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

  function render() {
    var s = S.schema(), c = cyc(), k = key();
    var stat = U.zoneStats(s, S.checks(), c);
    var sNotes = (S.notes() || {})[k] || {};
    var left = U.daysLeft(s.testDay, s.testHour);
    var st = S.status();

    var h = '';
    /* 顶部总览 */
    h += '<div class="card"><div class="card-title">' + U.esc(s.workshop) + ' · 本周期任务盯控</div>' +
      '<div style="text-align:center"><span class="cd-num">' + left + '</span><span class="muted"> 天后到下次 ' + s.testDay + ' 日 ' + s.testHour + ':00</span></div>' +
      '<div class="muted" style="text-align:center">' + U.ymd(c.start) + ' ~ ' + U.ymd(c.end) + '</div>' +
      '<div class="divider"></div>' +
      '<div class="row"><span class="muted">区域完成</span><span class="bold">' + stat.done + ' / ' + stat.total + ' 个区域</span></div>' +
      '<div class="progress"><i style="width:' + (stat.total ? stat.done / stat.total * 100 : 0) + '%"></i></div>' +
      '<div class="row"><span class="muted">整站完成（全区域打勾）</span><span class="bold">' + stat.stationDone + ' / ' + stat.stationTotal + ' 站</span></div>' +
      (st.enabled ? '<div class="tips">已连团队云台账，工友打勾会实时汇总到这里。</div>'
        : '<div class="tips">当前为本机记录。开启云同步后，工区多人打勾会汇总到一起（见「我的」→管理后台）。</div>') +
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
            var on = !!stat.map[U.ckKey(stn.name, z)];
            return '<div class="zone-cell ' + (on ? 'on' : '') + '" onclick="BOARD.tick(\'' + U.esc(stn.name) + '\',\'' + U.esc(z) + '\')">' +
              '<span class="zone-check">' + (on ? '✓' : '') + '</span>' + U.esc(z) + '</div>';
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
    note: note, saveNote: saveNote, clearNote: clearNote, viewRecords: viewRecords
  };
})();
