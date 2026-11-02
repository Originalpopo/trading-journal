// The daily profit target: a share of the balance the day started with. Once the day's closed trades
// reach it, trading stops for the day; a trade entered after that is "after target".
// Kept free of app imports so it can be unit-tested with `node --test`.
import { toCents, fromCents } from './money.ts';
import { dayKeyOfTime } from './dayNotes.ts';

export const DEFAULT_TARGET_PCT = 2.5;

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
  hitAt?: string; // close time of the trade that took the day to its target
  afterCount: number; // trades entered after the target was reached
  afterPnl: number;
  afterRr: number;
}

const msOf = (time: string | undefined) => (time ? new Date(time.replace(' ', 'T')).getTime() : NaN);

// The target of every day that had a closed trade, plus `alsoDay` (today, before its first trade).
export function dailyTargets(trades: TargetTrade[], funding: TargetFunding[], pct: number, alsoDay?: string): Map<string, DayTarget> {
  const byDay = new Map<string, TargetTrade[]>();
  for (const t of trades) {
    const day = dayKeyOfTime(t.time);
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
    const dayStart = new Date(`${day}T00:00:00`).getTime();
    let startCents = 0;
    for (const m of moves) {
      if (m.at >= dayStart) break;
      startCents += m.cents;
    }
    const targetCents = startCents > 0 && pct > 0 ? Math.round(startCents * pct / 100) : 0;

    const dayTrades = [...byDay.get(day)!].sort((a, b) => msOf(a.time) - msOf(b.time));
    let runCents = 0;
    let hitAtMs = NaN;
    let hitAt: string | undefined;
    for (const t of dayTrades) {
      runCents += toCents(t.profit);
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

// Days on which a trade was entered after the target: they break the discipline streak.
export const daysTradedAfterTarget = (days: Map<string, DayTarget>): Set<string> =>
  new Set([...days.values()].filter(d => d.afterCount > 0).map(d => d.date));
