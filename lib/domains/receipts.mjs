// Receipts: the money read. Truth is what a human confirmed on each receipt; the candidate's
// read is a recorded JSON draft per receipt. The headline is the total: how often it is right,
// how often it is confidently wrong, and whether the model ever invents one.
import { classify, isBlank } from '../compare.mjs';
import { get } from '../jsonl.mjs';

export const FIELDS = [
  { k: 'vendor', type: 'text' },
  { k: 'date', type: 'date' },
  { k: 'doc_no', type: 'id' },
  { k: 'total', type: 'money' },
  { k: 'vat', type: 'money' },
  { k: 'doctype', type: 'id' },
];

const truthOf = (c, k) => get(c, `fields.${k}.truth`);
const pct = (a, b) => (b ? Number(((100 * a) / b).toFixed(1)) : 0);

export const receipts = {
  name: 'receipts',
  title: 'Receipt extraction',
  readKey: 'receipt_id',
  plantedKey: 'total_halluc',
  hardKeys: ['total_halluc', 'field_halluc'],
  ratchets: [
    { key: 'max_total_wrong', metric: 'total_wrong', dir: 'max' },
    { key: 'min_present_total_acc', metric: 'present_total_acc', dir: 'min' },
    { key: 'min_overall_field_pct', metric: 'overall_field_pct', dir: 'min' },
  ],

  validate(cases) {
    const seen = new Set();
    for (const c of cases) {
      if (!c || typeof c.id !== 'string' || typeof c.receipt_id !== 'string') throw new Error('every case needs a string id and receipt_id');
      if (!c.fields || typeof c.fields !== 'object') throw new Error(`case ${c.id} has no fields object`);
      if (seen.has(c.receipt_id)) throw new Error(`receipt_id ${c.receipt_id} appears twice`);
      seen.add(c.receipt_id);
    }
  },

  // The empty-room rule: a money eval with no money in it is untested, and an invented-total
  // gate with no blank total to invent on is untested too.
  tripwires(cases) {
    const filled = cases.filter((c) => !isBlank(truthOf(c, 'total'))).length;
    if (!cases.length || filled === 0) return 'no case has a non-blank total, so the money read is untested';
    if (filled === cases.length) return 'no case has a blank total, so the invented-total gate is untested';
    return null;
  },

  describe(cases) {
    const filled = cases.filter((c) => !isBlank(truthOf(c, 'total'))).length;
    return `${filled} with a non-blank total, ${cases.length - filled} with a blank total`;
  },

  score(cases, reads) {
    const per = Object.fromEntries(FIELDS.map((f) => [f.k, { match: 0, miss: 0, wrong: 0, halluc: 0, present: 0 }]));
    let unread = 0;
    const wrongTotals = [];
    for (const c of cases) {
      const row = reads.get(c.receipt_id);
      if (!row) unread++;
      const draft = (row && row.draft) || {};
      for (const f of FIELDS) {
        const truth = truthOf(c, f.k);
        const accepts = get(c, `fields.${f.k}.accept`) || [];
        const o = classify(f.type, truth, draft[f.k], accepts);
        per[f.k][o]++;
        if (!isBlank(truth)) per[f.k].present++;
        if (f.k === 'total' && o === 'wrong') wrongTotals.push(c.receipt_id);
      }
    }
    let match = 0;
    let all = 0;
    let fieldWrong = 0;
    let fieldHalluc = 0;
    for (const f of FIELDS) {
      const p = per[f.k];
      match += p.match;
      all += p.match + p.miss + p.wrong + p.halluc;
      if (f.k !== 'total') {
        fieldWrong += p.wrong;
        fieldHalluc += p.halluc;
      }
    }
    const t = per.total;
    const metrics = {
      cases: cases.length,
      unread,
      overall_field_pct: pct(match, all),
      present_total_acc: pct(t.present - t.miss - t.wrong, t.present),
      total_miss: t.miss,
      total_wrong: t.wrong,
      total_halluc: t.halluc,
      field_wrong: fieldWrong,
      field_halluc: fieldHalluc,
    };
    const detail = FIELDS.map((f) => {
      const p = per[f.k];
      return `${f.k.padEnd(8)} present ${p.present}, miss ${p.miss}, wrong ${p.wrong}, invented ${p.halluc}`;
    });
    if (wrongTotals.length) detail.push(`wrong totals: ${wrongTotals.join(', ')}`);
    return { metrics, detail };
  },
};
