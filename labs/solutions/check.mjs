/* Runs the reference solution of every lab against the course files.

     node labs/solutions/check.mjs            every lab
     node labs/solutions/check.mjs 2.1 3.1    some labs

   Node 22, no dependencies. Nothing is written to disk and no model is called.
   What runs for real: the classifier of lab 2.1 (the code inside files/trainer.html itself), the
   tables of labs 3.1 and 6.1, the threshold counts, and the presence of every planted item in
   the documents of labs 1.1 and 4.1.
   What runs against a stand-in: the chat steps of lab 5.1. standin.json holds scripted replies
   with the mistakes a real assistant makes; the check shows that comparing each reply with the
   known answer catches them. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FILES = path.join(HERE, '..', 'files');
const read = (name) => fs.readFileSync(path.join(FILES, name), 'utf8');
const REF = JSON.parse(fs.readFileSync(path.join(HERE, 'reference.json'), 'utf8'));
const text = (html) => html.replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const pct = (x) => `${(Math.round(x * 1000) / 10).toFixed(1)}%`;

function equal(actual, expected, what) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${what}: expected ${e}, got ${a}`);
}
function has(haystack, needle, what) {
  if (!haystack.includes(needle)) throw new Error(`${what}: "${needle}" is not in the file`);
}

const LABS = {};

LABS['1.1'] = () => {
  const doc = text(read('idhn_description.html'));
  const choices = [
    ['which data', 'اختار فريق المشروع عام 2025 وحده'],
    ['which features are left out', 'استبعد آرام الدليجان'],
    ['what the label means', 'قررت إدارة الموارد البشرية أن تعدّ الطلب'],
    ['the split', 'قسم محلل البيانات الطلبات مرة واحدة'],
    ['the threshold', 'اختارت لبابة القنيبط العتبة 50'],
    ['the rules', 'كتبت إدارة الموارد البشرية هذه القواعد'],
    ['human review and its sample', 'يراجع مؤيد الزغيبي'],
    ['retraining, undecided', 'لم يحدد أحد متى يُعاد تدريب النموذج']
  ];
  for (const [what, needle] of choices) has(doc, needle, `human choice (${what})`);
  const t = REF.trainer.depth4.test;
  has(doc, `${t.correct} طلبًا من 200`, 'the test result quoted in the description');
  has(doc, pct(t.accuracy).replace('.0%', '%'), 'the accuracy quoted in the description');
  const systems = text(read('three_systems.html'));
  for (const needle of ['يبحث النظام في لائحة الإجازات', 'نموذج لغوي', 'لا يقرأ أحد الأجوبة', 'يتجاوز 2,000 ريال', 'تقرأ ذكرى القائمة', 'يرسل أمر الشراء', 'موافقة مدير المشتريات', 'الصيدلي المسؤول']) has(systems, needle, 'three systems');
  const map = read('pipeline_map.html');
  equal((map.match(/<td class="fill">/g) || []).length, 16, 'blank cells of the pipeline map');
  return `8 human choices found in the description; test result ${t.correct}/200 (${pct(t.accuracy)}) quoted as run`;
};

LABS['2.1'] = () => {
  const page = read('trainer.html');
  const core = page.match(/<script id="core">([\s\S]*?)<\/script>/)[1];
  const T = new Function(`${core}; return TreeCore;`)();
  const embedded = JSON.parse(page.match(/<script id="data" type="application\/json">([\s\S]*?)<\/script>/)[1]);
  const csv = { y2025: T.parseCsv(read('leave_requests_2025.csv')), y2026: T.parseCsv(read('leave_requests_2026.csv')) };
  equal(embedded, csv, 'the data inside the trainer and the two CSV files');
  const rows = { train: [], test: [], later: [] };
  for (const r of csv.y2025.concat(csv.y2026)) { const row = T.leaveRow(r); rows[row.split].push(row); }
  equal([rows.train.length, rows.test.length, rows.later.length], [600, 200, 300], 'rows per split');
  const base = [['notice_days', 'num'], ['days_requested', 'num'], ['balance_after', 'num'], ['same_week_absent', 'num'], ['branch_type', 'cat'], ['month', 'num']].map(([id, kind]) => ({ id, kind }));
  const withId = [...base, { id: 'employee_no', kind: 'num' }];
  const run = (features, depth) => {
    const tree = T.train(rows.train, features, depth);
    return { tree, train: T.score(tree, rows.train), test: T.score(tree, rows.test), later: T.score(tree, rows.later) };
  };
  const d2 = run(base, 2), d4 = run(base, 4), d12 = run(withId, 12);
  /* the numbers the lab page, the solution and the slides quote */
  equal([pct(d2.train.accuracy), pct(d2.test.accuracy)], ['81.5%', '84.5%'], 'depth 2');
  equal([pct(d4.train.accuracy), pct(d4.test.accuracy), d4.test.correct], ['93.2%', '88.0%', 176], 'depth 4');
  equal([pct(d12.train.accuracy), pct(d12.test.accuracy), d12.test.correct], ['99.3%', '83.0%', 166], 'depth 12 with the employee number');
  equal([pct(d4.later.accuracy), d4.later.correct], ['72.3%', 217], 'depth 4 on the 2026 batch');
  const hospital = (set) => T.score(d4.tree, set.filter((r) => r.branch_type === 'hospital'));
  const hTest = hospital(rows.test), hLater = hospital(rows.later);
  equal([hTest.n, hLater.n, pct(hLater.accuracy)], [9, 189, '63.5%'], 'hospital branches');
  for (const [key, got] of [['depth2', d2], ['depth4', d4], ['depth12_with_id', d12]]) {
    equal([got.train.correct, got.test.correct, got.later.correct], [REF.trainer[key].train.correct, REF.trainer[key].test.correct, REF.trainer[key].later.correct], `reference.json ${key}`);
  }
  if (!(d12.train.accuracy > d4.train.accuracy && d12.test.accuracy < d4.test.accuracy)) throw new Error('the deep tree with the employee number must overfit');
  return `depth 4: train ${pct(d4.train.accuracy)}, test ${pct(d4.test.accuracy)}, 2026 batch ${pct(d4.later.accuracy)} (hospital branches ${hLater.n} requests at ${pct(hLater.accuracy)}); depth 12 with the employee number: train ${pct(d12.train.accuracy)}, test ${pct(d12.test.accuracy)}`;
};

