import test from 'node:test';
import assert from 'node:assert/strict';
import { HARD_ZERO, evaluateGates, ratchet } from '../lib/gates.mjs';

const RATCHETS = [
  { key: 'max_total_wrong', metric: 'total_wrong', dir: 'max' },
  { key: 'min_present_total_acc', metric: 'present_total_acc', dir: 'min' },
];

test('the hard-zero table is frozen and every invented-value count is zero', () => {
  assert.ok(Object.isFrozen(HARD_ZERO));
  assert.throws(() => { 'use strict'; HARD_ZERO.total_halluc = 5; }, TypeError);
  for (const k of ['total_halluc', 'consent_halluc', 'name_halluc', 'rating_halluc', 'field_halluc']) assert.equal(HARD_ZERO[k], 0);
});

test('a hard-zero gate fails on one invented value, with or without a baseline', () => {
  for (const baseline of [null, { gates: { max_total_wrong: 9 } }]) {
    const v = evaluateGates({ total_halluc: 1, total_wrong: 0, present_total_acc: 100 },
      { hardKeys: ['total_halluc'], ratchets: RATCHETS, baseline, baselineLabel: 'b.json' });
    assert.equal(v.failed, true);
    assert.match(v.lines[0], /^GATE FAIL total_halluc 1 > 0/);
  }
});

test('a baseline that names a hard-zero gate fails the run and does not raise the gate', () => {
  const v = evaluateGates({ total_halluc: 1, total_wrong: 0, present_total_acc: 100 },
    { hardKeys: ['total_halluc'], ratchets: RATCHETS, baselineLabel: 'b.json',
      baseline: { gates: { total_halluc: 999, max_total_halluc: 999, max_total_wrong: 5 } } });
  assert.equal(v.failed, true);
  assert.ok(v.lines.some((l) => /^GATE FAIL total_halluc 1 > 0/.test(l)));
  assert.ok(v.lines.some((l) => /^GATE FAIL baseline_integrity .*gates\.total_halluc/.test(l)));
});

test('a missing baseline is a gate failure, even for a clean read', () => {
  const v = evaluateGates({ total_halluc: 0, total_wrong: 0, present_total_acc: 100 },
    { hardKeys: ['total_halluc'], ratchets: RATCHETS, baseline: null, baselineLabel: 'b.json' });
  assert.equal(v.failed, true);
  assert.deepEqual(v.lines, ['GATE FAIL baseline_missing b.json does not exist; no baseline: create one with npm run rebaseline -- --init <domain> --results <reads.jsonl>']);
});

test('an unmeasured hard gate fails instead of passing', () => {
  const v = evaluateGates({}, { hardKeys: ['total_halluc'], ratchets: [], baseline: null, baselineLabel: 'b.json' });
  assert.equal(v.failed, true);
});

test('ratchet gates compare against the baseline in the right direction', () => {
  const base = { gates: { max_total_wrong: 2, min_present_total_acc: 90 } };
  const opts = { hardKeys: ['total_halluc'], ratchets: RATCHETS, baseline: base, baselineLabel: 'b.json' };
  assert.equal(evaluateGates({ total_halluc: 0, total_wrong: 2, present_total_acc: 90 }, opts).failed, false);
  const v = evaluateGates({ total_halluc: 0, total_wrong: 3, present_total_acc: 89.9 }, opts);
  assert.deepEqual(v.lines, ['GATE FAIL max_total_wrong total_wrong 3 > 2', 'GATE FAIL min_present_total_acc present_total_acc 89.9 < 90']);
});

test('the ratchet only ever tightens', () => {
  const old = { gates: { max_total_wrong: 2, min_present_total_acc: 90 } };
  assert.deepEqual(ratchet(old, { total_wrong: 1, present_total_acc: 95 }, RATCHETS), { max_total_wrong: 1, min_present_total_acc: 95 });
  assert.deepEqual(ratchet(old, { total_wrong: 4, present_total_acc: 80 }, RATCHETS), { max_total_wrong: 2, min_present_total_acc: 90 });
});
