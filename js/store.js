/* store.js —— 数据层：本机缓存 + 云端共享（单文档），团队加入码自动配置 */
window.S = (function () {
  var KEY = window.CFG.STORAGE_KEY;
  var data = null;              // { schema, records }
  var cloudOn = false;
  var client = null;
  var cloudError = '';

  function blank() {
    return { schema: JSON.parse(JSON.stringify(window.DEFAULT_SCHEMA)), records: [], checks: {}, notes: {} };
  }
  function normalize(o) {
    if (!o) return blank();
    if (!o.schema) return blank();
    if (!o.records) o.records = [];
    if (!o.checks) o.checks = {};      // 打勾：checks[周期key]['站||区'] = {at, by}
    if (!o.notes) o.notes = {};        // 站备注：notes[周期key]['站'] = 文本
    if (!o.schema.zones) o.schema.zones = JSON.parse(JSON.stringify(window.DEFAULT_SCHEMA.zones));
    if (!o.schema.stationZones) o.schema.stationZones = {};
    return o;
  }
  function localRead() {
    try { return normalize(JSON.parse(localStorage.getItem(KEY))); } catch (e) {}
    return blank();
  }
  function localWrite() {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {}
  }

  function cloudCfg() {
    var c = (data && data.schema && data.schema.cloud) || {};
    return {
      enabled: !!c.enabled,
      url: localStorage.getItem('ld_cloud_url') || c.url || '',
      key: localStorage.getItem('ld_cloud_key') || c.key || ''
    };
  }
  function ensureClient() {
    var c = cloudCfg();
    if (!c.enabled || !c.url || !c.key || !window.supabase) return null;
    if (!client) {
      try { client = window.supabase.createClient(c.url, c.key); } catch (e) { client = null; }
    }
    return client;
  }

  /* 团队加入码：#join=base64(url|key) */
  function consumeJoin() {
    var h = location.hash || '';
    if (h.indexOf('#join=') !== 0) return false;
    try {
      var raw = decodeURIComponent(h.slice(6));
      var s = decodeURIComponent(escape(atob(raw)));
      var i = s.indexOf('|');
      var url = s.slice(0, i), key = s.slice(i + 1);
      if (url && key) {
        localStorage.setItem('ld_cloud_url', url);
        localStorage.setItem('ld_cloud_key', key);
        data.schema.cloud = { enabled: true, url: url, key: key };
        localWrite();
        history.replaceState(null, '', location.pathname + location.search);
        return true;
      }
    } catch (e) {}
    return false;
  }
  function makeJoinLink() {
    var c = cloudCfg();
    var s = c.url + '|' + c.key;
    var b = btoa(unescape(encodeURIComponent(s)));
    return location.origin + location.pathname + '#join=' + encodeURIComponent(b);
  }

  function pullCloud() {
    var cl = ensureClient();
    if (!cl) return Promise.resolve(false);
    return cl.from(window.CFG.CLOUD_TABLE).select('content').eq('id', window.CFG.CLOUD_DOC_ID).single()
      .then(function (res) {
        if (res.error) throw res.error;
        if (res.data && res.data.content && res.data.content.schema) {
          data = normalize(res.data.content);
          localWrite();
          cloudOn = true; cloudError = '';
          return true;
        }
        return false;
      })
      .catch(function (e) {
        cloudError = (e && e.message) ? e.message : '云端连接失败';
        cloudOn = false;
        return false;
      });
  }
  function pushCloud() {
    var cl = ensureClient();
    if (!cl) return Promise.resolve(false);
    return cl.from(window.CFG.CLOUD_TABLE).upsert({
      id: window.CFG.CLOUD_DOC_ID,
      content: data,
      updated_at: new Date().toISOString()
    }).then(function (res) {
      if (res.error) { cloudError = res.error.message; cloudOn = false; return false; }
      cloudOn = true; cloudError = ''; return true;
    }).catch(function (e) { cloudError = e.message || '云端写入失败'; cloudOn = false; return false; });
  }

  function init() {
    data = localRead();
    var joined = consumeJoin();
    var c = cloudCfg();
    if (c.enabled && c.url && c.key) {
      return pullCloud().then(function (ok) {
        return { joined: joined, cloud: cloudOn };
      });
    }
    return Promise.resolve({ joined: joined, cloud: false });
  }

  /* 保存：先写本地，再异步推云（不阻塞界面） */
  function save() {
    data._updatedAt = new Date().toISOString();
    localWrite();
    if (cloudCfg().enabled) pushCloud();
  }
  function reload() { return pullCloud(); }

  function get() { return data; }
  function schema() { return data.schema; }
  function records() { return data.records; }

  function addRecord(rec) { data.records.unshift(rec); save(); }
  function updateRecord(id, rec) {
    for (var i = 0; i < data.records.length; i++) {
      if (data.records[i]._id === id) { data.records[i] = rec; break; }
    }
    save();
  }
  function delRecord(id) {
    data.records = data.records.filter(function (r) { return r._id !== id; });
    save();
  }
  function setSchema(s) { data.schema = s; save(); }
  function resetAll() { data = blank(); save(); }

  /* ---- 区域打勾 / 站备注（按周期隔离） ---- */
  function checks() { return data.checks; }
  function notes() { return data.notes; }
  function toggleCheck(cycKey, station, zone) {
    if (!data.checks[cycKey]) data.checks[cycKey] = {};
    var k = station + '||' + zone;
    if (data.checks[cycKey][k]) delete data.checks[cycKey][k];
    else data.checks[cycKey][k] = { at: new Date().toISOString(), by: '' };
    save();
    return !!data.checks[cycKey][k];
  }
  function setCheck(cycKey, station, zone, val) {
    if (!data.checks[cycKey]) data.checks[cycKey] = {};
    var k = station + '||' + zone;
    if (val) data.checks[cycKey][k] = { at: new Date().toISOString(), by: '' };
    else delete data.checks[cycKey][k];
    save();
  }
  function setNote(cycKey, station, text) {
    if (!data.notes[cycKey]) data.notes[cycKey] = {};
    if (text && text.trim()) data.notes[cycKey][station] = text.trim();
    else delete data.notes[cycKey][station];
    save();
  }
  function clearCycle(cycKey) {
    delete data.checks[cycKey];
    delete data.notes[cycKey];
    save();
  }

  function status() { return { cloudOn: cloudOn, error: cloudError, enabled: cloudCfg().enabled }; }
  function setCloud(url, key, enabled) {
    data.schema.cloud = { enabled: !!enabled, url: url, key: key };
    localStorage.setItem('ld_cloud_url', url);
    localStorage.setItem('ld_cloud_key', key);
    client = null;
    save();
  }
  function exportJson() { return JSON.stringify(data, null, 2); }
  function importJson(txt) {
    var o = JSON.parse(txt);
    if (!o.schema) throw new Error('文件格式不对');
    data = normalize(o); save();
  }

  return {
    init: init, get: get, schema: schema, records: records,
    save: save, reload: reload, status: status, setCloud: setCloud,
    cloudCfg: cloudCfg, makeJoinLink: makeJoinLink,
    addRecord: addRecord, updateRecord: updateRecord, delRecord: delRecord,
    setSchema: setSchema, resetAll: resetAll,
    checks: checks, notes: notes, toggleCheck: toggleCheck, setCheck: setCheck,
    setNote: setNote, clearCycle: clearCycle,
    exportJson: exportJson, importJson: importJson
  };
})();
