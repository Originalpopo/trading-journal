import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRate, toBaht, formatApproxBaht, localDay } from './bahtRate.ts';

test('reads the rate service answer', () => {
  assert.deepEqual(
    parseRate({ amount: 1, base: 'USD', date: '2026-10-05', rates: { THB: 33.695 } }, '2026-10-06'),
    { rate: 33.695, date: '2026-10-05', fetchedOn: '2026-10-06' },
  );
});

test('rejects an answer without a usable rate', () => {
  assert.equal(parseRate(null, '2026-10-06'), null);
  assert.equal(parseRate({ date: '2026-10-05', rates: {} }, '2026-10-06'), null);
  assert.equal(parseRate({ date: '2026-10-05', rates: { THB: 0 } }, '2026-10-06'), null);
  assert.equal(parseRate({ rates: { THB: 33.7 } }, '2026-10-06'), null);
});

test('converts dollars to baht, rounded to the satang', () => {
  assert.equal(toBaht(104.99, 33.695), 3537.64);
  assert.equal(toBaht(-1.47, 33.695), -49.53);
  assert.equal(toBaht(0, 33.695), 0);
});

test('formats the approximate baht figure', () => {
  assert.equal(formatApproxBaht(104.99, 33.695), '≈฿3,537.64');
  assert.equal(formatApproxBaht(-1.47, 33.695), '≈-฿49.53');
});

test('the day key is the local calendar day', () => {
  assert.equal(localDay(new Date(2026, 9, 6, 23, 59)), '2026-10-06');
  assert.equal(localDay(new Date(2026, 0, 1, 0, 0)), '2026-01-01');
});
