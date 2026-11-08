// A question-answering bot over pre-fetched context. Tier A (lib/tier-a.mjs) gates; Tier B
// (lib/judge.mjs) is an optional, advisory judge that only runs with --judge and JUDGE_URL.
import { tierA, buildPrompt, promptFit } from '../tier-a.mjs';
import { assertJudgeIndependent, callJudge } from '../judge.mjs';
import { readJsonl } from '../jsonl.mjs';

const kindOf = (c) => c.kind || (c.retrieved_context.length === 0 ? 'empty-fetch' : c.expected.should_escalate ? 'escalation' : 'faithful');
const pct = (a, b) => (b ? Number(((100 * a) / b).toFixed(1)) : 0);

export const chatbot = {
  name: 'chatbot',
  title: 'Question answering, Tier A',
  readKey: 'id',
  plantedKey: 'empty_fetch_halluc',
  hardKeys: ['empty_fetch_halluc', 'missed_escalation', 'scope_leak', 'invented_number', 'reply_gate_hits'],
  ratchets: [
    { key: 'min_pass_rate', metric: 'pass_rate', dir: 'min' },
    { key: 'min_fact_recall', metric: 'fact_recall', dir: 'min' },
  ],

  validate(cases) {
    const seen = new Set();
    for (const c of cases) {
      if (!c || typeof c.id !== 'string' || typeof c.question !== 'string') throw new Error('every case needs a string id and question');
      if (!Array.isArray(c.retrieved_context)) throw new Error(`case ${c.id}: retrieved_context must be a list`);
      if (!c.expected || typeof c.expected.should_escalate !== 'boolean') throw new Error(`case ${c.id}: expected.should_escalate must be true or false`);
      if (seen.has(c.id)) throw new Error(`id ${c.id} appears twice`);
      seen.add(c.id);
    }
  },

  tripwires(cases) {
    const kinds = new Set(cases.map(kindOf));
    if (!kinds.has('empty-fetch')) return 'no case has an empty fetch, so the no-invention floor is untested';
    if (!kinds.has('escalation')) return 'no case needs an escalation, so escalation is untested';
    for (const c of cases) {
      const fit = promptFit(buildPrompt(c), c.window || 8192);
      if (!fit.fits) return `case ${c.id}: its prompt (${fit.tokens} tokens) does not fit a ${fit.window} window, so the model would never see all of it`;
    }
    return null;
  },

  describe(cases) {
    const count = {};
    for (const c of cases) count[kindOf(c)] = (count[kindOf(c)] || 0) + 1;
    return Object.entries(count).map(([k, v]) => `${v} ${k}`).join(', ');
  },

  score(cases, reads) {
    const m = { cases: cases.length, unread: 0, answers_passed: 0, pass_rate: 0, fact_recall: 0,
      empty_fetch_halluc: 0, missed_escalation: 0, scope_leak: 0, invented_number: 0, reply_gate_hits: 0 };
    let facts = 0;
    let found = 0;
    const detail = [];
    for (const c of cases) {
      const row = reads.get(c.id);
      if (!row) m.unread++;
      const r = tierA(c, row ? row.answer : '');
      facts += r.facts.expected;
      found += r.facts.found;
      for (const [k, v] of Object.entries(r.hard)) m[k] += v;
      if (r.pass && row) m.answers_passed++;
      else detail.push(`${c.id}: ${r.fails.join('; ') || 'no answer'}`);
    }
    m.pass_rate = pct(m.answers_passed, cases.length);
    m.fact_recall = pct(found, facts);
    return { metrics: m, detail };
  },

  // The family check runs first, before the self-test and before any model call.
  beforeSelfTest(opts) {
    if (!opts.judge) return null;
    if (!opts.candidate || !opts.judgeModel) {
      return 'refusing the judge: --judge needs --candidate and --judge-model so the two model families can be compared';
    }
    try {
      assertJudgeIndependent(opts.candidate, opts.judgeModel);
    } catch (e) {
      return `refusing the judge: ${e.message}`;
    }
    return null;
  },

  async afterScore(opts, cases, resultsPath) {
    if (!opts.judge) return;
    const url = process.env.JUDGE_URL;
    if (!url) {
      console.log('judge: JUDGE_URL is not set, so Tier B is skipped (it is advisory and never gates)');
      return;
    }
    const answers = new Map(readJsonl(resultsPath).map((r) => [r.id, r.answer]));
    let passed = 0;
    let judged = 0;
    for (const c of cases) {
      const context = c.retrieved_context.map((r) => `[${r.ref}] ${r.fact}`).join('\n');
      const v = await callJudge(c.question, context, answers.get(c.id) || '', {
        model: opts.judgeModel, url, apiKey: process.env.JUDGE_API_KEY,
      });
      if (v.error) {
        console.log(`judge ${c.id}: no verdict (the call failed)`);
        continue;
      }
      judged++;
      if (v.pass) passed++;
      console.log(`judge ${c.id}: score ${v.score} ${v.pass ? 'pass' : 'fail'}`);
    }
    console.log(`judge: ${passed} of ${judged} judged answers pass (advisory, ${opts.judgeModel} judging ${opts.candidate})`);
  },
};
