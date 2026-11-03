// Day notes: one note per calendar day, read next to that day's trading result.
// Kept free of app imports so it can be unit-tested with `node --test`.
import { classifyTrade, type StatTrade } from './stats.ts';
import { toCents, fromCents } from './money.ts';

export interface DayNote {
  date: string; // "YYYY-MM-DD", also the document ID, which is what keeps it to one note a day
  content: string;
  mood: string; // one of the mood icon IDs
  brokenRules?: string[]; // ids of the user's discipline rules broken that day (Settings)
  createdAt?: string;
  updatedAt?: string;
}

// How the day felt, best to worst. Each one is a face, so the Calendar reads at a glance.
export const MOOD_IDS = ['laugh', 'smile', 'meh', 'annoyed', 'frown', 'angry'] as const;
export type MoodId = (typeof MOOD_IDS)[number];

export const DEFAULT_MOOD: MoodId = 'meh';

// Notes saved with the earlier icon set keep working: its sad face maps to the new one, and the
// icons that were not feelings (note, chart, bulb...) read as neutral.
export function normalizeMood(mood: string | undefined): MoodId {
  if (mood === 'sad') return 'frown';
  return (MOOD_IDS as readonly string[]).includes(mood ?? '') ? (mood as MoodId) : DEFAULT_MOOD;
}

// A calendar day as the journal writes it: local date, "YYYY-MM-DD".
export const dayKey = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

// A trading day starts at this hour, Bangkok time, not at midnight: the broker's day rolls over at 4 or 5
// in the morning, so a trade closed at 1am still belongs to the evening before. Set in Settings; 0 is midnight.
// Only how trades are grouped into days follows it (Calendar, notes, targets, discipline). The statement,
// tax report and History's date filter keep the real date and time.
export const DEFAULT_DAY_START_HOUR = 5;

// The trading day a moment falls in: the calendar day of the moment `startHour` hours earlier.
export const tradingDayOf = (date: Date, startHour: number): string =>
  dayKey(new Date(date.getTime() - startHour * 3_600_000));

// When a trading day ("YYYY-MM-DD") starts, in ms.
export const tradingDayStartMs = (day: string, startHour: number): number =>
  new Date(`${day}T00:00:00`).getTime() + startHour * 3_600_000;

// The trading day a stored time falls in, or null when the time cannot be read.
export function dayKeyOfTime(time: string | undefined, startHour: number): string | null {
  if (!time) return null;
  const date = new Date(time.replace(' ', 'T'));
  return isNaN(date.getTime()) ? null : tradingDayOf(date, startHour);
}

export interface DaySummary {
  count: number;
  pnl: number;
  rr: number;
  wins: number;
  losses: number;
  bes: number;
}

interface DayTrade extends StatTrade { time: string }

// What was traded on one day. A trade belongs to the trading day it closed in, as on the Calendar page.
export function summarizeDay(trades: DayTrade[], key: string, startHour: number): DaySummary {
  let count = 0, pnlCents = 0, rr = 0, wins = 0, losses = 0, bes = 0;
  for (const t of trades) {
    if (dayKeyOfTime(t.time, startHour) !== key) continue;
    count++;
    pnlCents += toCents(t.profit);
    rr += t.rr || 0;
    const outcome = classifyTrade(t);
    if (outcome === 'win') wins++;
    else if (outcome === 'loss') losses++;
    else bes++;
  }
  return { count, pnl: fromCents(pnlCents), rr, wins, losses, bes };
}

// The trades that closed in one trading day, earliest first.
export function tradesOfDay<T extends { time: string }>(trades: T[], key: string, startHour: number): T[] {
  return trades
    .filter(t => dayKeyOfTime(t.time, startHour) === key)
    .sort((a, b) => new Date(a.time.replace(' ', 'T')).getTime() - new Date(b.time.replace(' ', 'T')).getTime());
}

// Notes whose text or date contains the query, newest day first.
export function searchDayNotes(notes: DayNote[], query: string): DayNote[] {
  const q = query.trim().toLowerCase();
  return notes
    .filter(n => !q || n.content.toLowerCase().includes(q) || n.date.includes(q))
    .sort((a, b) => b.date.localeCompare(a.date));
}
