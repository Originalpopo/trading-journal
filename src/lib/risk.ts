import { pointValueOf, type ZoneTrade } from './tradeZones.ts';
import { deriveResultType } from './stats.ts';

// A trade's $ risk (1R) is the distance to the stop it was opened with, times the $ value of a
// 1.00 move. The broker only reports where the stop was last: if it's still on the losing side of
// the entry it was never moved and is the initial stop; if it was moved to break-even or into
// profit, the initial stop is lost unless the user entered it, and 1R falls back to a default.

export interface RiskTrade extends ZoneTrade {
  initialSlPrice?: number;
  initialSlSource?: 'broker' | 'manual';
}

export interface TradeRisk {
  risk: number;
  rr: number;
  resultType: 'TP' | 'SL' | 'BE';
  riskIsEstimate: boolean; // true when 1R is the default because the initial stop is unknown
  initialSlPrice?: number;
  initialSlSource?: 'broker' | 'manual';
}

const round2 = (n: number) => Math.round(n * 100) / 100;

// The stop the trade was opened with, when known.
export function initialStopOf(t: RiskTrade): { price: number; source: 'broker' | 'manual' } | null {
  if (t.initialSlPrice) return { price: t.initialSlPrice, source: t.initialSlSource || 'manual' };
  if (!t.entryPrice || !t.slPrice) return null;
  const dir = ['BUY', 'LONG'].includes((t.side || '').toUpperCase()) ? 1 : -1;
  return dir * (t.entryPrice - t.slPrice) > 0 ? { price: t.slPrice, source: 'broker' } : null;
}

export function computeTradeRisk(t: RiskTrade, fallbackPointValue: number | null, defaultRisk: number): TradeRisk {
  const profit = t.profit || 0;
  const stop = initialStopOf(t);
  const pointValue = pointValueOf(t) ?? fallbackPointValue;

  let risk = defaultRisk;
  let riskIsEstimate = true;
  if (stop && t.entryPrice && pointValue) {
    const fromStop = round2(Math.abs(t.entryPrice - stop.price) * pointValue);
    if (fromStop > 0) {
      risk = fromStop;
      riskIsEstimate = false;
    }
  }

  return {
    risk,
    rr: risk > 0 ? profit / risk : 0,
    resultType: deriveResultType(profit, risk),
    riskIsEstimate,
    ...(stop && !riskIsEstimate ? { initialSlPrice: stop.price, initialSlSource: stop.source } : {}),
  };
}

// The usual 1R when nothing better is known: the most common $ risk among the trades.
export function mostCommonRisk(trades: { risk?: number | string }[]): number | null {
  const counts = new Map<number, number>();
  for (const t of trades) {
    const r = parseFloat(String(t.risk ?? ''));
    if (r > 0) counts.set(r, (counts.get(r) || 0) + 1);
  }
  let best: number | null = null;
  let bestCount = 0;
  for (const [r, count] of counts) {
    if (count > bestCount) { best = r; bestCount = count; }
  }
  return best;
}
