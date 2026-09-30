import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computePriceOffset, candleIndexAt, shiftCandles } from './chartAlign.ts';

// 1-minute candles starting at t=0; the feed quotes about $4 below the broker.
const candles = [
  { time: 0, open: 3995, high: 3997, low: 3994, close: 3996 },
  { time: 60, open: 3996, high: 3998, low: 3995, close: 3997 },
  { time: 120, open: 3997, high: 4001, low: 3996, close: 4000 },
];

const close = (actual: { offset: number } | null, expected: number) =>
  assert.ok(actual !== null && Math.abs(actual.offset - expected) < 1e-9, `expected ${expected}, got ${actual?.offset}`);

test('candleIndexAt finds the candle containing a time', () => {
  assert.equal(candleIndexAt(candles, 0), 0);
  assert.equal(candleIndexAt(candles, 59), 0);
  assert.equal(candleIndexAt(candles, 60), 1);
  assert.equal(candleIndexAt(candles, 500), 2);
  assert.equal(candleIndexAt(candles, -1), -1);
});

test('no shift when the fills already sit inside their candles', () => {
  close(computePriceOffset(candles, [{ timeSec: 30, price: 3995 }, { timeSec: 130, price: 4000 }]), 0);
});

test('smallest shift that puts every fill inside its candle', () => {
  // entry 4000 in candle 0 (3994-3997) needs +3..+6; exit 4002 in candle 1 (3995-3998) needs +4..+7
  close(computePriceOffset(candles, [{ timeSec: 10, price: 4000 }, { timeSec: 70, price: 4002 }]), 4);
});

test('negative shift when the feed quotes above the broker', () => {
  close(computePriceOffset(candles, [{ timeSec: 10, price: 3990 }]), -4);
});

test('when no single shift fits all fills, the entry wins', () => {
  // candle 0 needs +3..+6 (entry 4000), candle 1 needs -5..-2 (exit 3993)
  const result = computePriceOffset(candles, [{ timeSec: 10, price: 4000 }, { timeSec: 70, price: 3993 }]);
  close(result, 3);
  assert.equal(result!.fitsAll, false);
});

test('fitsAll when one shift works for every fill', () => {
  assert.equal(computePriceOffset(candles, [{ timeSec: 10, price: 4000 }, { timeSec: 70, price: 4002 }])!.fitsAll, true);
});

test('fills outside the candle data are ignored', () => {
  assert.equal(computePriceOffset(candles, [{ timeSec: -100, price: 4000 }]), null);
  assert.equal(computePriceOffset(candles, []), null);
});

test('shiftCandles moves every price by the offset', () => {
  const [first] = shiftCandles(candles, 4);
  assert.deepEqual(first, { time: 0, open: 3999, high: 4001, low: 3998, close: 4000 });
  assert.equal(shiftCandles(candles, 0), candles);
});
