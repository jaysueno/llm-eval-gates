import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { run, scratchDir, ROOT } from './helpers.mjs';
import { readJsonl, get } from '../lib/jsonl.mjs';

const DOMAINS = ['receipts', 'surveys', 'voice', 'chatbot'];
const FILES = ['golden.jsonl', 'reference-read.jsonl', 'planted-halluc.jsonl'];

test('seed 7 reproduces the committed golden sets, reads and transcripts byte for byte', () => {
  const t = scratchDir();
  try {
    const r = run(['scripts/generate-golden.mjs', '--seed', '7', '--out', t.dir]);
    assert.equal(r.code, 0, r.out);
    for (const d of DOMAINS) {
      for (const f of FILES) {
        assert.equal(readFileSync(join(t.dir, d, f), 'utf8'), readFileSync(join(ROOT, 'eval', d, f), 'utf8'), `${d}/${f}`);
      }
    }
    for (const f of readdirSync(join(ROOT, 'eval', 'voice', 'transcripts'))) {
      const p = join('voice', 'transcripts', f);
      assert.equal(readFileSync(join(t.dir, p), 'utf8'), readFileSync(join(ROOT, 'eval', p), 'utf8'), p);
    }
  } finally {
    t.done();
  }
});

test('a different seed writes a different set', () => {
  const t = scratchDir();
  try {
    assert.equal(run(['scripts/generate-golden.mjs', '--seed', '8', '--out', t.dir]).code, 0);
    assert.notEqual(readFileSync(join(t.dir, 'receipts', 'golden.jsonl'), 'utf8'),
      readFileSync(join(ROOT, 'eval', 'receipts', 'golden.jsonl'), 'utf8'));
  } finally {
    t.done();
  }
});

test('the set has something to catch: filled and blank totals, marked and blank consent, names', () => {
  const rc = readJsonl(join(ROOT, 'eval', 'receipts', 'golden.jsonl'));
  const totals = rc.map((c) => get(c, 'fields.total.truth'));
  assert.ok(totals.filter((t) => t !== '').length >= 20);
  assert.ok(totals.filter((t) => t === '').length >= 3);
  const sv = readJsonl(join(ROOT, 'eval', 'surveys', 'golden.jsonl'));
  const consent = sv.map((c) => get(c, 'truth.feedback.newsletter_opt_in'));
  assert.ok(consent.includes(true) && consent.includes(false) && consent.includes(null));
  const vc = readJsonl(join(ROOT, 'eval', 'voice', 'golden.jsonl'));
  assert.ok(vc.every((c) => c.must_contain.length > 0));
});

test('every value is invented: example.com mail, 555 phone numbers, no real domains', () => {
  const sv = readJsonl(join(ROOT, 'eval', 'surveys', 'golden.jsonl'));
  for (const c of sv) {
    if (c.truth.intake.email) assert.match(c.truth.intake.email, /@example\.com$/);
    if (c.truth.intake.phone) assert.match(c.truth.intake.phone, /^555-01\d\d$/);
  }
});