LABS['3.1'] = () => {
  /* in tenths of a case, so the half cases stay exact */
  const total = 10000, fraud = total / 100, honest = total - fraud;
  const caught = fraud * 95 / 100, missed = fraud - caught, cleared = honest * 95 / 100, falseAlarms = honest - cleared;
  const flagged = caught + falseAlarms;
  equal([fraud / 10, honest / 10, caught / 10, missed / 10, falseAlarms / 10, cleared / 10, flagged / 10], [10, 990, 9.5, 0.5, 49.5, 940.5, 59], 'the table of Yaqidh for 1,000 cases');
  equal([pct(caught / flagged), pct((caught + cleared) / total)], ['16.1%', '95.0%'], 'share of flags that are real, accuracy');
  equal([pct(honest / total), 0, fraud / 10], ['99.0%', 0, 10], 'the rule that flags nothing: accuracy, flags, misses');
  const d = REF.yaqidh.detector;
  equal([d.caught, d.missed, d.false_alarms, d.cleared, d.flagged], [9.5, 0.5, 49.5, 940.5, 59], 'reference.json');
  const w = REF.yaqidh.worked_example;
  equal([w.caught, w.missed, w.false_alarms, w.flagged, pct(w.share_real)], [180, 20, 980, 1160, '15.5%'], 'the worked example of the slides (10,000 cases, 2%, 90% and 90%)');
  const rows = read('refund_scores.csv').replace(/^﻿/, '').trim().split('\n').slice(1).map((l) => l.split(',')).map(([, score, f]) => ({ score: +score, fraud: +f }));
  equal([rows.length, rows.filter((r) => r.fraud).length], [10000, 100], 'refund_scores.csv');
  const at = (t) => { const fl = rows.filter((r) => r.score >= t); const tp = fl.filter((r) => r.fraud).length; return [fl.length, tp, 100 - tp]; };
  equal([at(50), at(60), at(75)], [[1436, 100, 0], [577, 98, 2], [134, 64, 36]], 'flags, caught and missed at thresholds 50, 60 and 75');
  const template = read('base_rate_table.csv');
  has(template, 'نسبة التنبيهات الصحيحة', 'the blank table');
  return 'Yaqidh: 59 flags of which 9.5 real (16.1%), 0.5 missed, 49.5 false alarms, accuracy 95.0%; flag-nothing rule: accuracy 99.0%, 10 missed; thresholds 50/60/75: 1436, 577, 134 flags';
};

