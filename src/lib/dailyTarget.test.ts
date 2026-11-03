import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dailyTargets, summarizeTargets, daysTradedAfterTarget, weekdayTargets, pctOnDay, withPctChange } from './dailyTarget.ts';

const funding = [{ time: '2026-10-01T08:00:00', deposit: 1000 }];

test('the target is a share of the balance the day started with, to the cent', () => {
  const trades = [
    { time: '2026-10-01T10:00:00', profit: 33.33 },
    { time: '2026-10-02T10:00:00', profit: 1 },
  ];
  const days = dailyTargets(trades, funding, 0.25, 0);
  // Day 1 starts at $0 (the deposit lands that morning): no target.
  assert.equal(days.get('2026-10-01')!.target, 0);
  // Day 2 starts at 1033.33; 0.25% is 2.583325, so $2.58.
  assert.equal(days.get('2026-10-02')!.startBalance, 1033.33);
  assert.equal(days.get('2026-10-02')!.target, 2.58);
});

test('reaching the target: trades entered after it count, one entered before and closed after does not', () => {
  const trades = [
    { time: '2026-10-02T09:30:00', entryTime: '2026-10-02T09:00:00', profit: 2, rr: 1 },
    { time: '2026-10-02T10:15:00', entryTime: '2026-10-02T09:40:00', profit: 1, rr: 0.5 }, // reaches $2.50
    { time: '2026-10-02T10:30:00', entryTime: '2026-10-02T10:00:00', profit: 0.4, rr: 0.2 }, // entered before
    { time: '2026-10-02T11:30:00', entryTime: '2026-10-02T11:00:00', profit: -1.25, rr: -1 },
    { time: '2026-10-02T12:30:00', entryTime: '2026-10-02T12:00:00', profit: 0.1, rr: 0.05 },
  ];
  const d = dailyTargets(trades, funding, 0.25, 0).get('2026-10-02')!;
  assert.equal(d.target, 2.5);
  assert.equal(d.hitAt, '2026-10-02T10:15:00');
  assert.equal(d.afterCount, 2);
  assert.equal(d.afterPnl, -1.15);
  assert.ok(Math.abs(d.afterRr - -0.95) < 1e-9);
  assert.equal(d.pnl, 2.25);
});

test('a day that never reaches the target has no hit and nothing after', () => {
  const d = dailyTargets([{ time: '2026-10-02T10:00:00', profit: 2.49 }], funding, 0.25, 0).get('2026-10-02')!;
  assert.equal(d.hitAt, undefined);
  assert.equal(d.afterCount, 0);
});

test('today is given a target before its first trade', () => {
  const d = dailyTargets([], funding, 0.25, 0, '2026-10-05').get('2026-10-05')!;
  assert.deepEqual([d.startBalance, d.target, d.pnl], [1000, 2.5, 0]);
});

test('a withdrawal before the day lowers its target; a target of 0% turns it off', () => {
  const f = [...funding, { time: '2026-10-01T20:00:00', withdraw: 600 }];
  assert.equal(dailyTargets([], f, 0.25, 0, '2026-10-02').get('2026-10-02')!.target, 1);
  assert.equal(dailyTargets([], f, 0, 0, '2026-10-02').get('2026-10-02')!.target, 0);
});

test('summarizeTargets and daysTradedAfterTarget', () => {
  const trades = [
    { time: '2026-10-02T10:00:00', profit: 3 }, // hit, stopped
    { time: '2026-10-05T10:00:00', entryTime: '2026-10-05T09:00:00', profit: 3 }, // hit
    { time: '2026-10-05T12:00:00', entryTime: '2026-10-05T11:00:00', profit: -2, rr: -1 }, // after
  ];
  const days = dailyTargets(trades, funding, 0.25, 0);
  assert.deepEqual(summarizeTargets(days), { hitDays: 2, stoppedDays: 1, continuedDays: 1, afterCount: 1, afterPnl: -2, afterRr: -1 });
  assert.equal(summarizeTargets(days, '2026-10-03').hitDays, 1);
  assert.deepEqual([...daysTradedAfterTarget(days)], ['2026-10-05']);
});

