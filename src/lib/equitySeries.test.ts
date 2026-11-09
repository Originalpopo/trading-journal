import { test } from 'node:test';
import assert from 'node:assert/strict';
import { equitySeries, rangeStart, type SeriesEvent } from './equitySeries.ts';

const day = 86_400_000;
const NOW = new Date(2026, 10, 9, 12, 0).getTime();
const trade = (daysAgo: number, profit: number): SeriesEvent => ({ type: 'trade', time: NOW - daysAgo * day, profit });
const deposit = (daysAgo: number, amount: number): SeriesEvent => ({ type: 'funding', time: NOW - daysAgo * day, deposit: amount });

test('ALL starts at zero and keeps every point', () => {
  const s = equitySeries([deposit(40, 100), trade(30, 10), trade(3, -4)], 'ALL', NOW);
  assert.deepEqual(s.labels[0], 'Start');
  assert.deepEqual(s.equity, [0, 0, 10, 6]);
  assert.deepEqual(s.balance, [0, 100, 110, 106]);
  assert.equal(s.peak, 10);
  assert.equal(s.peakIndex, 2);
  assert.equal(s.current, 6);
});

test('a short range starts where the account stood then, and the figures stay all-time', () => {
  const s = equitySeries([deposit(40, 100), trade(30, 10), trade(3, -4), trade(1, 1)], '1W', NOW);
  // The line starts at the range's start with the equity and balance of that moment.
  assert.deepEqual(s.equity, [10, 6, 7]);
  assert.deepEqual(s.balance, [110, 106, 107]);
  // The peak came before the range: the Peak line starts at the left edge, at the all-time peak.
  assert.equal(s.peak, 10);
  assert.equal(s.peakIndex, 0);
  assert.equal(s.current, 7);
});

test('a peak inside the range is found in it', () => {
  const s = equitySeries([deposit(40, 100), trade(30, 10), trade(3, 5), trade(1, -2)], '1W', NOW);
  assert.equal(s.peak, 15);
  assert.equal(s.peakIndex, 1);
});

test('nothing in the range: a flat line from its start to now', () => {
  const s = equitySeries([deposit(40, 100), trade(30, 10)], '1W', NOW);
  assert.deepEqual(s.equity, [10, 10]);
  assert.deepEqual(s.balance, [110, 110]);
  assert.equal(s.peakIndex, 0);
});

test('an account newer than the range starts at zero, as on ALL', () => {
  const s = equitySeries([deposit(2, 50), trade(1, 5)], '1M', NOW);
  assert.equal(s.labels[0], 'Start');
  assert.deepEqual(s.equity, [0, 0, 5]);
});

test('over 500 points in the range: one per day, and the peak day keeps the peak', () => {
  const events: SeriesEvent[] = [deposit(80, 1000)];
  // 60 days × 10 trades; the best moment is the 3rd trade of 20 days ago.
  for (let d = 60; d >= 1; d--) {
    for (let i = 0; i < 10; i++) {
      const profit = d === 20 && i === 2 ? 500 : d === 20 && i === 3 ? -400 : 0.01;
      events.push({ type: 'trade', time: NOW - d * day + i * 60_000, profit });
    }
  }
  const s = equitySeries(events, '3M', NOW);
  assert.equal(s.equity.length, 1 + 1 + 60); // anchor, the deposit's day, 60 trading days
  const peakDay = new Date(NOW - 20 * day);
  assert.equal(s.labels[s.peakIndex], `${peakDay.getDate()}/${peakDay.getMonth() + 1}/${String(peakDay.getFullYear()).slice(-2)}`);
});

test('range starts', () => {
  assert.equal(rangeStart('ALL', NOW), null);
  assert.equal(rangeStart('1W', NOW), NOW - 7 * day);
  assert.equal(new Date(rangeStart('1M', NOW)!).getMonth(), 9);
  assert.equal(new Date(rangeStart('1Y', NOW)!).getFullYear(), 2025);
});
