import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dailyTargets, summarizeTargets, daysTradedAfterTarget } from './dailyTarget.ts';

const funding = [{ time: '2026-10-01T08:00:00', deposit: 1000 }];

test('the target is a share of the balance the day started with, to the cent', () => {
  const trades = [
    { time: '2026-10-01T10:00:00', profit: 33.33 },
    { time: '2026-10-02T10:00:00', profit: 1 },
  ];
  const days = dailyTargets(trades, funding, 0.25);
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
  const d = dailyTargets(trades, funding, 0.25).get('2026-10-02')!;
  assert.equal(d.target, 2.5);
  assert.equal(d.hitAt, '2026-10-02T10:15:00');
  assert.equal(d.afterCount, 2);
  assert.equal(d.afterPnl, -1.15);
  assert.ok(Math.abs(d.afterRr - -0.95) < 1e-9);
  assert.equal(d.pnl, 2.25);
});

test('a day that never reaches the target has no hit and nothing after', () => {
  const d = dailyTargets([{ time: '2026-10-02T10:00:00', profit: 2.49 }], funding, 0.25).get('2026-10-02')!;
  assert.equal(d.hitAt, undefined);
  assert.equal(d.afterCount, 0);
});

test('today is given a target before its first trade', () => {
  const d = dailyTargets([], funding, 0.25, '2026-10-05').get('2026-10-05')!;
  assert.deepEqual([d.startBalance, d.target, d.pnl], [1000, 2.5, 0]);
});

test('a withdrawal before the day lowers its target; a target of 0% turns it off', () => {
  const f = [...funding, { time: '2026-10-01T20:00:00', withdraw: 600 }];
  assert.equal(dailyTargets([], f, 0.25, '2026-10-02').get('2026-10-02')!.target, 1);
  assert.equal(dailyTargets([], f, 0, '2026-10-02').get('2026-10-02')!.target, 0);
});

test('summarizeTargets and daysTradedAfterTarget', () => {
  const trades = [
    { time: '2026-10-02T10:00:00', profit: 3 }, // hit, stopped
    { time: '2026-10-05T10:00:00', entryTime: '2026-10-05T09:00:00', profit: 3 }, // hit
    { time: '2026-10-05T12:00:00', entryTime: '2026-10-05T11:00:00', profit: -2, rr: -1 }, // after
  ];
  const days = dailyTargets(trades, funding, 0.25);
  assert.deepEqual(summarizeTargets(days), { hitDays: 2, stoppedDays: 1, continuedDays: 1, afterCount: 1, afterPnl: -2, afterRr: -1 });
  assert.equal(summarizeTargets(days, '2026-10-03').hitDays, 1);
  assert.deepEqual([...daysTradedAfterTarget(days)], ['2026-10-05']);
});
