import { parseRisk } from './stats.ts';

// Where the chart draws a trade's risk (entry -> stop) and reward (entry -> target) zones.

export interface ZoneTrade {
  side?: string;
  entryPrice?: number;
  exitPrice?: number;
  tpPrice?: number;
  slPrice?: number;
  initialSlPrice?: number; // entered by the user when the broker no longer shows it
  profit?: number;
  risk?: number | string;
  rr?: number;
}

export interface TradeZones {
  tp: number;
  sl: number; // the stop as first placed
  slIsEstimate: boolean; // true when the first stop isn't known and is drawn at 1R ($ risk) instead
  movedSl: number | null; // where the stop ended up, when it was moved to break-even or into profit
}

// $ of P&L per 1.00 move in price (0.01 lot of XAUUSD -> 1), read from the trade's own fills.
export function pointValueOf(t: ZoneTrade): number | null {
  if (!t.entryPrice || !t.exitPrice || !t.profit) return null;
  const move = Math.abs(t.exitPrice - t.entryPrice);
  if (move < 1e-9) return null;
  return Math.abs(t.profit) / move;
}

// For trades whose own fills can't tell (closed exactly at entry), use the typical value of others.
export function medianPointValue(trades: ZoneTrade[]): number | null {
  const values = trades.map(pointValueOf).filter((v): v is number => v !== null && Number.isFinite(v)).sort((a, b) => a - b);
  if (values.length === 0) return null;
  const mid = Math.floor(values.length / 2);
  return values.length % 2 ? values[mid] : (values[mid - 1] + values[mid]) / 2;
}

export function tradeZones(t: ZoneTrade, fallbackPointValue: number | null = null): TradeZones | null {
  const entry = t.entryPrice;
  if (!entry) return null;
  const isBuy = ['BUY', 'LONG'].includes((t.side || '').toUpperCase());
  const dir = isBuy ? 1 : -1;
  const exit = t.exitPrice;
  const isWin = !!exit && dir * (exit - entry) > 0;
  const isLoss = !!exit && dir * (exit - entry) < 0;

  const risk = parseRisk(t.risk);
  const pointValue = pointValueOf(t) ?? fallbackPointValue;
  const riskDistance = risk > 0 && pointValue ? risk / pointValue : null;

  // The broker reports where the stop was last. A stop still on the risk side of the entry is the
  // one the trade was opened with; one at or past the entry was moved (break-even or trailing), and
  // the original is gone, so it is drawn at 1R from the trade's $ risk instead.
  const slOnRiskSide = !!t.slPrice && dir * (entry - t.slPrice) > 0;
  const knownInitial = t.initialSlPrice && dir * (entry - t.initialSlPrice) > 0 ? t.initialSlPrice : null;
  const movedSl = t.slPrice && (!slOnRiskSide || (knownInitial && Math.abs(t.slPrice - knownInitial) > 1e-9)) ? t.slPrice : null;

  let sl: number;
  let slIsEstimate = false;
  if (knownInitial) sl = knownInitial;
  else if (slOnRiskSide) sl = t.slPrice!;
  else if (riskDistance) {
    sl = entry - dir * riskDistance;
    slIsEstimate = true;
  } else if (isLoss) sl = exit!;
  else if (isWin) sl = entry - dir * (Math.abs(exit! - entry) / (t.rr && t.rr > 0 ? t.rr : 5));
  else sl = entry * (1 - dir * 0.001);

  const tpOnRewardSide = t.tpPrice && dir * (t.tpPrice - entry) > 0;
  let tp: number;
  if (tpOnRewardSide) tp = t.tpPrice!;
  else if (isWin) tp = exit!;
  else if (isLoss || riskDistance) tp = entry + dir * 5 * Math.abs(entry - sl);
  else tp = entry * (1 + dir * 0.002);

  return { tp, sl, slIsEstimate, movedSl };
}
