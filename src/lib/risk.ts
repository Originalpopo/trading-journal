import { pointValueOf, medianPointValue, type ZoneTrade } from './tradeZones.ts';
import { beThresholdAt, deriveResultType, parseRisk } from './stats.ts';
import { riskKeptOf, DEFAULT_RISK_OVER_PCT, type RiskKept } from './riskStep.ts';
import { valueAt, type SettingChange } from './settingHistory.ts';

// A trade's risk, its result in R and its TP/SL/BE label are never trusted from storage: they are
// worked out here, from the facts of the trade, every time trades are loaded or planned for import.
//
// 1R is the distance from the price the entry order was placed at to the stop the trade was opened
// with, in dollars. The broker's order history only reports where the stop was last, so the first
// stop is known when the notifications log or the user supplied it, or when the last stop is still
// on the losing side of the entry (it was never moved to break-even). Otherwise 1R is the usual 1R
// of the time: the median of the 10 trades (Settings) before it whose 1R is known (defaultRiskAt), else the
// Risk per Trade in force when it was entered, else the Settings fallback. It is saved with the trade, so a
// later change never rewrites it.

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

// A value read from one trade's fills, at the time the trade closed (NaN when it has no time).
interface Sample { at: number; value: number }

export interface RiskContext {
  defaultRisk: number; // 1R when the initial stop is unknown and the trade carries no risk of its own
  fallbackPointValue: number | null; // $ per 1.00 move, for trades that tell nothing themselves
  contractSizes: Record<string, number>; // $ per 1.00 move of one lot, by symbol, read from every trade
  // The same two, read from each trade's fills (buildRiskContext). When present, a trade only uses the trades
  // that closed up to it, so a trade added later never changes the 1R of an earlier one.
  contractSamples?: Record<string, Sample[]>;
  pointValueSamples?: Sample[];
  knownRisks?: { at: number; risk: number }[]; // 1R of trades whose first stop (or typed risk) is known, by entry time
}

// How many trades with a known 1R make up "the usual 1R" of a moment. The default; Settings can
// change it (setUsualRiskWindow), and the store sets it before trades are derived.
export const USUAL_RISK_WINDOW = 10;
let usualRiskWindow = USUAL_RISK_WINDOW;
export const getUsualRiskWindow = () => usualRiskWindow;
export const setUsualRiskWindow = (value: number | undefined) => {
  usualRiskWindow = value !== undefined && Number.isInteger(value) && value >= 1 ? value : USUAL_RISK_WINDOW;
};

// Every Risk per Trade the user set (Dashboard), oldest first: from `at` (ms) on, `risk` dollars a trade. The
// store sets it before trades are derived, like the usual-1R window. A trade's own time picks the one in force
// then, so stepping the risk up later never changes an older trade.
let riskHistory: { at: number; risk: number }[] = [];
export const setRiskHistory = (list: { at: number; risk: number }[] | undefined) => {
  riskHistory = (list ?? []).filter(c => !Number.isNaN(c.at) && c.risk > 0).sort((a, b) => a.at - b.at);
};
// The Risk per Trade in force at a moment, or null before the first one (or for a trade with no time).
export function setRiskAt(at: number): number | null {
  if (Number.isNaN(at)) return null;
  let risk: number | null = null;
  for (const c of riskHistory) {
    if (c.at > at) break;
    risk = c.risk;
  }
  return risk;
}

