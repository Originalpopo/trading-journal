import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulatePath, simulateOutlook, percentile, outlookRuns, binaryOutcomes, cautiousWinRate } from './simulation.ts';

// Replays a fixed list of draws, so a path is fully predictable.
const draws = (values: number[]) => { let i = 0; return () => values[i++ % values.length]; };
// Small deterministic generator for the many-run tests.
const seeded = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};

const close = (actual: number, expected: number) =>
  assert.ok(Math.abs(actual - expected) < 1e-9, `expected ${expected}, got ${actual}`);

test('simulatePath: a draw at or below the win rate wins risk * rr, above it loses the risk', () => {
  // win, win, loss, loss, loss, win
  const p = simulatePath({ balance: 100, risk: 10, winRate: 0.5, ...binaryOutcomes(2), trades: 6 }, draws([0.1, 0.5, 0.9, 0.6, 0.51, 0.2]));
  assert.deepEqual(p.balances, [100, 120, 140, 130, 120, 110, 130]);
  assert.equal(p.endBalance, 130);
  assert.equal(p.netProfit, 30);
  assert.equal(p.growth, 30);
  assert.equal(p.winRate, 50);
  assert.equal(p.maxDD, 30);
  close(p.maxDDPct, (30 / 140) * 100);
  assert.equal(p.lowestBal, 100);
  assert.equal(p.recoveryFactor, 1);
  assert.equal(p.maxConsWins, 2);
  assert.equal(p.maxConsLosses, 3);
  assert.equal(p.wipedOut, false);
  assert.equal(p.tradesTaken, 6);
});

test('simulatePath: no trades leaves the balance alone', () => {
  const p = simulatePath({ balance: 100, risk: 10, winRate: 0.5, ...binaryOutcomes(2), trades: 0 });
  assert.deepEqual(p.balances, [100]);
  assert.equal(p.netProfit, 0);
  assert.equal(p.winRate, 0);
  assert.equal(p.recoveryFactor, 0);
});

test('simulatePath: an account that reaches zero stops trading and never comes back', () => {
  // loss, loss (now 0), then draws that would have been wins
  const p = simulatePath({ balance: 20, risk: 10, winRate: 0.5, ...binaryOutcomes(5), trades: 5 }, draws([0.9, 0.9, 0.1, 0.1, 0.1]));
  assert.deepEqual(p.balances, [20, 10, 0, 0, 0, 0]);
  assert.equal(p.wipedOut, true);
  assert.equal(p.tradesTaken, 2);
  assert.equal(p.endBalance, 0);
  assert.equal(p.lowestBal, 0);
  assert.equal(p.maxDDPct, 100);
});

test('simulatePath: a loss larger than the balance stops at zero, not below', () => {
  const p = simulatePath({ balance: 15, risk: 10, winRate: 0.5, ...binaryOutcomes(2), trades: 3 }, draws([0.9]));
  assert.deepEqual(p.balances, [15, 5, 0, 0]);
  assert.equal(p.lowestBal, 0);
});

test('simulatePath: percent risk sizes each trade from the balance at that moment', () => {
  // 10% risk, rr 2: win (+20%), loss (-10%), win (+20%)
  const p = simulatePath({ balance: 100, risk: 999, riskPercent: 10, winRate: 0.5, ...binaryOutcomes(2), trades: 3 }, draws([0.1, 0.9, 0.1]));
  close(p.balances[1], 120);
  close(p.balances[2], 108);
  close(p.balances[3], 129.6);
});

test('simulatePath: results are drawn from the real outcomes, break-evens included', () => {
  // Each trade uses two draws: win or not, then which result of that pool.
  const params = { balance: 100, risk: 10, winRate: 0.5, winOutcomes: [1, 3], otherOutcomes: [-1, 0, -1.5], trades: 4 };
  const p = simulatePath(params, draws([
    0.1, 0.9, // win pool, second item: +3R
    0.9, 0.5, // other pool, middle item: 0R (break-even)
    0.9, 0.99, // other pool, last item: -1.5R
    0.2, 0.0, // win pool, first item: +1R
  ]));
  assert.deepEqual(p.balances, [100, 130, 130, 115, 125]);
  assert.equal(p.winRate, 50); // 2 of 4 made money
  assert.equal(p.maxConsLosses, 1);
  assert.equal(p.maxConsWins, 1);
});

test('simulatePath: a break-even neither extends nor breaks a streak', () => {
  const params = { balance: 100, risk: 10, winRate: 0.5, winOutcomes: [1], otherOutcomes: [0], trades: 3 };
  const p = simulatePath(params, draws([0.1, 0.9, 0.1])); // win, break-even, win
  assert.equal(p.maxConsWins, 2);
  assert.equal(p.maxConsLosses, 0);
});

test('percentile uses the nearest rank', () => {
  const v = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  assert.equal(percentile(v, 0.5), 5);
  assert.equal(percentile(v, 0.05), 1);
  assert.equal(percentile(v, 0.95), 10);
  assert.equal(percentile([], 0.5), 0);
});

test('outlookRuns: 1,000 runs normally, fewer for very long paths, never under 100', () => {
  assert.equal(outlookRuns(1000), 1000);
  assert.equal(outlookRuns(10000), 200);
  assert.equal(outlookRuns(1_000_000), 100);
});

test('simulateOutlook: a strategy that always wins never loses', () => {
  const o = simulateOutlook({ balance: 100, risk: 10, winRate: 1, ...binaryOutcomes(1), trades: 10 }, 50, seeded(1));
  assert.equal(o.medianEnd, 200);
  assert.equal(o.lowEnd, 200);
  assert.equal(o.highEnd, 200);
  assert.equal(o.chanceOfLoss, 0);
  assert.equal(o.chanceOfWipeout, 0);
  assert.equal(o.badMaxDDPct, 0);
});

test('simulateOutlook: a strategy that always loses is wiped out every time', () => {
  const o = simulateOutlook({ balance: 100, risk: 10, winRate: -1, ...binaryOutcomes(1), trades: 20 }, 50, seeded(1));
  assert.equal(o.medianEnd, 0);
  assert.equal(o.chanceOfLoss, 100);
  assert.equal(o.chanceOfWipeout, 100);
  assert.equal(o.medianMaxDDPct, 100);
});

test('simulateOutlook: a positive edge centres on its expected value, with a real spread', () => {
  // Expected gain per trade: 0.4 * 20 - 0.6 * 10 = +2, so +400 over 200 trades.
  const o = simulateOutlook({ balance: 1000, risk: 10, winRate: 0.4, ...binaryOutcomes(2), trades: 200 }, 2000, seeded(42));
  assert.ok(Math.abs(o.medianEnd - 1400) <= 60, `median ${o.medianEnd}`);
  assert.ok(o.lowEnd < o.medianEnd && o.medianEnd < o.highEnd);
  assert.ok(o.chanceOfLoss > 0 && o.chanceOfLoss < 20, `loss ${o.chanceOfLoss}`);
  assert.ok(o.badMaxDDPct > o.medianMaxDDPct);
});

test('cautiousWinRate: few trades pull the win rate far down, many trades barely', () => {
  // 7 wins in 49 trades: the true rate could be as low as about 7%.
  const few = cautiousWinRate(7 / 49, 49);
  assert.ok(few > 0.065 && few < 0.078, `few ${few}`);
  const many = cautiousWinRate(7 / 49, 4900);
  assert.ok(many > 0.13 && many < 7 / 49, `many ${many}`);
  assert.equal(cautiousWinRate(0.5, 0), 0);
  assert.ok(cautiousWinRate(0, 50) === 0);
});