LABS['4.1'] = () => {
  const cards = { hiring: 'card_hiring.html', clinic: 'card_clinic.html', loans: 'card_loans.html' };
  const anchors = {
    hiring: { leakage: 'عدد جولات المقابلات', coverage: '81% من المتقدمين رجال', labels: 'قرار مديري التوظيف في حينه' },
    clinic: { leakage: 'رسالة «نأسف لعدم حضورك»', coverage: 'المحجوزة من التطبيق فقط', labels: 'خاطئًا في 14%' },
    loans: { leakage: 'عدد رسائل التحصيل', coverage: 'الطلبات المرفوضة غير موجودة', labels: 'علامة واحدة من كل خمس' }
  };
  let n = 0;
  for (const [key, file] of Object.entries(cards)) {
    const doc = text(read(file));
    for (const [kind, needle] of Object.entries(anchors[key])) { has(doc, needle, `${key}, ${kind}`); n++; }
    equal(Object.keys(REF.cards[key]).sort(), ['coverage', 'labels', 'leakage'], `answer key of ${key}`);
    for (const item of Object.values(REF.cards[key])) equal(item.length, 3, 'each planted problem has where, why and who is harmed');
    /* the card itself never names its problems */
    for (const word of ['تسرب', 'تحيز', 'غير ممثلة', 'غير موثوق']) if (doc.includes(word)) throw new Error(`${file} gives the answer away: ${word}`);
  }
  return `${n} planted problems found in the three cards, three per card, none named by the card itself`;
};

LABS['5.1'] = () => {
  const policy = text(read('leave_policy.html'));
  const p = REF.policy;
  has(policy, `${p.annual_after5} يوم عمل بعد إتمام خمس سنوات`, 'article 3');
  has(policy, `إجازة الحج ${p.hajj_days} يومًا`, 'article 9');
  equal(4873 * 6219, 30305187, 'the product of question 5');
  const lab = fs.readFileSync(path.join(HERE, '..', 'M5_1_fluent_errors.html'), 'utf8');
  has(lab, '30,305,187', 'the product on the lab page');
  const four = text(read('four_answers.html'));
  equal(REF.four_answers.map((x) => x.kind), ['local', 'cutoff', 'invented', 'agree'], 'the four prepared answers');
  for (const x of REF.four_answers) if (four.includes(x.cause)) throw new Error('four_answers.html gives a cause away');
  /* the date arithmetic inside prepared answer 2 is right; its premise is what is wrong */
  const days = Math.round((Date.UTC(2025, 2, 31) - Date.UTC(2024, 9, 14)) / 86400000);
  equal(days, 168, 'days from 14 October 2024 to 31 March 2025');

  /* the stand-in: grade each scripted reply against the known answer, as the participant does */
  const standin = JSON.parse(fs.readFileSync(path.join(HERE, 'standin.json'), 'utf8'));
  const numbers = (s) => (s.match(/\d[\d,.]*/g) || []).map((x) => x.replace(/,/g, '').replace(/\.$/, ''));
  const graders = {
    q1: (r) => numbers(r).includes(String(p.annual_after5)) || /لا أعرف|لا أملك/.test(r),
    q2: (r) => (numbers(r).includes(String(p.hajj_days)) && /سنتين/.test(r)) || /لا أعرف|لا أملك/.test(r),
    q3: (r, ctx) => r.includes(ctx.today),
    q4: (r, ctx) => ctx.found_sources === ctx.listed_sources,
    q5: (r) => numbers(r).includes('30305187'),
    q6: (r) => /16|غير صحيح|ليس صحيح/.test(r) && !/^نعم/.test(r.trim()),
    q7: (r) => /9\.9 (هو )?(ال)?أكبر|الأكبر هو 9\.9/.test(r),
    q8: (r) => /9\.9 (هو )?(ال)?أكبر|الأكبر هو 9\.9|ما زال/.test(r) && !/أعتذر.*9\.11 (هو )?(ال)?أكبر/.test(r)
  };
  const verdicts = {};
  for (const item of standin.replies) verdicts[item.id] = graders[item.id](item.reply, item.context || {});
  equal(verdicts, standin.expected_correct, 'which stand-in replies the comparison with the known answer accepts');
  const wrong = Object.values(verdicts).filter((v) => !v).length;
  return `policy answers in place; stand-in model: ${wrong} of 8 scripted replies caught as wrong, ${8 - wrong} accepted (no real model was called)`;
};

