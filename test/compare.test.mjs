import test from 'node:test';
import assert from 'node:assert/strict';
import { classify, money, isBlank } from '../lib/compare.mjs';

test('the four classes: match, miss, wrong, invented', () => {
  assert.equal(classify('money', '1,284.50', '1284.5'), 'match');
  assert.equal(classify('money', '', ''), 'match');
  assert.equal(classify('money', '1,284.50', ''), 'miss');
  assert.equal(classify('money', '1,284.50', '1,248.50'), 'wrong');
  assert.equal(classify('money', '', '350.00'), 'halluc');
});

test('a non-number on a blank total still counts as invented', () => {
  assert.equal(classify('money', '', 'N/A'), 'halluc');
  assert.equal(money('N/A'), null);
});

test('a blank consent box is null, and false is a mark', () => {
  assert.equal(classify('bool', null, true), 'halluc');
  assert.equal(classify('bool', null, false), 'halluc');
  assert.equal(classify('bool', false, null), 'miss');
  assert.equal(classify('bool', false, 'no'), 'match');
  assert.equal(isBlank(false), false);
});

test('free text tolerates a small typo and ids do not', () => {
  assert.equal(classify('text', 'Tidewater Hardware', 'Tidewter Hardware'), 'match');
  assert.equal(classify('id', 'INV-48213', 'INV-48231'), 'wrong');
  assert.equal(classify('id', 'INV-48213', 'inv 48213'), 'match');
});
