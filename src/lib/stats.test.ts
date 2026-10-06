import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyTrade, deriveResultType, calcProfitFactor, healthTierFromProfitFactor, summarizeTrades,
  calcAccountGrowth, computePnlDrawdown, isOnPlan,
} from './stats.ts';

const close = (actual: number, expected: number) =>
  assert.ok(Math.abs(actual - expected) < 1e-9, `expected ${expected}, got ${actual}`);

test('classifyTrade: with risk, |RR| <= 0.4 is break-even', () => {
  assert.equal(classifyTrade({ profit: 4, risk: 10 }), 'be');
  assert.equal(classifyTrade({ profit: -4, risk: 10 }), 'be');
  assert.equal(classifyTrade({ profit: 4.01, risk: 10 }), 'win');
  assert.equal(classifyTrade({ profit: -4.01, risk: 10 }), 'loss');
});

test('classifyTrade: with risk, stored resultType BE is ignored', () => {
  assert.equal(classifyTrade({ profit: 20, risk: 10, resultType: 'BE' }), 'win');
});

test('classifyTrade: without risk, falls back to profit sign and resultType', () => {
  assert.equal(classifyTrade({ profit: 0 }), 'be');
  assert.equal(classifyTrade({ profit: 5, resultType: 'BE' }), 'be');
  assert.equal(classifyTrade({ profit: 0.5 }), 'win');
  assert.equal(classifyTrade({ profit: -0.5 }), 'loss');
});

test('classifyTrade: risk stored as a string still works', () => {
  assert.equal(classifyTrade({ profit: 3, risk: '10' }), 'be');
  assert.equal(classifyTrade({ profit: 30, risk: '10' }), 'win');
});

test('deriveResultType matches classifyTrade', () => {
  assert.equal(deriveResultType(3, 10), 'BE');
  assert.equal(deriveResultType(15, 10), 'TP');
  assert.equal(deriveResultType(-10, 10), 'SL');
  assert.equal(deriveResultType(0, 0), 'BE');
  assert.equal(deriveResultType(-1, 0), 'SL');
});

test('calcProfitFactor: no losses returns gross profit', () => {
  assert.equal(calcProfitFactor(30, 0), 30);
  assert.equal(calcProfitFactor(30, 10), 3);
});

test('healthTierFromProfitFactor', () => {
  assert.equal(healthTierFromProfitFactor(0, 0), 3);
  assert.equal(healthTierFromProfitFactor(2, 5), 5);
  assert.equal(healthTierFromProfitFactor(1.2, 5), 4);
  assert.equal(healthTierFromProfitFactor(0.8, 5), 3);
  assert.equal(healthTierFromProfitFactor(0.5, 5), 2);
  assert.equal(healthTierFromProfitFactor(0.49, 5), 1);
});

test('summarizeTrades: empty list', () => {
  const s = summarizeTrades([]);
  assert.equal(s.totalTrades, 0);
  assert.equal(s.winRate, 0);
  assert.equal(s.profitFactor, 0);
  assert.equal(s.expectancyR, 0);
  assert.equal(s.sharpeRatio, 0);
});

test('summarizeTrades: totals, rates and RR figures', () => {
  // risk 10 each: win 2R, loss -1R, BE (+2 = 0.2R), win 3R, loss -1R
  const trades = [
    { profit: 20, risk: 10, rr: 2 },
    { profit: -10, risk: 10, rr: -1 },
    { profit: 2, risk: 10, rr: 0.2 },
    { profit: 30, risk: 10, rr: 3 },
    { profit: -10, risk: 10, rr: -1 },
  ];
  const s = summarizeTrades(trades);

  assert.equal(s.totalTrades, 5);
  assert.equal(s.wins, 2);
  assert.equal(s.losses, 2);
  assert.equal(s.bes, 1);
  assert.equal(s.netProfit, 32);
  assert.equal(s.grossProfit, 50);
  assert.equal(s.grossLoss, 20);
  assert.equal(s.winRate, 0.5); // BE excluded
  assert.equal(s.profitFactor, 2.5);
  assert.equal(s.avgWin, 25);
  assert.equal(s.avgLoss, 10);
  assert.equal(s.expectedPayoff, 6.4);
  assert.equal(s.expectancyR, 0.64);
  assert.equal(s.netRR, 3.2);
  assert.equal(s.avgTPRR, 2.5);
  assert.equal(s.maxTPRR, 3);
  assert.equal(s.avgSLRR, -1);
  assert.equal(s.maxSLRR, -1);
  assert.equal(s.largestProfit, 30);
  assert.equal(s.largestLoss, -10);
  assert.equal(s.sumBE, 2);
});

