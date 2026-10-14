import { addMoney } from './money.ts';
import { classifyTrade, type StatTrade } from './stats.ts';
import { weekKeyOf } from './weekNotes.ts';

// The Calendar's year view: every month as a row of weeks. A week runs Sunday to Saturday and is
// cut at the month's edges, exactly like the Summary column of the month view, so the two always agree.

export interface PeriodStats {
  pnl: number;
  rr: number;
  count: number;
}

export interface YearWeek extends PeriodStats {
  startDay: number; // first day of the month in this week
  endDay: number; // last day of the month in this week
  isFuture: boolean; // starts after today
  week: string; // the whole week it is part of (its Sunday), which is what a week note belongs to
}

export interface YearMonth extends PeriodStats {
  month: number; // 0 = January
  weeks: YearWeek[];
}

export interface YearSummary extends PeriodStats {
  months: YearMonth[];
  winRate: number; // 0..100, break-evens left out
}

type YearTrade = StatTrade & { time: string; profit: number; rr?: number };

const empty = (): PeriodStats => ({ pnl: 0, rr: 0, count: 0 });

const add = (into: PeriodStats, t: YearTrade) => {
  into.pnl = addMoney(into.pnl, t.profit);
  into.rr += t.rr || 0;
  into.count++;
};

export function summarizeYear(trades: YearTrade[], year: number, today: Date = new Date()): YearSummary {
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();

  const months: YearMonth[] = Array.from({ length: 12 }, (_, month) => {
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const weeks: YearWeek[] = [];
    for (let day = 1; day <= daysInMonth; day++) {
      if (day === 1 || new Date(year, month, day).getDay() === 0) {
        const date = new Date(year, month, day);
        weeks.push({ ...empty(), startDay: day, endDay: day, isFuture: date.getTime() > todayStart, week: weekKeyOf(date) });
      }
      weeks[weeks.length - 1].endDay = day;
    }
    return { ...empty(), month, weeks };
  });

  const total = empty();
  let wins = 0;
  let losses = 0;
  for (const t of trades) {
    const d = new Date(t.time.replace(' ', 'T'));
    if (isNaN(d.getTime()) || d.getFullYear() !== year) continue;
    const month = months[d.getMonth()];
    const week = month.weeks.find(w => d.getDate() >= w.startDay && d.getDate() <= w.endDay)!;
    add(week, t);
    add(month, t);
    add(total, t);
    const outcome = classifyTrade(t);
    if (outcome === 'win') wins++;
    else if (outcome === 'loss') losses++;
  }

  return { ...total, months, winRate: wins + losses > 0 ? (wins / (wins + losses)) * 100 : 0 };
}
