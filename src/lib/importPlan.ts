import type { Trade } from '@/store/useJournalStore';
import { computeTradeRisk, type TradeRisk } from './risk.ts';
import { toCents } from './money.ts';
import type { ImportWarning } from './tradingViewParser.ts';

export type ImportAction = 'new' | 'update' | 'same';

export interface ImportPlanRow {
  key: string;
  parsed: Partial<Trade>; // broker data, with the user's edits (exit time, initial stop) applied
  action: ImportAction;
  existing?: Trade;
  updates?: Partial<Trade>;
  result: Partial<Trade>; // the trade as it will be after importing
  keptManualTimes: boolean; // existing hand-set times win over the broker data
  previousExitTime?: string; // shown struck through when importing changes the exit time
  previousRisk?: number; // shown struck through when importing changes 1R
  previousProfit?: number; // saved P&L that disagrees with the broker's; importing replaces it
  invalidExit: boolean; // edited exit time is before the entry
  invalidInitialSl: boolean; // edited initial stop is not on the losing side of the entry
}

export interface RiskContext {
  defaultRisk: number; // 1R when the initial stop is unknown
  fallbackPointValue: number | null; // $ per 1.00 move, for trades that closed exactly at entry
}

export interface ImportEdits {
  exitTimes: Record<string, string>; // row key -> datetime-local value
  initialStops: Record<string, string>; // row key -> price typed by the user
}

const TIME_FIELDS = ['time', 'entryTime', 'exitTime', 'duration', 'exitTimeConfidence'] as const;
const RISK_FIELDS = ['risk', 'rr', 'resultType', 'riskIsEstimate', 'initialSlPrice', 'initialSlSource'] as const;

const toMs = (time: string) => new Date(time.replace(' ', 'T')).getTime();

// A datetime-local input drops ":00" seconds; stored times always carry them.
const normalizeInputTime = (value: string) => (value.length === 16 ? `${value}:00` : value);

function applyExitEdit(parsed: Partial<Trade>, exitInput: string): Partial<Trade> {
  const exitTime = normalizeInputTime(exitInput);
  const entryMs = toMs(parsed.entryTime || exitTime);
  return {
    ...parsed,
    time: exitTime,
    exitTime,
    duration: Math.max(0, Math.floor((toMs(exitTime) - entryMs) / 1000)),
    exitTimeConfidence: 'manual',
  };
}

const sameValue = (a: unknown, b: unknown) =>
  typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) < 1e-9 : a === b;

