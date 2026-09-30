import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeTradeRisk, initialStopOf, mostCommonRisk } from './risk.ts';

const near = (actual: number, expected: number) =>
  assert.ok(Math.abs(actual - expected) < 1e-6, `expected ${expected}, got ${actual}`);

test('stop never moved: 1R is the real distance to it', () => {
  // SELL 4179.76, stop 0.49 away at 4180.25, hit for -0.52 (was counted BE at a flat $1.50)
  const r = computeTradeRisk({ side: 'SELL', entryPrice: 4179.76, exitPrice: 4180.28, profit: -0.52, slPrice: 4180.25 }, 1, 1.5);
  near(r.risk, 0.49);
  near(r.rr, -0.52 / 0.49);
  assert.equal(r.resultType, 'SL');
  assert.equal(r.riskIsEstimate, false);
  assert.equal(r.initialSlPrice, 4180.25);
  assert.equal(r.initialSlSource, 'broker');
});

test('stop moved to break-even: falls back to the default 1R', () => {
  const r = computeTradeRisk({ side: 'BUY', entryPrice: 4179.14, exitPrice: 4198.68, profit: 19.54, slPrice: 4179.15 }, 1, 1.5);
  near(r.risk, 1.5);
  near(r.rr, 19.54 / 1.5);
  assert.equal(r.riskIsEstimate, true);
  assert.equal(r.initialSlPrice, undefined);
});

test('an initial stop entered by the user is used even after the stop moved', () => {
  const r = computeTradeRisk({ side: 'BUY', entryPrice: 4179.14, exitPrice: 4198.68, profit: 19.54, slPrice: 4179.15, initialSlPrice: 4178.24 }, 1, 1.5);
  near(r.risk, 0.9);
  near(r.rr, 19.54 / 0.9);
  assert.equal(r.riskIsEstimate, false);
  assert.equal(r.initialSlSource, 'manual');
});

test('break-even exit uses the fallback point value', () => {
  const r = computeTradeRisk({ side: 'BUY', entryPrice: 4000, exitPrice: 4000, profit: 0, initialSlPrice: 3999 }, 1, 1.5);
  near(r.risk, 1);
  assert.equal(r.resultType, 'BE');
});

test('initialStopOf only trusts a broker stop on the losing side', () => {
  assert.deepEqual(initialStopOf({ side: 'BUY', entryPrice: 100, slPrice: 99 }), { price: 99, source: 'broker' });
  assert.equal(initialStopOf({ side: 'BUY', entryPrice: 100, slPrice: 100 }), null);
  assert.equal(initialStopOf({ side: 'SELL', entryPrice: 100, slPrice: 99 }), null);
});

test('mostCommonRisk', () => {
  assert.equal(mostCommonRisk([{ risk: 1.5 }, { risk: 1.5 }, { risk: 0.49 }, { risk: 0 }]), 1.5);
  assert.equal(mostCommonRisk([]), null);
});
