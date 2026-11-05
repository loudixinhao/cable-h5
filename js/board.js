/* board.js —— 区域盯控看板：线 → 站 → 区域，点击打勾标记完成 */
window.BOARD = (function () {
  var expanded = {};      // 站展开状态
  var cycMode = 'cur';    // 本周期 / 上一周期（上一周期只读回看）

  function cyc() {
    var s = S.schema();
    return cycMode === 'cur'
      ? U.currentCycle(s.testDay, s.testHour)
      : U.prevCycle(s.testDay, s.testHour);
  }
  function key() { return U.cycleKey(cyc()); }
  function readonly() { return cycMode === 'prev'; }

  function syncBar() {
    var st = S.status();
    var cls = !st.enabled ? 'off' : (st.cloudOn ? '' : (st.error ? 'err' : 'off'));
    var label, sub;
    if (!st.enabled) {
      label = '未连团队共享（本机模式）';
      sub = '数据只在这台手机，工友看不到';
    } else if (st.cloudOn) {
      label = st.syncing ? '团队共享 · 同步中' : '团队共享 · 已连接云端';
      var t = st.lastSync ? new Date(st.lastSync) : null;
      sub = '全工区同一份台账 · 最近成功 ' +
        (t ? U.pad(t.getHours()) + ':' + U.pad(t.getMinutes()) + ':' + U.pad(t.getSeconds()) : '—') +
        (st.pending ? ' · 有改动待上传' : '');
    } else {
      label = st.error ? '云端未连通（本地已保存）' : '正在连接云端…';
      sub = '本地改动已保存，会自动重试补传，不影响现在打勾';
    }
    /* 版本号常显：截图就能看出这台手机是不是加载了旧版 */
    var subHtml = U.esc(sub) + ' <span class="muted">· v' + U.esc(st.build || '旧版') + '</span>';
    if (!st.enabled) subHtml += ' <span style="color:#1989fa;text-decoration:underline" onclick="BOARD.restoreTeam()">点此恢复共享</span>';
    return '<div class="sync-bar ' + cls + '"><span class="sync-dot"></span>' +
      '<span class="sync-txt"><b>' + label + '</b><br>' + subHtml +
      (st.error ? '<br><span style="color:#e54d42">' + U.esc(st.error) + '</span>' : '') + '</span>' +
      '<span class="sync-btn" onclick="BOARD.syncNow()">立即同步</span></div>';
  }

  /* 一键恢复工区默认共享仓（误切「本机模式」/连错仓时可自救） */
  function restoreTeam() {
    if (!confirm('恢复为工区默认共享仓？\n本机已有的打勾和记录会保留并合并上传，不会丢失。')) return;
    U.toast('正在恢复…');
    S.useDefaultTeam().then(function () { return S.syncNow(); })
      .then(function () { render(); U.toast('已恢复团队共享'); });
  }

  /* 同步自检：把「连没连上、连的哪个仓、是不是旧版」一次性摆出来 */
  function diagnose() {
    U.sheet('同步自检', '<div class="tips">正在检测云端连通，请稍候…</div>');
    S.diagnose().then(function (d) {
      var r = [];
      function row(k, v) { r.push('<div class="row"><span class="muted">' + k + '</span><span class="bold">' + v + '</span></div>'); }
      row('程序版本', 'v' + U.esc(d.build));
      row('云端连通', d.ok ? '<span style="color:#07a854">成功 · ' + d.ms + ' ms</span>' : '<span style="color:#e54d42">失败</span>');
      if (!d.ok) row('失败原因', U.esc(d.error || '未知'));
      row('团队共享', d.enabled ? (d.isDefault ? '工区默认仓 ✓' : '自定义数据仓') : '<span style="color:#e54d42">未开启</span>');
      row('数据仓编号', U.esc(String(d.bin || '—')));
      row('打开方式', d.wechat ? '微信内置浏览器' : '手机浏览器');
      if (d.override) row('本机特殊设置', U.esc(d.override));
      if (d.cloud) {
        row('云端 · 打勾', d.cloud.checksOn + ' 个 / ' + d.cloud.checkCycles + ' 个周期');
        row('云端 · 记录', d.cloud.records + ' 条');
        row('云端 · 站点', d.cloud.stations + ' 站 · 默认区域 ' + d.cloud.zones + ' 类');
        row('云端数据指纹', d.cloud.fingerprint);
        row('本机数据指纹', d.local.fingerprint);
        row('两端是否一致', d.sameFingerprint ? '<span style="color:#07a854">一致 ✓</span>' : '不一致（同步后会一致）');
      }
      var html = r.join('') + '<div class="divider"></div>' +
        '<div class="tips">两台手机都点一次「同步自检」，<b>数据仓编号</b>和<b>云端数据指纹</b>相同，才是同一份台账。<br>' +
        (d.wechat ? '<b>提示：</b>微信里可能一直加载旧版，建议点右上角「···」→「在浏览器打开」。<br>' : '') +
        '把这一屏截图发出来，就能判断是没连上云端、连错仓，还是手机缓存了旧版。</div>' +
        '<div style="margin-top:10px">' +
        '<button class="btn btn-line btn-sm" onclick="S.syncNow().then(function(){BOARD.diagnose()})">立即同步并复测</button> ' +
        (!d.enabled ? '<button class="btn btn-sm" onclick="U.closeSheet();BOARD.restoreTeam()">恢复团队共享</button> ' : '') +
        '<button class="btn btn-gray btn-sm" onclick="U.closeSheet()">关闭</button></div>';
      U.sheet('同步自检', html);
    });
  }

  function render() {
    var s = S.schema(), c = cyc(), k = key();
    var rawChecks = S.checks() || {};
    var stat = U.zoneStats(s, rawChecks, c);
    var sNotes = (S.notes() || {})[k] || {};
    var left = U.daysLeft(s.testDay, s.testHour);

    var h = '';
    /* 顶部总览 */
    h += '<div class="card"><div class="card-title">' + U.esc(s.workshop) + ' · 本周期任务盯控</div>' +
      syncBar() +
      '<div style="text-align:center"><span class="cd-num">' + left + '</span><span class="muted"> 天后到下次 ' + s.testDay + ' 日 ' + s.testHour + ':00</span></div>' +
      '<div class="muted" style="text-align:center">' + U.ymd(c.start) + ' ~ ' + U.ymd(c.end) + '</div>' +
      '<div class="divider"></div>' +
      '<div class="row"><span class="muted">区域完成</span><span class="bold">' + stat.done + ' / ' + stat.total + ' 个区域</span></div>' +
      '<div class="progress"><i style="width:' + (stat.total ? stat.done / stat.total * 100 : 0) + '%"></i></div>' +
      '<div class="row"><span class="muted">整站完成（全区域打勾）</span><span class="bold">' + stat.stationDone + ' / ' + stat.stationTotal + ' 站</span></div>' +
      '<div class="divider"></div>' +
      '<div class="row"><span class="muted">我的署名</span><span class="bold link" style="color:#1989fa" onclick="BOARD.editMember()">' +
      U.esc(S.member() || '点此填写姓名') + ' <span class="muted" style="font-weight:400">›</span></span></div>' +
      memberLine(k) +
      '<div class="tips">工友打开同一链接或扫「团队码」即共用这份进度，谁勾的、什么时候勾的都可查；断网也能勾，联网自动补传。</div>' +
      '</div>';

    /* 周期切换 */
    h += '<div class="seg"><div class="' + (cycMode === 'cur' ? 'active' : '') + '" onclick="BOARD.setMode(\'cur\')">本周期</div>' +
      '<div class="' + (cycMode === 'prev' ? 'active' : '') + '" onclick="BOARD.setMode(\'prev\')">上一周期(回看)</div></div>';
    if (readonly()) h += '<div class="tips" style="margin-bottom:8px">上一周期仅供回看，不能修改打勾。</div>';

    /* 按线 → 站 → 区域 */
    stat.lines.forEach(function (line) {
      var lineDone = 0, lineTotal = 0;
      line.stations.forEach(function (st2) { lineDone += st2.done; lineTotal += st2.total; });
      h += '<div class="card"><div class="card-title">' + U.esc(line.name) +
        '<span class="sub">' + lineDone + '/' + lineTotal + ' 区域</span></div>';

      line.stations.forEach(function (stn) {
        var full = stn.total > 0 && stn.done === stn.total;
        var open = expanded[stn.name] !== false;   // 默认展开
        var note = sNotes[stn.name] || '';
        h += '<div class="station-block">';
        h += '<div class="station-head" onclick="BOARD.toggleStation(\'' + U.esc(stn.name) + '\')">' +
          '<span class="station-name">' + (full ? '✓ ' : '') + U.esc(stn.name) +
          (note ? ' <span class="pill">有记录</span>' : '') + '</span>' +
          '<span class="station-right">' +
          (full ? '<span class="badge badge-ok">已完成</span>' :
            '<span class="badge ' + (stn.done ? 'badge-warn' : 'badge-gray') + '">' + stn.done + '/' + stn.total + '</span>') +
          '<span class="caret">' + (open ? '▾' : '▸') + '</span></span></div>';

        if (open) {
          h += '<div class="zone-grid">' + stn.zones.map(function (z) {
            var rec = stat.map[U.ckKey(stn.name, z)];
            var on = !!rec;
            var by = on ? (rec.by || '') : '';
            var at = on ? shortAt(rec.at) : '';
            return '<div class="zone-cell ' + (on ? 'on' : '') + '" onclick="BOARD.tick(\'' + U.esc(stn.name) + '\',\'' + U.esc(z) + '\')">' +
              '<span class="zone-main"><span class="zone-check">' + (on ? '✓' : '') + '</span>' + U.esc(z) + '</span>' +
              (on ? '<span class="zone-by">' + U.esc((by || '未署名') + (at ? ' · ' + at : '')) + '</span>' : '') +
              '</div>';
          }).join('') + '</div>';
          if (!stn.zones.length) h += '<div class="tips">该站还没设置区域，请管理员到后台「区域管理」添加。</div>';

          /* 可选记录入口（不强制） */
          h += '<div class="station-ops">' +
            '<button class="btn btn-gray btn-xs" onclick="BOARD.note(\'' + U.esc(stn.name) + '\')">' + (note ? '查看/改记录' : '+ 记录(可选)') + '</button> ' +
            '<button class="btn btn-line btn-xs" onclick="BOARD.viewRecords(\'' + U.esc(stn.name) + '\')">该站台账</button>' +
            '</div>';
        }
        h += '</div>';
      });
      h += '</div>';
    });

    /* 审批电话 */
    h += '<div class="card"><div class="card-title">不足 4 小时作业临时审批</div>' +
      '<div class="row"><span class="muted">临时审批电话</span><a class="call-btn" href="tel:' + U.esc(s.tempPhone) + '">' + U.esc(s.tempPhone) + '</a></div></div>';

    h += '<button class="btn btn-line" onclick="APP.go(\'summary\')">查看汇总 / 复制上报文本</button>';
    document.getElementById('view-home').innerHTML = h;
  }

  function memberLine(cycKey) {
    var ms = window.SYNC.members(S.get(), cycKey);
    if (!ms.length) return '<div class="tips">本周期还没有人打勾，完成后这里会显示参与人。</div>';
    return '<div style="margin-top:6px"><span class="muted" style="font-size:12px">本周期参与（' + ms.length + ' 人）：</span><br>' +
      ms.map(function (m) { return '<span class="member-chip">' + U.esc(m.name) + '</span>'; }).join('') + '</div>';
  }

  function shortAt(iso) {
    if (!iso) return '';
    var m = String(iso).match(/-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
    return m ? m[1] + '/' + m[2] + ' ' + m[3] + ':' + m[4] : '';
  }
  function syncNow() {
    U.toast('正在同步…');
    S.syncNow().then(function () {
      render();
      var st = S.status();
      U.toast(st.cloudOn ? (st.pending ? '已连上，仍有改动待补传' : '已同步到团队台账') : '暂未连上，数据已存在本机');
    });
  }
  function editMember() {
    U.sheet('设置我的姓名',
      '<div class="tips" style="margin-bottom:8px">填一次即可（存在这台手机）。你打勾、写记录时会署上名字，工区其他人能看到「谁完成的」。</div>' +
      '<div class="field"><label>姓名 / 工号</label><input id="memBox" type="text" value="' + U.esc(S.member()) + '" placeholder="如：张三"></div>' +
      '<button class="btn" onclick="BOARD.saveMember()">保存</button>');
  }
  function saveMember() {
    var v = (document.getElementById('memBox') || {}).value || '';
    S.setMember(v); U.closeSheet(); render(); U.toast('已保存：' + (v.trim() || '未署名'));
  }
  function setMode(m) { cycMode = m; render(); }
  function toggleStation(name) { expanded[name] = expanded[name] === false; render(); }

  function tick(station, zone) {
    if (readonly()) { U.toast('上一周期仅供回看'); return; }
    var on = S.toggleCheck(key(), station, zone);
    U.toast(on ? station + ' · ' + zone + ' 已完成' : station + ' · ' + zone + ' 已取消完成');
    render();
  }

  /* 站备注（可选记录，不强制） */
  function note(station) {
    var k = key();
    var cur = ((S.notes() || {})[k] || {})[station] || '';
    U.sheet(station + ' · 本周期记录（可选）',
      '<div class="tips" style="margin-bottom:8px">这里只记一句备注/情况说明，<b>不填写不影响打勾</b>。' +
      '如需录入详细绝缘测试数据，用「新增」页选对应模块。</div>' +
      '<div class="field"><label>情况记录</label><textarea id="noteBox" placeholder="如：一区、二区已测，三区待天窗点；或填不合格处理情况">' + U.esc(cur) + '</textarea></div>' +
      '<button class="btn" onclick="BOARD.saveNote(\'' + U.esc(station) + '\')">保存记录</button>' +
      (cur ? ' <button class="btn btn-gray btn-sm" onclick="BOARD.clearNote(\'' + U.esc(station) + '\')">清除记录</button>' : ''));
  }
  function saveNote(station) {
    var v = (document.getElementById('noteBox') || {}).value || '';
    S.setNote(key(), station, v);
    U.closeSheet(); render(); U.toast('已保存');
  }
  function clearNote(station) {
    S.setNote(key(), station, '');
    U.closeSheet(); render(); U.toast('已清除');
  }
  function viewRecords(station) { APP.showStationRecords(station); }

  return {
    render: render, setMode: setMode, toggleStation: toggleStation, tick: tick,
    note: note, saveNote: saveNote, clearNote: clearNote, viewRecords: viewRecords,
    syncNow: syncNow, editMember: editMember, saveMember: saveMember,
    diagnose: diagnose, restoreTeam: restoreTeam
  };
})();
