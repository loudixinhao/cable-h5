/* store.js —— 团队共享数据层
 *
 * 通道：
 *   默认 npoint 免注册数据仓（CFG.TEAM_BIN），零配置，打开同一链接即同一份台账
 *   可选自建 Supabase REST（后台填入 URL / anon key）
 *   两种通道均为纯 fetch，不依赖任何外部 SDK
 *
 * 可靠性：
 *   1. 本地 localStorage 永远保存全量数据，所有操作先落本地，断网照用
 *   2. 写入采用「先拉远端 → 合并 → 写回 → 校验 → 冲突重试」
 *   3. 合并用 SYNC.mergeData（LWW + 墓碑），多人并发打勾不互相覆盖
 *   4. 定时轮询 + 回到前台/恢复网络立即同步，别人的改动自动出现
 *   5. 删除/取消一律写墓碑，避免被远端旧数据「复活」
 */
window.S = (function () {
  var KEY = window.CFG.STORAGE_KEY;
  var data = null;
  var cloudOn = false, syncing = false, pending = false, dirty = false;
  var cloudError = '', lastSync = 0, pushTimer = null, pollTimer = null;
  var listeners = [];

  function now() { return new Date().toISOString(); }
  function member() { return localStorage.getItem('ld_member') || ''; }
  function setMember(n) { localStorage.setItem('ld_member', (n || '').trim()); emit(); }
  function blank() {
    return {
      schema: JSON.parse(JSON.stringify(window.DEFAULT_SCHEMA)),
      records: [], checks: {}, notes: {}, _updatedAt: now(), _team: ''
    };
  }
  function normalize(o) {
    if (!o || !o.schema) return blank();
    if (!o.records) o.records = [];
    if (!o.checks) o.checks = {};
    if (!o.notes) o.notes = {};
    if (!o.schema.zones) o.schema.zones = JSON.parse(JSON.stringify(window.DEFAULT_SCHEMA.zones));
    if (!o.schema.stationZones) o.schema.stationZones = {};
    if (!o._updatedAt) o._updatedAt = now();
    return o;
  }
  function localRead() {
    try { return normalize(JSON.parse(localStorage.getItem(KEY))); } catch (e) { }
    return blank();
  }
  function localWrite() {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { }
  }
  function emit() { listeners.forEach(function (f) { try { f(); } catch (e) { } }); }
  function onChange(f) { if (f) listeners.push(f); }

  /* ---------- 云端配置（默认零配置） ---------- */
  function cloudCfg() {
    var c = (data && data.schema && data.schema.cloud) || {};
    var ov = {};
    try { ov = JSON.parse(localStorage.getItem('ld_cloud_override') || '{}'); } catch (e) { }
    var provider = ov.provider || c.provider || 'npoint';
    var bin = ov.bin || c.bin || window.CFG.TEAM_BIN;
    /* 兼容旧版本地数据：cloud 只有 enabled/url/key 而无 provider/bin 时，
       视为「尚未配置过团队共享」，按新默认（开启 + 内置共享仓）处理 */
    var isLegacy = !c.provider && !c.bin && !c.url && !c.key;
    var baseEnabled = isLegacy ? true : (c.enabled === undefined ? true : !!c.enabled);
    return {
      enabled: ov.enabled === undefined ? baseEnabled : !!ov.enabled,
      provider: provider,
      bin: bin,
      url: ov.url || c.url || '',
      key: ov.key || c.key || '',
      table: window.CFG.CLOUD_TABLE
    };
  }
  function setCloud(url, key, enabled) {
    var ov = { provider: 'supabase', url: (url || '').trim(), key: (key || '').trim(), enabled: !!enabled };
    localStorage.setItem('ld_cloud_override', JSON.stringify(ov));
    data.schema.cloud = { provider: 'supabase', enabled: !!enabled, url: ov.url, key: ov.key };
    localWrite();
    return reload();
  }
  function setTeamBin(bin) {
    var ov = { provider: 'npoint', bin: (bin || '').trim(), enabled: true };
    localStorage.setItem('ld_cloud_override', JSON.stringify(ov));
    return reload();
  }
  function useDefaultTeam() {
    localStorage.removeItem('ld_cloud_override');
    return reload();
  }

  /* 团队加入码：默认零配置时就是页面链接本身；自建/换仓时把配置编码进 hash */
  function consumeJoin() {
    var h = location.hash || '';
    if (h.indexOf('#join=') !== 0) return false;
    try {
      var s = decodeURIComponent(escape(atob(decodeURIComponent(h.slice(6)))));
      var p = s.split('|');
      if (p[0] === 'supabase' && p[2] && p[3]) {
        localStorage.setItem('ld_cloud_override', JSON.stringify({ provider: 'supabase', bin: p[1] || '', url: p[2], key: p[3], enabled: true }));
      } else if (p[1]) {
        localStorage.setItem('ld_cloud_override', JSON.stringify({ provider: 'npoint', bin: p[1], enabled: true }));
      } else return false;
      history.replaceState(null, '', location.pathname + location.search);
      return true;
    } catch (e) { }
    return false;
  }
  function makeJoinLink() {
    var c = cloudCfg(), base = location.origin + location.pathname;
    var isDefault = c.provider === 'npoint' && c.bin === window.CFG.TEAM_BIN;
    if (isDefault) return base;                       // 打开同一链接即共享，最简单
    var s = c.provider + '|' + c.bin + '|' + c.url + '|' + c.key;
    return base + '#join=' + encodeURIComponent(btoa(unescape(encodeURIComponent(s))));
  }

  /* ---------- 云端读写（纯 fetch，双通道） ---------- */
  function fetchT(url, opt, ms) {
    opt = opt || {};
    var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    if (ctl) opt.signal = ctl.signal;
    var timer = setTimeout(function () { if (ctl) ctl.abort(); }, ms || window.CFG.SYNC_TIMEOUT);
    return fetch(url, opt).then(function (r) {
      clearTimeout(timer);
      return r;
    }, function (e) { clearTimeout(timer); throw e; });
  }
  function cloudGet() {
    var c = cloudCfg();
    if (!c.enabled) return Promise.resolve(null);
    if (c.provider === 'supabase') {
      if (!c.url || !c.key) return Promise.reject(new Error('未填写云数据库地址'));
      var u = c.url.replace(/\/$/, '') + '/rest/v1/' + c.table + '?id=eq.' + window.CFG.CLOUD_DOC_ID + '&select=content';
      return fetchT(u, { headers: { apikey: c.key, Authorization: 'Bearer ' + c.key } })
        .then(function (r) { if (!r.ok) throw new Error('云端读取失败 ' + r.status); return r.json(); })
        .then(function (arr) { return (arr && arr[0] && arr[0].content) || null; });
    }
    if (!c.bin) return Promise.reject(new Error('未设置团队数据仓'));
    return fetchT(window.CFG.CLOUD_API + c.bin + '?t=' + Date.now(), { headers: { Accept: 'application/json' } })
      .then(function (r) { if (r.status === 404) return null; if (!r.ok) throw new Error('云端读取失败 ' + r.status); return r.json(); })
      .then(function (o) {
        return (o && typeof o === 'object' && (o.schema || o.records || o.checks || o.notes)) ? o : null;
      });
  }
  function cloudSet(payload) {
    var c = cloudCfg();
    if (!c.enabled) return Promise.resolve(false);
    if (c.provider === 'supabase') {
      var u = c.url.replace(/\/$/, '') + '/rest/v1/' + c.table;
      return fetchT(u, {
        method: 'POST',
        headers: { apikey: c.key, Authorization: 'Bearer ' + c.key, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify({ id: window.CFG.CLOUD_DOC_ID, content: payload, updated_at: now() })
      }).then(function (r) { if (!r.ok) throw new Error('云端写入失败 ' + r.status); return true; });
    }
    return fetchT(window.CFG.CLOUD_API + c.bin, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
    }).then(function (r) { if (!r.ok) throw new Error('云端写入失败 ' + r.status); return true; });
  }

  /* ---------- 同步 ---------- */
  function markOk() { cloudOn = true; cloudError = ''; lastSync = Date.now(); pending = false; emit(); }
  function markFail(e) { cloudOn = false; cloudError = (e && e.message) ? e.message : '云端未连通'; emit(); }

  /* 推：先拉 → 合并 → 写 → 校验 → 冲突重试（最多 3 次） */
  function push(retries) {
    retries = retries || 0;
    if (!cloudCfg().enabled) return Promise.resolve(false);
    if (syncing) { pending = true; dirty = true; return Promise.resolve(false); }
    syncing = true; emit();
    function attempt(n) {
      return cloudGet().then(function (remote) {
        var merged = window.SYNC.mergeData(data, remote);
        return cloudSet(merged).then(function () {
          return cloudGet().then(function (verify) {
            if (window.SYNC.covers(verify, merged)) {
              data = merged; localWrite(); dirty = false; markOk(); emit(); return true;
            }
            if (n < 2) return attempt(n + 1);      // 被并发覆盖，重新合并再写
            data = merged; localWrite(); dirty = true; pending = true; markOk(); emit(); return false;
          });
        });
      });
    }
    return attempt(0).catch(function (e) { markFail(e); dirty = true; pending = true; return false; })
      .then(function (r) { syncing = false; emit(); return r; });
  }

  /* 拉：只同步别人的新改动，不写回云端 */
  function pull() {
    if (!cloudCfg().enabled) return Promise.resolve(false);
    return cloudGet().then(function (remote) {
      if (!remote) { markOk(); return false; }
      var merged = window.SYNC.mergeData(data, remote);
      var changed = JSON.stringify(merged) !== JSON.stringify(data);
      if (changed) { data = merged; localWrite(); emit(); }
      markOk();
      return changed;
    }).catch(function (e) { markFail(e); return false; });
  }
  function syncNow() { return push(0); }
  function schedulePush() {
    dirty = true;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(function () {
      if (dirty) push(0);
    }, 600);                                        // 连续打勾合并成一次写入
  }
  function startAuto() {
    clearInterval(pollTimer);
    pollTimer = setInterval(function () {
      if (document.visibilityState === 'visible') { if (dirty || pending) push(0); else pull(); }
    }, window.CFG.POLL_MS);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') { if (dirty || pending) push(0); else pull(); }
    });
    window.addEventListener('online', function () { if (dirty || pending) push(0); else pull(); });
  }
  function status() {
    var c = cloudCfg();
    return {
      enabled: c.enabled, cloudOn: cloudOn, syncing: syncing, error: cloudError,
      pending: pending, lastSync: lastSync, provider: c.provider, bin: c.bin,
      hasUrl: !!c.url, member: member(), isDefault: c.provider === 'npoint' && c.bin === window.CFG.TEAM_BIN
    };
  }
  function reload() { return pull(); }

  function init() {
    data = localRead();
    var joined = consumeJoin();
    var c = cloudCfg();
    if (!c.enabled) return Promise.resolve({ joined: joined, cloud: false });
    return cloudGet().then(function (remote) {
      /* 空仓（云端还没有任何配置）→ 把本地默认配置打时间戳作为初始版本推上去，
         让云端从一开始就持有完整配置，避免后续边界情况 */
      if (remote && !remote.schema && data.schema && !data.schema._schemaAt) {
        data.schema._schemaAt = now();
        data.schema._schemaBy = member() || 'system';
      }
      var merged = remote ? window.SYNC.mergeData(data, remote) : data;
      data = merged; localWrite();
      /* 本地有云端没有的内容（含旧数据）→ 推上去 */
      var need = !remote || !window.SYNC.covers(remote, data);
      if (need) return push(0).then(function () { return { joined: joined, cloud: cloudOn }; });
      markOk();
      return { joined: joined, cloud: true };
    }).catch(function (e) {
      markFail(e);                                   // 断网：本地数据照用
      return { joined: joined, cloud: false };
    }).then(function (r) { startAuto(); return r; });
  }

  /* ---------- 本地操作（先落本地，再异步同步） ---------- */
  function save() {
    data._updatedAt = now();
    localWrite();
    schedulePush();
  }
  function get() { return data; }
  function schema() { return data.schema; }
  function records() { return window.SYNC.visibleRecords(data); }
  function checks() { return window.SYNC.visibleChecks(data); }
  function notes() { return window.SYNC.visibleNotes(data); }

  function addRecord(rec) {
    rec._at = rec._at || now(); rec._by = rec._by || member();
    data.records.unshift(rec); save();
  }
  function updateRecord(id, rec) {
    rec._at = now(); rec._by = member();
    for (var i = 0; i < data.records.length; i++) {
      if (data.records[i]._id === id) { data.records[i] = rec; break; }
    }
    save();
  }
  function delRecord(id) {                            // 墓碑，不真删
    for (var i = 0; i < data.records.length; i++) {
      if (data.records[i]._id === id) {
        data.records[i] = { _id: id, _at: now(), _by: member(), _del: true };
        break;
      }
    }
    save();
  }
  function clearAllRecords() {                        // 后台「清空所有记录」
    data.records = (data.records || []).map(function (r) {
      return { _id: r._id, _at: now(), _by: member(), _del: true };
    });
    save();
  }
  function setSchema(s) {
    s._schemaAt = now(); s._schemaBy = member();     // 配置也带时间戳，避免工友端旧配置回灌
    data.schema = s; save();
  }
  function resetAll() { data = blank(); localWrite(); schedulePush(); }

  /* ---- 区域打勾 / 站备注（按周期隔离，取消写墓碑） ---- */
  function toggleCheck(cycKey, station, zone) {
    if (!data.checks[cycKey]) data.checks[cycKey] = {};
    var k = station + '||' + zone;
    var cur = data.checks[cycKey][k];
    var on = !(cur && window.SYNC.isOn(cur));
    data.checks[cycKey][k] = { at: now(), by: member(), on: on };
    save();
    return on;
  }
  function setCheck(cycKey, station, zone, val) {
    if (!data.checks[cycKey]) data.checks[cycKey] = {};
    data.checks[cycKey][station + '||' + zone] = { at: now(), by: member(), on: !!val };
    save();
  }
  function setNote(cycKey, station, text) {
    if (!data.notes[cycKey]) data.notes[cycKey] = {};
    data.notes[cycKey][station] = { at: now(), by: member(), text: (text || '').trim() };
    save();
  }
  function clearCycle(cycKey) {                       // 墓碑式清空，防止云端旧勾复活
    var ck = data.checks[cycKey] || {}, nt = data.notes[cycKey] || {};
    Object.keys(ck).forEach(function (k) { ck[k] = { at: now(), by: member(), on: false }; });
    Object.keys(nt).forEach(function (k) { nt[k] = { at: now(), by: member(), text: '' }; });
    data.checks[cycKey] = ck; data.notes[cycKey] = nt;
    save();
  }

  function exportJson() { return JSON.stringify(data, null, 2); }
  function importJson(txt) {
    var o = JSON.parse(txt);
    if (!o.schema) throw new Error('文件格式不对');
    o.schema._schemaAt = now(); o.schema._schemaBy = member();
    (o.records || []).forEach(function (r) { r._at = r._at || now(); r._by = r._by || member(); });
    data = normalize(o); localWrite(); schedulePush();
  }

  return {
    init: init, get: get, schema: schema, records: records, checks: checks, notes: notes,
    save: save, reload: reload, status: status, onChange: onChange,
    setCloud: setCloud, setTeamBin: setTeamBin, useDefaultTeam: useDefaultTeam,
    cloudCfg: cloudCfg, makeJoinLink: makeJoinLink, syncNow: syncNow, pull: pull, startAuto: startAuto,
    member: member, setMember: setMember,
    addRecord: addRecord, updateRecord: updateRecord, delRecord: delRecord,
    clearAllRecords: clearAllRecords, setSchema: setSchema, resetAll: resetAll,
    toggleCheck: toggleCheck, setCheck: setCheck, setNote: setNote, clearCycle: clearCycle,
    exportJson: exportJson, importJson: importJson
  };
})();
