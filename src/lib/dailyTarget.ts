// The daily profit target: a share of the balance the day started with. Once the day's closed trades
// reach it, trading stops for the day; a trade entered after that is "after target".
// Kept free of app imports so it can be unit-tested with `node --test`.
import { toCents, fromCents } from './money.ts';
import { dayKeyOfTime, tradingDayStartMs } from './dayNotes.ts';
import { weekKeyOfDay, daysOfWeek } from './weekNotes.ts';

export const DEFAULT_TARGET_PCT = 2.5;

// One change of the target %: in force from `from` ("YYYY-MM-DD", a trading day) until the next change.
// `from` "" is the % every day before the first change was made.
export interface TargetPctChange {
  from: string;
  pct: number;
}

// Which % a day was held to: the last change made on or before it, or `fallback` with no history.
export function pctOnDay(history: TargetPctChange[] | undefined, day: string, fallback: number): number {
  let pct = fallback;
  for (const c of [...(history ?? [])].sort((a, b) => a.from.localeCompare(b.from))) {
    if (c.from > day) break;
    pct = c.pct;
  }
  return pct;
}

// The history after the % is changed from `oldPct` to `newPct` on `today`: the first change also records
// the old % for every day before it, and a second change on the same day replaces the first.
export function withPctChange(history: TargetPctChange[] | undefined, oldPct: number, newPct: number, today: string): TargetPctChange[] {
  const kept = (history?.length ? history : [{ from: '', pct: oldPct }]).filter(c => c.from < today);
  if (pctOnDay(kept, today, oldPct) === newPct) return kept;
  return [...kept, { from: today, pct: newPct }].sort((a, b) => a.from.localeCompare(b.from));
}

interface TargetTrade {
  time: string; // close time
  entryTime?: string;
  profit?: number;
  rr?: number;
}

interface TargetFunding {
  time: string;
  deposit?: number;
  withdraw?: number;
}

export interface DayTarget {
  date: string; // "YYYY-MM-DD"
  startBalance: number; // deposits less withdrawals plus every trade closed before the day began
  target: number; // dollars, to the cent; 0 when the start balance is not positive
  pnl: number; // the day's closed trades
  lowPnl: number; // the lowest the day's running total went, trade by trade, since it was last above 0 (else 0)
  hitAt?: string; // close time of the trade that took the day to its target
  afterCount: number; // trades entered after the target was reached
  afterPnl: number;
  afterRr: number;
}

const msOf = (time: string | undefined) => (time ? new Date(time.replace(' ', 'T')).getTime() : NaN);

// The target of every trading day that had a closed trade, plus `alsoDay` (today, before its first trade).
// A day starts at `startHour` (see dayNotes.ts), and so does the balance its target is a share of.
// `pct` is one % for every day, or the % each day was held to (see pctOnDay).
export function dailyTargets(trades: TargetTrade[], funding: TargetFunding[], pct: number | ((day: string) => number), startHour: number, alsoDay?: string): Map<string, DayTarget> {
  const byDay = new Map<string, TargetTrade[]>();
  for (const t of trades) {
    const day = dayKeyOfTime(t.time, startHour);
    if (!day) continue;
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day)!.push(t);
  }
  if (alsoDay && !byDay.has(alsoDay)) byDay.set(alsoDay, []);

  // Everything that moved the balance, oldest first, to read the balance at the start of each day.
  const moves = [
    ...trades.map(t => ({ at: msOf(t.time), cents: toCents(t.profit) })),
    ...funding.map(f => ({ at: msOf(f.time), cents: toCents(f.deposit) - toCents(f.withdraw) })),
  ].filter(m => !Number.isNaN(m.at)).sort((a, b) => a.at - b.at);

  const result = new Map<string, DayTarget>();
  for (const day of [...byDay.keys()].sort()) {
    const dayStart = tradingDayStartMs(day, startHour);
    let startCents = 0;
    for (const m of moves) {
      if (m.at >= dayStart) break;
      startCents += m.cents;
    }
    const dayPct = typeof pct === 'function' ? pct(day) : pct;
    const targetCents = startCents > 0 && dayPct > 0 ? Math.round(startCents * dayPct / 100) : 0;

    const dayTrades = [...byDay.get(day)!].sort((a, b) => msOf(a.time) - msOf(b.time));
    let runCents = 0;
    let lowCents = 0;
    let hitAtMs = NaN;
    let hitAt: string | undefined;
    for (const t of dayTrades) {
      runCents += toCents(t.profit);
      // Back above 0 makes up for the dip before it, so a later dip is measured on its own.
      lowCents = runCents > 0 ? 0 : Math.min(lowCents, runCents);
      if (targetCents > 0 && Number.isNaN(hitAtMs) && runCents >= targetCents) {
        hitAtMs = msOf(t.time);
        hitAt = t.time;
      }
    }

    let afterCount = 0, afterCents = 0, afterRr = 0;
    if (!Number.isNaN(hitAtMs)) {
      for (const t of dayTrades) {
        // A trade belongs to after-target by when it was entered; one entered before and closed after is not.
        if (msOf(t.entryTime || t.time) > hitAtMs) {
          afterCount++;
          afterCents += toCents(t.profit);
          afterRr += t.rr || 0;
        }
      }
    }

    result.set(day, {
      date: day,
      startBalance: fromCents(startCents),
      target: fromCents(targetCents),
      pnl: fromCents(runCents),
      lowPnl: fromCents(lowCents),
      hitAt,
      afterCount,
      afterPnl: fromCents(afterCents),
      afterRr,
    });
  }
  return result;
}

