import type { Trade } from '@/store/useJournalStore';

export type ImportAction = 'new' | 'update' | 'same';

export interface ImportPlanRow {
  key: string;
  parsed: Partial<Trade>; // broker data, with the user's exit-time edit applied
  action: ImportAction;
  existing?: Trade;
  updates?: Partial<Trade>;
  result: Partial<Trade>; // the trade as it will be after importing
  keptManualTimes: boolean; // existing hand-set times win over the broker data
  previousExitTime?: string; // shown struck through when importing changes the exit time
  invalidExit: boolean; // edited exit time is before the entry
}

const TIME_FIELDS = ['time', 'entryTime', 'exitTime', 'duration', 'exitTimeConfidence'] as const;

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

// Decide per parsed trade whether it is new, fixes an existing trade, or is already up to date.
// Re-importing refreshes times (they used to be wrong for SL/TP exits) unless the user set them by hand;
// checklists, notes, TF and risk are never touched. `exitEdits` are exit times typed in the preview,
// keyed by row key.
export function planImport(parsedTrades: Partial<Trade>[], trades: Trade[], exitEdits: Record<string, string>): ImportPlanRow[] {
  return parsedTrades.map((raw, idx) => {
    const key = raw.positionId || `row-${idx}`;
    const parsed = exitEdits[key] ? applyExitEdit(raw, exitEdits[key]) : raw;
    const invalidExit = !!exitEdits[key] && toMs(parsed.exitTime!) < toMs(parsed.entryTime || parsed.exitTime!);

    const existing = trades.find(t => {
      if (raw.positionId && t.positionId) return t.positionId === raw.positionId;
      return t.time === raw.time && t.symbol === raw.symbol && t.profit === (raw.profit || 0);
    });
    if (!existing) return { key, parsed, action: 'new', result: parsed, keptManualTimes: false, invalidExit };

    const updates: Partial<Trade> = {};
    if (!existing.tpPrice && parsed.tpPrice) updates.tpPrice = parsed.tpPrice;
    if (!existing.slPrice && parsed.slPrice) updates.slPrice = parsed.slPrice;
    if (!existing.entryType && parsed.entryType) updates.entryType = parsed.entryType;
    if (!existing.exitType && parsed.exitType) updates.exitType = parsed.exitType;

    // An edit made in the preview is also the user's own time, so it may replace an older one.
    const keptManualTimes = existing.exitTimeConfidence === 'manual' && parsed.exitTimeConfidence !== 'manual';
    if (!keptManualTimes) {
      for (const field of TIME_FIELDS) {
        if (parsed[field] !== undefined && existing[field] !== parsed[field]) {
          (updates as Record<string, unknown>)[field] = parsed[field];
        }
      }
    }

    const oldExit = existing.exitTime || existing.time;
    const result = { ...existing, ...updates };
    const previousExitTime = (result.exitTime || result.time) !== oldExit ? oldExit : undefined;

    return {
      key, parsed, existing, result, keptManualTimes, previousExitTime, invalidExit,
      ...(Object.keys(updates).length > 0 ? { action: 'update' as const, updates } : { action: 'same' as const }),
    };
  });
}