test('summarizeTrades: BE does not break a streak', () => {
  const trades = [
    { profit: 10, resultType: 'TP' },
    { profit: 0 }, // BE
    { profit: 10, resultType: 'TP' },
    { profit: -5 },
    { profit: -5 },
    { profit: -5 },
    { profit: 10 },
  ];
  const s = summarizeTrades(trades);

  assert.equal(s.maxConsWinCount, 2);
  assert.equal(s.maxConsWinAmt, 20);
  assert.equal(s.countAtMaxWinAmt, 2);
  assert.equal(s.maxConsLossCount, 3);
  assert.equal(s.maxConsLossAmt, 15);
  assert.equal(s.avgConsWin, 2); // streaks of 2 and 1 -> round(1.5)
  assert.equal(s.avgConsLoss, 3);
});

test('summarizeTrades: sharpe is mean / population std dev', () => {
  const s = summarizeTrades([{ profit: 10 }, { profit: -10 }, { profit: 30 }]);
  const mean = 10;
  const std = Math.sqrt(((10 - mean) ** 2 + (-10 - mean) ** 2 + (30 - mean) ** 2) / 3);
  assert.equal(s.stdDev, std);
  assert.equal(s.sharpeRatio, mean / std);
});

test('calcAccountGrowth: withdrawing profit does not change growth', () => {
  // deposit 1000, make 1000, withdraw 1000 -> still +100%
  assert.equal(calcAccountGrowth(1000, 1000), 100);
  assert.equal(calcAccountGrowth(50, 0), 0);
});

test('computePnlDrawdown: deposits and withdrawals neither cause nor heal a drawdown', () => {
  const dd = computePnlDrawdown([
    { type: 'funding', deposit: 1000 },
    { type: 'trade', profit: 100 },
    { type: 'funding', withdraw: 500 },
    { type: 'trade', profit: -40 },
    { type: 'funding', deposit: 2000 },
  ]);
  assert.equal(dd.usd.max, 40);
  assert.equal(dd.usd.active, 40);
});

test('computePnlDrawdown: % is measured against the balance, not the P&L peak', () => {
  // P&L peaks at +10 then drops to +5: $5 on a $1010 account, not 50%
  const dd = computePnlDrawdown([
    { type: 'funding', deposit: 1000 },
    { type: 'trade', profit: 10 },
    { type: 'trade', profit: -5 },
  ]);
  assert.equal(dd.usd.max, 5);
  close(dd.usd.maxPercent, (5 / 1010) * 100);
});

test('computePnlDrawdown: a loss before any profit still shows a percentage', () => {
  const dd = computePnlDrawdown([
    { type: 'funding', deposit: 1000 },
    { type: 'trade', profit: -20 },
  ]);
  assert.equal(dd.usd.max, 20);
  close(dd.usd.maxPercent, 2);
});

test('computePnlDrawdown: the deepest % and the largest $ drop can be different drops', () => {
  const dd = computePnlDrawdown([
    { type: 'funding', deposit: 100 },
    { type: 'trade', profit: -50 }, // 50% of 100
    { type: 'trade', profit: 50 },
    { type: 'funding', deposit: 9900 },
    { type: 'trade', profit: -200 }, // 2% of 10000
  ]);
  assert.equal(dd.usd.max, 200);
  close(dd.usd.maxPercent, 50);
  close(dd.usd.activePercent, 2);
});

