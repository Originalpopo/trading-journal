// Why a trade was off plan. Every off-plan trade names at least one reason; an on-plan trade names none.
// The reasons are stored on the trade as ids, so renaming a reason in Settings renames it everywhere.
// Kept free of app imports so it can be unit-tested with `node --test`.

export interface OffPlanReason {
  id: string;
  name: string;
  // Removed in Settings while trades still named it: no longer offered, but those trades keep it, shown
  // under its name, until it is taken off in each trade's Edit.
  removed?: boolean;
}

// The reasons offered for a trade: the ones in use, plus any removed one the trade already names.
export const offeredReasons = (reasons: OffPlanReason[], picked: string[]): OffPlanReason[] =>
  reasons.filter(r => !r.removed || picked.includes(r.id));

// Removing a reason in Settings: dropped outright when no trade names it, else kept as removed.
export function withoutReason(reasons: OffPlanReason[], id: string, usage: Map<string, number>): OffPlanReason[] {
  return (usage.get(id) ?? 0) > 0
    ? reasons.map(r => (r.id === id ? { ...r, removed: true } : r))
    : reasons.filter(r => r.id !== id);
}

// The list until the user saves their own in Settings. Fixed ids, so trades can name them before then.
export const DEFAULT_OFF_PLAN_REASONS: OffPlanReason[] = [
  { id: 'early-be', name: 'เลื่อน BE ก่อนแผน' },
  { id: 'early-tp', name: 'ปิด TP ก่อนแผน' },
  { id: 'no-setup', name: 'เข้าโดยไม่มี setup ตามแผน' },
  { id: 'sl-moved-away', name: 'เลื่อน SL หนี' },
  { id: 'lot-too-big', name: 'Lot ใหญ่กว่าแผน' },
];

// Offered in Settings as one-click starting points.
export const SUGGESTED_OFF_PLAN_REASONS = [
  ...DEFAULT_OFF_PLAN_REASONS.map(r => r.name),
  'เข้าก่อนสัญญาณครบ',
  'ไม่วาง SL',
  'เสี่ยงเกิน 1R',
];

export const reasonsOrDefault = (saved: OffPlanReason[] | undefined): OffPlanReason[] => saved ?? DEFAULT_OFF_PLAN_REASONS;

interface PlanMarkedTrade {
  checklists?: string[];
  isOnPlan?: boolean;
  offPlanReasons?: string[];
}

// Same reading as stats.ts: trades saved before checklists existed count as on plan unless marked otherwise.
const isOnPlan = (t: PlanMarkedTrade): boolean => !!t.checklists?.includes('On Plan') || t.isOnPlan !== false;

// How many trades name each reason (ids no longer in the list are counted too, under their own id).
export function reasonUsage(trades: PlanMarkedTrade[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const t of trades) {
    if (isOnPlan(t)) continue;
    for (const id of new Set(t.offPlanReasons ?? [])) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

// The reasons of an off-plan trade that are still in the list, in the list's order.
export function reasonsOfTrade(t: PlanMarkedTrade, reasons: OffPlanReason[]): OffPlanReason[] {
  if (isOnPlan(t)) return [];
  const ids = new Set(t.offPlanReasons ?? []);
  return reasons.filter(r => ids.has(r.id));
}

// Off-plan trades that name no reason still in the list: there should be none.
export function offPlanWithoutReason<T extends PlanMarkedTrade>(trades: T[], reasons: OffPlanReason[]): T[] {
  return trades.filter(t => !isOnPlan(t) && reasonsOfTrade(t, reasons).length === 0);
}
