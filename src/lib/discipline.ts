// Trading discipline, read from the trades' On Plan mark and the rules ticked in the day notes.
// Kept free of app imports so it can be unit-tested with `node --test`.
import { isOnPlan } from './stats.ts';
import { toCents, fromCents } from './money.ts';
import { dayKeyOfTime } from './dayNotes.ts';

// One of the user's own trading rules. The id never changes, so renaming a rule keeps its history.
export interface DisciplineRule {
  id: string;
  name: string;
}

// Offered in Settings as one-click starting points; the user's own list is what counts.
export const SUGGESTED_RULES = [
  'เทรดแก้แค้น',
  'ไม่วาง SL',
  'เลื่อน SL หนี',
  'เทรดเกินจำนวนที่ตั้งไว้',
  'เสี่ยงเกิน 1R',
  'เข้าก่อนสัญญาณครบ',
];

interface PlanTrade {
  time: string; // close time; a trade belongs to the day it closed, as on the Calendar
  profit?: number;
  rr?: number;
  checklists?: string[];
  isOnPlan?: boolean;
}

interface RuleNote {
  date: string; // "YYYY-MM-DD"
  brokenRules?: string[]; // rule ids
}

export interface PlanSide {
  count: number;
  pnl: number;
  rr: number;
}

// What trading on plan and off plan each came to, from `from` (a "YYYY-MM-DD" day, inclusive) on.
export function planCost(trades: PlanTrade[], from?: string): { onPlan: PlanSide; offPlan: PlanSide } {
  const sides = { onPlan: { count: 0, cents: 0, rr: 0 }, offPlan: { count: 0, cents: 0, rr: 0 } };
  for (const t of trades) {
    const day = dayKeyOfTime(t.time);
    if (!day || (from && day < from)) continue;
    const side = isOnPlan(t) ? sides.onPlan : sides.offPlan;
    side.count++;
    side.cents += toCents(t.profit);
    side.rr += t.rr || 0;
  }
  const out = (s: typeof sides.onPlan): PlanSide => ({ count: s.count, pnl: fromCents(s.cents), rr: s.rr });
  return { onPlan: out(sides.onPlan), offPlan: out(sides.offPlan) };
}

// How often each rule was broken from `from` on, most broken first. Rules never broken are left out;
// ids of rules since deleted are skipped.
export function ruleCounts(notes: RuleNote[], rules: DisciplineRule[], from?: string): { rule: DisciplineRule; count: number }[] {
  const counts = new Map<string, number>();
  for (const n of notes) {
    if (from && n.date < from) continue;
    for (const id of new Set(n.brokenRules ?? [])) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return rules
    .map(rule => ({ rule, count: counts.get(rule.id) ?? 0 }))
    .filter(r => r.count > 0)
    .sort((a, b) => b.count - a.count);
}

export type DayDiscipline = 'clean' | 'broken';

// A day is broken when it had an off-plan trade or its note ticks a broken rule, and clean when it
// had trades that were all on plan. Days with neither are left out: a day off is not a lapse.
export function disciplineByDay(trades: PlanTrade[], notes: RuleNote[]): Map<string, DayDiscipline> {
  const days = new Map<string, DayDiscipline>();
  for (const t of trades) {
    const day = dayKeyOfTime(t.time);
    if (!day) continue;
    if (!isOnPlan(t)) days.set(day, 'broken');
    else if (!days.has(day)) days.set(day, 'clean');
  }
  for (const n of notes) if ((n.brokenRules ?? []).length > 0) days.set(n.date, 'broken');
  return days;
}

// Clean trading days in a row: `current` counts back from the latest day, `best` is the longest run.
export function disciplineStreak(trades: PlanTrade[], notes: RuleNote[]): { current: number; best: number } {
  const ordered = [...disciplineByDay(trades, notes).entries()].sort(([a], [b]) => a.localeCompare(b));
  let run = 0, best = 0;
  for (const [, state] of ordered) {
    run = state === 'clean' ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return { current: run, best };
}
