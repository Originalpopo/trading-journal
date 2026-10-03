import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toCents, fromCents, addMoney, subMoney, sumMoney } from './money.ts';

test('float addition drifts, cent addition does not', () => {
  assert.notEqual(0.1 + 0.2, 0.3);
  assert.equal(addMoney(0.1, 0.2), 0.3);
  assert.equal(subMoney(0.3, 0.1), 0.2);
});

test('toCents is exact for two-decimal amounts, including ones floats store badly', () => {
  assert.equal(toCents(-0.72), -72);
  assert.equal(toCents(1.15), 115);
  assert.equal(toCents(4.35), 435);
  assert.equal(toCents(19.99), 1999);
  assert.equal(toCents('12.30'), 1230);
  assert.equal(fromCents(-892), -8.92);
});

test('missing or unreadable amounts count as zero', () => {
  assert.equal(toCents(undefined), 0);
  assert.equal(toCents(null), 0);
  assert.equal(toCents(''), 0);
  assert.equal(toCents('abc'), 0);
});

test('sumMoney gives the exact total of many small amounts', () => {
  const amounts = Array.from({ length: 10000 }, () => 0.01);
  assert.notEqual(amounts.reduce((s, a) => s + a, 0), 100);
  assert.equal(sumMoney(amounts), 100);
  assert.equal(sumMoney([-0.72, -0.01, -1.32]), -2.05);
  assert.equal(sumMoney([]), 0);
});
