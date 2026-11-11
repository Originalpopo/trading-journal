import { test } from 'node:test';
import assert from 'node:assert/strict';
import { riskStep, drawdownAfterLosses } from './riskStep.ts';

const anchor = (balance: number) => ({ balance, at: '2026-11-04T10:00:00Z' });

test('the risk is the anchor share, held until a step', () => {
  const s = riskStep(95, 2, anchor(90), 20, 10);
  assert.equal(s.riskNow, 1.8);
  assert.equal(s.upAt, 108);
  assert.equal(s.downAt, 81);
  assert.equal(s.state, 'hold');
  assert.equal(s.riskAtBalance, 1.9);
});

test('a step is due at the edges, up or down', () => {
  assert.equal(riskStep(108, 2, anchor(90), 20, 10).state, 'up');
  assert.equal(riskStep(81, 2, anchor(90), 20, 10).state, 'down');
  assert.equal(riskStep(81.01, 2, anchor(90), 20, 10).state, 'hold');
  // A step of 0 never calls.
  assert.equal(riskStep(500, 2, anchor(90), 0, 10).state, 'hold');
});

test('dollars are to the cent', () => {
  const s = riskStep(91.79, 2, anchor(91.79), 20, 10);
  assert.equal(s.riskNow, 1.84);
  assert.equal(s.upAt, 110.15);
  assert.equal(s.downAt, 82.61);
});

test('no anchor yet: the balance stands in', () => {
  const s = riskStep(91.79, 2, undefined, 20, 10);
  assert.equal(s.anchorBalance, 91.79);
  assert.equal(s.state, 'hold');
});

test('drawdown after a run of losses', () => {
  assert.ok(Math.abs(drawdownAfterLosses(2, 13) - 23.1) < 0.1);
  assert.ok(Math.abs(drawdownAfterLosses(2, 20) - 33.2) < 0.1);
  assert.equal(drawdownAfterLosses(0, 20), 0);
});

test('the balance is funding plus every trade, to the cent', async () => {
  const { balanceOf } = await import('./riskStep.ts');
  assert.equal(balanceOf([{ profit: 0.1 }, { profit: 0.2 }, { profit: -1.15 }], [{ deposit: 50, withdraw: 0 }, { deposit: 0, withdraw: 10 }]), 39.15);
});

test('the risk set is kept in dollars; a new % shows as a step to take', async () => {
  const { riskStep, riskHistoryOf, setRiskFrom } = await import('./riskStep.ts');
  const a = { balance: 91.79, at: '2026-11-04T10:00:00.000Z', risk: 1.84 };
  assert.equal(riskStep(91.79, 2, a, 20, 10).state, 'hold');
  const changed = riskStep(91.79, 1.5, a, 20, 10);
  assert.equal(changed.riskNow, 1.84);
  assert.equal(changed.state, 'pct');
  assert.equal(changed.riskAtBalance, 1.38);
  // The first anchor, saved before the history, stands in for its own entry at the % then.
  assert.deepEqual(riskHistoryOf(undefined, { balance: 91.79, at: '2026-11-04T10:00:00.000Z' }, 2), [{ from: '2026-11-04T10:00:00.000Z', risk: 1.84 }]);
  assert.deepEqual(riskHistoryOf(undefined, undefined, 2), []);
  const next = setRiskFrom(110.5, 2, '2026-12-01T02:00:00.000Z', [{ from: '2026-11-04T10:00:00.000Z', risk: 1.84 }]);
  assert.deepEqual(next.riskAnchor, { balance: 110.5, at: '2026-12-01T02:00:00.000Z', risk: 2.21 });
  assert.deepEqual(next.riskHistory.map(c => c.risk), [1.84, 2.21]);
});

test('a trade keeps its risk up to the % over allowed, to the cent', async () => {
  const { riskKeptOf } = await import('./riskStep.ts');
  // $1.84 set, 10% over allowed: up to $2.02 (1.84 x 1.1 = 2.024 → 2.02).
  assert.equal(riskKeptOf(2.02, false, 1.84, 10), 'within');
  assert.equal(riskKeptOf(2.03, false, 1.84, 10), 'over');
  assert.equal(riskKeptOf(1.2, false, 1.84, 10), 'within');
  assert.equal(riskKeptOf(1.85, false, 1.84, 0), 'over');
});

test('a guessed 1R, or one before any risk was set, cannot be checked', async () => {
  const { riskKeptOf } = await import('./riskStep.ts');
  assert.equal(riskKeptOf(5, true, 1.84, 10), 'unchecked');
  assert.equal(riskKeptOf(5, undefined, 1.84, 10), 'unchecked');
  assert.equal(riskKeptOf(5, false, null, 10), 'unchecked');
  assert.equal(riskKeptOf(0, false, 1.84, 10), 'unchecked');
});