// Decide per parsed trade whether it is new, fixes an existing trade, or is already up to date.
// Re-importing refreshes times (they used to be wrong for SL/TP exits) unless the user set them by
// hand, and 1R from the broker's stop unless the user entered the initial stop. Checklists, notes
// and TF are never touched.
export function planImport(parsedTrades: Partial<Trade>[], trades: Trade[], edits: ImportEdits, riskContext: RiskContext): ImportPlanRow[] {
  return parsedTrades.map((raw, idx) => {
    const key = raw.positionId || `row-${idx}`;
    let parsed = edits.exitTimes[key] ? applyExitEdit(raw, edits.exitTimes[key]) : raw;
    const invalidExit = !!edits.exitTimes[key] && toMs(parsed.exitTime!) < toMs(parsed.entryTime || parsed.exitTime!);

    const existing = trades.find(t => {
      if (raw.positionId && t.positionId) return t.positionId === raw.positionId;
      return t.time === raw.time && t.symbol === raw.symbol && t.profit === (raw.profit || 0);
    });

    // Initial stop: typed in the preview, else one the user entered earlier, else the broker's.
    const typedStop = parseFloat(edits.initialStops[key] || '');
    const dir = parsed.side === 'SELL' ? -1 : 1;
    const invalidInitialSl = Number.isFinite(typedStop) && !!parsed.entryPrice && dir * (parsed.entryPrice - typedStop) <= 0;
    if (Number.isFinite(typedStop) && !invalidInitialSl) {
      parsed = { ...parsed, initialSlPrice: typedStop, initialSlSource: 'manual' };
    } else if (existing?.initialSlSource === 'manual' && existing.initialSlPrice) {
      parsed = { ...parsed, initialSlPrice: existing.initialSlPrice, initialSlSource: 'manual' };
    }

    let riskInfo: Partial<TradeRisk> = computeTradeRisk(parsed, riskContext.fallbackPointValue, riskContext.defaultRisk);
    // The default 1R only applies to new trades. An existing trade keeps the risk it already has
    // (known from a stop, typed by the user, or the default at the time it was imported), so
    // changing the default later never rewrites past trades.
    if (riskInfo.riskIsEstimate && existing && parseFloat(String(existing.risk || 0)) > 0) {
      riskInfo = existing.riskIsEstimate === false ? {} : { riskIsEstimate: true };
    }

    if (!existing) {
      const result = { ...parsed, ...riskInfo };
      return { key, parsed: result, action: 'new', result, keptManualTimes: false, invalidExit, invalidInitialSl };
    }

    const updates: Partial<Trade> = {};
    if (!existing.tpPrice && parsed.tpPrice) updates.tpPrice = parsed.tpPrice;
    if (!existing.slPrice && parsed.slPrice) updates.slPrice = parsed.slPrice;
    if (!existing.entryType && parsed.entryType) updates.entryType = parsed.entryType;
    if (!existing.exitType && parsed.exitType) updates.exitType = parsed.exitType;
    // The broker's Closed P&L is the source of truth for money.
    if (existing.positionId && parsed.profit !== undefined && toCents(existing.profit) !== toCents(parsed.profit)) {
      updates.profit = parsed.profit;
    }
    if (parsed.commission !== undefined && !sameValue(existing.commission, parsed.commission)) updates.commission = parsed.commission;

    // An edit made in the preview is also the user's own time, so it may replace an older one.
    const keptManualTimes = existing.exitTimeConfidence === 'manual' && parsed.exitTimeConfidence !== 'manual';
    if (!keptManualTimes) {
      for (const field of TIME_FIELDS) {
        if (parsed[field] !== undefined && existing[field] !== parsed[field]) {
          (updates as Record<string, unknown>)[field] = parsed[field];
        }
      }
    }

    for (const field of RISK_FIELDS) {
      const value = (riskInfo as Record<string, unknown>)[field];
      if (value !== undefined && !sameValue(existing[field], value)) {
        (updates as Record<string, unknown>)[field] = value;
      }
    }

    const oldExit = existing.exitTime || existing.time;
    const result = { ...existing, ...updates };
    const previousExitTime = (result.exitTime || result.time) !== oldExit ? oldExit : undefined;
    const previousRisk = updates.risk !== undefined ? existing.risk : undefined;
    const previousProfit = updates.profit !== undefined ? existing.profit : undefined;

    return {
      key, parsed, existing, result, keptManualTimes, previousExitTime, previousRisk, previousProfit, invalidExit, invalidInitialSl,
      ...(Object.keys(updates).length > 0 ? { action: 'update' as const, updates } : { action: 'same' as const }),
    };
  });
}

export interface ReviewedWarnings {
  warnings: ImportWarning[]; // still need the user's attention
  alreadySaved: ImportWarning[]; // cut-off positions the journal already holds with the same P&L
  savedDiffers: (ImportWarning & { savedProfit: number })[]; // already saved, but with another P&L
}

// A paste that starts where the last one ended often catches the tail of a position imported
// before. If the journal already has that position with the broker's P&L, no money is missing.
export function reviewImportWarnings(warnings: ImportWarning[], trades: Pick<Trade, 'positionId' | 'profit'>[]): ReviewedWarnings {
  const reviewed: ReviewedWarnings = { warnings: [], alreadySaved: [], savedDiffers: [] };
  for (const w of warnings) {
    const saved = w.kind === 'missingEntry' && w.positionId ? trades.find(t => t.positionId === w.positionId) : undefined;
    if (!saved) reviewed.warnings.push(w);
    else if (toCents(saved.profit) === toCents(w.pnl)) reviewed.alreadySaved.push(w);
    else reviewed.savedDiffers.push({ ...w, savedProfit: saved.profit });
  }
  return reviewed;
}
