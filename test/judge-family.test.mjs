import test from 'node:test';
import assert from 'node:assert/strict';
import { modelFamily, assertJudgeIndependent, callJudge } from '../lib/judge.mjs';
import { run } from './helpers.mjs';

test('refuses a judge from the same family as the candidate', () => {
  const pairs = [
    ['qwen-7b-example', 'qwen-large-example:q8'],
    ['Qwen9-Example-7B', 'qwen/qwen-judge-example'],
    ['deepseek-small-example', 'deepseek/deepseek-judge-example'],
    ['gemma-example:9b', 'google/gemini-example'],
    ['llama-example:8b', 'meta-llama/llama-large-example'],
    ['claude-example', 'anthropic/claude-judge-example'],
    ['gpt-small-example', 'openai/gpt-judge-example'],
    ['mistral-small-example', 'mistralai/mixtral-example'],
    ['glm-small-example', 'z-ai/glm-judge-example'],
  ];
  for (const [c, j] of pairs) assert.throws(() => assertJudgeIndependent(c, j), /same model family/i, `${c} | ${j}`);
});

test('accepts a judge from a different family', () => {
  const pairs = [
    ['qwen-7b-example', 'deepseek/deepseek-judge-example'],
    ['gemma-example:9b', 'z-ai/glm-judge-example'],
    ['llama-example:8b', 'mistralai/mistral-judge-example'],
    ['gpt-small-example', 'anthropic/claude-judge-example'],
  ];
  for (const [c, j] of pairs) {
    const r = assertJudgeIndependent(c, j);
    assert.notEqual(r.candidate, r.judge);
  }
});

test('refuses when a model family is unknown, on either side', () => {
  assert.throws(() => assertJudgeIndependent('zorbel-7b', 'deepseek/deepseek-judge-example'), /unknown/i);
  assert.throws(() => assertJudgeIndependent('qwen-7b-example', 'quillon-2:13b'), /unknown/i);
  assert.throws(() => assertJudgeIndependent('', 'gemma-example:9b'), /unknown/i);
  assert.equal(modelFamily('vexmara/vexmara-large'), null);
  assert.equal(modelFamily(undefined), null);
});

test('modelFamily reads provider prefixes, size tags, case and glued versions', () => {
  assert.equal(modelFamily('deepseek/deepseek-judge-example'), 'deepseek');
  assert.equal(modelFamily('Qwen9-Example-7B'), 'qwen');
  assert.equal(modelFamily('qwen-large-example:q8'), 'qwen');
  assert.equal(modelFamily('meta-llama/llama-large-example'), 'meta');
  assert.equal(modelFamily('google/gemma-example-it'), 'google');
});

test('the CLI refuses a same-family or unknown-family judge before any model call', () => {
  const closed = { JUDGE_URL: 'http://localhost:9', JUDGE_API_KEY: '' };
  for (const [c, j] of [['qwen-7b-example', 'qwen-large-example:q8'], ['zorbel-7b', 'deepseek/deepseek-judge-example']]) {
    const r = run(['scripts/chatbot-eval.mjs', '--judge', '--candidate', c, '--judge-model', j], { env: closed });
    assert.equal(r.code, 2);
    assert.match(r.out, /refusing the judge: .*famil/i);
    assert.doesNotMatch(r.out, /SELF-TEST/);
  }
});

test('without JUDGE_URL the judge is skipped and never changes the verdict', () => {
  const r = run(['scripts/chatbot-eval.mjs', '--results', 'eval/chatbot/reference-read.jsonl', '--judge',
    '--candidate', 'qwen-7b-example', '--judge-model', 'deepseek-judge-example'], { env: { JUDGE_URL: '' } });
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /JUDGE_URL is not set/);
  assert.match(r.out, /GATE PASS/);
});

test('callJudge parses a verdict and returns no verdict on a failed call', async () => {
  const ok = async () => ({ json: async () => ({ choices: [{ message: { content: '{"grounded": true, "complete": true, "score": 0.9, "pass": true}' } }] }) });
  const v = await callJudge('q', 'c', 'a', { model: 'm', url: 'http://localhost:9', fetchImpl: ok });
  assert.equal(v.pass, true);
  assert.equal(v.score, 0.9);
  const bad = async () => { throw new Error('down'); };
  const e = await callJudge('q', 'c', 'a', { model: 'm', url: 'http://localhost:9', fetchImpl: bad });
  assert.equal(e.error, true);
});
