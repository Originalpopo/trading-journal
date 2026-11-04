import { test } from 'node:test';
import assert from 'node:assert/strict';
import { systemReview, systemScore, inReviewOrder, nextPhase, REVIEW_PHASES, type ReviewTrade } from './systemReview.ts';
import type { DayTarget } from './dailyTarget.ts';

const close = (actual: number, expected: number) =>
  assert.ok(Math.abs(actual - expected) < 1e-9, `expected ${expected}, got ${actual}`);

const pad = (n: number) => String(n).padStart(2, '0');

// Ten trades over two days (each closes 10 minutes after entry): a 5 R win, then losses of -1 R, one
// break-even, and an off-plan loss.
const trades: ReviewTrade[] = [
  // Day 1, 2026-03-02: 09:00 win +5 R ($5), then 10:00, 11:00 losses
  { entryTime: '2026-03-02 09:00:00', time: '2026-03-02 09:10:00', profit: 5, risk: 1, rr: 5, checklists: ['On Plan'] },
  { entryTime: '2026-03-02 10:00:00', time: '2026-03-02 10:10:00', profit: -1, risk: 1, rr: -1, checklists: ['On Plan'] },
  { entryTime: '2026-03-02 11:00:00', time: '2026-03-02 11:10:00', profit: -1, risk: 1, rr: -1, checklists: ['On Plan'] },
  // Day 2, 2026-03-03: evening losses, a break-even, an off-plan loss
  ...[19, 20, 21, 22].map(h => ({ entryTime: `2026-03-03 ${pad(h)}:00:00`, time: `2026-03-03 ${pad(h)}:10:00`, profit: -1, risk: 1, rr: -1, checklists: ['On Plan'] })),
  { entryTime: '2026-03-03 23:00:00', time: '2026-03-03 23:10:00', profit: 0.05, risk: 1, rr: 0.05, checklists: ['On Plan'] },
  { entryTime: '2026-03-03 23:20:00', time: '2026-03-03 23:30:00', profit: -1, risk: 1, rr: -1, isOnPlan: false, checklists: [] },
  { entryTime: '2026-03-03 23:40:00', time: '2026-03-03 23:50:00', profit: -1, risk: 1, rr: -1, checklists: ['On Plan'] },
];

// Day 1 reached its target with the 09:10 win; day 2 never did.
const targetDays = new Map<string, DayTarget>([
  ['2026-03-02', { date: '2026-03-02', startBalance: 100, target: 2.5, pnl: 3, lowPnl: 0, hitAt: '2026-03-02 09:10:00', afterCount: 2, afterPnl: -2, afterRr: -2 }],
  ['2026-03-03', { date: '2026-03-03', startBalance: 103, target: 2.58, pnl: -5.95, lowPnl: -5.95, afterCount: 0, afterPnl: 0, afterRr: 0 }],
]);

test('no report until there are enough trades', () => {
  assert.equal(systemReview(trades, 11, targetDays, 5), null);
  assert.notEqual(systemReview(trades, 10, targetDays, 5), null);
});

test('the result, halves and the weight of the biggest win', () => {
  const r = systemReview(inReviewOrder(trades), 10, targetDays, 5)!;
  assert.deepEqual([r.wins, r.losses, r.bes], [1, 8, 1]);
  close(r.winRate, 1 / 9);
  close(r.netR, 5 - 8 + 0.05);
  close(r.expectancyR, (5 - 8 + 0.05) / 10);
  close(r.avgWinR, 5);
  close(r.avgLossR, -1);
  assert.equal(r.netPnl, -2.95);
  // First five: +5 -1 -1 -1 -1 = 1 → 0.2; last five: -1 -1 +0.05 -1 -1 = -3.95 → -0.79
  close(r.firstHalfR, 0.2);
  close(r.secondHalfR, -0.79);
  close(r.largestWinR, 5);
  close(r.netRWithoutLargest, -8 + 0.05);
  // Six losses in a row on day 2, the break-even not ending the run; the two on day 1 come first.
  assert.equal(r.maxLossStreak, 8);
  assert.equal(r.firstTime, '2026-03-02 09:10:00');
  assert.equal(r.lastTime, '2026-03-03 23:50:00');
});

test('time of day goes by the entry hour', () => {
  const r = systemReview(trades, 10, targetDays, 5)!;
  assert.equal(r.hours[9].count, 1);
  close(r.hours[9].avgR, 5);
  assert.equal(r.hours[23].count, 3);
  const morning = r.blocks.find(b => b.label === 'Morning')!;
  assert.equal(morning.count, 3);
  close(morning.netR, 3);
  const evening = r.blocks.find(b => b.label === 'Evening')!;
  assert.equal(evening.count, 7);
  close(evening.netR, -5.95);
});

test('after the target: trades entered after the day was reached', () => {
  const r = systemReview(trades, 10, targetDays, 5)!;
  assert.deepEqual(r.afterTarget, { daysReached: 1, daysTradedOn: 1, trades: 2, netR: -2, pnl: -2 });
  // With only the first trade, the day is reached but nothing came after it yet.
  const first = systemReview(trades, 1, targetDays, 5)!;
  assert.deepEqual(first.afterTarget, { daysReached: 1, daysTradedOn: 0, trades: 0, netR: 0, pnl: 0 });
  // No target data, no section.
  assert.equal(systemReview(trades, 10, null, 5)!.afterTarget, null);
});

test('on plan and off plan', () => {
  const r = systemReview(trades, 10, targetDays, 5)!;
  assert.equal(r.onPlan.count, 9);
  assert.equal(r.offPlan.count, 1);
  close(r.offPlan.avgR, -1);
});

test('phases run 100 to 1,000 in steps of 100', () => {
  assert.deepEqual([...REVIEW_PHASES], [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000]);
  assert.equal(nextPhase(23), 100);
  assert.equal(nextPhase(100), 200);
  assert.equal(nextPhase(1000), null);
});

test('the score out of 10 weighs five checks', () => {
  // The ten trades: -0.295 R per trade, PF 5.05 / 8 < 1, first half up, second down, net below 0, 9 of 10 on plan.
  const r = systemReview(trades, 10, targetDays, 5)!;
  const { total, parts } = systemScore(r);
  const pts = Object.fromEntries(parts.map(p => [p.key, p.points]));
  close(pts.expectancy, 0);
  close(pts.profitFactor, 0);
  close(pts.consistency, 1);
  close(pts.biggestWin, 0);
  close(pts.discipline, 1.5 * 0.9);
  close(total, 1 + 1.35);
  assert.equal(parts.reduce((a, p) => a + p.weight, 0), 10);

  // The first five alone: +1 R net from a 5 R win, 0.2 R per trade, PF 5 / 4, both halves (2 and 3 trades) …
  const five = systemReview(trades, 5, targetDays, 5)!;
  const p5 = Object.fromEntries(systemScore(five).parts.map(p => [p.key, p.points]));
  close(p5.expectancy, 3.5 * (0.2 / 0.5));
  close(p5.profitFactor, 1.5 * 0.25);
  close(p5.biggestWin, 1.5 * (1 / 5));
  close(p5.discipline, 1.5);
});
