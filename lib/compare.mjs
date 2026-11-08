// Field comparison for extraction evals. Every field read lands in exactly one class:
//   match   the read equals the truth, including a blank field correctly left blank
//   miss    the truth has a value and the read is blank        (safe: a human fills it in)
//   wrong   both have a value and they differ                  (dangerous: a confident misread)
//   halluc  the truth is blank and the read has a value        (the model invented it)
// Blank and wrong are kept apart on purpose. A blank costs a human a few seconds. A wrong
// value goes into the books looking exactly like a right one.

export const isBlank = (v) =>
  v === null || v === undefined || (typeof v === 'string' && v.trim() === '') ||
  (Array.isArray(v) && v.length === 0);

const normText = (v) => String(v).normalize('NFKD').toLowerCase().replace(/[^a-z0-9]/g, '');
const normId = (v) => String(v).toLowerCase().replace(/[^a-z0-9]/g, '');

export function money(v) {
  if (isBlank(v)) return null;
  const n = Number(String(v).replace(/[, ]/g, ''));
  return Number.isFinite(n) ? n : null;
}

// Bigram Dice similarity: a cheap, deterministic tolerance for handwriting drift in free text.
export function dice(a, b) {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const grams = (s) => {
    const m = new Map();
    for (let i = 0; i < s.length - 1; i++) {
      const g = s.slice(i, i + 2);
      m.set(g, (m.get(g) || 0) + 1);
    }
    return m;
  };
  const ga = grams(a);
  const gb = grams(b);
  let inter = 0;
  for (const [g, n] of ga) inter += Math.min(n, gb.get(g) || 0);
  return (2 * inter) / (a.length - 1 + b.length - 1);
}

function asBool(v) {
  if (v === true || v === false) return v;
  const s = String(v).trim().toLowerCase();
  if (['true', 'yes', 'y', 'checked', 'x'].includes(s)) return true;
  if (['false', 'no', 'n', 'unchecked'].includes(s)) return false;
  return null;
}

function same(type, truth, read, accepts = []) {
  switch (type) {
    case 'money': {
      const t = money(truth);
      const r = money(read);
      return t !== null && r !== null && Math.abs(t - r) <= 0.005;
    }
    case 'int':
      return Number.parseInt(truth, 10) === Number.parseInt(read, 10);
    case 'bool':
      return asBool(truth) === asBool(read);
    case 'date':
    case 'id':
      return normId(truth) === normId(read) || accepts.some((a) => normId(a) === normId(read));
    case 'text': {
      const t = normText(truth);
      const r = normText(read);
      if (t === r || accepts.some((a) => normText(a) === r)) return true;
      if (t.length >= 4 && r.length >= 4 && (t.includes(r) || r.includes(t))) return true;
      return dice(t, r) >= 0.85;
    }
    default:
      return String(truth) === String(read);
  }
}

// A money field whose read does not parse as a number counts as blank for the truth check,
// and as a value for the invention check: "N/A" on a blank total is still an invented total.
export function classify(type, truth, read, accepts) {
  const tBlank = isBlank(truth);
  const rBlank = isBlank(read);
  if (tBlank && rBlank) return 'match';
  if (tBlank) return 'halluc';
  if (rBlank) return 'miss';
  return same(type, truth, read, accepts) ? 'match' : 'wrong';
}
