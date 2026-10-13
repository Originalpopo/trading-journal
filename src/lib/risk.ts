import { pointValueOf, medianPointValue, type ZoneTrade } from './tradeZones.ts';
import { BE_RR_THRESHOLD, deriveResultType, parseRisk } from './stats.ts';

// A trade's risk, its result in R and its TP/SL/BE label are never trusted from storage: they are
// worked out here, from the facts of the trade, every time trades are loaded or planned for import.
//
// 1R is the distance from the price the entry order was placed at to the stop the trade was opened
// with, in dollars. The broker's order history only reports where the stop was last, so the first
// stop is known when the notifications log or the user supplied it, or when the last stop is still
// on the losing side of the entry (it was never moved to break-even). Otherwise 1R is a default.

export interface RiskTrade extends ZoneTrade {
  symbol?: string;
  size?: number;
  entryOrderPrice?: number;
  exitType?: string;
  initialSlPrice?: number;
  initialSlSource?: 'broker' | 'manual' | 'log';
  riskIsEstimate?: boolean;
}

export interface TradeRisk {
  risk: number;
  rr: number;
  resultType: 'TP' | 'SL' | 'BE';
  riskIsEstimate: boolean; // true when 1R is a default because the initial stop is unknown
  initialSlPrice?: number;
  initialSlSource?: 'broker' | 'manual' | 'log';
}

export interface RiskContext {
  defaultRisk: number; // 1R when the initial stop is unknown and the trade carries no risk of its own
  fallbackPointValue: number | null; // $ per 1.00 move, for trades that tell nothing themselves
  contractSizes: Record<string, number>; // $ per 1.00 move of one lot, by symbol
}

// A stop the order history shows closer to the entry than this share of the usual 1R was dragged
// there to break even: it is not the risk the trade was opened with.
const BREAK_EVEN_STOP_SHARE = 0.05;

const round2 = (n: number) => Math.round(n * 100) / 100;
const directionOf = (t: { side?: string }) => (['BUY', 'LONG'].includes((t.side || '').toUpperCase()) ? 1 : -1);
const symbolKey = (t: { symbol?: string }) => (t.symbol || '').toUpperCase().trim();

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

// A symbol's contract size is the same for every trade, so it is read from all of them at once:
// one trade's own fills can be thrown off by cent rounding when it closed a few points from entry.
export function buildRiskContext(trades: RiskTrade[], defaultRisk: number): RiskContext {
  const perLot = new Map<string, number[]>();
  for (const t of trades) {
    const pointValue = pointValueOf(t);
    if (!pointValue || !t.size || !(t.size > 0)) continue;
    const key = symbolKey(t);
    if (!perLot.has(key)) perLot.set(key, []);
    perLot.get(key)!.push(pointValue / t.size);
  }
  const contractSizes: Record<string, number> = {};
  for (const [key, values] of perLot) contractSizes[key] = median(values);
  return { defaultRisk, fallbackPointValue: medianPointValue(trades), contractSizes };
}

// $ of P&L per 1.00 move in price for this trade.
export function pointValueFor(t: RiskTrade, ctx: RiskContext): number | null {
  const contractSize = ctx.contractSizes[symbolKey(t)];
  if (contractSize && t.size && t.size > 0) return t.size * contractSize;
  return pointValueOf(t) ?? ctx.fallbackPointValue;
}

// The stop the trade was opened with, when known.
export function initialStopOf(t: RiskTrade): { price: number; source: 'broker' | 'manual' | 'log' } | null {
  if (t.initialSlPrice) return { price: t.initialSlPrice, source: t.initialSlSource || 'manual' };
  if (!t.entryPrice || !t.slPrice) return null;
  return directionOf(t) * (t.entryPrice - t.slPrice) > 0 ? { price: t.slPrice, source: 'broker' } : null;
}

