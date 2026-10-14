import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeYear } from './calendarYear.ts';

test('weeks run Sunday to Saturday and are cut at the month edges', () => {
  const { months } = summarizeYear([], 2026, new Date(2026, 0, 1));
  // September 2026 starts on a Tuesday and ends on a Wednesday.
  assert.deepEqual(months[8].weeks.map(w => [w.startDay, w.endDay]), [[1, 5], [6, 12], [13, 19], [20, 26], [27, 30]]);
  // October 2026 starts on a Thursday.
  assert.deepEqual(months[9].weeks.map(w => [w.startDay, w.endDay]), [[1, 3], [4, 10], [11, 17], [18, 24], [25, 31]]);
});

test('trades are added to their week, month and year', () => {
  const trades = [
    { time: '2026-09-30T21:58:34', profit: -1.4, risk: 1.46, rr: -0.96, resultType: 'SL' },
    { time: '2026-10-01T14:15:06', profit: 18.99, risk: 1.42, rr: 13.37, resultType: 'TP' },
    { time: '2026-10-02 10:00:32', profit: 0.08, risk: 1.5, rr: 0.05, resultType: 'BE' },
    { time: '2025-10-01T10:00:00', profit: 99, risk: 1, rr: 99, resultType: 'TP' },
  ];
  const year = summarizeYear(trades, 2026, new Date(2026, 9, 14));
  assert.deepEqual([year.pnl, year.count], [17.67, 3]);
  assert.equal(year.winRate, 50);
  assert.deepEqual([year.months[8].weeks[4].pnl, year.months[8].weeks[4].count], [-1.4, 1]);
  assert.deepEqual([year.months[9].weeks[0].pnl, year.months[9].weeks[0].count], [19.07, 2]);
  assert.deepEqual([year.months[9].pnl, year.months[9].count], [19.07, 2]);
});

test('a week cut at a month edge names the whole week it belongs to', () => {
  const { months } = summarizeYear([], 2026, new Date(2026, 0, 1));
  assert.equal(months[8].weeks[4].week, '2026-09-27');
  assert.equal(months[9].weeks[0].week, '2026-09-27');
  assert.equal(months[9].weeks[1].week, '2026-10-04');
});

test('weeks that start after today are marked as future', () => {
  const { months } = summarizeYear([], 2026, new Date(2026, 9, 14));
  assert.deepEqual(months[9].weeks.map(w => w.isFuture), [false, false, false, true, true]);
});
