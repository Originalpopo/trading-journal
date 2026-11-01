import { pointValueOf, medianPointValue, type ZoneTrade } from './tradeZones.ts';
import { BE_RR_THRESHOLD, deriveResultType, parseRisk } from './stats.ts';

// A trade's risk, its result in R and its TP/SL/BE label are never trusted from storage: they are
// worked out here, from the facts of the trade, every time trades are loaded or planned for import.
//
// 1R is the distance from the price the entry order was placed at to the stop the trade was opened
// with, in dollars. The broker's order history only reports where the stop was last, so the first
// stop is known when the notifications log or the user supplied it, or when the last stop is still
// on the losing side of the entry (it was never moved to break-even). Otherwise 1R is the usual 1R
// of the time: the median of the 10 trades before it whose 1R is known (defaultRiskAt), else the
// Settings value. It is saved with the trade, so a later change never rewrites it.

export interface RiskTrade extends ZoneTrade {
  symbol?: string;
  size?: number;
  entryOrderPrice?: number;
  exitType?: string;
  initialSlPrice?: number;
  initialSlSource?: 'broker' | 'manual' | 'log';
  riskIsEstimate?: boolean;
  time?: string; // close time, "YYYY-MM-DD HH:mm:ss"
  entryTime?: string;
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
  knownRisks?: { at: number; risk: number }[]; // 1R of trades whose first stop (or typed risk) is known, by entry time
}

// How many trades with a known 1R make up "the usual 1R" of a moment.
const USUAL_RISK_WINDOW = 10;

// A stop the order history shows closer to the entry than this share of the entry price was dragged
// there to break even: it is not the risk the trade was opened with. Measured in price, not in
// dollars or against the default 1R, so neither a bigger lot nor a new default in Settings changes
// how an old trade reads (0.002% is about 0.08 on gold at 4000, a fifth of a pip on EURUSD).
const BREAK_EVEN_STOP_SHARE = 0.00002;

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
  const base: RiskContext = { defaultRisk, fallbackPointValue: medianPointValue(trades), contractSizes };
  // A known 1R never depends on the default, so these can be read with the base context.
  const knownRisks = trades
    .map(t => ({ at: timeOf(t), derived: deriveTradeRisk(t, base) }))
    .filter(k => !Number.isNaN(k.at) && !k.derived.riskIsEstimate && k.derived.risk > 0)
    .map(k => ({ at: k.at, risk: k.derived.risk }))
    .sort((a, b) => a.at - b.at);
  return { ...base, knownRisks };
}

const timeOf = (t: { entryTime?: string; time?: string }) => {
  const value = t.entryTime || t.time;
  return value ? new Date(value.replace(' ', 'T')).getTime() : NaN;
};

// The usual 1R when a trade was opened: the median of the last 10 known 1Rs before it, so it grows
// with the account yet never changes for an old trade. Without any, the Settings value.
export function defaultRiskAt(ctx: RiskContext, t: { entryTime?: string; time?: string }): number {
  const known = ctx.knownRisks ?? [];
  const at = timeOf(t);
  const before = Number.isNaN(at) ? known : known.filter(k => k.at < at);
  const recent = before.slice(-USUAL_RISK_WINDOW).map(k => k.risk);
  return recent.length > 0 ? round2(median(recent)) : ctx.defaultRisk;
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

// The first stop that makes 1R come out at `risk` dollars: on the tick prices are quoted in when one
// gives exactly that amount, else at the exact price.
export function stopForRisk(entryRef: number, direction: number, risk: number, pointValue: number): number {
  const target = round2(risk);
  const exact = entryRef - direction * target / pointValue;
  for (let decimals = 2; decimals <= 5; decimals++) {
    const factor = 10 ** decimals;
    const stop = Math.round(exact * factor) / factor;
    if (round2(Math.abs(entryRef - stop) * pointValue) === target) return stop;
  }
  return exact;
}

export function deriveTradeRisk(t: RiskTrade, ctx: RiskContext): TradeRisk {
  const profit = t.profit || 0;
  const entryRef = t.entryOrderPrice || t.entryPrice;
  const pointValue = pointValueFor(t, ctx);
  let stop = initialStopOf(t);
  const stopDistance = stop && entryRef ? Math.abs(entryRef - stop.price) : 0;
  const fromStop = stop && entryRef && pointValue ? round2(stopDistance * pointValue) : 0;

  // Read from the order history, a stop a hair on the losing side of the entry looks like the first
  // stop but is one dragged to break-even. So is one that closed the trade without a loss: a stop
  // that was never moved cannot do that.
  const stoppedOut = (t.exitType || '').toLowerCase() === 'stop loss';
  const draggedToEntry = !!stop && stop.source === 'broker' && fromStop > 0
    && (stopDistance < BREAK_EVEN_STOP_SHARE * (entryRef || 0) || (stoppedOut && profit >= 0));
  if (draggedToEntry) stop = null;

  // A risk saved from that mistaken stop is not the trade's own.
  const savedRisk = parseRisk(t.risk);
  const storedRisk = draggedToEntry && Math.abs(savedRisk - fromStop) < 0.005 ? 0 : savedRisk;
  // A risk the user typed for a trade without a first stop stands as it is.
  const typedRisk = !t.initialSlPrice && t.riskIsEstimate === false && storedRisk > 0;

  let risk = storedRisk > 0 ? storedRisk : defaultRiskAt(ctx, t);
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
