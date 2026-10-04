import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computePerformance, type PerfTrade, type PerformanceFilters } from './performance.ts';

const close = (actual: number, expected: number) =>
  assert.ok(Math.abs(actual - expected) < 1e-9, `expected ${expected}, got ${actual}`);

const funding = [
  { time: '2025-12-01 09:00:00', deposit: 50, withdraw: 0 },
  { time: '2026-01-02 09:00:00', deposit: 100, withdraw: 0 },
];

// One loss in 2025, then a win (Mon), a loss off plan (Tue) and a break-even (Tue) in 2026.
const trades: PerfTrade[] = [
  { time: '2025-12-30 12:00:00', profit: -2, risk: 1, rr: -2, symbol: 'XAUUSD', side: 'SELL', tf: '1m', isOnPlan: true, checklists: ['On Plan'] },
  { time: '2026-01-05 10:30:00', entryTime: '2026-01-05 10:00:00', profit: 3, risk: 1.5, rr: 2, symbol: 'XAUUSD', side: 'BUY', tf: '1m', isOnPlan: true, checklists: ['On Plan'] },
  { time: '2026-01-06 11:00:00', entryTime: '2026-01-06 10:50:00', profit: -1.5, risk: 1.5, rr: -1, symbol: 'XAUUSD', side: 'SELL', tf: '5m', isOnPlan: false, checklists: [] },
  { time: '2026-02-03 15:00:00', profit: 0.1, risk: 1.5, rr: 0.07, symbol: 'XAUUSD', side: 'BUY' },
];

const filters = (over: Partial<PerformanceFilters> = {}): PerformanceFilters =>
  ({ selectedYear: '2026', selectedTfs: [], selectedPlan: 'ALL', selectedMetric: 'PNL', ...over });

test('a year shows its own trades on top of the balance carried over', () => {
  const p = computePerformance(trades, funding, filters());
  assert.equal(p.totalTrades, 3);
  assert.equal(p.netProfit, 1.6);
  assert.deepEqual([p.profitTradesCount, p.lossTradesCount, p.beTradesCount], [1, 1, 1]);
  assert.equal(p.mainWinRate, 50);
  assert.deepEqual(p.perfBalanceData, [48, 148, 151, 149.5, 149.6]);
  assert.deepEqual(p.perfPnlData, [0, 0, 3, -1.5, 0.1]);
  assert.deepEqual(p.perfBalanceLabels, ['Start', '2026-01-02', '2026-01-05', '2026-01-06', '2026-02-03']);
  assert.equal(p.isAggregated, false);
});

test('all years start from zero', () => {
  const p = computePerformance(trades, funding, filters({ selectedYear: 'ALL' }));
  assert.equal(p.totalTrades, 4);
  assert.equal(p.netProfit, -0.4);
  assert.deepEqual(p.perfBalanceData.slice(0, 3), [0, 50, 48]);
});

test('drawdown is the drop from the highest balance', () => {
  const p = computePerformance(trades, funding, filters());
  assert.equal(p.maxDrawdownAmt, 1.5);
  close(p.maxDrawdownPct, (1.5 / 151) * 100);
  assert.equal(p.absoluteDD, 0);
  close(p.recoveryFactor, 1.6 / 1.5);
});

test('discipline splits trades and P&L into on plan and off plan', () => {
  const p = computePerformance(trades, funding, filters());
  close(p.onPlanPct, (2 / 3) * 100);
  close(p.offPlanPct, (1 / 3) * 100);
  assert.equal(p.onPlanPnL, 3.1);
  assert.equal(p.offPlanPnL, -1.5);
});

test('the plan filter keeps one side only, and the two sides add up to the whole', () => {
  const on = computePerformance(trades, funding, filters({ selectedPlan: 'On Plan' }));
  const off = computePerformance(trades, funding, filters({ selectedPlan: 'Off Plan' }));
  assert.deepEqual([on.totalTrades, on.netProfit], [2, 3.1]);
  assert.deepEqual([off.totalTrades, off.netProfit], [1, -1.5]);
  assert.equal(off.offPlanPct, 100);
});

test('the timeframe filter matches any of the chosen timeframes; no timeframe is "none"', () => {
  assert.equal(computePerformance(trades, funding, filters({ selectedTfs: ['5m'] })).netProfit, -1.5);
  assert.equal(computePerformance(trades, funding, filters({ selectedTfs: ['none'] })).netProfit, 0.1);
  assert.equal(computePerformance(trades, funding, filters({ selectedTfs: ['5m', 'none'] })).totalTrades, 2);
});

test('direction, timeframe and hold time', () => {
  const p = computePerformance(trades, funding, filters());
  assert.deepEqual([p.longTrades, p.longWinPct, p.shortTrades, p.shortWinPct], [2, 50, 1, 0]);
  assert.deepEqual([p.tfStats['1m'].pnl, p.tfStats['5m'].pnl, p.tfStats['none'].pnl], [3, -1.5, 0.1]);
  assert.deepEqual([p.holdWin, p.holdLoss], ['30m', '10m']);
});

test('buy/sell tables add up per symbol and sort timeframes by P&L', () => {
  const p = computePerformance(trades, funding, filters());
  assert.equal(p.matrixSorted.length, 1);
  const [symbol, m] = p.matrixSorted[0];
  assert.equal(symbol, 'XAUUSD');
  assert.deepEqual([m.BUY.trades, m.BUY.win, m.BUY.loss, m.BUY.pnl], [2, 1, 0, 3.1]);
  assert.deepEqual([m.SELL.trades, m.SELL.win, m.SELL.loss, m.SELL.pnl], [1, 0, 1, -1.5]);
  assert.deepEqual(p.tfMatrixSorted.map(([tf]) => tf), ['1m', 'none', '5m']);
});

test('hour, weekday and month charts follow the entry time', () => {
  const p = computePerformance(trades, funding, filters());
  assert.equal(p.hourlyDataArr[10], 1.5);
  assert.equal(p.hourlyDataArr[15], 0.1);
  assert.deepEqual(p.activeDowNames, ['Mon', 'Tue']);
  assert.deepEqual(p.activeDowData, [3, -1.4]);
  assert.deepEqual(p.activeMoyNames, ['Jan', 'Feb']);
  assert.deepEqual(p.moyRRData, [1.5, 0.1]);
  assert.deepEqual([p.activeMoyWins, p.activeMoyLosses, p.activeMoyBEs], [[1, 0], [1, 0], [0, 1]]);
});

test('monthly gain is measured against the balance the month started with', () => {
  const p = computePerformance(trades, funding, filters({ selectedMetric: 'GAIN' }));
  close(p.moyRRData[0], (1.5 / 148) * 100);
  close(p.moyRRData[1], (0.1 / 149.5) * 100);
});

test('more than 500 events are drawn one point per day', () => {
  const many: PerfTrade[] = Array.from({ length: 501 }, (_, i) => ({
    time: `2026-03-0${i < 300 ? 2 : 3} 10:00:00`, profit: 0.01, risk: 1, rr: 0.01, symbol: 'XAUUSD', side: 'BUY',
  }));
  const p = computePerformance(many, [], filters());
  assert.equal(p.isAggregated, true);
  assert.deepEqual(p.perfBalanceData, [0, 3, 5.01]);
  assert.deepEqual(p.perfPnlData, [0, 3, 2.01]);
  assert.deepEqual(p.perfBalanceLabels, ['Start', '2/3/26', '3/3/26']);
  assert.equal(p.netProfit, 5.01);
});
