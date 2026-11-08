// End to end: the four harnesses as a user runs them, and every way someone might try to get
// a failing read past a gate.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { run, scratchCopy, scratchDir } from './helpers.mjs';
import { readJsonl, toJsonl } from '../lib/jsonl.mjs';

const KEY = { receipts: 'total_halluc', surveys: 'consent_halluc', voice: 'name_halluc', chatbot: 'empty_fetch_halluc' };

test('each harness self-test passes and prints every pinned number', () => {
  for (const d of Object.keys(KEY)) {
    const r = run([`scripts/${d}-eval.mjs`]);
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /SELF-TEST PASS/);
    const pinned = JSON.parse(readFileSync(`eval/${d}/self-test.json`, 'utf8')).pinned;
    for (const [k, v] of Object.entries(pinned)) assert.match(r.out, new RegExp(`${k} ${v} \\(pinned ${v}\\)`));
  }
});

test('the reference read passes its gates and the planted read trips the hard zero', () => {
  for (const [d, key] of Object.entries(KEY)) {
    const ok = run([`scripts/${d}-eval.mjs`, '--results', `eval/${d}/reference-read.jsonl`]);
    assert.equal(ok.code, 0, ok.out);
    assert.match(ok.out, /^GATE PASS$/m);
    const bad = run([`scripts/${d}-eval.mjs`, '--results', `eval/${d}/planted-halluc.jsonl`]);
    assert.equal(bad.code, 1, bad.out);
    assert.match(bad.out, new RegExp(`^GATE FAIL ${key} `, 'm'));
  }
});

test('a self-test that cannot reproduce its numbers gives no verdict', () => {
  const s = scratchCopy();
  try {
    const p = join(s.dir, 'eval', 'receipts', 'self-test.json');
    const doc = JSON.parse(readFileSync(p, 'utf8'));
    doc.pinned.total_wrong += 1;
    writeFileSync(p, JSON.stringify(doc));
    const r = run(['scripts/receipts-eval.mjs', '--results', 'eval/receipts/reference-read.jsonl'], { cwd: s.dir });
    assert.equal(r.code, 2);
    assert.match(r.out, /SELF-TEST FAIL/);
    assert.doesNotMatch(r.out, /SELF-TEST PASS|GATE (PASS|FAIL)/);
  } finally {
    s.done();
  }
});

function blanked(d, mutate) {
  const t = scratchDir();
  const rows = readJsonl(`eval/${d}/golden.jsonl`).map((c) => { mutate(c); return c; });
  const p = join(t.dir, 'set.jsonl');
  writeFileSync(p, toJsonl(rows));
  return { p, done: t.done };
}

test('an empty room is refused: no money, no consent, no names', () => {
  const sets = [
    ['receipts', (c) => { c.fields.total.truth = ''; }, /refus.*total/],
    ['surveys', (c) => { c.truth.feedback.newsletter_opt_in = null; }, /refus.*consent/],
    ['voice', (c) => { c.must_contain = []; }, /refus.*must_contain/],
  ];
  for (const [d, mutate, rx] of sets) {
    const b = blanked(d, mutate);
    try {
      for (const extra of [['--dry'], ['--results', `eval/${d}/reference-read.jsonl`]]) {
        const r = run([`scripts/${d}-eval.mjs`, '--golden', b.p, ...extra]);
        assert.equal(r.code, 1, r.out);
        assert.match(r.out, rx);
        assert.doesNotMatch(r.out, /GATE/);
      }
    } finally {
      b.done();
    }
  }
});

test('a set with nothing blank is refused too: the invented-value gate needs a blank to trip on', () => {
  const sets = [
    ['receipts', (c) => { if (!c.fields.total.truth) c.fields.total.truth = '10.00'; }, /refus.*blank total/],
    ['surveys', (c) => { if (c.truth.feedback.newsletter_opt_in === null) c.truth.feedback.newsletter_opt_in = true; }, /refus.*blank consent/],
  ];
  for (const [d, mutate, rx] of sets) {
    const b = blanked(d, mutate);
    try {
      const r = run([`scripts/${d}-eval.mjs`, '--golden', b.p, '--dry']);
      assert.equal(r.code, 1, r.out);
      assert.match(r.out, rx);
    } finally {
      b.done();
    }
  }
});

