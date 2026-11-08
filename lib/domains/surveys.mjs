// Survey forms: contact details, ratings, free text and one consent box. The invented consent
// mark is the costly error: it puts a person on a mailing list they never agreed to join. A
// blank consent box is null in the truth; true and false are both marks.
import { classify, isBlank } from '../compare.mjs';
import { get } from '../jsonl.mjs';

export const FIELDS = [
  { p: 'intake.name', type: 'text', group: 'contact' },
  { p: 'intake.email', type: 'id', group: 'contact' },
  { p: 'intake.phone', type: 'id', group: 'contact' },
  { p: 'intake.town', type: 'text' },
  { p: 'intake.visitor', type: 'bool' },
  { p: 'feedback.ratings.service', type: 'int', group: 'rating' },
  { p: 'feedback.ratings.staff', type: 'int', group: 'rating' },
  { p: 'feedback.ratings.space', type: 'int', group: 'rating' },
  { p: 'feedback.ratings.value', type: 'int', group: 'rating' },
  { p: 'feedback.newsletter_opt_in', type: 'bool', group: 'consent' },
  { p: 'feedback.would_return', type: 'bool' },
  { p: 'feedback.liked', type: 'text' },
  { p: 'feedback.improve', type: 'text' },
];

const consentOf = (c) => get(c, 'truth.feedback.newsletter_opt_in');
const pct = (a, b) => (b ? Number(((100 * a) / b).toFixed(1)) : 0);

export const surveys = {
  name: 'surveys',
  title: 'Survey form extraction',
  readKey: 'form_id',
  plantedKey: 'consent_halluc',
  hardKeys: ['consent_halluc', 'rating_halluc', 'field_halluc'],
  ratchets: [
    { key: 'max_contact_wrong', metric: 'contact_wrong', dir: 'max' },
    { key: 'max_field_wrong', metric: 'wrong', dir: 'max' },
    { key: 'min_field_acc', metric: 'field_acc', dir: 'min' },
  ],

  validate(cases) {
    const seen = new Set();
    for (const c of cases) {
      if (!c || typeof c.id !== 'string' || typeof c.form_id !== 'string') throw new Error('every case needs a string id and form_id');
      if (!c.truth || typeof c.truth !== 'object') throw new Error(`case ${c.id} has no truth object`);
      if (seen.has(c.form_id)) throw new Error(`form_id ${c.form_id} appears twice`);
      seen.add(c.form_id);
    }
  },

  tripwires(cases) {
    const marked = cases.filter((c) => consentOf(c) === true || consentOf(c) === false).length;
    const blank = cases.filter((c) => isBlank(consentOf(c))).length;
    if (!cases.length || marked === 0) return 'no form has a marked consent box, so the consent read is untested';
    if (blank === 0) return 'no form has a blank consent box, so the invented-consent gate is untested';
    const ratings = cases.flatMap((c) => Object.values(get(c, 'truth.feedback.ratings') || {}));
    if (!ratings.some((v) => !isBlank(v))) return 'no form has a filled rating, so the rating read is untested';
    return null;
  },

  describe(cases) {
    const blank = cases.filter((c) => isBlank(consentOf(c))).length;
    return `${cases.length - blank} with a marked consent box, ${blank} with a blank one`;
  },

  score(cases, reads) {
    const rows = [];
    let unread = 0;
    for (const c of cases) {
      const row = reads.get(c.form_id);
      if (!row) unread++;
      const draft = (row && row.draft) || {};
      const skip = new Set(c.illegible || []);
      for (const f of FIELDS) {
        if (skip.has(f.p)) continue;
        const accepts = (c.accept || {})[f.p] || [];
        rows.push({ group: f.group, r: classify(f.type, get(c.truth, f.p), get(draft, f.p), accepts) });
      }
    }
    const n = (pred) => rows.filter(pred).length;
    const match = n((x) => x.r === 'match');
    const metrics = {
      forms: cases.length,
      unread,
      scored_fields: rows.length,
      field_acc: pct(match, rows.length),
      miss: n((x) => x.r === 'miss'),
      wrong: n((x) => x.r === 'wrong'),
      consent_wrong: n((x) => x.group === 'consent' && x.r === 'wrong'),
      consent_halluc: n((x) => x.group === 'consent' && x.r === 'halluc'),
      rating_halluc: n((x) => x.group === 'rating' && x.r === 'halluc'),
      contact_wrong: n((x) => x.group === 'contact' && x.r === 'wrong'),
      field_halluc: n((x) => x.r === 'halluc' && x.group !== 'consent' && x.group !== 'rating'),
    };
    return { metrics, detail: [] };
  },
};
