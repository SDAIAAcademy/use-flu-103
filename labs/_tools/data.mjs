/* The synthetic data of Balsam Pharmacies: fixed seed, the same bytes on every run. */

export function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const int = (r, lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
const pick = (r, pairs) => {
  let x = r();
  for (const [value, p] of pairs) { if (x < p) return value; x -= p; }
  return pairs[pairs.length - 1][0];
};

/* What the HR officers did. In 2025 one rule for every branch. In 2026 the hospital branches,
   which work in shifts, are handled differently: short notice is normal there, and one absent
   colleague is already too many. */
export function officerDecision(row, year) {
  const hospital2026 = year === 2026 && row.branch_type === 'hospital';
  const shortNotice = row.notice_days < (hospital2026 ? 2 : 7);
  const thinCover = row.same_week_absent >= (hospital2026 ? 1 : 2);
  return shortNotice || thinCover || row.balance_after < 0 || row.days_requested > 14;
}

export const NOISE = 0.08;

function leaveRequest(r, year, i) {
  const hospitalShare = year === 2026 ? 0.6 : 0.06;
  const branch_type = pick(r, [['hospital', hospitalShare], ['mall', (1 - hospitalShare) * 0.45], ['street', (1 - hospitalShare) * 0.55]]);
  const shift = year === 2026 && branch_type === 'hospital';
  const notice_days = shift ? (r() < 0.2 ? int(r, 0, 1) : int(r, 2, 6)) : (r() < 0.3 ? int(r, 0, 6) : int(r, 7, 60));
  const days_requested = r() < 0.12 ? int(r, 15, 30) : int(r, 1, 10);
  const balance_after = r() < 0.1 ? int(r, -6, -1) : int(r, 0, 30);
  const same_week_absent = pick(r, [[0, 0.6], [1, 0.25], [2, 0.1], [3, 0.05]]);
  const month = int(r, 1, 12);
  const employee_no = int(r, 10000, 99999);
  const row = { request_id: `${year}-${String(i + 1).padStart(4, '0')}`, notice_days, days_requested, balance_after, same_week_absent, branch_type, month, employee_no };
  const rule = officerDecision(row, year);
  const noisy = r() < NOISE;
  row.decision = (rule !== noisy) ? 'review' : 'fast';
  row.rule = rule ? 'review' : 'fast';
  return row;
}

export function leaveRequests() {
  const r25 = rng(20250103);
  const y2025 = Array.from({ length: 800 }, (_, i) => leaveRequest(r25, 2025, i));
  /* a fixed split: every fourth request is held out for the test */
  y2025.forEach((row, i) => { row.split = i % 4 === 3 ? 'test' : 'train'; });
  const r26 = rng(20260103);
  const y2026 = Array.from({ length: 300 }, (_, i) => leaveRequest(r26, 2026, i));
  y2026.forEach((row) => { row.split = 'later'; });
  return { y2025, y2026 };
}

export const LEAVE_COLUMNS = ['request_id', 'notice_days', 'days_requested', 'balance_after', 'same_week_absent', 'branch_type', 'month', 'employee_no', 'decision', 'split'];

/* 10,000 refund transactions of one month, 1 in 100 fraudulent, each with Yaqidh's score 0..100 */
export function refunds() {
  const r = rng(20261117);
  const rows = [];
  for (let i = 0; i < 10000; i++) {
    const fraud = i % 100 === 37 ? 1 : 0;
    const z = Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());   /* a normal draw */
    const score = Math.round(fraud ? 80 + 12 * z : 30 + 18 * z);
    rows.push({ refund_id: `R-${String(i + 1).padStart(5, '0')}`, score: Math.max(0, Math.min(100, score)), is_fraud: fraud });
  }
  return rows;
}

export function atThreshold(rows, t) {
  let tp = 0, fp = 0, fn = 0, tn = 0;
  for (const row of rows) {
    const flag = row.score >= t;
    if (flag && row.is_fraud) tp++; else if (flag) fp++; else if (row.is_fraud) fn++; else tn++;
  }
  return { threshold: t, tp, fp, fn, tn, flagged: tp + fp, share_real: tp / (tp + fp || 1), accuracy: (tp + tn) / rows.length };
}

export function toCsv(rows, columns) {
  return '\uFEFF' + [columns.join(','), ...rows.map((row) => columns.map((c) => row[c]).join(','))].join('\n') + '\n';
}
