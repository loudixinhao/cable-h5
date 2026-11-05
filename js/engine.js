/* engine.js —— 按「模块/字段配置」动态渲染表单与台账 */
window.ENG = (function () {
  var draft = null;   // { modId, values:{}, details:{fkey:[{col:v}]} }

  function start(mod, preset) {
    draft = { modId: mod.id, values: {}, details: {} };
    (mod.fields || []).forEach(function (f) {
      if (f.type === 'detail') {
        draft.details[f.key] = (preset && preset[f.key]) ? JSON.parse(JSON.stringify(preset[f.key])) : [{}];
      } else {
        var v = '';
        if (preset && preset[f.key] !== undefined) v = preset[f.key];
        else if (f.def !== undefined) v = f.def;
        else if (f.remember) { try { v = localStorage.getItem('ld_remember_' + mod.id + '_' + f.key) || ''; } catch (e) {} }
        else if (f.type === 'date') v = U.today();
        draft.values[f.key] = v;
      }
    });
    return draft;
  }
  function cur() { return draft; }
  function setVal(k, v) { if (draft) draft.values[k] = v; }

  /* 单字段控件 */
  function fieldHtml(mod, f) {
    var v = draft.values[f.key] !== undefined ? draft.values[f.key] : '';
    var req = f.required ? ' <span class="req">*</span>' : '';
    var h = '<div class="field" data-fwrap="' + U.esc(f.key) + '"><label>' + U.esc(f.label) + req + '</label>';
    var onin = 'ENG.setVal(\'' + f.key + '\',this.value)';
    var t = f.type;
    if (t === 'textarea') {
      h += '<textarea placeholder="' + U.esc(f.placeholder || '请输入') + '" oninput="' + onin + '">' + U.esc(v) + '</textarea>';
    } else if (t === 'select') {
      h += '<select onchange="' + onin + '"><option value="">请选择</option>' +
        (f.options || []).map(function (o) {
          return '<option value="' + U.esc(o) + '"' + (String(v) === String(o) ? ' selected' : '') + '>' + U.esc(o) + '</option>';
        }).join('') + '</select>';
    } else if (t === 'station') {
      var sch = S.schema();
      h += '<select onchange="' + onin + '"><option value="">请选择站点</option>' +
        (sch.lines || []).map(function (l) {
          return '<optgroup label="' + U.esc(l.name) + '">' + (l.stations || []).map(function (s) {
            return '<option value="' + U.esc(s) + '"' + (v === s ? ' selected' : '') + '>' + U.esc(s) + '</option>';
          }).join('') + '</optgroup>';
        }).join('') + '</select>';
    } else if (t === 'date') {
      h += '<input type="date" value="' + U.esc(v) + '" onchange="' + onin + '">';
    } else if (t === 'time') {
      h += '<input type="time" value="' + U.esc(v) + '" onchange="' + onin + '">';
    } else if (t === 'number') {
      h += '<input type="number" inputmode="decimal" value="' + U.esc(v) + '" placeholder="' + U.esc(f.placeholder || '请输入数字') + '" oninput="' + onin + '">';
    } else if (t === 'phone') {
      h += '<input type="tel" value="' + U.esc(v) + '" placeholder="电话号码" oninput="' + onin + '">' +
        (v ? '<a class="link" style="font-size:13px" href="tel:' + U.esc(v) + '">拨打</a>' : '');
    } else if (t === 'detail') {
      h += detailHtml(f) + '</div>';
      return h;
    } else {
      h += '<input type="text" value="' + U.esc(v) + '" placeholder="' + U.esc(f.placeholder || '请输入') + '" oninput="' + onin + '">';
    }
    h += '</div>';
    return h;
  }

  /* 明细表 */
  function detailHtml(f) {
    var rows = draft.details[f.key] || [{}];
    var cols = f.columns || [];
    var th = parseFloat(S.schema().threshold);
    var head = '<div class="detail-head">' + cols.map(function (c) { return '<span>' + U.esc(c.label) + '</span>'; }).join('') + '</div>';
    var body = rows.map(function (row, ri) {
      return '<div class="detail-row">' + cols.map(function (c) {
        var val = row[c.key] !== undefined ? row[c.key] : '';
        var bad = (c.role === 'insulation' && val !== '' && !isNaN(parseFloat(val)) && parseFloat(val) < th) ? ' bad-val' : '';
        var inp = c.type === 'select' && c.options
          ? '<select onchange="ENG.setCell(\'' + f.key + '\',' + ri + ',\'' + c.key + '\',this.value)">' +
            '<option value="">选择</option>' + c.options.map(function (o) {
              return '<option value="' + U.esc(o) + '"' + (val === o ? ' selected' : '') + '>' + U.esc(o) + '</option>';
            }).join('') + '</select>'
          : '<input type="' + (c.type === 'number' ? 'number' : 'text') + '"' + (c.type === 'number' ? ' inputmode="decimal"' : '') +
            ' class="' + bad.trim() + '" value="' + U.esc(val) + '" placeholder="' + U.esc(c.label) + '"' +
            ' oninput="ENG.setCell(\'' + f.key + '\',' + ri + ',\'' + c.key + '\',this.value)">';
        return inp;
      }).join('') + '<span class="del" onclick="ENG.delRow(\'' + f.key + '\',' + ri + ')">×</span></div>';
    }).join('');
    return head + body +
      '<div style="margin-top:6px">' +
      '<button class="btn btn-line btn-xs" onclick="ENG.addRow(\'' + f.key + '\')">+ 加一行</button> ' +
      '<button class="btn btn-gray btn-xs" onclick="ENG.batchPaste(\'' + f.key + '\')">批量粘贴</button> ' +
      '<button class="btn btn-gray btn-xs" onclick="ENG.addRows(\'' + f.key + '\',5)">+5行</button></div>';
  }
  function redrawDetail(fkey) {
    var mod = U.getMod(S.schema(), draft.modId);
    var f = (mod.fields || []).filter(function (x) { return x.key === fkey; })[0];
    var wrap = document.querySelector('[data-fwrap="' + fkey + '"]');
    if (wrap && f) {
      var label = wrap.querySelector('label');
      wrap.innerHTML = label.outerHTML + detailHtml(f);
    }
  }
  function setCell(fkey, ri, ckey, v) {
    if (!draft.details[fkey]) draft.details[fkey] = [{}];
    if (!draft.details[fkey][ri]) draft.details[fkey][ri] = {};
    draft.details[fkey][ri][ckey] = v;
    /* 绝缘值实时标红 */
    var mod = U.getMod(S.schema(), draft.modId);
    var f = (mod.fields || []).filter(function (x) { return x.key === fkey; })[0];
    var col = (f.columns || []).filter(function (c) { return c.key === ckey; })[0];
    if (col && col.role === 'insulation') {
      var th = parseFloat(S.schema().threshold);
      var inputs = document.querySelectorAll('[data-fwrap="' + fkey + '"] .detail-row');
      var rowEl = inputs[ri];
      if (rowEl) {
        var idx = (f.columns || []).indexOf(col);
        var inp = rowEl.querySelectorAll('input,select')[idx];
        if (inp) inp.classList.toggle('bad-val', v !== '' && !isNaN(parseFloat(v)) && parseFloat(v) < th);
      }
    }
  }
  function addRow(fkey) { draft.details[fkey].push({}); redrawDetail(fkey); }
  function addRows(fkey, n) { for (var i = 0; i < n; i++) draft.details[fkey].push({}); redrawDetail(fkey); }
  function delRow(fkey, ri) { draft.details[fkey].splice(ri, 1); if (!draft.details[fkey].length) draft.details[fkey] = [{}]; redrawDetail(fkey); }

  /* 批量粘贴：每行一条，列用 Tab/逗号/空格分隔 */
  function batchPaste(fkey) {
    var mod = U.getMod(S.schema(), draft.modId);
    var f = (mod.fields || []).filter(function (x) { return x.key === fkey; })[0];
    var cols = f.columns || [];
    U.sheet('批量粘贴 · 每行一条',
      '<div class="tips" style="margin-bottom:8px">从 Excel/表格复制两列（如「电缆编号」和「绝缘值」），粘贴到下面；每行一条，列之间用 Tab、逗号或空格分隔。' +
      '<br>列名顺序：' + cols.map(function (c) { return U.esc(c.label); }).join(' / ') + '</div>' +
      '<textarea id="pasteBox" style="width:100%;min-height:150px;padding:10px;border:1px solid #ddd;border-radius:8px;font-size:14px" placeholder="例如：\n1-1芯  12.5\n2-1芯  0.8"></textarea>' +
      '<button class="btn" onclick="ENG.doPaste(\'' + fkey + '\')">导入到明细</button>',
      function () { setTimeout(function () { var e = document.getElementById('pasteBox'); if (e) e.focus(); }, 100); });
  }
  function doPaste(fkey) {
    var txt = (document.getElementById('pasteBox') || {}).value || '';
    var lines = txt.split(/\r?\n/).filter(function (l) { return l.trim(); });
    var mod = U.getMod(S.schema(), draft.modId);
    var f = (mod.fields || []).filter(function (x) { return x.key === fkey; })[0];
    var cols = f.columns || [];
    var rows = [];
    lines.forEach(function (l) {
      var parts = l.split(/\t|,|，|\s{1,}/).filter(function (p) { return p !== ''; });
      var row = {};
      cols.forEach(function (c, i) { row[c.key] = parts[i] !== undefined ? parts[i].trim() : ''; });
      rows.push(row);
    });
    if (!rows.length) { U.toast('没有识别到数据'); return; }
    var existing = draft.details[fkey].filter(function (r) { return Object.keys(r).some(function (k) { return r[k]; }); });
    draft.details[fkey] = existing.concat(rows);
    U.closeSheet(); redrawDetail(fkey);
    U.toast('已导入 ' + rows.length + ' 行');
  }

  /* 表单整体 */
  function formHtml(mod) {
    return (mod.fields || []).map(function (f) { return fieldHtml(mod, f); }).join('');
  }
  function collect(mod) {
    var out = JSON.parse(JSON.stringify(draft.values));
    var missing = null;
    (mod.fields || []).forEach(function (f) {
      if (f.type === 'detail') {
        var rows = (draft.details[f.key] || []).filter(function (r) {
          return Object.keys(r).some(function (k) { return String(r[k] || '').trim() !== ''; });
        });
        out[f.key] = rows;
        if (f.required && !rows.length) missing = missing || f.label;
      } else if (f.required && String(out[f.key] || '').trim() === '') {
        missing = missing || f.label;
      }
    });
    if (missing) { U.toast('请填写：' + missing); return null; }
    /* 记住常用字段 */
    (mod.fields || []).forEach(function (f) {
      if (f.remember && f.type !== 'detail') {
        try { localStorage.setItem('ld_remember_' + mod.id + '_' + f.key, out[f.key] || ''); } catch (e) {}
      }
    });
    return out;
  }
  function lastPreset(modId) {
    var recs = S.records().filter(function (r) { return r._mod === modId; });
    if (!recs.length) return null;
    var p = JSON.parse(JSON.stringify(recs[0]));
    delete p._id; delete p._mod; delete p._at; delete p._date;
    return p;
  }
  function reuse(modId) {
    var p = lastPreset(modId);
    if (!p) { U.toast('该模块还没有历史记录'); return; }
    APP.openAddWithPreset(modId, p);
    U.toast('已带入上一条记录，改一下即可保存');
  }

  /* 台账条目 */
  function listItemHtml(mod, rec) {
    var tf = U.getField(mod, 'title');
    var df = U.getField(mod, 'date');
    var sf = U.getField(mod, 'station');
    var bf = U.getField(mod, 'badge');
    var title = tf && rec[tf.key] ? rec[tf.key] : (mod.name + ' 记录');
    var meta = [];
    if (df && rec[df.key]) meta.push(rec[df.key]);
    if (sf && rec[sf.key]) meta.push(rec[sf.key]);
    var badge = U.isBad(S.schema(), mod, rec)
      ? '<span class="badge badge-bad">不合格</span>'
      : (bf && rec[bf.key] ? '<span class="badge badge-ok">' + U.esc(rec[bf.key]) + '</span>' : '');
    var shown = (mod.fields || []).filter(function (f) { return f.showInList && f.type !== 'detail' && f.key !== (tf && tf.key); })
      .slice(0, 2).map(function (f) { return U.esc(f.label) + ':' + U.esc(rec[f.key] || '-'); }).join(' · ');
    return '<div class="list-item" onclick="APP.detail(\'' + rec._id + '\')">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px">' +
      '<span class="li-title">' + U.esc(title) + '</span>' + badge + '</div>' +
      '<div class="li-meta">' + U.esc(meta.join(' · ')) + ' · ' + U.esc(mod.name) + '</div>' +
      (shown ? '<div class="li-fields">' + shown + '</div>' : '') + '</div>';
  }

  /* 详情 */
  function detailHtmlRec(mod, rec) {
    var h = '';
    (mod.fields || []).forEach(function (f) {
      if (f.type === 'detail') {
        var rows = rec[f.key] || [];
        h += '<div class="card-title" style="margin-top:12px">' + U.esc(f.label) + '（' + rows.length + '条）</div>';
        h += '<table class="tbl"><tr>' + (f.columns || []).map(function (c) { return '<th>' + U.esc(c.label) + '</th>'; }).join('') + '</tr>';
        rows.forEach(function (row) {
          h += '<tr>' + (f.columns || []).map(function (c) {
            var v = row[c.key] !== undefined ? row[c.key] : '';
            var bad = c.role === 'insulation' && v !== '' && !isNaN(parseFloat(v)) && parseFloat(v) < parseFloat(S.schema().threshold);
            return '<td class="' + (bad ? 'bad' : '') + '">' + U.esc(v) + (c.role === 'insulation' && v !== '' ? ' MΩ' : '') + '</td>';
          }).join('') + '</tr>';
        });
        h += '</table>';
      } else {
        var val = rec[f.key] !== undefined && rec[f.key] !== '' ? rec[f.key] : '-';
        h += '<div class="row"><span class="muted">' + U.esc(f.label) + '</span><span>' + U.esc(val) + '</span></div>';
      }
    });
    return h;
  }

  return {
    start: start, cur: cur, setVal: setVal, formHtml: formHtml,
    setCell: setCell, addRow: addRow, addRows: addRows, delRow: delRow,
    batchPaste: batchPaste, doPaste: doPaste, collect: collect,
    reuse: reuse, listItemHtml: listItemHtml, detailHtmlRec: detailHtmlRec
  };
})();
