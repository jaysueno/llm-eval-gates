// The name check for summaries. "Every person's name in the summary appears in the transcript"
// needs a definition of "name" that a function can apply. This one is deliberately simple:
//   1. a capitalized token of 3 or more letters, possessive stripped
//   2. not an acronym (two capitals in a row) and not a contraction
//   3. not a common word or a simple inflection of one (lib/words.mjs)
//   4. not a word with a common-noun suffix (-ing, -ment, -tion and so on)
//   5. not on the case's names_allow_extra list
// Whatever survives and is absent from the transcript is an invented name. There is no
// position filter: a capital at the start of a sentence is still checked, because an invented
// name at the head of a bullet looks exactly like a real one.
import { COMMON_WORDS } from './words.mjs';

const NON_NAME_SUFFIX = /(?:ing|ment|tions?|sions?|ness|ity|ities|ance|ence|ship|ism|ology|edly|ally|ed)$/i;

export function stems(w) {
  const out = [w];
  if (w.endsWith('ies') && w.length > 4) out.push(w.slice(0, -3) + 'y');
  if (w.endsWith('es') && w.length > 3) out.push(w.slice(0, -2), w.slice(0, -1));
  else if (w.endsWith('s') && w.length > 3) out.push(w.slice(0, -1));
  if (w.endsWith('ing') && w.length > 5) out.push(w.slice(0, -3), w.slice(0, -3) + 'e');
  if (w.endsWith('ed') && w.length > 4) out.push(w.slice(0, -2), w.slice(0, -1));
  return out;
}

const stripMarkdown = (s) =>
  String(s || '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[*_`~]/g, '').replace(/^#{1,6}\s*/gm, '');

export function nameCandidates(text, { words = COMMON_WORDS, allow = new Set() } = {}) {
  const out = [];
  const re = /[A-Z][A-Za-z'\u2019]*[A-Za-z]/g;
  const flat = stripMarkdown(text);
  let m;
  while ((m = re.exec(flat)) !== null) {
    const tok = m[0].replace(/['\u2019]s$/, '');
    if (tok.length < 3 || /['\u2019]/.test(tok) || /[A-Z]{2,}/.test(tok)) continue;
    const low = tok.toLowerCase();
    if (allow.has(low) || NON_NAME_SUFFIX.test(tok)) continue;
    if (stems(low).some((s) => words.has(s))) continue;
    out.push(tok);
  }
  return [...new Set(out)];
}

export function inTranscript(name, transcript) {
  const t = transcript.toLowerCase();
  const n = name.toLowerCase();
  return t.includes(n) || (n.endsWith('s') && n.length > 3 && t.includes(n.slice(0, -1)));
}

// Everything a reader sees. A wrong name in an action item is as wrong as one in the title.
export function summaryText(s) {
  if (!s || typeof s !== 'object') return '';
  const list = (v) => (Array.isArray(v) ? v : []);
  return [
    s.title,
    s.summary_short,
    s.summary_long,
    ...list(s.key_takeaways),
    ...list(s.action_items).map((a) => (a && typeof a === 'object' ? a.text : a)),
  ]
    .filter((x) => typeof x === 'string' && x)
    .join('\n');
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Whole words, so "vet" never matches "veteran".
const hasWord = (hay, w) => new RegExp(`(?:^|[^A-Za-z])${escapeRe(w)}(?![A-Za-z])`, 'i').test(hay);
const hasStr = (hay, s) => hay.toLowerCase().includes(String(s).toLowerCase());

// Pure: (case, summary, transcript) -> the graded result. No I/O, no model.
export function gradeSummary(c, summary, transcript) {
  const blob = summaryText(summary);
  const allow = new Set((c.names_allow_extra || []).map((s) => String(s).toLowerCase()));
  const candidates = nameCandidates(blob, { allow });
  const invented = candidates.filter((n) => !inTranscript(n, transcript));
  const missing = (c.must_contain || []).filter((s) => !hasStr(blob, s));
  const forbidden = (c.must_not_contain || []).filter((s) => hasStr(blob, s));
  const inferred = (c.no_inferred_terms || []).filter((w) => hasWord(blob, w) && !hasWord(transcript, w));
  return {
    checked: candidates.length,
    invented,
    missing,
    forbidden,
    inferred,
    pass: !invented.length && !missing.length && !forbidden.length && !inferred.length,
  };
}
