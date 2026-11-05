/* util.js —— 通用工具 */
window.U = (function () {
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function today() { return ymd(new Date()); }
  function esc(s) {
    if (s === undefined || s === null) return '';
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function uid() { return 'r' + Date.now() + Math.floor(Math.random() * 10000); }

  /* 周期：每月 testDay 16:00 ~ 次月 testDay 16:00 */
  function currentCycle(day, hour, now) {
    now = now || new Date();
    day = day || 25; hour = (hour === undefined ? 16 : hour);
    var start, end;
    if (now.getDate() > day || (now.getDate() === day && now.getHours() >= hour)) {
      start = new Date(now.getFullYear(), now.getMonth(), day, hour);
      end = new Date(now.getFullYear(), now.getMonth() + 1, day, hour);
    } else {
      start = new Date(now.getFullYear(), now.getMonth() - 1, day, hour);
      end = new Date(now.getFullYear(), now.getMonth(), day, hour);
    }
    return { start: start, end: end };
  }
  function prevCycle(day, hour, now) {
    var cur = currentCycle(day, hour, now);
    var s = new Date(cur.start); s.setMonth(s.getMonth() - 1);
    return { start: s, end: new Date(cur.start) };
  }
  function daysLeft(day, hour, now) {
    return Math.max(0, Math.ceil((currentCycle(day, hour, now).end - (now || new Date())) / 86400000));
  }

  function toast(msg) {
    var t = document.getElementById('toast');
    t.textContent = msg; t.classList.remove('hidden');
    clearTimeout(window._toastTimer);
    window._toastTimer = setTimeout(function () { t.classList.add('hidden'); }, 1800);
  }

  /* 底部弹层 */
  function sheet(title, html, onMount) {
    closeSheet();
    var root = document.getElementById('modalRoot');
    root.innerHTML =
      '<div class="mask" onclick="U.closeSheet()"></div>' +
      '<div class="sheet"><span class="sheet-close" onclick="U.closeSheet()">×</span>' +
      '<h3>' + esc(title) + '</h3>' + html + '</div>';
    if (onMount) onMount();
  }
  function closeSheet() { document.getElementById('modalRoot').innerHTML = ''; }

  function copy(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { toast('已复制'); }, function () { fallback(text); });
    } else fallback(text);
  }
  function fallback(text) {
    var ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); toast('已复制'); } catch (e) { toast('复制失败，请长按选择'); }
    document.body.removeChild(ta);
  }

  /* 从 schema/记录中取字段值 */
  function allStations(schema) {
    var arr = [];
    (schema.lines || []).forEach(function (l) { (l.stations || []).forEach(function (s) { arr.push(s); }); });
    return arr;
  }
  function stationLine(schema, station) {
    var r = '';
    (schema.lines || []).forEach(function (l) { if ((l.stations || []).indexOf(station) >= 0) r = l.name; });
    return r;
  }
  function getField(mod, role) {
    if (!mod) return null;
    for (var i = 0; i < (mod.fields || []).length; i++) if (mod.fields[i].role === role) return mod.fields[i];
    return null;
  }
  function getMod(schema, id) {
    for (var i = 0; i < (schema.modules || []).length; i++) if (schema.modules[i].id === id) return schema.modules[i];
    return null;
  }
  function enabledMods(schema) {
    return (schema.modules || []).filter(function (m) { return m.enabled; })
      .sort(function (a, b) { return (a.order || 99) - (b.order || 99); });
  }

  /* ---- 区域盯控 ---- */
  function zonesOf(schema, station) {
    var ov = schema.stationZones || {};
    if (ov[station] && ov[station].length) return ov[station].slice();
    return (schema.zones || []).slice();
  }
  function cycleKey(cyc) { return ymd(cyc.start); }
  function ckKey(station, zone) { return station + '||' + zone; }
  function checksOf(schema, checks, cyc) {
    return (checks && checks[cycleKey(cyc)]) || {};
  }
  function zoneStats(schema, checks, cyc) {
    var map = checksOf(schema, checks, cyc);
    var lines = [], total = 0, done = 0, stationDone = 0, stationTotal = 0;
    (schema.lines || []).forEach(function (l) {
      var sts = [];
      (l.stations || []).forEach(function (s) {
        var zs = zonesOf(schema, s);
        var d = zs.filter(function (z) { return map[ckKey(s, z)]; }).length;
        total += zs.length; done += d; stationTotal++;
        if (zs.length && d === zs.length) stationDone++;
        sts.push({ name: s, zones: zs, done: d, total: zs.length });
      });
      lines.push({ name: l.name, stations: sts });
    });
    return { lines: lines, total: total, done: done, stationDone: stationDone, stationTotal: stationTotal, map: map };
  }

  /* 记录是否不合格（明细里 role=insulation 的列低于阈值） */
  function isBad(schema, mod, rec) {
    var th = parseFloat(schema.threshold);
    var found = false;
    (mod.fields || []).forEach(function (f) {
      if (f.type === 'detail' && rec[f.key]) {
        (f.columns || []).forEach(function (c) {
          if (c.role === 'insulation') {
            (rec[f.key] || []).forEach(function (row) {
              var v = parseFloat(row[c.key]);
              if (!isNaN(v) && v < th) found = true;
            });
          }
        });
      }
      if (f.role === 'insulation') {
        var v2 = parseFloat(rec[f.key]);
        if (!isNaN(v2) && v2 < th) found = true;
      }
    });
    return found;
  }

  /* 记录归属周期：取 role=date 的字段 */
  function recDate(schema, mod, rec) {
    var f = getField(mod, 'date');
    var v = f ? rec[f.key] : (rec._date || '');
    if (!v) return null;
    var d = new Date(String(v) + 'T00:00:00');
    return isNaN(d.getTime()) ? null : d;
  }
  function inCycle(d, cyc) { return d && d >= cyc.start && d < cyc.end; }

  /* 覆盖统计 */
  function coverage(schema, records, cyc) {
    var tested = {};
    records.forEach(function (r) {
      var mod = getMod(schema, r._mod);
      if (!mod || !mod.coverage || !mod.enabled) return;
      var d = recDate(schema, mod, r);
      if (!inCycle(d, cyc)) return;
      var sf = getField(mod, 'station');
      if (sf && r[sf.key]) tested[r[sf.key]] = 1;
    });
    return tested;
  }
  function badCount(schema, records, cyc) {
    var n = 0;
    records.forEach(function (r) {
      var mod = getMod(schema, r._mod);
      if (!mod) return;
      var d = recDate(schema, mod, r);
      if (!inCycle(d, cyc)) return;
      if (isBad(schema, mod, r)) n++;
    });
    return n;
  }

  return {
    pad: pad, ymd: ymd, today: today, esc: esc, uid: uid,
    currentCycle: currentCycle, prevCycle: prevCycle, daysLeft: daysLeft,
    toast: toast, sheet: sheet, closeSheet: closeSheet, copy: copy,
    allStations: allStations, stationLine: stationLine, getField: getField,
    getMod: getMod, enabledMods: enabledMods, isBad: isBad,
    recDate: recDate, inCycle: inCycle, coverage: coverage, badCount: badCount,
    zonesOf: zonesOf, cycleKey: cycleKey, ckKey: ckKey, checksOf: checksOf, zoneStats: zoneStats
  };
})();
