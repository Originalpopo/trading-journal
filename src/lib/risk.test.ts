import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveTradeRisk, withDerivedRisk, buildRiskContext, initialStopOf, mostCommonRisk, resolveDefaultRisk } from './risk.ts';

const near = (actual: number, expected: number) =>
  assert.ok(Math.abs(actual - expected) < 1e-6, `expected ${expected}, got ${actual}`);

// 0.01 lot of XAUUSD: $1 per 1.00 move.
const CTX = { defaultRisk: 1.5, fallbackPointValue: 1, contractSizes: { XAUUSD: 100 } };
const gold = (t: Record<string, unknown>) => ({ symbol: 'XAUUSD', size: 0.01, ...t });

test('stop never moved: 1R is the distance from the entry order to it', () => {
  // Buy limit 4186.68 filled better at 4186.38; stop 0.99 below the order, hit for -0.74
  const r = deriveTradeRisk(gold({ side: 'BUY', entryOrderPrice: 4186.68, entryPrice: 4186.38, exitPrice: 4185.64, profit: -0.74, slPrice: 4185.69, exitType: 'Stop Loss' }), CTX);
  near(r.risk, 0.99);
  near(r.rr, -0.74 / 0.99);
  assert.equal(r.resultType, 'SL');
  assert.equal(r.riskIsEstimate, false);
  assert.equal(r.initialSlPrice, 4185.69);
  assert.equal(r.initialSlSource, 'broker');
});

test('without an order price, 1R is measured from the fill', () => {
  const r = deriveTradeRisk({ side: 'SELL', entryPrice: 4179.76, exitPrice: 4180.28, profit: -0.52, slPrice: 4180.25 }, { ...CTX, contractSizes: {} });
  near(r.risk, 0.49);
  near(r.rr, -0.52 / 0.49);
});

test('stop moved to the entry and hit: break-even on the default 1R', () => {
  const r = deriveTradeRisk(gold({ side: 'SELL', entryOrderPrice: 4196.30, entryPrice: 4196.37, exitPrice: 4196.47, profit: -0.1, slPrice: 4196.37, exitType: 'Stop Loss' }), CTX);
  near(r.risk, 1.5);
  assert.equal(r.riskIsEstimate, true);
  assert.equal(r.resultType, 'BE');
  assert.equal(r.initialSlPrice, undefined);
});

test('stop moved to lock a little profit and hit: still break-even', () => {
  const r = deriveTradeRisk(gold({ side: 'SELL', entryPrice: 4197.93, exitPrice: 4197.84, profit: 0.09, slPrice: 4197.84, exitType: 'Stop Loss' }), CTX);
  assert.equal(r.resultType, 'BE');
});

test('stop trailed far into profit and hit: a win', () => {
  const r = deriveTradeRisk(gold({ side: 'SELL', entryPrice: 4200, exitPrice: 4190, profit: 10, slPrice: 4190, exitType: 'Stop Loss', initialSlPrice: 4201 }), CTX);
  assert.equal(r.resultType, 'TP');
});

test('a first stop from the log or the user is used after the stop moved', () => {
  // Sell limit 4211.41, stop dragged to the fill, closed by hand for +23.60
  const moved = gold({ side: 'SELL', entryOrderPrice: 4211.41, entryPrice: 4211.42, exitPrice: 4187.82, profit: 23.6, slPrice: 4211.42, exitType: 'Market' });
  const guess = deriveTradeRisk(moved, CTX);
  assert.equal(guess.riskIsEstimate, true);
  near(guess.rr, 23.6 / 1.5);
  assert.equal(guess.resultType, 'TP');

  const known = deriveTradeRisk({ ...moved, initialSlPrice: 4212.41, initialSlSource: 'log' as const }, CTX);
  near(known.risk, 1);
  near(known.rr, 23.6);
  assert.equal(known.riskIsEstimate, false);
  assert.equal(known.initialSlSource, 'log');
});

test('entry filled past a stop that was never moved: a loss on the planned 1R', () => {
  // Sell limit 4126.44 filled at 4127.56, above its own stop at 4127.52
  const r = deriveTradeRisk(gold({ side: 'SELL', entryOrderPrice: 4126.44, entryPrice: 4127.56, exitPrice: 4127.74, profit: -0.18, slPrice: 4127.52, initialSlPrice: 4127.52, initialSlSource: 'broker', exitType: 'Stop Loss' }), CTX);
  near(r.risk, 1.08);
  assert.equal(r.resultType, 'SL');
  assert.equal(r.riskIsEstimate, false);
});

test('a stop a hair on the losing side of the entry was dragged there: break-even, not a 0.01 risk', () => {
  // Saved by an earlier import as a first stop 0.01 away, which made +0.07 a "7R loss"
  const saved = gold({ side: 'SELL', entryPrice: 4000, exitPrice: 3999.93, profit: 0.07, slPrice: 4000.01, exitType: 'Stop Loss', risk: 0.01, riskIsEstimate: false, initialSlPrice: 4000.01, initialSlSource: 'broker' });
  const r = deriveTradeRisk(saved, CTX);
  near(r.risk, 1.5);
  assert.equal(r.riskIsEstimate, true);
  assert.equal(r.resultType, 'BE');
  assert.equal(r.initialSlPrice, undefined);
  near(r.rr, 0.07 / 1.5);

  // The same stop hit for a small loss is still a break-even stop, by its distance alone.
  const lost = deriveTradeRisk({ ...saved, exitPrice: 4000.03, profit: -0.03 }, CTX);
  near(lost.risk, 1.5);
  assert.equal(lost.resultType, 'BE');
});