// How far over the risk set a trade may go and still keep it (Settings), with every change of it, so changing it
// never relabels a trade already taken: each trade is judged by the % in force when it was entered.
let riskOverPct = DEFAULT_RISK_OVER_PCT;
let riskOverHistory: SettingChange[] = [];
export const setRiskOver = (value: number | undefined, history: SettingChange[] | undefined) => {
  riskOverPct = value !== undefined && value >= 0 ? value : DEFAULT_RISK_OVER_PCT;
  riskOverHistory = history ?? [];
};
// Whether a trade (with its 1R worked out) kept to the Risk per Trade in force when it was entered.
export function riskKeptAt(t: { risk?: number | string; riskIsEstimate?: boolean; entryTime?: string; time?: string }): RiskKept {
  const at = timeOf(t);
  return riskKeptOf(parseRisk(t.risk), t.riskIsEstimate, setRiskAt(at), valueAt(riskOverHistory, at, riskOverPct));
}

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
  const contractSamples: Record<string, Sample[]> = {};
  const pointValueSamples: Sample[] = [];
  for (const t of trades) {
    const pointValue = pointValueOf(t);
    if (!pointValue || !Number.isFinite(pointValue)) continue;
    pointValueSamples.push({ at: closeTimeOf(t), value: pointValue });
    if (!t.size || !(t.size > 0)) continue;
    (contractSamples[symbolKey(t)] ??= []).push({ at: closeTimeOf(t), value: pointValue / t.size });
  }
  const contractSizes: Record<string, number> = {};
  for (const [key, samples] of Object.entries(contractSamples)) contractSizes[key] = median(samples.map(x => x.value));
  const base: RiskContext = { defaultRisk, fallbackPointValue: medianPointValue(trades), contractSizes, contractSamples, pointValueSamples };
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
const closeTimeOf = (t: { time?: string }) => (t.time ? new Date(t.time.replace(' ', 'T')).getTime() : NaN);

// The median of the samples taken up to `at` (the trade's own included); with none that early, the earliest
// sample, so the first trades read the same however many come after. Every sample for a trade without a time.
function sampledAt(samples: Sample[] | undefined, at: number): number | null {
  if (!samples?.length) return null;
  if (Number.isNaN(at)) return median(samples.map(x => x.value));
  const upTo = samples.filter(x => !Number.isNaN(x.at) && x.at <= at);
  if (upTo.length > 0) return median(upTo.map(x => x.value));
  const timed = samples.filter(x => !Number.isNaN(x.at));
  if (timed.length === 0) return median(samples.map(x => x.value));
  return timed.reduce((first, x) => (x.at < first.at ? x : first)).value;
}

// The usual 1R when a trade was opened: the median of the last 10 (Settings) known 1Rs before it, so it grows
// with the account yet never changes for an old trade. Without any, the Risk per Trade set at the time, and
// before that was ever set, the Settings fallback.
export function defaultRiskAt(ctx: RiskContext, t: { entryTime?: string; time?: string }): number {
  const known = ctx.knownRisks ?? [];
  const at = timeOf(t);
  const before = Number.isNaN(at) ? known : known.filter(k => k.at < at);
  const recent = before.slice(-usualRiskWindow).map(k => k.risk);
  if (recent.length > 0) return round2(median(recent));
  return setRiskAt(at) ?? ctx.defaultRisk;
}

// $ of P&L per 1.00 move in price for this trade.
// Read from the trades closed up to this one, so trades added later never change it.
export function pointValueFor(t: RiskTrade, ctx: RiskContext): number | null {
  const at = closeTimeOf(t);
  const contractSize = ctx.contractSamples ? sampledAt(ctx.contractSamples[symbolKey(t)], at) : ctx.contractSizes[symbolKey(t)];
  if (contractSize && t.size && t.size > 0) return t.size * contractSize;
  return pointValueOf(t) ?? (ctx.pointValueSamples ? sampledAt(ctx.pointValueSamples, at) : ctx.fallbackPointValue);
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
  // The BE range in force when the trade closed, so a later change in Settings never relabels it.
  const beThreshold = beThresholdAt(t.time ? new Date(t.time.replace(' ', 'T')).getTime() : NaN);
  if (exitType === 'take profit') return 'TP';
  if (exitType === 'stop loss' && t.entryPrice && t.slPrice) {
    const onLosingSide = !draggedToEntry && directionOf(t) * (t.entryPrice - t.slPrice) > 0;
    const moved = stop ? Math.abs(t.slPrice - stop.price) > 1e-9 : true;
    if (onLosingSide || !moved) return 'SL';
    // A stop trailed far into profit is a win, not a break-even.
    return risk > 0 && profit / risk > beThreshold ? 'TP' : 'BE';
  }
  if (exitType && exitType !== 'stop loss') return profit > 0 ? 'TP' : profit < 0 ? 'SL' : 'BE';
  return deriveResultType(profit, risk, beThreshold);
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
