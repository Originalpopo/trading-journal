// Day notes: one note per calendar day, read next to that day's trading result.
// Kept free of app imports so it can be unit-tested with `node --test`.
import { classifyTrade, type StatTrade } from './stats.ts';
import { toCents, fromCents } from './money.ts';

export interface DayNote {
  date: string; // "YYYY-MM-DD", also the document ID, which is what keeps it to one note a day
  content: string;
  mood: string; // one of the mood icon IDs
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

// The day a stored time falls on, or null when the time cannot be read.
export function dayKeyOfTime(time: string | undefined): string | null {
  if (!time) return null;
  const date = new Date(time.replace(' ', 'T'));
  return isNaN(date.getTime()) ? null : dayKey(date);
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

// What was traded on one day. A trade belongs to the day it closed, as on the Calendar page.
export function summarizeDay(trades: DayTrade[], key: string): DaySummary {
  let count = 0, pnlCents = 0, rr = 0, wins = 0, losses = 0, bes = 0;
  for (const t of trades) {
    if (dayKeyOfTime(t.time) !== key) continue;
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

// The trades that closed on one day, earliest first.
export function tradesOfDay<T extends { time: string }>(trades: T[], key: string): T[] {
  return trades
    .filter(t => dayKeyOfTime(t.time) === key)
    .sort((a, b) => new Date(a.time.replace(' ', 'T')).getTime() - new Date(b.time.replace(' ', 'T')).getTime());
}

// Notes whose text or date contains the query, newest day first.
export function searchDayNotes(notes: DayNote[], query: string): DayNote[] {
  const q = query.trim().toLowerCase();
  return notes
    .filter(n => !q || n.content.toLowerCase().includes(q) || n.date.includes(q))
    .sort((a, b) => b.date.localeCompare(a.date));
}
