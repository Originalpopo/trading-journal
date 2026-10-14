// Week notes: one note per week, a review of the whole trading week beside that week's result.
// A week runs Sunday to Saturday and is named by its Sunday. The Calendar cuts a week that spans two
// months into two cells; both show the same note, because it is one trading week.
// Kept free of app imports so it can be unit-tested with `node --test`.
import { classifyTrade, type StatTrade } from './stats.ts';
import { toCents, fromCents } from './money.ts';
import { dayKey, dayKeyOfTime, type DayNote, type DaySummary } from './dayNotes.ts';

export interface WeekNote {
  week: string; // "YYYY-MM-DD" of the week's Sunday, also the document ID: one note a week
  content: string;
  mood: string; // one of the mood icon IDs
  createdAt?: string;
  updatedAt?: string;
}

const parseDay = (key: string) => new Date(`${key}T00:00:00`);

// The week a date falls in: its Sunday, as a day key.
export const weekKeyOf = (date: Date): string =>
  dayKey(new Date(date.getFullYear(), date.getMonth(), date.getDate() - date.getDay()));

export const weekKeyOfDay = (key: string): string => weekKeyOf(parseDay(key));

// The seven days of a week, Sunday first.
export function daysOfWeek(week: string): string[] {
  const start = parseDay(week);
  return Array.from({ length: 7 }, (_, i) => dayKey(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)));
}

// "Oct 11 – 17, 2026", "Sep 27 – Oct 3, 2026" or "Dec 27, 2026 – Jan 2, 2027".
export function formatWeekRange(week: string): string {
  const days = daysOfWeek(week);
  const first = parseDay(days[0]);
  const last = parseDay(days[6]);
  const month = (d: Date) => d.toLocaleDateString('en-US', { month: 'short' });
  if (first.getFullYear() !== last.getFullYear()) {
    return `${month(first)} ${first.getDate()}, ${first.getFullYear()} – ${month(last)} ${last.getDate()}, ${last.getFullYear()}`;
  }
  const end = first.getMonth() === last.getMonth() ? `${last.getDate()}` : `${month(last)} ${last.getDate()}`;
  return `${month(first)} ${first.getDate()} – ${end}, ${last.getFullYear()}`;
}

interface WeekTrade extends StatTrade { time: string }

export interface WeekSummary extends DaySummary {
  days: (DaySummary & { date: string })[]; // Sunday to Saturday
}

// What was traded in one week, in total and day by day. A trade belongs to the day it closed.
export function summarizeWeek(trades: WeekTrade[], week: string): WeekSummary {
  const days = daysOfWeek(week).map(date => ({ date, count: 0, pnlCents: 0, rr: 0, wins: 0, losses: 0, bes: 0 }));
  const byDate = new Map(days.map(d => [d.date, d]));
  for (const t of trades) {
    const day = byDate.get(dayKeyOfTime(t.time) ?? '');
    if (!day) continue;
    day.count++;
    day.pnlCents += toCents(t.profit);
    day.rr += t.rr || 0;
    const outcome = classifyTrade(t);
    if (outcome === 'win') day.wins++;
    else if (outcome === 'loss') day.losses++;
    else day.bes++;
  }
  const sum = (f: (d: typeof days[number]) => number) => days.reduce((s, d) => s + f(d), 0);
  return {
    count: sum(d => d.count),
    pnl: fromCents(sum(d => d.pnlCents)),
    rr: sum(d => d.rr),
    wins: sum(d => d.wins),
    losses: sum(d => d.losses),
    bes: sum(d => d.bes),
    days: days.map(({ pnlCents, ...d }) => ({ ...d, pnl: fromCents(pnlCents) })),
  };
}

export interface NoteWeekGroup {
  week: string;
  weekNote?: WeekNote;
  dayNotes: DayNote[]; // newest day first
}

// Every week that has a note of its own or a day note, newest week first. A search keeps the whole
// week of any note whose text or date matches, so a match is read in its week.
export function groupNotesByWeek(dayNotes: DayNote[], weekNotes: WeekNote[], query = ''): NoteWeekGroup[] {
  const groups = new Map<string, NoteWeekGroup>();
  const groupOf = (week: string) => {
    if (!groups.has(week)) groups.set(week, { week, dayNotes: [] });
    return groups.get(week)!;
  };
  for (const n of weekNotes) groupOf(n.week).weekNote = n;
  for (const n of dayNotes) groupOf(weekKeyOfDay(n.date)).dayNotes.push(n);

  const q = query.trim().toLowerCase();
  const matches = (text: string, date: string) => text.toLowerCase().includes(q) || date.includes(q);
  return [...groups.values()]
    .filter(g => !q
      || (g.weekNote && (matches(g.weekNote.content, g.week) || formatWeekRange(g.week).toLowerCase().includes(q)))
      || g.dayNotes.some(n => matches(n.content, n.date)))
    .map(g => ({ ...g, dayNotes: [...g.dayNotes].sort((a, b) => b.date.localeCompare(a.date)) }))
    .sort((a, b) => b.week.localeCompare(a.week));
}
