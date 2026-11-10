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
  ({ selectedPeriod: '2026', selectedTfs: [], selectedPlan: 'ALL', selectedMetric: 'PNL', ...over });

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
  const p = computePerformance(trades, funding, filters({ selectedPeriod: 'ALL' }));
  assert.equal(p.totalTrades, 4);
  assert.equal(p.netProfit, -0.4);
  assert.deepEqual(p.perfBalanceData.slice(0, 3), [0, 50, 48]);
});

test('the last month shows its own trades on top of the balance before it, across a year end too', () => {
  const now = new Date('2026-02-04T12:00:00').getTime();
  const p = computePerformance(trades, funding, filters({ selectedPeriod: 'LAST_1M', now }));
  // From 4 January: the win, the off-plan loss and the break-even; everything before is the starting balance.
  assert.equal(p.totalTrades, 3);
  assert.equal(p.netProfit, 1.6);
  assert.equal(p.perfBalanceData[0], 148);
  const quarter = computePerformance(trades, funding, filters({ selectedPeriod: 'LAST_3M', now }));
  // From 4 November 2025: the December deposit and the loss of 30 December as well.
  assert.equal(quarter.totalTrades, 4);
  assert.equal(quarter.perfBalanceData[0], 0);
});

test('drawdown is the drop of the trading result from its peak', () => {
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
  // Of the two buys one won and one broke even; break-evens are left out of the win rate.
  assert.deepEqual([p.longTrades, p.longWinPct, p.shortTrades, p.shortWinPct], [2, 100, 1, 0]);
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
  assert.deepEqual(p.hourTraded.flatMap((t, h) => t ? [h] : []), [10, 15]);
  // Monday to Friday always; untraded days have no bar.
  assert.deepEqual(p.activeDowNames, ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
  assert.deepEqual(p.activeDowData, [3, -1.4, null, null, null]);
  assert.deepEqual(p.dowTraded, [true, true, false, false, false]);
  // Every month is on the axis; untraded ones have no bar.
  assert.deepEqual(p.activeMoyNames, ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']);
  assert.deepEqual(p.moyRRData, [1.5, 0.1, ...Array(10).fill(null)]);
  assert.deepEqual(p.moyTraded, [true, true, ...Array(10).fill(false)]);
  const pad = (a: number[]) => [...a, ...Array(10).fill(0)];
  assert.deepEqual([p.activeMoyWins, p.activeMoyLosses, p.activeMoyBEs], [pad([1, 0]), pad([1, 0]), pad([0, 1])]);
});

test('monthly gain is measured against the balance the month started with', () => {
  const p = computePerformance(trades, funding, filters({ selectedMetric: 'GAIN' }));
  close(p.moyRRData[0]!, (1.5 / 148) * 100);
  close(p.moyRRData[1]!, (0.1 / 149.5) * 100);
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

test('a withdrawal is not a drawdown, and a deposit does not hide one', () => {
  const t = (time: string, profit: number) => ({ time, profit, risk: 1, rr: profit, symbol: 'XAUUSD', side: 'BUY' });
  const p = computePerformance(
    [t('2026-01-02 10:00:00', 10), t('2026-01-04 10:00:00', -4), t('2026-01-06 10:00:00', -3)],
    [
      { time: '2026-01-01 09:00:00', deposit: 100, withdraw: 0 },
      { time: '2026-01-03 09:00:00', deposit: 0, withdraw: 50 }, // taking money out loses nothing
      { time: '2026-01-05 09:00:00', deposit: 500, withdraw: 0 }, // topping up recovers nothing
    ],
    filters({ selectedPeriod: 'ALL' }),
  );
  assert.equal(p.maxDrawdownAmt, 7);
  assert.equal(p.absoluteDD, 0);
});

test('absolute drawdown is how far the result fell below where the period started', () => {
  const t = (time: string, profit: number) => ({ time, profit, risk: 1, rr: profit, symbol: 'XAUUSD', side: 'BUY' });
  const p = computePerformance(
    [t('2026-01-02 10:00:00', -2), t('2026-01-03 10:00:00', -1.5), t('2026-01-04 10:00:00', 9)],
    [{ time: '2026-01-01 09:00:00', deposit: 25, withdraw: 0 }],
    filters({ selectedPeriod: 'ALL' }),
  );
  assert.equal(p.absoluteDD, 3.5); // not the whole 25 deposited
});

test('a weekend day joins the weekday chart only when it was traded', () => {
  const weekend: PerfTrade = { time: '2026-01-10 12:00:00', profit: 2, risk: 1, rr: 2, symbol: 'BTCUSD', side: 'BUY' }; // Saturday
  const p = computePerformance([...trades, weekend], funding, filters());
  assert.deepEqual(p.activeDowNames, ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);
  assert.deepEqual(p.activeDowData.slice(-1), [2]);
});

test('Avg R is the R per trade of each hour, weekday and month, and each bar knows its trade count', () => {
  const p = computePerformance(trades, funding, filters({ selectedMetric: 'AVG_R' }));
  // 10:00 holds a 2 R win and a 1 R loss; 15:00 a single 0.07 R break-even.
  close(p.hourlyDataArr[10], 0.5);
  close(p.hourlyDataArr[15], 0.07);
  assert.equal(p.hourlyDataArr[9], 0);
  assert.equal(p.hourCounts[10], 2);
  assert.equal(p.hourCounts[15], 1);
  // Monday: the win alone; Tuesday: the loss and the break-even.
  close(p.activeDowData[0]!, 2);
  close(p.activeDowData[1]!, -0.465);
  assert.deepEqual(p.activeDowCounts, [1, 2, 0, 0, 0]);
  close(p.moyRRData[0]!, 0.5);
  close(p.moyRRData[1]!, 0.07);
  assert.deepEqual(p.activeMoyCounts.slice(0, 3), [2, 1, 0]);
});

test('Buy and Sell carry their P&L and R, and wins and losses their average R', () => {
  const p = computePerformance(trades, funding, filters());
  assert.equal(p.longPnl, 3.1);
  close(p.longRr, 2.07);
  assert.equal(p.shortPnl, -1.5);
  close(p.shortRr, -1);
  // The break-even is in neither average.
  close(p.avgWinR, 2);
  close(p.avgLossR, -1);
});

test('account growth is time-weighted from the balance carried into the period; all years match the Dashboard', () => {
  // 2026 starts from 48; the deposit of 100 does not move it; then 148 grows to 149.6.
  close(computePerformance(trades, funding, filters()).accountGrowth, (149.6 / 148 - 1) * 100);
  // All years: 50 falls to 48, then 148 grows to 149.6.
  close(computePerformance(trades, funding, filters({ selectedPeriod: 'ALL' })).accountGrowth, (48 / 50 * 149.6 / 148 - 1) * 100);
});
