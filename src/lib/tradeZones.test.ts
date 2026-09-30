import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tradeZones, pointValueOf, medianPointValue } from './tradeZones.ts';

const near = (actual: number | null | undefined, expected: number) =>
  assert.ok(actual != null && Math.abs(actual - expected) < 1e-6, `expected ${expected}, got ${actual}`);

test('point value comes from the trade fills', () => {
  near(pointValueOf({ entryPrice: 4192.64, exitPrice: 4190.93, profit: -1.71 }), 1);
  assert.equal(pointValueOf({ entryPrice: 4000, exitPrice: 4000, profit: 0 }), null);
  near(medianPointValue([{ entryPrice: 1, exitPrice: 2, profit: 1 }, { entryPrice: 1, exitPrice: 3, profit: 2 }, { entryPrice: 1, exitPrice: 2, profit: 3 }]), 1);
});

test('stop never moved: risk zone ends at the broker stop, even if tighter than 1R', () => {
  // SELL 4183.79 with its stop 0.85 away at 4184.64 (risk field says $1.50)
  const z = tradeZones({ side: 'SELL', entryPrice: 4183.79, exitPrice: 4184.73, profit: -0.94, risk: 1.5, slPrice: 4184.64, tpPrice: 4120.08 })!;
  near(z.sl, 4184.64);
  assert.equal(z.slIsEstimate, false);
  assert.equal(z.movedSl, null);
  near(z.tp, 4120.08);
});

test('stop moved to break-even: first stop drawn at 1R, moved stop reported', () => {
  // BUY 4192.38, stop dragged to 4192.38 and hit at 4192.34 for -0.04, risk $1.50
  const z = tradeZones({ side: 'BUY', entryPrice: 4192.38, exitPrice: 4192.34, profit: -0.04, risk: 1.5, slPrice: 4192.38, tpPrice: 4221.96 })!;
  near(z.sl, 4190.88);
  assert.equal(z.slIsEstimate, true);
  near(z.movedSl!, 4192.38);
});

test('stop trailed into profit on a sell', () => {
  const z = tradeZones({ side: 'SELL', entryPrice: 4144.81, exitPrice: 4144.91, profit: -0.1, risk: 1.5, slPrice: 4144.79 })!;
  near(z.sl, 4146.31);
  near(z.movedSl!, 4144.79);
});

test('an initial stop entered by the user replaces the 1R estimate', () => {
  const z = tradeZones({ side: 'BUY', entryPrice: 4179.14, exitPrice: 4198.68, profit: 19.54, risk: 1.5, slPrice: 4179.15, initialSlPrice: 4178.24 })!;
  near(z.sl, 4178.24);
  assert.equal(z.slIsEstimate, false);
  near(z.movedSl!, 4179.15);
});

test('closed exactly at entry: 1R uses the fallback point value', () => {
  const z = tradeZones({ side: 'BUY', entryPrice: 4000, exitPrice: 4000, profit: 0, risk: 1.5, slPrice: 4000 }, 1)!;
  near(z.sl, 3998.5);
  near(z.movedSl!, 4000);
});

test('without broker stop or $ risk, falls back to the fills', () => {
  const loss = tradeZones({ side: 'BUY', entryPrice: 4000, exitPrice: 3998, profit: -2 })!;
  near(loss.sl, 3998);
  near(loss.tp, 4010);
  assert.equal(loss.movedSl, null);

  const win = tradeZones({ side: 'BUY', entryPrice: 4000, exitPrice: 4006, profit: 6, rr: 3 })!;
  near(win.tp, 4006);
  near(win.sl, 3998);
});

test('no entry price, no zones', () => {
  assert.equal(tradeZones({ side: 'BUY', exitPrice: 4000 }), null);
});
