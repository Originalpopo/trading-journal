// The chart's candles come from a different price feed than the broker the trades were made with,
// so the two quotes differ by a few cents to a few dollars. Over a single trade that difference is
// close to constant, so the candles are shifted by one offset to line up with the broker's fills.

export interface OhlcCandle {
  time: number; // unix seconds, start of the candle
  open: number;
  high: number;
  low: number;
  close: number;
}

// A price the broker actually filled at, and when.
export interface PriceAnchor {
  timeSec: number;
  price: number;
}

// Index of the candle whose period contains `timeSec` (candles sorted by time), or -1 if it's before the first.
export function candleIndexAt(candles: { time: number }[], timeSec: number): number {
  let idx = -1;
  for (let i = 0; i < candles.length && candles[i].time <= timeSec; i++) idx = i;
  return idx;
}

const closestToZero = (lo: number, hi: number) => Math.min(Math.max(0, lo), hi);

export interface PriceOffset {
  offset: number;
  fitsAll: boolean; // false when the feeds drifted apart during the trade and only the first anchor fits
}

// The smallest shift that puts every anchor inside the candle it happened in. If no single shift
// fits them all, the first anchor (the entry, where every zone starts) wins.
// Null when no anchor falls on a candle.
export function computePriceOffset(candles: OhlcCandle[], anchors: PriceAnchor[]): PriceOffset | null {
  const ranges: [number, number][] = [];
  for (const { timeSec, price } of anchors) {
    if (!Number.isFinite(price) || price <= 0) continue;
    const idx = candleIndexAt(candles, timeSec);
    if (idx < 0) continue;
    const c = candles[idx];
    // low + offset <= price <= high + offset
    ranges.push([price - c.high, price - c.low]);
  }
  if (ranges.length === 0) return null;

  const lo = Math.max(...ranges.map(r => r[0]));
  const hi = Math.min(...ranges.map(r => r[1]));
  if (lo <= hi) return { offset: closestToZero(lo, hi), fitsAll: true };

  return { offset: closestToZero(ranges[0][0], ranges[0][1]), fitsAll: false };
}

export const shiftCandles = <T extends OhlcCandle>(candles: T[], offset: number): T[] =>
  offset === 0
    ? candles
    : candles.map(c => ({ ...c, open: c.open + offset, high: c.high + offset, low: c.low + offset, close: c.close + offset }));
