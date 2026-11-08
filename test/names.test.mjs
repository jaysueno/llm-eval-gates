import test from 'node:test';
import assert from 'node:assert/strict';
import { gradeSummary, nameCandidates } from '../lib/names.mjs';

const transcript = 'Present: Talvi Penhallow, Orrin Dunmore.\nTalvi: I will call Corvin on Monday.\nOrrin: As the buyer I agree.\n';
const c = { must_contain: ['Talvi', 'Corvin'], must_not_contain: ['Talvy'], no_inferred_terms: ['lawyer', 'nurse'] };
const clean = { title: 'Talvi and Orrin on the order', summary_short: 'The buyer agreed.',
  key_takeaways: ['They meet again next week.'], action_items: [{ text: 'Talvi calls Corvin on Monday.' }] };

test('a clean summary in title case is not flagged', () => {
  const g = gradeSummary(c, clean, transcript);
  assert.equal(g.pass, true, JSON.stringify(g));
  assert.equal(g.checked, 3);
});

test('an invented name is caught, even at the head of a bullet', () => {
  const s = { ...clean, key_takeaways: ['Brannoch will bring the rope.'] };
  assert.deepEqual(gradeSummary(c, s, transcript).invented, ['Brannoch']);
});

test('the known-wrong spelling, a dropped name and an inferred job are each caught', () => {
  const s = { ...clean, title: 'Talvy and Orrin on the order', action_items: [{ text: 'The lawyer calls on Monday.' }] };
  const g = gradeSummary(c, s, transcript);
  assert.deepEqual(g.forbidden, ['Talvy']);
  assert.deepEqual(g.missing, ['Talvi', 'Corvin']);
  assert.deepEqual(g.inferred, ['lawyer']);
  assert.deepEqual(g.invented, ['Talvy']);
});

test('acronyms, contractions and common words are not names; names_allow_extra is respected', () => {
  assert.deepEqual(nameCandidates("The VAT number. We're late. Monday."), []);
  const s = { ...clean, summary_short: 'Saltmere is the town.' };
  assert.deepEqual(gradeSummary({ ...c, names_allow_extra: ['Saltmere'] }, s, transcript).invented, []);
});
