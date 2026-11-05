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
      label = '本机模式';
      sub = '数据仅存这台手机，未开启团队共享';
    } else if (st.cloudOn) {
      label = st.syncing ? '团队共享 · 同步中' : '团队共享 · 已连接';
      var t = st.lastSync ? new Date(st.lastSync) : null;
      sub = '全工区同一份台账 · 最近同步 ' + (t ? U.pad(t.getHours()) + ':' + U.pad(t.getMinutes()) + ':' + U.pad(t.getSeconds()) : '—') +
        (st.pending ? ' · 有改动待上传' : '');
    } else {
      label = '离线（本地已保存）';
      sub = '联网后自动补传，不影响现在打勾';
    }
    return '<div class="sync-bar ' + cls + '"><span class="sync-dot"></span>' +
      '<span class="sync-txt"><b>' + label + '</b><br>' + U.esc(sub) +
      (st.error ? '<br><span style="color:#e54d42">' + U.esc(st.error) + '</span>' : '') + '</span>' +
      '<span class="sync-btn" onclick="BOARD.syncNow()">立即同步</span></div>';
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
    syncNow: syncNow, editMember: editMember, saveMember: saveMember
  };
})();
