/* Writes the file pack of the course into labs/files/ and the reference numbers into
   labs/solutions/reference.json. Node 22, no dependencies, fixed seeds: the same bytes on every
   run. Run from anywhere:  node labs/_tools/prepare_files.mjs */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { leaveRequests, LEAVE_COLUMNS, refunds, atThreshold, toCsv } from './data.mjs';
import * as D from './docs.mjs';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const FILES = path.join(HERE, '..', 'files');
const SOLUTIONS = path.join(HERE, '..', 'solutions');
const T = require('./tree_core.js');

fs.mkdirSync(FILES, { recursive: true });
fs.mkdirSync(SOLUTIONS, { recursive: true });
const write = (name, text) => fs.writeFileSync(path.join(FILES, name), text.replace(/\r\n/g, '\n'), 'utf8');

/* ---- module 2: leave requests and the trainer */
const { y2025, y2026 } = leaveRequests();
write('leave_requests_2025.csv', toCsv(y2025, LEAVE_COLUMNS));
write('leave_requests_2026.csv', toCsv(y2026, LEAVE_COLUMNS));

const strip = (rows) => rows.map((r) => Object.fromEntries(LEAVE_COLUMNS.map((c) => [c, String(r[c])])));
const rows = { train: [], test: [], later: [] };
for (const r of strip(y2025).concat(strip(y2026))) { const row = T.leaveRow(r); rows[row.split].push(row); }
const BASE = [['notice_days', 'num'], ['days_requested', 'num'], ['balance_after', 'num'], ['same_week_absent', 'num'], ['branch_type', 'cat'], ['month', 'num']].map(([id, kind]) => ({ id, kind }));
const WITH_ID = [...BASE, { id: 'employee_no', kind: 'num' }];
const brief = (s) => ({ n: s.n, correct: s.correct, accuracy: s.accuracy, tp: s.tp, fp: s.fp, fn: s.fn, tn: s.tn });
function run(features, depth) {
  const tree = T.train(rows.train, features, depth);
  const by = {};
  for (const bt of ['street', 'mall', 'hospital']) {
    by[bt] = { test: brief(T.score(tree, rows.test.filter((r) => r.branch_type === bt))), later: brief(T.score(tree, rows.later.filter((r) => r.branch_type === bt))) };
  }
  return { depth, leaves: T.leaves(tree), train: brief(T.score(tree, rows.train)), test: brief(T.score(tree, rows.test)), later: brief(T.score(tree, rows.later)), by_branch: by };
}
const trainer = { depth2: run(BASE, 2), depth4: run(BASE, 4), depth12_with_id: run(WITH_ID, 12) };

const core = fs.readFileSync(path.join(HERE, 'tree_core.js'), 'utf8');
const tpl = fs.readFileSync(path.join(HERE, 'trainer.tpl.html'), 'utf8');
write('trainer.html', tpl.replace('/*CORE*/', () => core.trim()).replace('/*DATA*/', () => JSON.stringify({ y2025: strip(y2025), y2026: strip(y2026) })));

/* ---- module 3: the base-rate table and the refund scores */
function baseRate(total, rate, caught, cleared) {
  const fraud = total * rate, honest = total - fraud;
  const tp = fraud * caught, fn = fraud - tp, tn = honest * cleared, fp = honest - tn;
  const r = (x) => Math.round(x * 10) / 10;
  return { total, fraud: r(fraud), honest: r(honest), caught: r(tp), missed: r(fn), false_alarms: r(fp), cleared: r(tn), flagged: r(tp + fp), share_real: tp + fp ? tp / (tp + fp) : null, accuracy: (tp + tn) / total };
}
const yaqidh = { detector: baseRate(1000, 0.01, 0.95, 0.95), flag_nothing: baseRate(1000, 0.01, 0, 1), worked_example: baseRate(10000, 0.02, 0.9, 0.9) };
write('base_rate_table.csv', '\uFEFF' + [
  'الجدول,احتيال فعلًا,سليم فعلًا,المجموع',
  'الكاشف «يقِظ»: نبّه,,,',
  'الكاشف «يقِظ»: لم ينبّه,,,',
  'الكاشف «يقِظ»: المجموع,,,1000',
  'قاعدة لا تنبّه على شيء: نبّهت,,,',
  'قاعدة لا تنبّه على شيء: لم تنبّه,,,',
  'قاعدة لا تنبّه على شيء: المجموع,,,1000',
  '',
  'السؤال,الكاشف «يقِظ»,قاعدة لا تنبّه على شيء',
  'الإنذارات الكاذبة,,',
  'الحالات الفائتة,,',
  'نسبة التنبيهات الصحيحة,,',
  'الصحة الإجمالية,,'
].join('\n') + '\n');
const refundRows = refunds();
write('refund_scores.csv', toCsv(refundRows, ['refund_id', 'score', 'is_fraud']));
const thresholds = [50, 60, 75].map((t) => atThreshold(refundRows, t));

/* ---- modules 1, 4, 5, 6: the documents */
const reference = { trainer, yaqidh, thresholds, brochures: Object.fromEntries(Object.keys(D.BROCHURES).map((k) => [k, D.brochureImplied(D.BROCHURES[k])])), policy: D.POLICY };
write('idhn_description.html', D.idhnDescription(reference));
write('pipeline_map.html', D.pipelineMap());
write('three_systems.html', D.threeSystems());
for (const card of Object.values(D.CARDS)) write(card.file, D.datasetCard(card));
write('leave_policy.html', D.leavePolicy());
write('four_answers.html', D.fourAnswers());
for (const k of Object.keys(D.BROCHURES)) write(`brochure_${k}.html`, D.brochure(k));
write('critique_rubric.html', D.rubricPage());

reference.cards = Object.fromEntries(Object.entries(D.CARDS).map(([k, c]) => [k, c.planted]));
reference.four_answers = D.FOUR_ANSWERS.map(({ kind, truth, cause }) => ({ kind, truth, cause }));
fs.writeFileSync(path.join(SOLUTIONS, 'reference.json'), JSON.stringify(reference, null, 2) + '\n', 'utf8');

console.log('files:', fs.readdirSync(FILES).length, 'in labs/files');
console.log('trainer depth 4: test', trainer.depth4.test.correct, '/ 200, later', trainer.depth4.later.correct, '/ 300');
console.log('trainer depth 12 with employee number: train', trainer.depth12_with_id.train.correct, '/ 600, test', trainer.depth12_with_id.test.correct, '/ 200');
console.log('Yaqidh at 1,000 cases: flagged', yaqidh.detector.flagged, 'real', yaqidh.detector.caught, 'share', yaqidh.detector.share_real.toFixed(3));
