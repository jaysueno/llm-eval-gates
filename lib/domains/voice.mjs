// Voice summaries: a model reads a meeting transcript and writes a title, a short summary,
// takeaways and action items. A summary is what someone reads instead of the recording, so a
// wrong name or an invented job reads exactly like a right one. All four gates are absolute.
//
// The transcript is the ruler. A case points at it by path (resolved next to the golden file)
// or carries it inline, and pins it by digest, so a verdict is never scored against different
// text without anyone noticing. With real recordings, keep the transcripts and the golden set
// outside git and point --golden at them.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { homedir } from 'node:os';
import { gradeSummary } from '../names.mjs';

export const digest = (text) => 'sha256-' + createHash('sha256').update(text, 'utf8').digest('base64url');

const names = (c) => (Array.isArray(c.must_contain) ? c.must_contain : []).filter((s) => typeof s === 'string' && s.trim());

function transcriptFor(c, goldenPath) {
  let text;
  if (typeof c.transcript_text === 'string') text = c.transcript_text;
  else if (typeof c.transcript_path === 'string') {
    const raw = c.transcript_path.startsWith('~') ? join(homedir(), c.transcript_path.slice(1)) : c.transcript_path;
    const p = isAbsolute(raw) ? raw : join(dirname(goldenPath), raw);
    if (!existsSync(p)) throw new Error(`case ${c.id}: no transcript at ${c.transcript_path}; never grade a summary without its ruler`);
    text = readFileSync(p, 'utf8');
  } else throw new Error(`case ${c.id}: no transcript_text or transcript_path`);
  if (c.transcript_digest && digest(text) !== c.transcript_digest) {
    throw new Error(`case ${c.id}: the transcript does not match its pinned digest`);
  }
  return text;
}

export const voice = {
  name: 'voice',
  title: 'Voice summary grading',
  readKey: 'id',
  plantedKey: 'name_halluc',
  hardKeys: ['name_halluc', 'inferred_fact', 'must_not_contain_hits', 'must_contain_missing'],
  ratchets: [{ key: 'min_cases', metric: 'cases', dir: 'min' }],

  validate(cases) {
    const seen = new Set();
    for (const c of cases) {
      if (!c || typeof c.id !== 'string') throw new Error('every case needs a string id');
      if (seen.has(c.id)) throw new Error(`id ${c.id} appears twice`);
      seen.add(c.id);
      for (const k of ['must_contain', 'must_not_contain', 'no_inferred_terms', 'names_allow_extra']) {
        if (c[k] !== undefined && !Array.isArray(c[k])) throw new Error(`case ${c.id}: ${k} must be a list`);
      }
    }
  },

  tripwires(cases) {
    if (!cases.some((c) => names(c).length)) return 'no case lists a name in must_contain, so the name check is untested';
    return null;
  },

  describe(cases) {
    return `${cases.filter((c) => names(c).length).length} with a name in must_contain`;
  },

  score(cases, reads, { goldenPath }) {
    const m = { cases: cases.length, unread: 0, name_tokens_checked: 0, name_halluc: 0, inferred_fact: 0,
      must_not_contain_hits: 0, must_contain_missing: 0, cases_passed: 0 };
    const detail = [];
    for (const c of cases) {
      const transcript = transcriptFor(c, goldenPath);
      const row = reads.get(c.id);
      if (!row) m.unread++;
      const g = gradeSummary(c, row ? row.summary : null, transcript);
      m.name_tokens_checked += g.checked;
      m.name_halluc += g.invented.length;
      m.inferred_fact += g.inferred.length;
      m.must_not_contain_hits += g.forbidden.length;
      m.must_contain_missing += g.missing.length;
      if (g.pass && row) m.cases_passed++;
      const why = [];
      if (g.invented.length) why.push(`name not in transcript: ${g.invented.join(', ')}`);
      if (g.inferred.length) why.push(`inferred: ${g.inferred.join(', ')}`);
      if (g.forbidden.length) why.push(`must not contain: ${g.forbidden.join(', ')}`);
      if (g.missing.length) why.push(`missing: ${g.missing.join(', ')}`);
      if (why.length) detail.push(`${c.id}: ${why.join('; ')}`);
    }
    return { metrics: m, detail };
  },
};