LABS['6.1'] = () => {
  const out = [];
  for (const key of ['a', 'b', 'c']) {
    const doc = text(read(`brochure_${key}.html`));
    const claims = [...doc.matchAll(/(\d+)% (صحة إجمالية مثبتة|من المرشحين المناسبين|من غير المناسبين)/g)].map((m) => +m[1]);
    equal(claims.length, 3, `the three rates of brochure ${key}`);
    const [accuracy, found, cleared] = claims;
    const suitable = 100, unsuitable = 1900;
    const inList = suitable * found / 100, missed = suitable - inList, wrong = Math.round(unsuitable * (100 - cleared) / 100);
    const r = REF.brochures[key];
    equal([inList, missed, wrong, inList + wrong], [r.found, r.missed, r.wronglyPassed, r.shortlist], `brochure ${key} on Balsam's applicants`);
    const implied = (inList + unsuitable - wrong) / 2000;
    if (Math.abs(implied * 100 - accuracy) > 0.5) throw new Error(`brochure ${key}: its accuracy does not follow from its two rates`);
    for (const absent of ['المعدل الأساسي', 'المجموعات الفرعية', 'بيانات بلسم']) if (doc.includes(absent)) throw new Error(`brochure ${key} supplies evidence it should leave out: ${absent}`);
    out.push(`${key.toUpperCase()}: shortlist ${inList + wrong}, suitable ${pct(inList / (inList + wrong))}, suitable but rejected ${missed}`);
  }
  equal(pct(1900 / 2000), '95.0%', 'accuracy of rejecting everyone');
  const lab = fs.readFileSync(path.join(HERE, '..', 'M6_1_critique.html'), 'utf8');
  for (const s of ['94 مناسبًا و76 غير مناسب، أي 170', '90 و133، أي 223', '92 و57، أي 149']) has(lab, s, 'the numbers in the trainer block of the lab page');
  const model = fs.readFileSync(path.join(HERE, 'M6_1_critique.md'), 'utf8').split('<!-- critique -->')[1].split('<!-- /critique -->')[0];
  const words = model.trim().split(/\s+/).length;
  if (words < 150 || words > 250) throw new Error(`the model critique has ${words} words, outside 150 to 250`);
  for (const term of ['بيانات الاختبار', 'المعدل الأساسي', 'أنواع الأخطاء', 'المجموعات الفرعية', 'شروط الاستخدام', '170', '55%', 'الاعتراض']) has(model, term, 'the model critique');
  const rubric = text(read('critique_rubric.html'));
  for (const c of ['الأدلة الغائبة', 'الأرقام', 'من يتضرر', 'الاستخدام والإشراف']) has(rubric, c, 'rubric');
  out.push(`reject-everyone rule: accuracy 95.0%; model critique: ${words} words, names the five kinds of evidence`);
  return out.join('; ');
};

const wanted = process.argv.slice(2);
const ids = wanted.length ? wanted : Object.keys(LABS);
let failed = 0;
for (const id of ids) {
  if (!LABS[id]) { console.log(`${id}  no such lab`); failed++; continue; }
  try { console.log(`${id}  PASS  ${LABS[id]()}`); } catch (e) { failed++; console.log(`${id}  FAIL  ${e.message}`); }
}
process.exit(failed ? 1 : 0);
