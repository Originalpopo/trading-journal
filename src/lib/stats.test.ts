import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyTrade, deriveResultType, calcProfitFactor, healthTierFromProfitFactor, summarizeTrades,
  calcAccountGrowth, computeDrawdowns, isOnPlan,
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

test('computeDrawdowns: balance counts withdrawals, trading does not', () => {
  const dd = computeDrawdowns([
    { type: 'funding', deposit: 1000 },
    { type: 'trade', profit: 100 },
    { type: 'funding', withdraw: 500 },
  ]);
  assert.equal(dd.balance.maxValue, 500);
  close(dd.balance.maxPercent, (500 / 1100) * 100);
  assert.equal(dd.trading.maxValue, 0);
  assert.equal(dd.trading.activeValue, 0);
});

test('computeDrawdowns: trading drawdown from a losing trade', () => {
  const dd = computeDrawdowns([
    { type: 'funding', deposit: 1000 },
    { type: 'trade', profit: -100 },
    { type: 'trade', profit: 50 },
  ]);
  assert.equal(dd.trading.maxValue, 100);
  close(dd.trading.maxPercent, 10);
  assert.equal(dd.trading.activeValue, 50);
  close(dd.trading.activePercent, 5);
});

test('computeDrawdowns: equity % is measured against the balance, not the P&L peak', () => {
  // P&L peaks at +10 then drops to +5: $5 on a $1010 account, not 50%
  const dd = computeDrawdowns([
    { type: 'funding', deposit: 1000 },
    { type: 'trade', profit: 10 },
    { type: 'trade', profit: -5 },
  ]);
  assert.equal(dd.equity.maxValue, 5);
  close(dd.equity.maxPercent, (5 / 1010) * 100);
});

test('computeDrawdowns: equity loss before any profit still shows a percentage', () => {
  const dd = computeDrawdowns([
    { type: 'funding', deposit: 1000 },
    { type: 'trade', profit: -20 },
  ]);
  assert.equal(dd.equity.maxValue, 20);
  close(dd.equity.maxPercent, 2);
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
