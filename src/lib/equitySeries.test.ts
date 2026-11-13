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

test('a short range starts where the account stood then; the equity stays all-time', () => {
  const s = equitySeries([deposit(40, 100), trade(30, 10), trade(3, -4), trade(1, 1)], '1W', NOW);
  // The line starts at the range's start with the equity and balance of that moment.
  assert.deepEqual(s.equity, [10, 6, 7]);
  assert.deepEqual(s.balance, [110, 106, 107]);
  // The range's highest is where it started: the Peak line starts at the left edge.
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

test('the Low line: the lowest point between the latest peak and the peak before it', () => {
  // Climbs to 10 (two new highs in a row, one climb), dips to 4, climbs to 15, then falls to 3.
  const s = equitySeries([trade(9, 6), trade(8, 4), trade(7, -3), trade(6, -3), trade(5, 2), trade(4, 9), trade(3, -12)], 'ALL', NOW);
  assert.deepEqual(s.equity, [0, 6, 10, 7, 4, 6, 15, 3]);
  assert.equal(s.peak, 15);
  assert.equal(s.low, 4);
  assert.equal(s.lowIndex, 4);
});

test('the Low line: none while the equity has only climbed to its peak', () => {
  const s = equitySeries([trade(5, 6), trade(4, 4), trade(3, -2)], 'ALL', NOW);
  assert.equal(s.low, null);
});

test('the Low line: new highs one after another are one climb, so the peak before is the one before the dip', () => {
  // 10 (peak), dips to 2, climbs to 12 (new high), straight on to 14 (new high), falls back.
  const s = equitySeries([trade(9, 10), trade(8, -8), trade(7, 10), trade(6, 2), trade(5, -5)], 'ALL', NOW);
  assert.equal(s.peak, 14);
  assert.equal(s.low, 2);
});

test('a short range has its own Peak and Low lines; All keeps the all-time ones', () => {
  // All-time: up to 10, down to 4, up to 12 (the peak), down to 3. The last week: from 4, up to 12, down to 3.
  const events = [trade(30, 10), trade(29, -6), trade(3, 8), trade(1, -9)];
  const all = equitySeries(events, 'ALL', NOW);
  assert.deepEqual([all.peak, all.low], [12, 4]);
  const week = equitySeries(events, '1W', NOW);
  assert.deepEqual(week.equity, [4, 12, 3]);
  assert.equal(week.peak, 12);
  assert.equal(week.peakIndex, 1);
  // No peak before the week's top: the lowest point before it (its start, 4) is the Low line.
  assert.equal(week.low, 4);
  assert.equal(week.lowIndex, 0);
});

test('a short range: the Low line is the dip below its start before its top, never one before the range', () => {
  // Before the week: up to 20 (all-time peak), down to 5. In the week: from 5 to 2, up to 9, down to 6.
  const events = [trade(30, 20), trade(29, -15), trade(5, -3), trade(4, 7), trade(2, -3)];
  const all = equitySeries(events, 'ALL', NOW);
  assert.equal(all.peak, 20);
  const week = equitySeries(events, '1W', NOW);
  assert.deepEqual(week.equity, [5, 2, 9, 6]);
  assert.equal(week.peak, 9);
  assert.equal(week.peakIndex, 2);
  assert.equal(week.low, 2);
  assert.equal(week.lowIndex, 1);
});

test('a short range that only fell: its top is its start, and the Low line is the top itself', () => {
  const s = equitySeries([trade(30, 10), trade(3, -2), trade(2, -3)], '1W', NOW);
  assert.deepEqual(s.equity, [10, 8, 5]);
  assert.equal(s.peak, 10);
  assert.equal(s.peakIndex, 0);
  assert.equal(s.low, 10);
  assert.equal(s.lowIndex, 0);
});

test('no peak before the top: the lowest point before it, even if not the start', () => {
  // The week starts at 10, falls to 6, climbs to 14, then drops to 9.
  const s = equitySeries([trade(30, 10), trade(5, -4), trade(4, 8), trade(2, -5)], '1W', NOW);
  assert.deepEqual(s.equity, [10, 6, 14, 9]);
  assert.equal(s.peak, 14);
  // 6 is below the start (10), so lowBeforePeak finds it; same answer.
  assert.equal(s.low, 6);
  assert.equal(s.lowIndex, 1);
});

test('Today is the trading day, starting at the day-start hour', () => {
  const at = (d: number, h: number, m = 0) => new Date(2026, 10, d, h, m).getTime();
  // 9 Nov 2026 at 12:00 (NOW): today began at 05:00; at 03:00 it is still the 8th's trading day.
  assert.equal(rangeStart('TODAY', NOW, 5), at(9, 5));
  assert.equal(rangeStart('TODAY', at(9, 3), 5), at(8, 5));
});

test("Today shows today's trades from where the account stood, with times and the day's own peak", () => {
  const at = (d: number, h: number, m = 0) => new Date(2026, 10, d, h, m).getTime();
  const events: SeriesEvent[] = [
    { type: 'funding', time: at(1, 9), deposit: 100 },
    { type: 'trade', time: at(2, 10), profit: 20 },
    { type: 'trade', time: at(9, 4), profit: -5 }, // still the 8th's trading day
    { type: 'trade', time: at(9, 9, 30), profit: 3 },
  ];
  const s = equitySeries(events, 'TODAY', NOW, 5);
  assert.deepEqual(s.equity, [15, 18]);
  assert.deepEqual(s.labels, ['9/11/26 05:00', '9/11/26 09:30']);
  // The day's top is its last trade, not the all-time 20; the Low line is the lowest before it, the day's start.
  assert.equal(s.peak, 18);
  assert.equal(s.peakIndex, 1);
  assert.equal(s.low, 15);
  assert.equal(s.current, 18);
});
