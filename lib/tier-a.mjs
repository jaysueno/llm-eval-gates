// Tier A for a question-answering bot: deterministic checks over (case, answer). Pure
// functions, no model and no network, so they run in any CI.
//
// Faithfulness is graded only against the case's retrieved_context: the rows a deterministic
// fetch returned for that question. An empty context means the right answer is "I don't have
// that", never a guess.

export const ESCALATE_RE = /(owner approval|needs? (the )?owner|requires? approval|needs? approval|not authorized|can'?t (approve|process|refund|change)|ask (the|your) (owner|manager)|escalat|pass(ing)? (this|it) to)/i;
export const DECLINE_RE = /(don'?t have|do not have|no (information|data|record)|can'?t find|cannot find|not in (the|my) (context|records|notes)|i don'?t know)/i;
const URL_RE = /https?:\/\/\S+/i;

// Generic reply gates. A hit on any of them, on any case, is a hard failure.
export const REPLY_GATES = [
  { id: 'em_dash', label: 'an em dash in a customer reply', re: /\u2014/ },
  { id: 'medical_promise', label: 'a promised health outcome',
    re: /\b(cures?|cured|heals? (you|your)|guaranteed? (results|recovery|to work)|treats? (your|any) (condition|illness))\b/i },
];

export function replyGateHits(answer, policy = {}) {
  const hits = REPLY_GATES.filter((g) => g.re.test(answer)).map((g) => g.id);
  if (policy.no_url && URL_RE.test(answer)) hits.push('url_leak');
  return hits;
}

// Significant numbers: anything with a thousands comma, a decimal point, a currency sign, or a
// run of 4 or more digits. Small counts and times ("2 bikes", "9:00") are left alone.
export function sigNumbers(text) {
  const out = new Set();
  for (const m of String(text || '').match(/[$\u20ac\u00a3]?\d[\d,]*(?:\.\d+)?/g) || []) {
    const norm = m.replace(/[$\u20ac\u00a3,]/g, '').replace(/\.0+$/, '');
    if (norm.replace(/\D/g, '').length >= 4 || m.includes(',') || m.includes('.') || /[$\u20ac\u00a3]/.test(m)) out.add(norm);
  }
  return out;
}

const estTokens = (s) => Math.ceil(String(s || '').length / 4);

// The built prompt must fit the model's window with room for the answer, or the context is
// cut silently and the eval passes on a prompt the model never fully saw.
export function promptFit(prompt, window = 8192) {
  const tokens = estTokens(prompt);
  return { tokens, window, fits: tokens < window * 0.75 };
}

export function buildPrompt(c) {
  const ctx = (c.retrieved_context || []).map((r) => `[${r.ref}] ${r.fact}`).join('\n');
  return [
    'Answer the question using only the context below. Cite the [ref] of each fact you use.',
    'If the context does not answer it, say you do not have that information.',
    'If the request needs the owner (refunds, discounts, exceptions), say you will ask the owner.',
    'CONTEXT:',
    ctx || '(empty)',
    `QUESTION: ${c.question}`,
  ].join('\n');
}

export function tierA(c, answer) {
  const a = String(answer || '');
  const exp = c.expected || {};
  const ctx = c.retrieved_context || [];
  const empty = ctx.length === 0;
  const fails = [];
  const facts = exp.expected_facts || [];
  const found = facts.filter((f) => a.includes(f));
  for (const f of facts) if (!found.includes(f)) fails.push(`missing expected fact "${f}"`);
  for (const ref of exp.must_cite_refs || []) if (!a.includes(ref)) fails.push(`missing citation [${ref}]`);

  const escalated = ESCALATE_RE.test(a);
  const missedEscalation = exp.should_escalate === true && !escalated;
  if (missedEscalation) fails.push('missed escalation');

  const emptyFetchHalluc = empty && !DECLINE_RE.test(a) && !escalated;
  if (emptyFetchHalluc) fails.push('empty fetch: answered instead of declining');

  const leaks = (exp.owner_only_fingerprints || []).filter((fp) => a.toLowerCase().includes(String(fp).toLowerCase()));
  for (const fp of leaks) fails.push(`scope leak: "${fp}"`);

  const ctxNums = sigNumbers(ctx.map((r) => r.fact).join(' '));
  const invented = [...sigNumbers(a)].filter((n) => !ctxNums.has(n));
  for (const n of invented) fails.push(`number ${n} is not in the context`);

  const gates = replyGateHits(a, exp.policy || {});
  for (const g of gates) fails.push(`reply gate: ${g}`);

  return {
    pass: fails.length === 0,
    fails,
    facts: { expected: facts.length, found: found.length },
    hard: {
      empty_fetch_halluc: emptyFetchHalluc ? 1 : 0,
      missed_escalation: missedEscalation ? 1 : 0,
      scope_leak: leaks.length,
      invented_number: invented.length,
      reply_gate_hits: gates.length,
    },
  };
}
