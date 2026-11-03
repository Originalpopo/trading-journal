import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planCost, ruleCounts, disciplineByDay, disciplineStreak } from './discipline.ts';

const on = { checklists: ['On Plan'] };
const off = { checklists: [], isOnPlan: false };

const trades = [
  { time: '2026-10-01T09:00:00', profit: 10.1, rr: 2, ...on },
  { time: '2026-10-01T15:00:00', profit: -5.05, rr: -1, ...off },
  { time: '2026-10-02T09:00:00', profit: 0.1, rr: 0.02, ...on },
  { time: '2026-10-05T09:00:00', profit: -0.2, rr: -0.04, ...off },
];

test('planCost splits money and R by the On Plan mark, to the cent', () => {
  const all = planCost(trades, 0);
  assert.deepEqual(all.onPlan, { count: 2, pnl: 10.2, rr: 2.02 });
  assert.equal(all.offPlan.count, 2);
  assert.equal(all.offPlan.pnl, -5.25);
  assert.ok(Math.abs(all.offPlan.rr - -1.04) < 1e-9);
});

test('planCost counts only the days from `from` on', () => {
  const late = planCost(trades, 0, '2026-10-02');
  assert.deepEqual([late.onPlan.count, late.offPlan.count], [1, 1]);
  assert.equal(late.offPlan.pnl, -0.2);
});

test('planCost: an old trade without a mark is on plan', () => {
  assert.equal(planCost([{ time: '2026-10-01T09:00:00', profit: 1 }], 0).onPlan.count, 1);
});

const rules = [{ id: 'a', name: 'Revenge' }, { id: 'b', name: 'No SL' }, { id: 'c', name: 'Overtrade' }];

test('ruleCounts: most broken first, unbroken and deleted rules left out, one count per note', () => {
  const notes = [
    { date: '2026-10-01', brokenRules: ['b', 'b', 'gone'] },
    { date: '2026-10-02', brokenRules: ['a', 'b'] },
    { date: '2026-10-03' },
  ];
  assert.deepEqual(ruleCounts(notes, rules).map(r => [r.rule.id, r.count]), [['b', 2], ['a', 1]]);
  assert.deepEqual(ruleCounts(notes, rules, '2026-10-02').map(r => [r.rule.id, r.count]), [['a', 1], ['b', 1]]);
});

test('disciplineByDay: an off-plan trade or a ticked rule breaks the day; a day off is left out', () => {
  const days = disciplineByDay(trades, [{ date: '2026-10-02', brokenRules: ['a'] }, { date: '2026-10-03', brokenRules: [] }], 0);
  assert.deepEqual(Object.fromEntries(days), { '2026-10-01': 'broken', '2026-10-02': 'broken', '2026-10-05': 'broken' });
});

test('disciplineStreak counts clean trading days back from the latest, skipping days off', () => {
  const clean = (d: string) => ({ time: `${d}T09:00:00`, profit: 1, ...on });
  const t = [clean('2026-10-01'), clean('2026-10-02'), clean('2026-10-03'), { ...clean('2026-10-06'), ...off }, clean('2026-10-07'), clean('2026-10-09')];
  assert.deepEqual(disciplineStreak(t, [], 0), { current: 2, best: 3 });
  // A rule broken on the latest day ends the run, even without an off-plan trade.
  assert.deepEqual(disciplineStreak(t, [{ date: '2026-10-09', brokenRules: ['a'] }], 0), { current: 0, best: 3 });
  assert.deepEqual(disciplineStreak([], [], 0), { current: 0, best: 0 });
  // So does trading on after the daily target.
  assert.deepEqual(disciplineStreak(t, [], 0, new Set(['2026-10-09'])), { current: 0, best: 3 });
});

test('with days starting at 5am, a 3am close belongs to the day before', () => {
  const trades = [{ time: '2026-10-02T03:00:00', profit: 1, isOnPlan: false }];
  assert.equal(planCost(trades, 5, '2026-10-02').offPlan.count, 0);
  assert.equal(planCost(trades, 0, '2026-10-02').offPlan.count, 1);
  assert.deepEqual([...disciplineByDay(trades, [], 5).keys()], ['2026-10-01']);
});
