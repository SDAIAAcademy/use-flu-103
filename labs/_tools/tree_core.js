/* The classifier of the no-code trainer: a small decision tree. This one file is placed inside
   labs/files/trainer.html by prepare_files.mjs and is run again by labs/solutions/check.mjs, so
   the page and the reference numbers come from the same code. Plain script, no dependencies. */
var TreeCore = (function () {
  'use strict';

  /* rows: [{feature: value, ..., label: 0|1}], features: [{id, kind: 'num'|'cat'}] */
  function gini(pos, n) {
    if (n === 0) return 0;
    var p = pos / n;
    return 2 * p * (1 - p);
  }

  function candidates(rows, f) {
    var seen = {}, vals = [], i, v;
    for (i = 0; i < rows.length; i++) {
      v = rows[i][f.id];
      if (!seen[v]) { seen[v] = true; vals.push(v); }
    }
    if (f.kind === 'cat') { vals.sort(); return vals; }
    vals.sort(function (a, b) { return a - b; });
    var cuts = [];
    for (i = 1; i < vals.length; i++) cuts.push((vals[i - 1] + vals[i]) / 2);
    return cuts;
  }

  function goesLeft(row, f, cut) {
    return f.kind === 'cat' ? row[f.id] === cut : row[f.id] < cut;
  }

  function bestSplit(rows, features) {
    var n = rows.length, pos = 0, i, j, k;
    for (i = 0; i < n; i++) pos += rows[i].label;
    var parent = gini(pos, n), best = null;
    for (j = 0; j < features.length; j++) {
      var f = features[j], cuts = candidates(rows, f);
      for (k = 0; k < cuts.length; k++) {
        var ln = 0, lp = 0;
        for (i = 0; i < n; i++) if (goesLeft(rows[i], f, cuts[k])) { ln++; lp += rows[i].label; }
        var rn = n - ln, rp = pos - lp;
        if (ln === 0 || rn === 0) continue;
        var gain = parent - (ln / n) * gini(lp, ln) - (rn / n) * gini(rp, rn);
        if (gain > 1e-9 && (best === null || gain > best.gain + 1e-12)) best = { gain: gain, f: f, cut: cuts[k] };
      }
    }
    return best;
  }

  function leaf(rows) {
    var pos = 0;
    for (var i = 0; i < rows.length; i++) pos += rows[i].label;
    return { leaf: true, n: rows.length, pos: pos, predict: pos * 2 > rows.length ? 1 : 0 };
  }

  function grow(rows, features, depth) {
    var node = leaf(rows);
    if (depth === 0 || node.pos === 0 || node.pos === node.n) return node;
    var s = bestSplit(rows, features);
    if (!s) return node;
    var left = [], right = [];
    for (var i = 0; i < rows.length; i++) (goesLeft(rows[i], s.f, s.cut) ? left : right).push(rows[i]);
    return { leaf: false, n: node.n, pos: node.pos, f: s.f, cut: s.cut,
      left: grow(left, features, depth - 1), right: grow(right, features, depth - 1) };
  }

  function train(rows, features, depth) { return grow(rows, features, depth); }

  function predict(tree, row) {
    var node = tree;
    while (!node.leaf) node = goesLeft(row, node.f, node.cut) ? node.left : node.right;
    return node.predict;
  }

  /* counts with 1 = "needs review" as the positive class */
  function score(tree, rows) {
    var r = { n: rows.length, tp: 0, fp: 0, fn: 0, tn: 0 };
    for (var i = 0; i < rows.length; i++) {
      var p = predict(tree, rows[i]), y = rows[i].label;
      if (p === 1 && y === 1) r.tp++; else if (p === 1 && y === 0) r.fp++;
      else if (p === 0 && y === 1) r.fn++; else r.tn++;
    }
    r.correct = r.tp + r.tn;
    r.accuracy = r.n ? r.correct / r.n : 0;
    return r;
  }

  function leaves(tree) { return tree.leaf ? 1 : leaves(tree.left) + leaves(tree.right); }

  function parseCsv(text) {
    var lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(function (l) { return l.length; });
    var head = lines[0].split(',');
    return lines.slice(1).map(function (line) {
      var cells = line.split(','), row = {};
      for (var i = 0; i < head.length; i++) row[head[i]] = cells[i];
      return row;
    });
  }

  /* a row of leave_requests_*.csv as the tree reads it */
  function leaveRow(r) {
    return {
      notice_days: +r.notice_days, days_requested: +r.days_requested, balance_after: +r.balance_after,
      same_week_absent: +r.same_week_absent, month: +r.month, branch_type: r.branch_type,
      employee_no: +r.employee_no, label: r.decision === 'review' ? 1 : 0, split: r.split
    };
  }

  return { train: train, predict: predict, score: score, leaves: leaves, parseCsv: parseCsv, leaveRow: leaveRow };
})();
if (typeof module !== 'undefined') module.exports = TreeCore;
