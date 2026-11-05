/* app.js —— 页面路由与前台视图 */
window.APP = (function () {
  var view = 'home';
  var addModId = null;
  var addPreset = null;      // 编辑/复用时预填数据
  var addEditId = null;      // 非空=编辑态
  var listFilter = 'all';
  var stationFilter = '';   // 从看板「该站台账」跳转时按站点筛选
  var summaryCycle = 'cur';

  var TITLES = { home: '任务盯控', list: '台账', add: '新增记录', summary: '周期汇总', mine: '我的', admin: '管理后台' };

  function go(v, arg) {
    if (v === 'admin' && !ADM.logged()) { ADM.login(); return; }
    view = v;
    if (v === 'add' && arg) { addModId = arg; addPreset = null; addEditId = null; }
    ['home', 'list', 'add', 'summary', 'mine', 'admin'].forEach(function (x) {
      var el = document.getElementById('view-' + x);
      if (el) el.classList.toggle('hidden', x !== v);
    });
    document.getElementById('topTitle').textContent = TITLES[v] || '工作台';
    document.getElementById('tabbar').style.display = (v === 'admin') ? 'none' : 'flex';
    document.getElementById('topRight').textContent = (v === 'admin') ? '返回' : '管理';
    document.getElementById('topRight').onclick = function () { v === 'admin' ? go('mine') : go('mine'); };
    document.querySelectorAll('#tabbar .tab').forEach(function (t) { t.classList.toggle('active', t.dataset.view === v); });
    window.scrollTo(0, 0);
    render();
  }

  function render() {
    if (view === 'home') renderHome();
    else if (view === 'list') renderList();
    else if (view === 'add') renderAdd();
    else if (view === 'summary') renderSummary();
    else if (view === 'mine') renderMine();
    else if (view === 'admin') document.getElementById('view-admin').innerHTML = ADM.render();
  }

  /* ---------- 首页 = 区域盯控看板 ---------- */
  function renderHome() { BOARD.render(); }
  function showStationRecords(station) { stationFilter = station; go('list'); }

  /* ---------- 台账 ---------- */
  function renderList() {
    var s = S.schema();
    var mods = U.enabledMods(s);
    var bar = '<span class="' + (listFilter === 'all' ? 'on' : '') + '" onclick="APP.filter(\'all\')">全部</span>' +
      mods.map(function (m) {
        return '<span class="' + (listFilter === m.id ? 'on' : '') + '" onclick="APP.filter(\'' + m.id + '\')">' + U.esc(m.name) + '</span>';
      }).join('');
    var recs = S.records().filter(function (r) {
      if (listFilter !== 'all' && r._mod !== listFilter) return false;
      if (stationFilter) {
        var m = U.getMod(s, r._mod);
        var sf = m && U.getField(m, 'station');
        if (!sf || r[sf.key] !== stationFilter) return false;
      }
      return true;
    });
    var body = recs.length ? recs.map(function (r) {
      var m = U.getMod(s, r._mod);
      return m ? ENG.listItemHtml(m, r) : '';
    }).join('') : '<div class="empty">还没有记录' + (stationFilter ? '（' + U.esc(stationFilter) + '）' : '') + '，点底部「新增」开始录入</div>';
    var sbar = stationFilter
      ? '<div class="tips" style="margin-top:8px">仅看 <b>' + U.esc(stationFilter) + '</b> 的记录 ' +
        '<span class="link" onclick="APP.clearStationFilter()">清除筛选</span></div>' : '';
    document.getElementById('view-list').innerHTML =
      '<div class="card"><div class="row" style="margin-bottom:8px"><span class="card-title" style="margin:0">测试台账</span>' +
      '<span class="muted">' + recs.length + ' 条</span></div>' +
      '<div class="filter-bar">' + bar + '</div>' + sbar + '</div>' +
      '<div class="card" style="padding:0">' + body + '</div>';
  }
  function filter(id) { listFilter = id; renderList(); }
  function clearStationFilter() { stationFilter = ''; renderList(); }

  /* ---------- 新增 ---------- */
  function renderAdd() {
    var s = S.schema(), mods = U.enabledMods(s);
    if (!mods.length) { document.getElementById('view-add').innerHTML = '<div class="empty">后台还没启用模块</div>'; return; }
    if (!addModId || !U.getMod(s, addModId)) { addModId = mods[0].id; addPreset = null; addEditId = null; }
    var mod = U.getMod(s, addModId);
    var picker = '<div class="filter-bar">' + mods.map(function (m) {
      return '<span class="' + (m.id === addModId ? 'on' : '') + '" onclick="APP.pickMod(\'' + m.id + '\')">' + U.esc(m.name) + '</span>';
    }).join('') + '</div>';
    ENG.start(mod, addPreset);
    var editing = !!addEditId;
    document.getElementById('view-add').innerHTML =
      '<div class="card"><div class="card-title">选择模块</div>' + picker +
      '<div style="margin-top:8px"><button class="btn btn-gray btn-xs" onclick="ENG.reuse(\'' + mod.id + '\')">复用上一条</button> ' +
      (editing ? '<button class="btn btn-gray btn-xs" onclick="APP.cancelEdit()">取消编辑</button> ' : '') +
      '<span class="muted" style="font-size:12px">常用字段自动记忆，明细可批量粘贴</span></div></div>' +
      '<div class="card"><div class="card-title">' + U.esc(mod.name) + ' · ' + (editing ? '编辑记录' : '新增记录') + '</div>' +
      ENG.formHtml(mod) +
      '<button class="btn" id="saveBtn" onclick="' + (editing ? 'APP.saveEdit(\'' + addEditId + '\')' : 'APP.save()') + '">' +
      (editing ? '保存修改' : '保存记录') + '</button></div>';
    addPreset = null;   // 预填只生效一次
  }
  function pickMod(id) { addModId = id; addPreset = null; addEditId = null; renderAdd(); }
  function openAddWithPreset(modId, preset) {
    addModId = modId; addPreset = preset; addEditId = null;
    go('add');
  }
  function cancelEdit() { addEditId = null; addPreset = null; renderAdd(); U.toast('已取消编辑'); }
  function save() {
    var mod = U.getMod(S.schema(), addModId);
    var values = ENG.collect(mod);
    if (!values) return;
    values._id = U.uid(); values._mod = mod.id;
    values._at = new Date().toISOString(); values._date = U.today();
    S.addRecord(values);
    U.toast('保存成功');
    listFilter = mod.id; addPreset = null; addEditId = null;
    go('list');
  }

  /* ---------- 详情 ---------- */
  function detail(id) {
    var rec = S.records().filter(function (r) { return r._id === id; })[0];
    if (!rec) return;
    var mod = U.getMod(S.schema(), rec._mod);
    if (!mod) return;
    var bad = U.isBad(S.schema(), mod, rec) ? '<span class="badge badge-bad">不合格</span>' : '';
    U.sheet(mod.name + ' · 详情',
      '<div class="card" style="box-shadow:none;padding:0;margin:0">' + bad + ENG.detailHtmlRec(mod, rec) + '</div>' +
      '<div class="divider"></div>' +
      '<button class="btn btn-line btn-sm" onclick="APP.editRec(\'' + id + '\')">编辑这条</button> ' +
      '<button class="btn btn-danger btn-sm" onclick="APP.delRec(\'' + id + '\')">删除</button>');
  }
  function editRec(id) {
    var rec = S.records().filter(function (r) { return r._id === id; })[0];
    if (!rec) return;
    var mod = U.getMod(S.schema(), rec._mod);
    if (!mod) return;
    addModId = mod.id; addPreset = JSON.parse(JSON.stringify(rec)); addEditId = id;
    U.closeSheet();
    go('add');
    U.toast('修改后点「保存修改」');
  }
  function saveEdit(id) {
    var mod = U.getMod(S.schema(), addModId);
    var values = ENG.collect(mod);
    if (!values) return;
    var old = S.records().filter(function (r) { return r._id === id; })[0] || {};
    values._id = id; values._mod = mod.id;
    values._at = old._at; values._date = old._date || U.today();
    S.updateRecord(id, values);
    addEditId = null; addPreset = null;
    U.toast('已保存修改'); go('list');
  }
  function delRec(id) {
    if (!confirm('确认删除这条记录？')) return;
    S.delRecord(id); U.closeSheet(); render(); U.toast('已删除');
  }

  /* ---------- 汇总 ---------- */
  function summaryCycleObj() {
    var s = S.schema();
    return summaryCycle === 'cur' ? U.currentCycle(s.testDay, s.testHour) : U.prevCycle(s.testDay, s.testHour);
  }
  function renderSummary() {
    var s = S.schema(), cyc = summaryCycleObj();
    var stat = U.zoneStats(s, S.checks(), cyc);
    var bad = U.badCount(s, S.records(), cyc);
    var notes = (S.notes() || {})[U.cycleKey(cyc)] || {};
    var h = '<div class="seg"><div class="' + (summaryCycle === 'cur' ? 'active' : '') + '" onclick="APP.cycle(\'cur\')">本周期</div>' +
      '<div class="' + (summaryCycle === 'prev' ? 'active' : '') + '" onclick="APP.cycle(\'prev\')">上一周期</div></div>';
    h += '<div class="card"><div class="muted" style="margin-bottom:8px">周期：' + U.ymd(cyc.start) + ' ~ ' + U.ymd(cyc.end) + '</div>' +
      '<div class="row"><span class="bold">区域完成</span><span>' + stat.done + ' / ' + stat.total + '</span></div>' +
      '<div class="progress"><i style="width:' + (stat.total ? stat.done / stat.total * 100 : 0) + '%"></i></div>' +
      '<div class="row"><span class="muted">整站完成</span><span class="bold">' + stat.stationDone + ' / ' + stat.stationTotal + ' 站</span></div></div>';

    stat.lines.forEach(function (l) {
      var ld = 0, lt = 0, undone = [];
      l.stations.forEach(function (stn) {
        ld += stn.done; lt += stn.total;
        stn.zones.forEach(function (z) { if (!stat.map[U.ckKey(stn.name, z)]) undone.push(stn.name + '·' + z); });
      });
      h += '<div class="card"><div class="card-title">' + U.esc(l.name) + '（' + ld + '/' + lt + ' 区域）</div>' +
        '<div class="progress"><i style="width:' + (lt ? ld / lt * 100 : 0) + '%"></i></div>' +
        (undone.length ? '<div class="untested">未完成：' + U.esc(undone.join('、')) + '</div>'
          : '<div class="badge badge-ok">全部完成</div>') + '</div>';
    });

    /* 站内记录（可选填写的备注） */
    var noteKeys = Object.keys(notes);
    if (noteKeys.length) {
      h += '<div class="card"><div class="card-title">站内情况记录</div>';
      noteKeys.forEach(function (k) { h += '<div class="row"><span class="muted">' + U.esc(k) + '</span><span style="max-width:65%;text-align:right">' + U.esc(notes[k]) + '</span></div>'; });
      h += '</div>';
    }

    h += '<div class="card"><div class="card-title">补充数据</div>' +
      '<div class="row"><span class="muted">绝缘测试不合格批次</span><span class="bold">' + bad + '</span></div>';
    U.enabledMods(s).forEach(function (m) {
      var n = S.records().filter(function (r) { return r._mod === m.id && U.inCycle(U.recDate(s, m, r), cyc); }).length;
      h += '<div class="row"><span class="muted">' + U.esc(m.name) + ' 记录</span><span>' + n + ' 条</span></div>';
    });
    h += '</div><button class="btn btn-line" onclick="APP.copySummary()">复制汇总文本（可直接上报）</button>';
    document.getElementById('view-summary').innerHTML = h;
    window._summaryText = buildText(s, cyc, stat, bad, notes);
  }
  function buildText(s, cyc, stat, bad, notes) {
    var tag = summaryCycle === 'cur' ? '本周期' : '上一周期';
    var t = '【' + s.workshop + ' 电缆综合绝缘测试 ' + tag + '完成汇总】\n周期：' + U.ymd(cyc.start) + ' ~ ' + U.ymd(cyc.end) + '\n';
    stat.lines.forEach(function (l) {
      var ld = 0, lt = 0, undone = [];
      l.stations.forEach(function (stn) {
        ld += stn.done; lt += stn.total;
        stn.zones.forEach(function (z) { if (!stat.map[U.ckKey(stn.name, z)]) undone.push(stn.name + '·' + z); });
      });
      t += '\n' + l.name + '：完成 ' + ld + '/' + lt + ' 区域';
      t += undone.length ? '，未完成：' + undone.join('、') : '，全部完成';
    });
    t += '\n\n合计：区域 ' + stat.done + '/' + stat.total + '，整站完成 ' + stat.stationDone + '/' + stat.stationTotal;
    if (bad) t += '，绝缘不合格 ' + bad + ' 批';
    var nk = Object.keys(notes || {});
    if (nk.length) {
      t += '\n\n【站内情况】';
      nk.forEach(function (k) { t += '\n' + k + '：' + notes[k]; });
    }
    t += '\n（不足4小时作业临时审批电话：' + s.tempPhone + '）';
    return t;
  }
  function cycle(c) { summaryCycle = c; renderSummary(); }
  function copySummary() { U.copy(window._summaryText || ''); }

  /* ---------- 我的 ---------- */
  function renderMine() {
    var s = S.schema(), st = S.status();
    var stations = (s.lines || []).map(function (l) {
      return '<div class="station-line"><b>' + U.esc(l.name) + '：</b>' + U.esc((l.stations || []).join('、')) + '</div>';
    }).join('') +
      '<div class="tips">默认分区：' + U.esc((s.zones || []).join('、') || '未设置') +
      '（管理员可在后台按站调整）。每站分区域打勾盯控完成情况。</div>';
    document.getElementById('view-mine').innerHTML =
      '<div class="card"><div class="card-title">' + U.esc(s.workshop) + '</div>' +
      '<div class="row"><span class="muted">运行模式</span><span class="bold">' +
      (st.enabled ? (st.cloudOn ? '团队云同步' : '云同步（未连通）') : '本机缓存') + '</span></div>' +
      (st.error ? '<div class="badge badge-bad">' + U.esc(st.error) + '</div>' : '') +
      '<div class="tips">' + (st.enabled ? '数据汇总到同一份台账，管理员在后台改的配置全员生效。' : '数据仅存本机。让管理员开启云同步即可多人共享。') + '</div></div>' +

      '<div class="card"><div class="card-title">管理后台</div>' +
      '<div class="tips" style="margin-bottom:8px">新增模块、增删字段、改站点与阈值、配置云同步、生成团队加入码。</div>' +
      '<button class="btn" onclick="APP.go(\'admin\')">进入管理后台</button></div>' +

      '<div class="card"><div class="card-title">车间站点（' + U.allStations(s).length + ' 站）</div>' + stations +
      '<div class="tips">目标：每个测试周期内全覆盖。</div></div>' +

      '<div class="card"><div class="card-title">关键参数</div>' +
      '<div class="row"><span class="muted">绝缘合格阈值</span><span class="bold">≥ ' + s.threshold + ' MΩ</span></div>' +
      '<div class="row"><span class="muted">测试周期</span><span class="bold">每月 ' + s.testDay + ' 日 ' + s.testHour + ':00 起</span></div>' +
      '<div class="row"><span class="muted">临时审批电话</span><a class="call-btn" href="tel:' + U.esc(s.tempPhone) + '">' + U.esc(s.tempPhone) + '</a></div></div>' +

      '<div class="card"><div class="card-title">使用说明</div><div class="tips" style="line-height:1.8">' +
      '1. 首页「盯控」按 线 → 站 → 区域 展开，<b>点一下区域就打勾标记完成</b>，主要用来盯任务进度。<br>' +
      '2. 一个站可分多次测完，每完成一个区就勾一个；整站全勾自动显示「已完成」。<br>' +
      '3. 每站的「记录(可选)」只是备注，<b>不填也能打勾</b>；要录详细绝缘数据用「新增」页。<br>' +
      '4. 汇总页按区域统计完成率、列出未完成的区域，可一键复制上报文本。<br>' +
      '5. 管理员进后台：区域管理可加减区域名、按站单独设置；还能加模块、加字段、改阈值。<br>' +
      '6. 开启云同步后生成「团队加入码」，工友微信扫码即连上同一份进度，多人打勾实时汇总。' +
      '</div></div>';
  }

  /* ---------- 启动 ---------- */
  function init() {
    S.init().then(function (r) {
      if (r.joined) setTimeout(function () { U.toast('已加入团队云台账'); }, 400);
      go('home');
      /* 云端连上后自动刷新一次首页 */
      if (r.cloud) render();
    });
  }

  return {
    go: go, init: init, render: render, filter: filter, pickMod: pickMod,
    clearStationFilter: clearStationFilter, showStationRecords: showStationRecords,
    openAddWithPreset: openAddWithPreset, cancelEdit: cancelEdit,
    save: save, saveEdit: saveEdit, detail: detail, editRec: editRec, delRec: delRec,
    cycle: cycle, copySummary: copySummary
  };
})();
document.addEventListener('DOMContentLoaded', function () { APP.init(); });
