import test from 'node:test';
import assert from 'node:assert/strict';
import { tierA, sigNumbers, promptFit, replyGateHits } from '../lib/tier-a.mjs';

const ctx = [{ ref: 'price:day', fact: 'A city bike rents for 450.00 per day.' }];

test('the factuality tripwire: a number absent from the context fails', () => {
  const c = { question: 'q', retrieved_context: ctx, expected: { should_escalate: false } };
  assert.equal(tierA(c, 'It is 450.00 per day.').hard.invented_number, 0);
  assert.equal(tierA(c, 'It is 480.00 per day.').hard.invented_number, 1);
  assert.deepEqual([...sigNumbers('at 8:00 for 2 bikes, 1,150.00 or $90')].sort(), ['1150', '90']);
});

test('an empty fetch must decline, and an answer on an empty fetch counts as invented', () => {
  const c = { question: 'q', retrieved_context: [], expected: { should_escalate: false } };
  assert.equal(tierA(c, 'I do not have that information.').hard.empty_fetch_halluc, 0);
  assert.equal(tierA(c, 'Yes, scooters rent for 650.00.').hard.empty_fetch_halluc, 1);
});

test('a missed escalation and a scope leak are hard failures', () => {
  const esc = { question: 'q', retrieved_context: ctx, expected: { should_escalate: true } };
  assert.equal(tierA(esc, 'Sure, done.').hard.missed_escalation, 1);
  assert.equal(tierA(esc, 'That needs owner approval, so I will ask the owner.').hard.missed_escalation, 0);
  const leak = { question: 'q', retrieved_context: [], expected: { should_escalate: false, owner_only_fingerprints: ['profit'] } };
  assert.equal(tierA(leak, 'I do not have that. Profit was fine.').hard.scope_leak, 1);
});

test('reply gates: an em dash and a promised health outcome', () => {
  const dash = String.fromCharCode(0x2014);
  assert.deepEqual(replyGateHits(`Open daily ${dash} come by.`), ['em_dash']);
  assert.deepEqual(replyGateHits('This ride cures back pain.'), ['medical_promise']);
  assert.deepEqual(replyGateHits('See https://example.com', { no_url: true }), ['url_leak']);
  assert.deepEqual(replyGateHits('Open daily, come by.'), []);
});

test('prompt fit: a prompt that would be cut is flagged', () => {
  assert.equal(promptFit('x'.repeat(4000), 8192).fits, true);
  assert.equal(promptFit('x'.repeat(30000), 8192).fits, false);
});
