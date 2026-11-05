/* admin.js —— 管理员后台：模块/字段可视化编辑、全局设置、云同步、团队加入码 */
window.ADM = (function () {
  function logged() { return sessionStorage.getItem('ld_admin') === '1'; }
  function login() {
    U.sheet('进入管理后台',
      '<div class="tips" style="margin-bottom:10px">管理后台可新增模块、增删字段、修改站点与阈值、配置云同步。初始口令 <b>2468</b>，进去后可修改。</div>' +
      '<div class="field"><label>管理口令</label><input id="pinInput" type="number" inputmode="numeric" placeholder="请输入口令"></div>' +
      '<button class="btn" onclick="ADM.doLogin()">进入</button>');
  }
  function doLogin() {
    var v = (document.getElementById('pinInput') || {}).value || '';
    if (v === String(S.schema().adminPin || '2468')) {
      sessionStorage.setItem('ld_admin', '1');
      U.closeSheet(); APP.go('admin');
    } else U.toast('口令不对');
  }
  function logout() { sessionStorage.removeItem('ld_admin'); U.toast('已退出管理'); APP.go('mine'); }

  function render() {
    var s = S.schema();
    var st = S.status();
    var mods = (s.modules || []).slice().sort(function (a, b) { return (a.order || 99) - (b.order || 99); });
    var modRows = mods.map(function (m, i) {
      return '<div class="admin-item"><div style="flex:1;min-width:0">' +
        '<div class="ai-name">' + U.esc(m.name) +
        '<span class="pill ' + (m.enabled ? '' : 'pill-off') + '">' + (m.enabled ? '启用' : '停用') + '</span>' +
        (m.coverage ? '<span class="pill">参与覆盖统计</span>' : '') + '</div>' +
        '<div class="ai-desc">' + U.esc(m.desc || '') + ' · ' + (m.fields || []).length + ' 个字段</div></div>' +
        '<div class="ai-ops">' +
        '<button class="btn btn-gray btn-xs" onclick="ADM.move(\'' + m.id + '\',-1)">↑</button>' +
        '<button class="btn btn-gray btn-xs" onclick="ADM.move(\'' + m.id + '\',1)">↓</button>' +
        '<button class="btn btn-line btn-xs" onclick="ADM.editMod(\'' + m.id + '\')">编辑</button>' +
        '</div></div>';
    }).join('');

    var h =
      '<div class="card"><div class="card-title">模块管理 <span class="sub" onclick="ADM.editMod(null)">+ 新增模块</span></div>' +
      '<div class="tips">点「编辑」可改名称、图标、开关，并增删改字段。新增模块后前台「新增」页会自动出现。</div>' +
      '<div style="margin-top:8px">' + (modRows || '<div class="empty">还没有模块</div>') + '</div></div>' +

      '<div class="card"><div class="card-title">区域管理（每站分几个区打勾）<span class="sub" onclick="ADM.editZones()">去编辑</span></div>' +
      '<div class="tips">默认分区模板：<b>' + U.esc((s.zones || []).join('、') || '未设置') + '</b>。' +
      '可为单个站单独设置不同区域名；未单独设置的站用默认模板。加减区域名后，前台看板立即更新。</div>' +
      '<div style="margin-top:8px"><button class="btn btn-line btn-sm" onclick="ADM.editZones()">编辑区域名</button> ' +
      '<button class="btn btn-gray btn-sm" onclick="ADM.clearChecks()">清空本周期打勾</button></div></div>' +

      '<div class="card"><div class="card-title">全局设置</div>' +
      '<button class="btn btn-line btn-sm" onclick="ADM.editSettings()">车间 / 站点 / 阈值 / 周期 / 电话 / 口令</button>' +
      '<div class="tips">当前：' + U.esc(s.workshop) + ' · ' + U.allStations(s).length + ' 站 · 阈值 ' + s.threshold + ' MΩ · 周期 ' + s.testDay + '日' + s.testHour + ':00 · 审批 ' + U.esc(s.tempPhone) + '</div></div>' +

      '<div class="card"><div class="card-title">团队共享（默认已开启 · 零配置）</div>' +
      '<div class="row"><span class="muted">连接状态</span><span class="bold">' +
      (!st.enabled ? '本机模式（工友看不到）' : (st.cloudOn ? '已连接 · 全员共用' : (st.error ? '云端未连通' : '连接中'))) + '</span></div>' +
      '<div class="row"><span class="muted">程序版本</span><span class="bold">v' + U.esc(st.build || '旧版') + '</span></div>' +
      '<div class="row"><span class="muted">数据仓</span><span class="bold">' +
      (st.isDefault ? '工区默认共享仓' : (st.provider === 'supabase' ? '自建云数据库' : '自定义共享仓')) + '</span></div>' +
      '<div class="row"><span class="muted">待上传改动</span><span class="bold">' + (st.pending ? '有（联网自动补传）' : '无') + '</span></div>' +
      (st.error ? '<div class="badge badge-bad" style="margin-top:6px">' + U.esc(st.error) + '</div>' : '') +
      (!st.enabled ? '<div class="badge badge-bad" style="margin-top:6px">当前是本机模式，请恢复团队共享</div>' : '') +
      '<div style="margin-top:10px">' +
      '<button class="btn btn-line btn-sm" onclick="ADM.joinCode()">生成团队码（发工区群）</button> ' +
      '<button class="btn btn-line btn-sm" onclick="ADM.reloadCloud()">立即同步</button> ' +
      '<button class="btn btn-line btn-sm" onclick="BOARD.diagnose()">同步自检</button> ' +
      (!st.enabled ? '<button class="btn btn-sm" onclick="BOARD.restoreTeam()">恢复团队共享</button> ' : '') +
      '<button class="btn btn-gray btn-sm" onclick="ADM.editCloud()">高级设置</button></div>' +
      '<div class="tips"><b>怎么用</b>：把网页链接发到工区群，或扫下面「团队码」，工友打开就是同一份台账，' +
      '<b>不用注册、不用填任何英文</b>。你在这里加模块、改区域/站点/阈值，全员立即生效；' +
      '多人同时打勾不会互相覆盖，断网也能用，联网自动补传。</div></div>' +

      '<div class="card"><div class="card-title">数据管理</div>' +
      '<div class="row"><span class="muted">当前记录</span><span class="bold">' + S.records().length + ' 条</span></div>' +
      '<button class="btn btn-line btn-sm" onclick="ADM.exportData()">导出全部数据</button> ' +
      '<button class="btn btn-line btn-sm" onclick="ADM.importData()">导入数据</button> ' +
      '<button class="btn btn-gray btn-sm" onclick="ADM.reloadCloud()">从云端刷新</button>' +
      '<div class="divider"></div>' +
      '<button class="btn btn-gray btn-sm" onclick="ADM.resetModules()">恢复默认模块模板</button> ' +
      '<button class="btn btn-danger btn-sm" onclick="ADM.clearRecords()">清空所有记录</button></div>' +

      '<button class="btn btn-gray" onclick="ADM.logout()">退出管理后台</button>';
    return h;
  }

  /* 模块编辑 */
  function editMod(id) {
    var s = S.schema();
    var m = id ? U.getMod(s, id) : { id: 'm_' + Date.now(), name: '', icon: '新', desc: '', enabled: true, coverage: false, order: 99, fields: [] };
    var isNew = !id;
    var fieldsHtml = (m.fields || []).map(function (f, i) {
      return '<div class="admin-item"><div style="flex:1;min-width:0">' +
        '<div class="ai-name">' + U.esc(f.label) + ' <span class="chip">' + U.esc(typeName(f.type)) + '</span>' + (f.required ? '<span class="pill">必填</span>' : '') + '</div>' +
        '<div class="ai-desc">字段标识 ' + U.esc(f.key) + (f.role ? ' · 角色:' + U.esc(roleName(f.role)) : '') + '</div></div>' +
        '<div class="ai-ops">' +
        '<button class="btn btn-gray btn-xs" onclick="ADM.moveField(\'' + m.id + '\',' + i + ',-1)">↑</button>' +
        '<button class="btn btn-gray btn-xs" onclick="ADM.moveField(\'' + m.id + '\',' + i + ',1)">↓</button>' +
        '<button class="btn btn-line btn-xs" onclick="ADM.editField(\'' + m.id + '\',' + i + ')">编辑</button>' +
        '</div></div>';
    }).join('');

    U.sheet(isNew ? '新增模块' : '编辑模块 · ' + m.name,
      '<div class="field"><label>模块名称</label><input id="mName" type="text" value="' + U.esc(m.name) + '" placeholder="如：施工报备"></div>' +
      '<div class="field"><label>图标（1个字）</label><input id="mIcon" type="text" value="' + U.esc(m.icon) + '" maxlength="2"></div>' +
      '<div class="field"><label>说明</label><input id="mDesc" type="text" value="' + U.esc(m.desc) + '" placeholder="简短说明"></div>' +
      '<div class="row"><span>启用该模块</span><label class="switch"><input id="mEnabled" type="checkbox"' + (m.enabled ? ' checked' : '') + '><i></i></label></div>' +
      '<div class="row"><span>参与 13 站覆盖统计</span><label class="switch"><input id="mCoverage" type="checkbox"' + (m.coverage ? ' checked' : '') + '><i></i></label></div>' +
      '<div class="tips">仅当该模块含「站点」和「日期」字段时，覆盖统计才有效。</div>' +
      '<div class="divider"></div>' +
      '<div class="card-title">字段 <span class="sub" onclick="ADM.editField(\'' + m.id + '\',-1)">+ 新增字段</span></div>' +
      '<div>' + (fieldsHtml || '<div class="tips">还没有字段，点右上新增。</div>') + '</div>' +
      '<div class="divider"></div>' +
      '<button class="btn" onclick="ADM.saveMod(\'' + m.id + '\',' + isNew + ')">保存模块</button>' +
      (isNew ? '' : '<button class="btn btn-danger btn-sm" style="width:100%" onclick="ADM.delMod(\'' + m.id + '\')">删除该模块</button>'));
  }
  function typeName(t) { var x = window.FIELD_TYPES.filter(function (a) { return a.t === t; })[0]; return x ? x.n : t; }
  function roleName(r) { var x = window.FIELD_ROLES.filter(function (a) { return a.r === r; })[0]; return x ? x.n : r; }

  function saveMod(id, isNew) {
    var s = S.schema();
    var m = isNew ? { id: id, fields: [] } : U.getMod(s, id);
    m.name = (document.getElementById('mName').value || '').trim() || '未命名';
    m.icon = (document.getElementById('mIcon').value || '').trim() || '·';
    m.desc = (document.getElementById('mDesc').value || '').trim();
    m.enabled = document.getElementById('mEnabled').checked;
    m.coverage = document.getElementById('mCoverage').checked;
    if (isNew) { m.order = (s.modules || []).length + 1; s.modules.push(m); }
    else { var tmp = JSON.parse(JSON.stringify(m)); s.modules = s.modules.filter(function (x) { return x.id !== id; }); s.modules.push(tmp); m = tmp; }
    S.setSchema(s);
    U.closeSheet(); APP.go('admin'); U.toast('已保存');
    return m;
  }
  function delMod(id) {
    if (!confirm('删除模块会同时保留历史记录，但无法再新增。确认删除？')) return;
    var s = S.schema();
    s.modules = s.modules.filter(function (m) { return m.id !== id; });
    S.setSchema(s); U.closeSheet(); APP.go('admin'); U.toast('已删除');
  }
  function move(id, dir) {
    var s = S.schema();
    var arr = s.modules.slice().sort(function (a, b) { return (a.order || 99) - (b.order || 99); });
    var i = arr.findIndex(function (m) { return m.id === id; });
    var j = i + dir; if (j < 0 || j >= arr.length) return;
    var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    arr.forEach(function (m, k) { m.order = k + 1; });
    s.modules = arr; S.setSchema(s); APP.go('admin');
  }

  /* 字段编辑 */
  function editField(modId, idx) {
    var m = U.getMod(S.schema(), modId);
    var isNew = idx < 0;
    var f = isNew ? { key: 'f' + Date.now(), label: '', type: 'text', required: false, role: '', showInList: false, options: [], columns: [] } : m.fields[idx];
    var typeOpts = window.FIELD_TYPES.map(function (t) { return '<option value="' + t.t + '"' + (f.type === t.t ? ' selected' : '') + '>' + t.n + '</option>'; }).join('');
    var roleOpts = window.FIELD_ROLES.map(function (r) { return '<option value="' + r.r + '"' + (f.role === r.r ? ' selected' : '') + '>' + r.n + '</option>'; }).join('');
    U.sheet((isNew ? '新增' : '编辑') + '字段 · ' + m.name,
      '<div class="field"><label>字段名称</label><input id="fLabel" type="text" value="' + U.esc(f.label) + '" placeholder="如：作业负责人"></div>' +
      '<div class="field"><label>字段类型</label><select id="fType" onchange="ADM.onTypeChange()">' + typeOpts + '</select></div>' +
      '<div id="fOptionsBox" class="field" style="display:none"><label>下拉选项（用逗号分隔）</label><input id="fOptions" type="text" value="' + U.esc((f.options || []).join(',')) + '" placeholder="如：晴,阴,雨"></div>' +
      '<div id="fColsBox" class="field" style="display:none"><label>明细表列</label>' +
      '<div id="fColsList"></div><button class="btn btn-line btn-xs" onclick="ADM.addCol()">+ 加一列</button></div>' +
      '<div class="field"><label>字段角色（统计用）</label><select id="fRole">' + roleOpts + '</select></div>' +
      '<div class="field"><label>默认值 / 提示</label><input id="fDef" type="text" value="' + U.esc(f.def || '') + '" placeholder="可选，新建时自动带入"></div>' +
      '<div class="row"><span>必填</span><label class="switch"><input id="fReq" type="checkbox"' + (f.required ? ' checked' : '') + '><i></i></label></div>' +
      '<div class="row"><span>在台账列表显示</span><label class="switch"><input id="fShow" type="checkbox"' + (f.showInList ? ' checked' : '') + '><i></i></label></div>' +
      '<div class="row"><span>记住上次填写</span><label class="switch"><input id="fRemember" type="checkbox"' + (f.remember ? ' checked' : '') + '><i></i></label></div>' +
      '<div class="divider"></div>' +
      '<button class="btn" onclick="ADM.saveField(\'' + modId + '\',' + idx + ')">保存字段</button>' +
      (isNew ? '' : '<button class="btn btn-danger btn-sm" style="width:100%" onclick="ADM.delField(\'' + modId + '\',' + idx + ')">删除该字段</button>'),
      function () { window._cols = JSON.parse(JSON.stringify(f.columns || [])); onTypeChange(); drawCols(); });
  }
  function onTypeChange() {
    var t = (document.getElementById('fType') || {}).value;
    document.getElementById('fOptionsBox').style.display = t === 'select' ? 'block' : 'none';
    document.getElementById('fColsBox').style.display = t === 'detail' ? 'block' : 'none';
  }
  function drawCols() {
    var box = document.getElementById('fColsList'); if (!box) return;
    box.innerHTML = (window._cols || []).map(function (c, i) {
      return '<div class="detail-row">' +
        '<input type="text" value="' + U.esc(c.label) + '" placeholder="列名" oninput="ADM.setCol(' + i + ',\'label\',this.value)">' +
        '<select onchange="ADM.setCol(' + i + ',\'type\',this.value)">' +
        '<option value="text"' + (c.type === 'text' ? ' selected' : '') + '>文本</option>' +
        '<option value="number"' + (c.type === 'number' ? ' selected' : '') + '>数字</option></select>' +
        '<select onchange="ADM.setCol(' + i + ',\'role\',this.value)">' +
        '<option value=""' + (!c.role ? ' selected' : '') + '>普通</option>' +
        '<option value="insulation"' + (c.role === 'insulation' ? ' selected' : '') + '>绝缘值(标红)</option></select>' +
        '<span class="del" onclick="ADM.delCol(' + i + ')">×</span></div>';
    }).join('') + '<div class="tips">「绝缘值」列低于阈值会自动标红预警。</div>';
  }
  function addCol() { window._cols.push({ key: 'c' + Date.now(), label: '', type: 'text', role: '' }); drawCols(); }
  function setCol(i, k, v) { window._cols[i][k] = v; }
  function delCol(i) { window._cols.splice(i, 1); drawCols(); }

  function saveField(modId, idx) {
    var s = S.schema(), m = U.getMod(s, modId);
    var isNew = idx < 0;
    var f = isNew ? { key: 'f' + Date.now() } : m.fields[idx];
    f.label = (document.getElementById('fLabel').value || '').trim() || '未命名字段';
    f.type = document.getElementById('fType').value;
    f.role = document.getElementById('fRole').value;
    f.def = (document.getElementById('fDef').value || '').trim();
    f.required = document.getElementById('fReq').checked;
    f.showInList = document.getElementById('fShow').checked;
    f.remember = document.getElementById('fRemember').checked;
    f.options = (document.getElementById('fOptions').value || '').split(/[,，]/).map(function (x) { return x.trim(); }).filter(Boolean);
    f.columns = window._cols || [];
    if (isNew) m.fields.push(f);
    S.setSchema(s); U.closeSheet(); APP.go('admin'); U.toast('字段已保存');
  }
  function delField(modId, idx) {
    if (!confirm('确认删除该字段？历史记录里的数据会保留但不再显示。')) return;
    var s = S.schema(); U.getMod(s, modId).fields.splice(idx, 1);
    S.setSchema(s); U.closeSheet(); APP.go('admin');
  }
  function moveField(modId, idx, dir) {
    var s = S.schema(), arr = U.getMod(s, modId).fields;
    var j = idx + dir; if (j < 0 || j >= arr.length) return;
    var t = arr[idx]; arr[idx] = arr[j]; arr[j] = t;
    S.setSchema(s); U.closeSheet(); editMod(modId);
  }

  /* 全局设置 */
  function editSettings() {
    var s = S.schema();
    var linesTxt = (s.lines || []).map(function (l) { return l.name + '：' + (l.stations || []).join('、'); }).join('\n');
    U.sheet('全局设置',
      '<div class="field"><label>车间名称</label><input id="sWorkshop" type="text" value="' + U.esc(s.workshop) + '"></div>' +
      '<div class="field"><label>站点（每行一条线，格式「线名：站1、站2」）</label>' +
      '<textarea id="sLines" style="min-height:120px">' + U.esc(linesTxt) + '</textarea></div>' +
      '<div class="field"><label>绝缘合格阈值 (MΩ)</label><input id="sThreshold" type="number" step="0.1" value="' + U.esc(s.threshold) + '"></div>' +
      '<div class="field"><label>周期起始日 / 时刻</label><div class="detail-row">' +
      '<input id="sDay" type="number" value="' + U.esc(s.testDay) + '" placeholder="日"><span style="align-self:center">日</span>' +
      '<input id="sHour" type="number" value="' + U.esc(s.testHour) + '" placeholder="时"><span style="align-self:center">:00</span></div></div>' +
      '<div class="field"><label>不足4小时作业临时审批电话</label><input id="sPhone" type="text" value="' + U.esc(s.tempPhone) + '"></div>' +
      '<div class="field"><label>管理后台口令</label><input id="sPin" type="text" value="' + U.esc(s.adminPin) + '"></div>' +
      '<button class="btn" onclick="ADM.saveSettings()">保存设置</button>');
  }
  function saveSettings() {
    var s = S.schema();
    s.workshop = document.getElementById('sWorkshop').value.trim() || s.workshop;
    s.threshold = parseFloat(document.getElementById('sThreshold').value) || 1;
    s.testDay = parseInt(document.getElementById('sDay').value) || 25;
    s.testHour = parseInt(document.getElementById('sHour').value) || 16;
    s.tempPhone = document.getElementById('sPhone').value.trim();
    s.adminPin = document.getElementById('sPin').value.trim() || '2468';
    var lines = [];
    (document.getElementById('sLines').value || '').split(/\r?\n/).forEach(function (l) {
      if (!l.trim()) return;
      var p = l.split(/[：:]/);
      if (p.length < 2) return;
      var stations = p.slice(1).join('：').split(/[、,，]/).map(function (x) { return x.trim(); }).filter(Boolean);
      lines.push({ name: p[0].trim(), stations: stations });
    });
    if (lines.length) s.lines = lines;
    S.setSchema(s); U.closeSheet(); APP.go('admin'); U.toast('设置已保存');
  }

  /* 区域管理 */
  function parseZones(txt) {
    return (txt || '').split(/[\n,，、]/).map(function (x) { return x.trim(); }).filter(Boolean);
  }
  function editZones() {
    var s = S.schema();
    var all = U.allStations(s);
    var opts = all.map(function (st) { return '<option value="' + U.esc(st) + '">' + U.esc(st) + '</option>'; }).join('');
    U.sheet('区域管理',
      '<div class="field"><label>默认分区模板（每行一个名字，所有站通用）</label>' +
      '<textarea id="zDefault" style="min-height:90px">' + U.esc((s.zones || []).join('\n')) + '</textarea></div>' +
      '<div class="tips" style="margin-bottom:10px">例如按现场分区填：一区 / 二区 / 三区，或 上行 / 下行 / 咽喉。改完点保存。</div>' +
      '<div class="divider"></div>' +
      '<div class="card-title">为单个站单独设置（可选）</div>' +
      '<div class="field"><label>选择站点</label><select id="zStation" onchange="ADM.loadStationZones()">' + opts + '</select></div>' +
      '<div class="field"><label>该站区域名（每行一个；留空 = 用默认模板）</label>' +
      '<textarea id="zStationZones" style="min-height:80px"></textarea></div>' +
      '<button class="btn btn-line btn-sm" onclick="ADM.saveStationZones()">保存该站区域</button> ' +
      '<button class="btn btn-gray btn-sm" onclick="ADM.resetStationZones()">恢复用默认</button>' +
      '<div class="divider"></div>' +
      '<button class="btn" onclick="ADM.saveZones()">保存全部设置</button>',
      function () { loadStationZones(); });
  }
  function loadStationZones() {
    var s = S.schema();
    var st = (document.getElementById('zStation') || {}).value;
    var ov = (s.stationZones || {})[st];
    document.getElementById('zStationZones').value = ov ? ov.join('\n') : '';
  }
  function saveStationZones() {
    var s = S.schema();
    var st = document.getElementById('zStation').value;
    var arr = parseZones(document.getElementById('zStationZones').value);
    if (!s.stationZones) s.stationZones = {};
    if (arr.length) s.stationZones[st] = arr;
    else delete s.stationZones[st];
    S.setSchema(s);
    U.toast(st + ' 已设为 ' + (arr.length ? arr.join('、') : '默认模板'));
  }
  function resetStationZones() {
    var s = S.schema();
    var st = document.getElementById('zStation').value;
    if (s.stationZones) delete s.stationZones[st];
    S.setSchema(s);
    document.getElementById('zStationZones').value = '';
    U.toast(st + ' 已恢复用默认模板');
  }
  function saveZones() {
    var s = S.schema();
    var arr = parseZones(document.getElementById('zDefault').value);
    s.zones = arr.length ? arr : ['一区'];
    S.setSchema(s);
    U.closeSheet(); APP.go('admin'); U.toast('区域设置已保存，前台看板已更新');
  }
  function clearChecks() {
    var s = S.schema();
    var k = U.cycleKey(U.currentCycle(s.testDay, s.testHour));
    if (!confirm('清空「本周期」的全部打勾和站内记录？上一周期数据保留。')) return;
    S.clearCycle(k);
    APP.go('admin'); U.toast('本周期打勾已清空');
  }

  /* 团队共享高级设置：默认零配置，可切换自建云数据库 */
  function editCloud() {
    var c = S.cloudCfg(), st = S.status();
    U.sheet('团队共享 · 高级设置',
      '<div class="tips" style="margin-bottom:10px">默认已配置好<b>工区共享仓</b>，无需任何设置，打开同一链接即多人共用。' +
      '下面是可选的高级项：换一个数据仓、或改用自己注册的云数据库。</div>' +
      '<div class="divider"></div>' +
      '<div class="field"><label>团队共享</label>' +
      '<div class="row"><span>' + (c.enabled ? '已开启（推荐）' : '已关闭，仅本机') + '</span>' +
      '<button class="btn btn-gray btn-xs" onclick="ADM.toggleCloud()">' + (c.enabled ? '切换为本机模式' : '开启团队共享') + '</button></div></div>' +
      '<div class="divider"></div>' +
      '<div class="field"><label>共享仓 ID（换仓用，一般不用改）</label>' +
      '<input id="cBin" type="text" value="' + U.esc(st.bin) + '" placeholder="默认共享仓"></div>' +
      '<button class="btn btn-line btn-sm" onclick="ADM.saveTeamBin()">保存并连接</button> ' +
      '<button class="btn btn-gray btn-sm" onclick="ADM.useDefault()">恢复工区默认仓</button>' +
      '<div class="divider"></div>' +
      '<div class="tips" style="margin-bottom:8px"><b>可选：自建云数据库</b>（需自己注册 Supabase，' +
      '适合想把数据放在自己账号下的情况；不填就用上面的免费共享仓，功能完全一样）</div>' +
      '<div class="field"><label>Project URL</label><input id="cUrl" type="text" value="' + U.esc(c.url) + '" placeholder="https://xxxx.supabase.co"></div>' +
      '<div class="field"><label>anon public key</label><input id="cKey" type="text" value="' + U.esc(c.key) + '" placeholder="eyJ..."></div>' +
      '<div class="tips">自建需建表 app_data（列：id text 主键、content jsonb、updated_at timestamptz），并开启 RLS 匿名读写策略。</div>' +
      '<button class="btn" style="margin-top:8px" onclick="ADM.saveCloud()">保存并连接自建库</button>');
  }
  function toggleCloud() {
    var c = S.cloudCfg();
    var ov = { provider: c.provider, bin: c.bin, url: c.url, key: c.key, enabled: !c.enabled };
    localStorage.setItem('ld_cloud_override', JSON.stringify(ov));
    U.closeSheet(); U.toast(ov.enabled ? '已开启团队共享' : '已切换为本机模式');
    S.reload().then(function () { APP.go('admin'); });
  }
  function saveTeamBin() {
    var bin = (document.getElementById('cBin') || {}).value.trim();
    if (!bin) { U.toast('请填写共享仓 ID'); return; }
    U.closeSheet(); U.toast('正在连接…');
    S.setTeamBin(bin).then(function () { APP.go('admin'); U.toast(S.status().cloudOn ? '已连接新共享仓' : '已保存，暂未连通'); });
  }
  function useDefault() {
    U.closeSheet(); U.toast('正在恢复…');
    S.useDefaultTeam().then(function () { APP.go('admin'); U.toast('已恢复工区默认共享仓'); });
  }
  function saveCloud() {
    var url = (document.getElementById('cUrl') || {}).value.trim();
    var key = (document.getElementById('cKey') || {}).value.trim();
    if (!url || !key) { U.toast('请填写 URL 和 key'); return; }
    U.closeSheet(); U.toast('正在连接自建库…');
    S.setCloud(url, key, true).then(function () { APP.go('admin'); U.toast(S.status().cloudOn ? '自建库已连接' : '未连通，已本地保存'); });
  }
  function reloadCloud() {
    U.toast('正在同步…');
    S.syncNow().then(function () { APP.go('admin'); U.toast(S.status().cloudOn ? '已同步' : '未连到云端，数据已存本机'); });
  }

  /* 团队码：把当前页面链接生成二维码，工友扫码即共用同一份台账 */
  function joinCode() {
    var link = S.makeJoinLink();
    window._joinLink = link;
    /* 默认仓用仓库自带的二维码图片，不依赖境外二维码服务；自定义仓才动态生成 */
    var qr = S.status().isDefault
      ? 'team_qr.png?v=' + (window.CFG.BUILD || '1')
      : 'https://api.qrserver.com/v1/create-qr-code/?size=360x360&data=' + encodeURIComponent(link);
    U.sheet('团队码 · 发给工区',
      '<div class="qr-box"><img src="' + qr + '" alt="团队码"></div>' +
      '<div class="tips" style="text-align:center">工友用<b>微信扫上面二维码</b>（或点链接），打开就是<b>同一份台账</b>，' +
      '不用注册、不用填任何英文。<br>以后你加的模块、改的区域/站点，他们都能看到。</div>' +
      '<div class="divider"></div>' +
      '<button class="btn btn-line btn-sm" style="width:100%" onclick="U.copy(window._joinLink)">复制团队链接发到群里</button>' +
      '<div class="tips" style="word-break:break-all;font-size:11px;margin-top:8px">' + U.esc(link) + '</div>');
  }

  /* 数据管理 */
  function exportData() {
    U.sheet('导出数据',
      '<div class="tips" style="margin-bottom:8px">下面是全部配置与记录的备份文本，可长按全选复制保存。</div>' +
      '<textarea id="exportBox" style="width:100%;min-height:220px;padding:10px;border:1px solid #ddd;border-radius:8px;font-size:11px">' + U.esc(S.exportJson()) + '</textarea>' +
      '<button class="btn btn-line btn-sm" style="width:100%" onclick="U.copy(document.getElementById(\'exportBox\').value)">复制全部</button>');
  }
  function importData() {
    U.sheet('导入数据',
      '<div class="tips" style="margin-bottom:8px">粘贴之前导出的备份文本，导入会<b>覆盖</b>当前全部配置与记录。</div>' +
      '<textarea id="importBox" style="width:100%;min-height:180px;padding:10px;border:1px solid #ddd;border-radius:8px;font-size:12px"></textarea>' +
      '<button class="btn btn-danger" onclick="ADM.doImport()">确认导入并覆盖</button>');
  }
  function doImport() {
    try { S.importJson(document.getElementById('importBox').value); U.closeSheet(); APP.go('admin'); U.toast('导入成功'); }
    catch (e) { U.toast('导入失败：' + e.message); }
  }
  function clearRecords() {
    if (!confirm('确认清空全部记录？此操作会对全员生效（建议先导出备份）。')) return;
    S.clearAllRecords(); APP.go('admin'); U.toast('已清空记录（全员同步生效）');
  }
  function resetModules() {
    if (!confirm('恢复默认模块模板？你自定义新增的模块会被覆盖（记录保留）。')) return;
    var s = S.schema(); s.modules = JSON.parse(JSON.stringify(window.DEFAULT_SCHEMA.modules));
    s.lines = JSON.parse(JSON.stringify(window.DEFAULT_LINES));
    S.setSchema(s); APP.go('admin'); U.toast('已恢复默认模板');
  }

  return {
    logged: logged, login: login, doLogin: doLogin, logout: logout, render: render,
    editMod: editMod, saveMod: saveMod, delMod: delMod, move: move,
    editField: editField, saveField: saveField, delField: delField, moveField: moveField,
    onTypeChange: onTypeChange, addCol: addCol, setCol: setCol, delCol: delCol, drawCols: drawCols,
    editSettings: editSettings, saveSettings: saveSettings,
    editZones: editZones, loadStationZones: loadStationZones, saveStationZones: saveStationZones,
    resetStationZones: resetStationZones, saveZones: saveZones, clearChecks: clearChecks,
    editCloud: editCloud, saveCloud: saveCloud, reloadCloud: reloadCloud, joinCode: joinCode,
    toggleCloud: toggleCloud, saveTeamBin: saveTeamBin, useDefault: useDefault,
    exportData: exportData, importData: importData, doImport: doImport,
    clearRecords: clearRecords, resetModules: resetModules
  };
})();