test('weekdayTargets: Monday to Friday of this week, each reached, missed, today or still to come', () => {
  const trades = [
    { time: '2026-10-02T10:00:00', profit: 5 }, // Friday the week before: not in this week
    { time: '2026-10-05T10:00:00', profit: 3 }, // Monday: over its $2.51 target
    { time: '2026-10-06T10:00:00', profit: 0.1 }, // Tuesday: short of it
  ];
  const days = dailyTargets(trades, funding, 0.25, 0, '2026-10-07');
  assert.deepEqual(weekdayTargets(days, '2026-10-07').map(d => `${d.date} ${d.state}`), [
    '2026-10-05 hit',
    '2026-10-06 missed',
    '2026-10-07 today',
    '2026-10-08 upcoming',
    '2026-10-09 upcoming',
  ]);
  // Today shows as reached once it is; on a Sunday, Sunday is today and the weekdays are still to come.
  const hitToday = dailyTargets([{ time: '2026-10-07T10:00:00', profit: 9 }], funding, 0.25, 0, '2026-10-07');
  assert.equal(weekdayTargets(hitToday, '2026-10-07')[2].state, 'hit');
  const sunday = dailyTargets([], funding, 0.25, 0, '2026-10-04');
  assert.deepEqual(weekdayTargets(sunday, '2026-10-04').map(d => d.state), ['today', 'upcoming', 'upcoming', 'upcoming', 'upcoming', 'upcoming']);
});

test('weekdayTargets: a weekend day shows only when it was traded or is today; one without trades is not missed', () => {
  const trades = [
    { time: '2026-10-04T10:00:00', profit: 9 }, // Sunday, traded (e.g. crypto): reached
    { time: '2026-10-05T10:00:00', profit: 9 }, // Monday
  ];
  // Seen on Saturday 10 October: the traded Sunday is in, and Saturday is today.
  const days = dailyTargets(trades, funding, 0.25, 0, '2026-10-10');
  assert.deepEqual(weekdayTargets(days, '2026-10-10').map(d => `${d.date} ${d.state}`), [
    '2026-10-04 hit',
    '2026-10-05 hit',
    '2026-10-06 noTrades',
    '2026-10-07 noTrades',
    '2026-10-08 noTrades',
    '2026-10-09 noTrades',
    '2026-10-10 today',
  ]);
  // The same week seen on Friday: the untraded Saturday does not show yet.
  const friday = dailyTargets(trades, funding, 0.25, 0, '2026-10-09');
  assert.deepEqual(weekdayTargets(friday, '2026-10-09').map(d => d.date), ['2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09']);
  // Without a weekend trade it is the five weekdays.
  const weekdays = dailyTargets(trades.slice(1), funding, 0.25, 0, '2026-10-09');
  assert.equal(weekdayTargets(weekdays, '2026-10-09').length, 5);
});

test('with days starting at 5am, a trade opened Friday night and closed 1am Saturday counts for Friday', () => {
  const trades = [
    { time: '2026-10-08T03:00:00', profit: 4 }, // 3am Thursday: Wednesday's, so already in Thursday's start balance
    { time: '2026-10-10T01:00:00', entryTime: '2026-10-09T23:00:00', profit: 3 }, // closes 1am Saturday
  ];
  const days = dailyTargets(trades, funding, 0.25, 5, '2026-10-10');
  assert.equal(days.get('2026-10-07')!.pnl, 4);
  const friday = days.get('2026-10-09')!;
  // Friday starts at 5am with 1004.00; 0.25% is $2.51, reached by the 1am close.
  assert.deepEqual([friday.startBalance, friday.target, friday.pnl, friday.hitAt], [1004, 2.51, 3, '2026-10-10T01:00:00']);
  // Saturday (today) starts after it: 1007.00.
  assert.equal(days.get('2026-10-10')!.startBalance, 1007);
  assert.equal(weekdayTargets(days, '2026-10-10')[4].state, 'hit');
});