test('a first stop the user or the log gave is trusted however close it is', () => {
  const r = deriveTradeRisk(gold({ side: 'SELL', entryPrice: 4000, exitPrice: 4000.03, profit: -0.03, slPrice: 4000.01, exitType: 'Stop Loss', initialSlPrice: 4000.01, initialSlSource: 'log' }), CTX);
  near(r.risk, 0.01);
  assert.equal(r.resultType, 'SL');
});

test('a stop on the losing side that closed the trade at no loss was moved there', () => {
  // 0.20 below the entry, yet the stop-out paid nothing: not the stop the trade opened with
  const r = deriveTradeRisk(gold({ side: 'BUY', entryPrice: 4000, exitPrice: 4000, profit: 0, slPrice: 3999.8, exitType: 'Stop Loss' }), CTX);
  assert.equal(r.riskIsEstimate, true);
  assert.equal(r.resultType, 'BE');
});

test('a position closed by hand goes by the sign of its P&L', () => {
  const base = gold({ side: 'BUY', entryPrice: 4000, slPrice: 3999, exitType: 'Market' });
  assert.equal(deriveTradeRisk({ ...base, exitPrice: 4000.1, profit: 0.1 }, CTX).resultType, 'TP');
  assert.equal(deriveTradeRisk({ ...base, exitPrice: 3999.9, profit: -0.1 }, CTX).resultType, 'SL');
  assert.equal(deriveTradeRisk({ ...base, exitPrice: 4000, profit: 0 }, CTX).resultType, 'BE');
});

test('a trade that does not say how it closed falls back to the 0.4R rule', () => {
  assert.equal(deriveTradeRisk({ profit: 0.5, risk: 1.5, riskIsEstimate: false }, CTX).resultType, 'BE');
  assert.equal(deriveTradeRisk({ profit: 3, risk: 1.5, riskIsEstimate: false }, CTX).resultType, 'TP');
});

test('a risk the user typed stands, and stored R or result are never trusted', () => {
  const r = deriveTradeRisk({ profit: 3, risk: 2, rr: -9, riskIsEstimate: false }, CTX);
  near(r.risk, 2);
  near(r.rr, 1.5);
  assert.equal(r.riskIsEstimate, false);
});

test('a saved default 1R is kept when the default changes; a trade without one uses the current default', () => {
  const moved = gold({ side: 'BUY', entryPrice: 4179.14, exitPrice: 4198.68, profit: 19.54, slPrice: 4179.15 });
  near(deriveTradeRisk({ ...moved, risk: 1.5, riskIsEstimate: true }, { ...CTX, defaultRisk: 5 }).risk, 1.5);
  near(deriveTradeRisk(moved, { ...CTX, defaultRisk: 5 }).risk, 5);
});

test('point value comes from the contract size of the symbol, not the rounded fills of one trade', () => {
  const trades = [
    gold({ entryPrice: 4000, exitPrice: 4010, profit: 10 }),
    gold({ entryPrice: 4000, exitPrice: 4001.07, profit: -1.07 }),
    gold({ entryPrice: 4000, exitPrice: 4000.02, profit: 0.03 }), // cent rounding: 150 per lot on its own
  ];
  const ctx = buildRiskContext(trades, 1.5);
  near(ctx.contractSizes.XAUUSD, 100);
  // The noisy trade still gets $1 per point: a stop 1.00 away is $1.00, not $1.50.
  near(deriveTradeRisk({ ...trades[2], side: 'BUY', slPrice: 3999 }, ctx).risk, 1);
});

test('withDerivedRisk overwrites what was stored', () => {
  const [t] = withDerivedRisk([gold({ side: 'BUY', entryPrice: 4000, exitPrice: 4003, profit: 3, slPrice: 3999, risk: 1.5, rr: -0.67, resultType: 'SL', exitType: 'Take Profit' })], 1.5);
  near(t.risk, 1);
  near(t.rr, 3);
  assert.equal(t.resultType, 'TP');
});

test('initialStopOf only trusts a broker stop on the losing side', () => {
  assert.deepEqual(initialStopOf({ side: 'BUY', entryPrice: 100, slPrice: 99 }), { price: 99, source: 'broker' });
  assert.equal(initialStopOf({ side: 'BUY', entryPrice: 100, slPrice: 100 }), null);
  assert.equal(initialStopOf({ side: 'SELL', entryPrice: 100, slPrice: 99 }), null);
});

test('mostCommonRisk and resolveDefaultRisk', () => {
  assert.equal(mostCommonRisk([{ risk: 1.5 }, { risk: 1.5 }, { risk: 0.49 }, { risk: 0 }]), 1.5);
  assert.equal(mostCommonRisk([]), null);
  assert.equal(resolveDefaultRisk(2, [{ risk: 1.5 }]), 2);
  assert.equal(resolveDefaultRisk(undefined, [{ risk: 1.5 }, { risk: 0.49, riskIsEstimate: false }]), 1.5);
  assert.equal(resolveDefaultRisk(undefined, []), 0);
});
