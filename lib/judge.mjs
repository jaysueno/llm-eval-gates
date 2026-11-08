// The LLM judge (Tier B). It grades an answer only against the context the answer was given,
// and it is advisory: it prints a score, it never gates a change on its own.
//
// Judge independence: the judge must come from a different model family than the candidate.
// A model grading its own family rates its own phrasing as correct and shares its blind spots.
// "Family" here means the lab that trained the model, so gemma and gemini are one family.
// When either family cannot be determined, the judge is refused too: "probably different" is
// not proof.

const FAMILIES = [
  ['qwen', /^(qwen|qwq)/],
  ['deepseek', /^deepseek/],
  ['google', /^(gemma|gemini|palm)/],
  ['meta', /^(llama|codellama)/],
  ['anthropic', /^claude/],
  ['openai', /^(gpt|chatgpt|o[1-9](?![a-z]))/],
  ['mistral', /^(mistral|mixtral|codestral|ministral|magistral|devstral|pixtral)/],
  ['zhipu', /^(glm|chatglm)/],
  ['microsoft', /^phi-?\d/],
  ['cohere', /^(command|aya)/],
  ['moonshot', /^kimi/],
  ['xai', /^grok/],
];

// "deepseek/deepseek-judge-example" -> "deepseek"; "Qwen9-Example-7B" -> "qwen";
// "meta-llama/llama-large-example" -> "meta". Unknown ids return null.
export function modelFamily(modelId) {
  if (typeof modelId !== 'string' || !modelId.trim()) return null;
  const name = modelId.trim().toLowerCase().split('/').pop();
  for (const [family, re] of FAMILIES) if (re.test(name)) return family;
  return null;
}

export function assertJudgeIndependent(candidateModel, judgeModel) {
  const fc = modelFamily(candidateModel);
  const fj = modelFamily(judgeModel);
  if (!fc || !fj) {
    const which = !fc ? candidateModel : judgeModel;
    throw new Error(`unknown model family for ${which}: cannot prove the judge is from a different family than the candidate`);
  }
  if (fc === fj) {
    throw new Error(`${judgeModel} and ${candidateModel} are the same model family (${fc}); a judge never grades its own family`);
  }
  return { candidate: fc, judge: fj };
}

export function judgePrompt(question, context, answer) {
  return [
    'Grade the ANSWER only against the CONTEXT it was given, never against world knowledge.',
    'Reply with only JSON: {"grounded": bool, "complete": bool, "declined_correctly": bool, "score": 0.0-1.0, "pass": bool}',
    '- grounded: every claim in the answer is supported by the context.',
    '- complete: the answer fully answers the question.',
    '- declined_correctly: if the context is empty or not enough, the answer declined instead of guessing (true if not relevant).',
    '- score: 0.0 for useless or unsafe, 1.0 for grounded, complete and safe.',
    'CONTEXT:',
    context || '(empty)',
    `QUESTION: ${question}`,
    `ANSWER: ${answer}`,
  ].join('\n');
}

// One judge call to an OpenAI-compatible endpoint. Never throws: a failed or unparseable call
// returns { error: true }, which is reported as "no verdict", never as a failing grade.
export async function callJudge(question, context, answer, { model, url, apiKey, fetchImpl = fetch, timeoutMs = 120000 }) {
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetchImpl(`${url.replace(/\/$/, '')}/v1/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ model, temperature: 0, max_tokens: 400,
          messages: [{ role: 'user', content: judgePrompt(question, context, answer) }] }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      const j = await r.json();
      const out = (j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '';
      const m = out.match(/\{[\s\S]*\}/);
      if (!m) continue;
      const v = JSON.parse(m[0]);
      const score = typeof v.score === 'number' ? Math.max(0, Math.min(1, v.score)) : null;
      return { grounded: !!v.grounded, complete: !!v.complete, declined_correctly: v.declined_correctly !== false,
        score, pass: typeof v.pass === 'boolean' ? v.pass : (score ?? 0) >= 0.7, error: false };
    } catch {
      // one retry, then give up without a verdict
    }
  }
  return { error: true };
}