export interface TargetSummary {
  hitDays: number;
  stoppedDays: number; // reached the target and entered nothing more
  continuedDays: number; // reached it and traded on
  afterCount: number;
  afterPnl: number;
  afterRr: number;
}

// The days from `from` ("YYYY-MM-DD", inclusive) on.
export function summarizeTargets(days: Map<string, DayTarget>, from?: string): TargetSummary {
  let hitDays = 0, continuedDays = 0, afterCount = 0, afterCents = 0, afterRr = 0;
  for (const d of days.values()) {
    if ((from && d.date < from) || !d.hitAt) continue;
    hitDays++;
    if (d.afterCount > 0) continuedDays++;
    afterCount += d.afterCount;
    afterCents += toCents(d.afterPnl);
    afterRr += d.afterRr;
  }
  return { hitDays, stoppedDays: hitDays - continuedDays, continuedDays, afterCount, afterPnl: fromCents(afterCents), afterRr };
}

// How one trading day of the week stands against its target: reached it, traded and ended without it,
// passed with no trade at all (a day off or no setup: not a miss, and kept apart for later analysis),
// is today (not reached yet), or is still to come.
export type WeekdayState = 'hit' | 'missed' | 'noTrades' | 'today' | 'upcoming';

// The trading days of a week (Sunday to Saturday, as on the Calendar; by default the one `today` falls in),
// each with its state: Monday to Friday always, and a Saturday or Sunday only when it was traded or is today
// (markets such as crypto trade at weekends). `days` holds only days with a closed trade, plus today; those
// days also carry their target and P&L, which a day with no trade or still to come has none of.
export interface WeekdayTarget {
  date: string;
  state: WeekdayState;
  target?: number;
  pnl?: number;
}

export function weekdayTargets(days: Map<string, DayTarget>, today: string, week = weekKeyOfDay(today)): WeekdayTarget[] {
  return daysOfWeek(week)
    .filter((date, i) => (i > 0 && i < 6) || days.has(date))
    .map(date => {
      const day = days.get(date);
      const state: WeekdayState = day?.hitAt ? 'hit'
        : date > today ? 'upcoming'
        : date === today ? 'today'
        : day ? 'missed' : 'noTrades';
      return day && date <= today ? { date, state, target: day.target, pnl: day.pnl } : { date, state };
    });
}

// Days on which a trade was entered after the target: they break the discipline streak.
export const daysTradedAfterTarget = (days: Map<string, DayTarget>): Set<string> =>
  new Set([...days.values()].filter(d => d.afterCount > 0).map(d => d.date));

// A week's P&L against the sum of its days' targets, over the days that have a target (traded, or today).
export function weekTotals(week: WeekdayTarget[]): { pnl: number; target: number; days: number } {
  let pnlCents = 0, targetCents = 0, days = 0;
  for (const d of week) {
    if (d.target === undefined) continue;
    days++;
    pnlCents += toCents(d.pnl);
    targetCents += toCents(d.target);
  }
  return { pnl: fromCents(pnlCents), target: fromCents(targetCents), days };
}