test('computePnlDrawdown: R drawdown follows the R of each trade, not its dollars', () => {
  const dd = computePnlDrawdown([
    { type: 'funding', deposit: 100 },
    { type: 'trade', profit: 3, rr: 2.1 },
    { type: 'trade', profit: -1.5, rr: -1.1 },
    { type: 'trade', profit: -1.2, rr: -1 },
    { type: 'trade', profit: 0.4, rr: 0.3 },
  ]);
  assert.equal(dd.r.max, 2.1);
  assert.equal(dd.r.active, 1.8);
});

test('computePnlDrawdown: counts the trades since the latest peak and remembers when it was', () => {
  const dd = computePnlDrawdown([
    { type: 'funding', deposit: 100, time: 1 },
    { type: 'trade', profit: 5, rr: 1, time: 2 },
    { type: 'trade', profit: -1, rr: -1, time: 3 },
    { type: 'funding', deposit: 50, time: 4 },
    { type: 'trade', profit: -1, rr: -1, time: 5 },
  ]);
  assert.equal(dd.usd.tradesBelowPeak, 2);
  assert.equal(dd.usd.peakTime, 2);
  assert.equal(dd.r.tradesBelowPeak, 2);
});

test('computePnlDrawdown: the deepest point of the current drawdown resets at a new peak', () => {
  const trade = (rr: number) => ({ type: 'trade' as const, profit: rr, rr });
  const start = [{ type: 'funding' as const, deposit: 100 }, trade(-1), trade(-1), trade(-1)];
  const after3 = computePnlDrawdown(start).r;
  assert.equal(after3.active, 3);
  assert.equal(after3.activeMax, 3);

  const after4 = computePnlDrawdown([...start, trade(2)]).r;
  assert.equal(after4.active, 1);
  assert.equal(after4.activeMax, 3);

  const after5 = computePnlDrawdown([...start, trade(2), trade(2)]).r;
  assert.equal(after5.active, 0);
  assert.equal(after5.activeMax, 0);
  assert.equal(after5.max, 3);
  assert.equal(after3.previousMax, 0);
  assert.equal(after5.previousMax, 3);

  // The next drawdown is compared with the one before it, not with the worst ever.
  const next = computePnlDrawdown([...start, trade(2), trade(2), trade(-1), trade(1), trade(-0.5)]).r;
  assert.equal(next.active, 0.5);
  assert.equal(next.previousMax, 1);
  assert.equal(next.max, 3);
});

test('computePnlDrawdown: back at the peak, nothing is active', () => {
  const dd = computePnlDrawdown([
    { type: 'funding', deposit: 100, time: 1 },
    { type: 'trade', profit: -1, rr: -0.1, time: 2 },
    { type: 'trade', profit: -2, rr: -0.2, time: 3 },
    { type: 'trade', profit: 3, rr: 0.3, time: 4 },
  ]);
  assert.equal(dd.usd.active, 0);
  assert.equal(dd.r.active, 0);
  assert.equal(dd.r.tradesBelowPeak, 0);
  assert.equal(dd.r.peakTime, 4);
});

test('isOnPlan: the checklist tag or the older flag, and on plan when a trade says nothing', () => {
  assert.equal(isOnPlan({ checklists: ['On Plan'], isOnPlan: true }), true);
  assert.equal(isOnPlan({ checklists: [], isOnPlan: false }), false);
  assert.equal(isOnPlan({ checklists: ['Follow'], isOnPlan: false }), false);
  assert.equal(isOnPlan({ isOnPlan: true }), true);
  assert.equal(isOnPlan({}), true);
  // The tag wins when the two disagree, as in the History table and the trade popup.
  assert.equal(isOnPlan({ checklists: ['On Plan'], isOnPlan: false }), true);
});