test('weekdayTargets of last week: every day is over, so each is reached, missed or had no trades', () => {
  const trades = [{ time: '2026-10-05T10:00:00', profit: 9 }]; // Monday of the week before
  const days = dailyTargets(trades, funding, 0.25, 0, '2026-10-13');
  assert.deepEqual(weekdayTargets(days, '2026-10-13', '2026-10-04').map(d => `${d.date} ${d.state}`), [
    '2026-10-05 hit',
    '2026-10-06 noTrades',
    '2026-10-07 noTrades',
    '2026-10-08 noTrades',
    '2026-10-09 noTrades',
  ]);
});

test('weekdayTargets: a past day traded but short is missed; one with no trade at all is not', () => {
  const trades = [{ time: '2026-10-05T10:00:00', profit: -1 }]; // Monday: traded, a loss
  const days = dailyTargets(trades, funding, 0.25, 0, '2026-10-07');
  assert.deepEqual(weekdayTargets(days, '2026-10-07').slice(0, 3).map(d => d.state), ['missed', 'noTrades', 'today']);
});

test('the target % history: the first change keeps the old % for the days before it', () => {
  const h = withPctChange(undefined, 25, 30, '2026-11-03');
  assert.deepEqual(h, [{ from: '', pct: 25 }, { from: '2026-11-03', pct: 30 }]);
  assert.equal(pctOnDay(h, '2026-11-02', 30), 25);
  assert.equal(pctOnDay(h, '2026-11-03', 30), 30);
  assert.equal(pctOnDay(h, '2026-12-01', 30), 30);
  // No history: every day uses the % set now.
  assert.equal(pctOnDay(undefined, '2026-11-02', 30), 30);
});

test('the target % history: a second change on the same day replaces it, and changing back drops it', () => {
  const once = withPctChange(undefined, 25, 30, '2026-11-03');
  assert.deepEqual(withPctChange(once, 30, 35, '2026-11-03'), [{ from: '', pct: 25 }, { from: '2026-11-03', pct: 35 }]);
  assert.deepEqual(withPctChange(once, 30, 25, '2026-11-03'), [{ from: '', pct: 25 }]);
  const later = withPctChange(once, 30, 20, '2026-11-10');
  assert.deepEqual(later.map(c => c.pct), [25, 30, 20]);
  assert.equal(pctOnDay(later, '2026-11-09', 20), 30);
});

test('each day can be held to its own %', () => {
  const trades = [
    { time: '2026-10-02T10:00:00', profit: 3 },
    { time: '2026-10-05T10:00:00', profit: 3 },
  ];
  const h = [{ from: '', pct: 0.25 }, { from: '2026-10-05', pct: 0.5 }];
  const days = dailyTargets(trades, funding, day => pctOnDay(h, day, 0.5), 0);
  assert.equal(days.get('2026-10-02')!.target, 2.5);
  assert.ok(days.get('2026-10-02')!.hitAt);
  // 1003 at 0.5% is 5.015, so $5.02, not reached with $3.
  assert.equal(days.get('2026-10-05')!.target, 5.02);
  assert.equal(days.get('2026-10-05')!.hitAt, undefined);
});

test('the lowest the day went: kept after it climbs back, 0 when it never went below', () => {
  const trades = [
    { time: '2026-10-02T09:00:00', profit: -5 },
    { time: '2026-10-02T10:00:00', profit: -7.25 },
    { time: '2026-10-02T11:00:00', profit: 10 },
  ];
  const d = dailyTargets(trades, funding, 0.25, 0).get('2026-10-02')!;
  assert.equal(d.pnl, -2.25);
  assert.equal(d.lowPnl, -12.25);
  assert.equal(dailyTargets([{ time: '2026-10-02T09:00:00', profit: 3 }], funding, 0.25, 0).get('2026-10-02')!.lowPnl, 0);
});

test('the lowest the day went starts again once the day is back above 0', () => {
  const trades = [
    { time: '2026-10-02T09:00:00', profit: -12.25 },
    { time: '2026-10-02T10:00:00', profit: 13 }, // back above 0: +0.75
    { time: '2026-10-02T11:00:00', profit: -4 }, // -3.25
    { time: '2026-10-02T12:00:00', profit: 1 }, // -2.25
  ];
  const d = dailyTargets(trades, funding, 0.25, 0).get('2026-10-02')!;
  assert.equal(d.pnl, -2.25);
  assert.equal(d.lowPnl, -3.25);
});