test('no env knob, flag or baseline lifts a hard-zero gate', () => {
  const env = { TOTAL_HALLUC_MAX: '999', MAX_HALLUC: '999', ALLOW_HALLUC: '1', SKIP_GATES: '1', NO_GATES: '1', FORCE: '1' };
  const base = ['scripts/receipts-eval.mjs', '--results', 'eval/receipts/planted-halluc.jsonl'];
  const viaEnv = run(base, { env });
  assert.equal(viaEnv.code, 1);
  assert.match(viaEnv.out, /^GATE FAIL total_halluc/m);
  const viaFlag = run([...base, '--max-halluc', '999']);
  assert.equal(viaFlag.code, 2);
  assert.doesNotMatch(viaFlag.out, /GATE PASS/);
  const s = scratchCopy();
  try {
    const bp = join(s.dir, 'eval', 'receipts', 'baseline.json');
    const doc = JSON.parse(readFileSync(bp, 'utf8'));
    doc.gates.total_halluc = 999;
    writeFileSync(bp, JSON.stringify(doc));
    const raised = run(base, { cwd: s.dir });
    assert.equal(raised.code, 1);
    assert.match(raised.out, /^GATE FAIL total_halluc 5 > 0/m);
    assert.match(raised.out, /^GATE FAIL baseline_integrity/m);
    rmSync(bp);
    const none = run(base, { cwd: s.dir });
    assert.equal(none.code, 1);
    assert.match(none.out, /^GATE FAIL total_halluc/m);
    assert.match(none.out, /^GATE FAIL baseline_missing/m);
    const clean = run(['scripts/receipts-eval.mjs', '--results', 'eval/receipts/reference-read.jsonl'], { cwd: s.dir });
    assert.equal(clean.code, 1, clean.out);
    assert.match(clean.out, /^GATE FAIL baseline_missing .*no baseline: create one with npm run rebaseline -- --init/m);
    assert.doesNotMatch(clean.out, /GATE PASS/);
  } finally {
    s.done();
  }
});

test('--self-test or --dry next to --results is refused, so a run with reads always ends in a verdict', () => {
  for (const mode of ['--self-test', '--dry']) {
    const r = run(['scripts/receipts-eval.mjs', '--results', 'eval/receipts/planted-halluc.jsonl', mode]);
    assert.equal(r.code, 2, r.out);
    assert.match(r.out, /refusing: .*cannot be combined with --results/);
    assert.doesNotMatch(r.out, /GATE PASS|SELF-TEST PASS/);
  }
});

test('a transcript that does not match its digest is refused', () => {
  const s = scratchCopy();
  try {
    const p = join(s.dir, 'eval', 'voice', 'transcripts', 'vc-0001.txt');
    writeFileSync(p, readFileSync(p, 'utf8') + 'one more line\n');
    const r = run(['scripts/voice-eval.mjs'], { cwd: s.dir });
    assert.equal(r.code, 2);
    assert.match(r.out, /does not match its pinned digest/);
  } finally {
    s.done();
  }
});

test('rebaseline tightens after an improvement and refuses a failing run', () => {
  const s = scratchCopy();
  try {
    const reads = readJsonl('eval/receipts/golden.jsonl').map((c) => ({ receipt_id: c.receipt_id,
      draft: Object.fromEntries(Object.entries(c.fields).map(([k, v]) => [k, v.truth])) }));
    const perfect = join(s.dir, 'perfect.jsonl');
    writeFileSync(perfect, toJsonl(reads));
    const out = join(s.dir, 'new-baseline.json');
    const r = run(['scripts/rebaseline.mjs', 'receipts', '--results', perfect, '--out', out], { cwd: s.dir });
    assert.equal(r.code, 0, r.out);
    const g = JSON.parse(readFileSync(out, 'utf8')).gates;
    assert.deepEqual(g, { max_total_wrong: 0, min_present_total_acc: 100, min_overall_field_pct: 100 });
    const bad = run(['scripts/rebaseline.mjs', 'receipts', '--results', 'eval/receipts/planted-halluc.jsonl', '--out', out], { cwd: s.dir });
    assert.equal(bad.code, 1);
    assert.match(bad.out, /refusing: a run that fails a gate/);
  } finally {
    s.done();
  }
});

test('rebaseline without --init refuses a missing baseline, so a deleted file never becomes a looser floor', () => {
  const s = scratchCopy();
  try {
    rmSync(join(s.dir, 'eval', 'receipts', 'baseline.json'));
    const r = run(['scripts/rebaseline.mjs', 'receipts', '--results', 'eval/receipts/reference-read.jsonl'], { cwd: s.dir });
    assert.equal(r.code, 2, r.out);
    assert.match(r.out, /refusing: .*does not exist; write the first one on purpose with --init/);
  } finally {
    s.done();
  }
});

test('rebaseline --init writes only a first baseline and refuses when one exists', () => {
  const s = scratchCopy();
  try {
    const bp = join(s.dir, 'eval', 'receipts', 'baseline.json');
    const exists = run(['scripts/rebaseline.mjs', '--init', 'receipts', '--results', 'eval/receipts/reference-read.jsonl'], { cwd: s.dir });
    assert.equal(exists.code, 2, exists.out);
    assert.match(exists.out, /refusing: .*already exists/);
    rmSync(bp);
    const failing = run(['scripts/rebaseline.mjs', '--init', 'receipts', '--results', 'eval/receipts/planted-halluc.jsonl'], { cwd: s.dir });
    assert.equal(failing.code, 1, failing.out);
    const ok = run(['scripts/rebaseline.mjs', '--init', 'receipts', '--results', 'eval/receipts/reference-read.jsonl'], { cwd: s.dir });
    assert.equal(ok.code, 0, ok.out);
    assert.deepEqual(JSON.parse(readFileSync(bp, 'utf8')).gates, { max_total_wrong: 2, min_present_total_acc: 87.1, min_overall_field_pct: 89.8 });
    const after = run(['scripts/receipts-eval.mjs', '--results', 'eval/receipts/reference-read.jsonl'], { cwd: s.dir });
    assert.equal(after.code, 0, after.out);
    assert.match(after.out, /^GATE PASS$/m);
  } finally {
    s.done();
  }
});