// TP/SL/BE from what happened, not from the size of the result: a take profit is a win, a stop
// that was never moved is a loss, a stop moved to the entry (or just past it) is break-even, and a
// position closed by hand goes by the sign of its P&L. Trades that don't say how they were closed
// fall back to the ±0.4R rule.
function resultTypeOf(t: RiskTrade, profit: number, risk: number, stop: ReturnType<typeof initialStopOf>, draggedToEntry: boolean): 'TP' | 'SL' | 'BE' {
  const exitType = (t.exitType || '').toLowerCase();
  if (exitType === 'take profit') return 'TP';
  if (exitType === 'stop loss' && t.entryPrice && t.slPrice) {
    const onLosingSide = !draggedToEntry && directionOf(t) * (t.entryPrice - t.slPrice) > 0;
    const moved = stop ? Math.abs(t.slPrice - stop.price) > 1e-9 : true;
    if (onLosingSide || !moved) return 'SL';
    // A stop trailed far into profit is a win, not a break-even.
    return risk > 0 && profit / risk > BE_RR_THRESHOLD ? 'TP' : 'BE';
  }
  if (exitType && exitType !== 'stop loss') return profit > 0 ? 'TP' : profit < 0 ? 'SL' : 'BE';
  return deriveResultType(profit, risk);
}

export function deriveTradeRisk(t: RiskTrade, ctx: RiskContext): TradeRisk {
  const profit = t.profit || 0;
  const entryRef = t.entryOrderPrice || t.entryPrice;
  const pointValue = pointValueFor(t, ctx);
  let stop = initialStopOf(t);
  const fromStop = stop && entryRef && pointValue ? round2(Math.abs(entryRef - stop.price) * pointValue) : 0;

  // Read from the order history, a stop a hair on the losing side of the entry looks like the first
  // stop but is one dragged to break-even. So is one that closed the trade without a loss: a stop
  // that was never moved cannot do that.
  const stoppedOut = (t.exitType || '').toLowerCase() === 'stop loss';
  const draggedToEntry = !!stop && stop.source === 'broker' && fromStop > 0
    && (fromStop < BREAK_EVEN_STOP_SHARE * ctx.defaultRisk || (stoppedOut && profit >= 0));
  if (draggedToEntry) stop = null;

  // A risk saved from that mistaken stop is not the trade's own.
  const savedRisk = parseRisk(t.risk);
  const storedRisk = draggedToEntry && Math.abs(savedRisk - fromStop) < 0.005 ? 0 : savedRisk;
  // A risk the user typed for a trade without a first stop stands as it is.
  const typedRisk = !t.initialSlPrice && t.riskIsEstimate === false && storedRisk > 0;

  let risk = storedRisk > 0 ? storedRisk : ctx.defaultRisk;
  let stopUsed = false;
  if (stop && !typedRisk && fromStop > 0) {
    risk = fromStop;
    stopUsed = true;
  }
  // Without a known stop, 1R is a guess unless the user gave it; older trades never said which,
  // so theirs counts as a guess when the stop they show has been moved.
  const riskIsEstimate = !stopUsed && !typedRisk
    && (t.riskIsEstimate === true || storedRisk <= 0 || (!!t.entryPrice && !!t.slPrice));

  return {
    risk,
    rr: risk > 0 ? profit / risk : 0,
    resultType: resultTypeOf(t, profit, risk, stop, draggedToEntry),
    riskIsEstimate,
    ...(stop && stopUsed ? { initialSlPrice: stop.price, initialSlSource: stop.source } : {}),
    // Clears a first stop saved from the mistaken reading.
    ...(draggedToEntry ? { initialSlPrice: undefined, initialSlSource: undefined } : {}),
  };
}

// Every trade with its risk, R and result worked out. This is what the app reads.
export function withDerivedRisk<T extends RiskTrade>(trades: T[], defaultRisk: number): (T & TradeRisk)[] {
  const ctx = buildRiskContext(trades, defaultRisk);
  return trades.map(t => ({ ...t, ...deriveTradeRisk(t, ctx) }));
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

// 1R for trades whose initial stop is unknown: the Settings value, else the most common $ risk
// among trades whose risk was itself a default (or set before stops were used), else 0.
export function resolveDefaultRisk(preferred: number | undefined, trades: { risk?: number | string; riskIsEstimate?: boolean }[]): number {
  if (preferred && preferred > 0) return preferred;
  return mostCommonRisk(trades.filter(t => t.riskIsEstimate !== false)) ?? 0;
}
