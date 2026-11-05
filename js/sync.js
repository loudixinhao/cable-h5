/* sync.js —— 团队同步合并引擎（纯函数，无 DOM 依赖，可 Node 单测）
 *
 * 设计：LWW-Register（后写优先）+ 墓碑删除
 *  - 每条可变数据都带 at(ISO时间戳) 与 by(操作人)
 *  - 合并按 at 取新，时间相同用 by/id 作确定性 tie-breaker，保证交换律/结合律（幂等）
 *  - 删除/取消不 delete，而写墓碑(_del / on:false / text:'')，否则远端旧数据会「复活」
 *  - 兼容旧数据：check 旧对象 {at,by} 视为 on:true；note 旧字符串视为最旧版本
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.SYNC = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {

  function keys(o) { return o ? Object.keys(o) : []; }
  function union(a, b) {
    var m = {}, out = [];
    /* 排序保证输出键顺序与入参顺序无关：合并满足交换律，且避免云端无谓写入抖动 */
    (a || []).concat(b || []).sort().forEach(function (k) { if (!m[k]) { m[k] = 1; out.push(k); } });
    return out;
  }
  /* 取时间戳：ISO 字符串字典序即时间序 */
  function timeOf(x) {
    if (!x || typeof x === 'string') return '';
    return String(x._at || x.at || '');
  }
  function tieOf(x, k) {
    if (!x || typeof x === 'string') return 's|' + k;
    return String(x._by || x.by || '') + '|' + String(x._id || x.text || '') + '|' + k;
  }
  /* a 是否严格比 b 新 */
  function newer(a, b, k) {
    var ta = timeOf(a), tb = timeOf(b);
    if (ta !== tb) return ta > tb;
    return tieOf(a, k) > tieOf(b, k);
  }
  function schemaTime(s) { return s ? String(s._schemaAt || '') : ''; }
  function newerSchema(a, b) {
    var ta = schemaTime(a), tb = schemaTime(b);
    if (ta !== tb) return ta > tb;
    return String((a && a._schemaBy) || '') > String((b && b._schemaBy) || '');
  }

  /* 旧数据规范化：note 字符串 -> 对象；统一为可比较结构 */
  function normNote(v) {
    if (v === undefined || v === null) return null;
    if (typeof v === 'string') return { text: v, at: '', by: '' };
    return v;
  }
  function normCheck(v) {
    if (v === undefined || v === null) return null;
    if (typeof v !== 'object') return { at: '', by: '', on: true };
    return v;
  }
  /* check 是否表示「已完成」（旧对象无 on 字段 = 已完成；on:false 为墓碑） */
  function isOn(v) { return !!v && typeof v === 'object' && v.on !== false; }

  /* --- 各分片合并 --- */
  function mergeSchema(a, b) {
    if (!a) return b || null;
    if (!b) return a;
    return newerSchema(a, b) ? a : b;
  }
  function mergeRecords(a, b) {
    var map = {};
    (a || []).forEach(function (r) { if (r && r._id) map[r._id] = r; });
    (b || []).forEach(function (r) {
      if (!r || !r._id) return;
      var old = map[r._id];
      if (!old || newer(r, old, r._id)) map[r._id] = r;
    });
    return Object.keys(map).map(function (k) { return map[k]; })
      .sort(function (x, y) { return timeOf(y).localeCompare(timeOf(x)); });
  }
  function mergeChecks(a, b) {
    var out = {};
    union(keys(a), keys(b)).forEach(function (cyc) {
      out[cyc] = {};
      var m1 = (a && a[cyc]) || {}, m2 = (b && b[cyc]) || {};
      union(keys(m1), keys(m2)).forEach(function (k) {
        var v1 = normCheck(m1[k]), v2 = normCheck(m2[k]);
        if (!v1) out[cyc][k] = v2;
        else if (!v2) out[cyc][k] = v1;
        else out[cyc][k] = newer(v1, v2, k) ? v1 : v2;
      });
    });
    return out;
  }
  function mergeNotes(a, b) {
    var out = {};
    union(keys(a), keys(b)).forEach(function (cyc) {
      out[cyc] = {};
      var m1 = (a && a[cyc]) || {}, m2 = (b && b[cyc]) || {};
      union(keys(m1), keys(m2)).forEach(function (k) {
        var v1 = normNote(m1[k]), v2 = normNote(m2[k]);
        if (!v1) out[cyc][k] = v2;
        else if (!v2) out[cyc][k] = v1;
        else out[cyc][k] = newer(v1, v2, k) ? v1 : v2;
      });
    });
    return out;
  }

  /* 合并两份完整数据：顺序无关（幂等、可交换） */
  function mergeData(a, b) {
    a = a || {}; b = b || {};
    return {
      schema: mergeSchema(a.schema, b.schema),
      records: mergeRecords(a.records, b.records),
      checks: mergeChecks(a.checks, b.checks),
      notes: mergeNotes(a.notes, b.notes),
      _updatedAt: [a._updatedAt || '', b._updatedAt || ''].sort().pop(),
      _team: b._team || a._team || ''
    };
  }

  /* remote 是否已包含 local 的全部最新操作（用于 POST 后校验是否被并发覆盖） */
  function covers(remote, local) {
    remote = remote || {}; local = local || {};
    if (newerSchema(local.schema, remote.schema)) return false;
    var rm = {}; (remote.records || []).forEach(function (r) { if (r && r._id) rm[r._id] = r; });
    for (var i = 0; i < (local.records || []).length; i++) {
      var r = local.records[i]; if (!r || !r._id) continue;
      var x = rm[r._id];
      if (!x || newer(r, x, r._id)) return false;
    }
    if (!coversMap(remote.checks, local.checks, normCheck)) return false;
    if (!coversMap(remote.notes, local.notes, normNote)) return false;
    return true;
  }
  function coversMap(rMap, lMap, norm) {
    lMap = lMap || {}; rMap = rMap || {};
    var cycs = keys(lMap);
    for (var i = 0; i < cycs.length; i++) {
      var cyc = cycs[i], lm = lMap[cyc] || {}, rmm = rMap[cyc] || {};
      var ks = keys(lm);
      for (var j = 0; j < ks.length; j++) {
        var lv = norm(lm[ks[j]]), rv = norm(rmm[ks[j]]);
        if (lv && (!rv || newer(lv, rv, ks[j]))) return false;
      }
    }
    return true;
  }

  /* 对外读取的兼容投影：隐藏墓碑，保持旧页面接口不变 */
  function visibleRecords(data) {
    return (data.records || []).filter(function (r) { return r && !r._del; });
  }
  function visibleChecks(data) {
    var out = {};
    keys(data.checks || {}).forEach(function (cyc) {
      out[cyc] = {};
      var m = data.checks[cyc] || {};
      keys(m).forEach(function (k) { if (isOn(m[k])) out[cyc][k] = m[k]; });
    });
    return out;
  }
  function visibleNotes(data) {
    var out = {};
    keys(data.notes || {}).forEach(function (cyc) {
      out[cyc] = {};
      var m = data.notes[cyc] || {};
      keys(m).forEach(function (k) {
        var v = normNote(m[k]);
        if (v && v.text) out[cyc][k] = v.text;
      });
    });
    return out;
  }

  /* 收集参与者（本周期打勾/备注/记录的人） */
  function members(data, cycKey) {
    var m = {};
    function add(by, at) {
      if (!by) return;
      if (!m[by] || String(at || '') > m[by]) m[by] = String(at || '');
    }
    var ck = (data.checks || {})[cycKey] || {};
    keys(ck).forEach(function (k) { add(ck[k] && ck[k].by, ck[k] && ck[k].at); });
    var nt = (data.notes || {})[cycKey] || {};
    keys(nt).forEach(function (k) { var v = normNote(nt[k]); if (v) add(v.by, v.at); });
    (data.records || []).forEach(function (r) { if (r && !r._del) add(r._by, r._at); });
    return Object.keys(m).map(function (name) { return { name: name, at: m[name] }; })
      .sort(function (a, b) { return b.at.localeCompare(a.at); });
  }

  return {
    mergeData: mergeData, covers: covers, isOn: isOn, newer: newer,
    visibleRecords: visibleRecords, visibleChecks: visibleChecks, visibleNotes: visibleNotes,
    members: members, normNote: normNote, union: union
  };
});
