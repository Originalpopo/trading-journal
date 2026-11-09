// The Dashboard's Equity and Balance chart, for a chosen stretch of time: the newest part of the account fills
// the chart however long the history grows. Figures stay all-time: the equity is the P&L since the first
// trade and the peak is the highest it has ever been, whatever range is shown.
// Kept free of app imports so it can be unit-tested with `node --test`.
import { addMoney, subMoney } from './money.ts';

export const CHART_RANGES = ['1W', '1M', '3M', '1Y', 'ALL'] as const;
export type ChartRange = (typeof CHART_RANGES)[number];
export const DEFAULT_CHART_RANGE: ChartRange = '1M';

// Above this many points in the range, the chart shows one point per day (the last of each day).
const MAX_POINTS = 500;

export interface SeriesEvent {
  type: 'trade' | 'funding';
  time: number; // ms
  profit?: number;
  deposit?: number;
  withdraw?: number;
}

export interface EquitySeries {
  labels: string[];
  equity: number[];
  balance: number[];
  peak: number; // highest equity ever (0 before any profit)
  peakIndex: number; // where the peak is in this series; 0 (the left edge) when it came before the range
  current: number; // equity now
}

// When a range starts, or null for all of it.
export function rangeStart(range: ChartRange, now: number): number | null {
  if (range === 'ALL') return null;
  if (range === '1W') return now - 7 * 86_400_000;
  const d = new Date(now);
  if (range === '1M') d.setMonth(d.getMonth() - 1);
  else if (range === '3M') d.setMonth(d.getMonth() - 3);
  else d.setFullYear(d.getFullYear() - 1);
  return d.getTime();
}

const dateLabel = (ms: number) => {
  const d = new Date(ms);
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear().toString().slice(-2)}`;
};
const dayOf = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

interface Point { time: number; equity: number; balance: number; isPeak: boolean }

// Events must be in chronological order.
export function equitySeries(events: SeriesEvent[], range: ChartRange, now: number): EquitySeries {
  // Every event as a point, all-time, and which one set the peak.
  const all: Point[] = [];
  let equity = 0, balance = 0, peak = 0, peakAt = -1;
  for (const evt of events) {
    if (evt.type === 'funding') {
      balance = subMoney(addMoney(balance, evt.deposit), evt.withdraw);
    } else {
      balance = addMoney(balance, evt.profit);
      equity = addMoney(equity, evt.profit);
      if (equity > peak) { peak = equity; peakAt = all.length; }
    }
    all.push({ time: evt.time, equity, balance, isPeak: false });
  }
  if (peakAt >= 0) all[peakAt].isPeak = true;

  const start = rangeStart(range, now);
  const firstIn = start === null ? 0 : all.findIndex(p => p.time >= start);
  const inRange = firstIn < 0 ? [] : all.slice(firstIn);
  // Where the line starts: where the account stood when the range began, or nothing yet ("Start").
  const before = firstIn < 0 ? all[all.length - 1] : all[firstIn - 1];
  const anchor = before
    ? { label: dateLabel(start ?? before.time), equity: before.equity, balance: before.balance }
    : { label: 'Start', equity: 0, balance: 0 };

  let points = inRange;
  if (inRange.length > MAX_POINTS) {
    // The last point of each day; the day the peak was set keeps the peak.
    const byDay = new Map<string, Point>();
    for (const p of inRange) {
      const key = dayOf(p.time);
      const isPeak = p.isPeak || !!byDay.get(key)?.isPeak;
      byDay.set(key, { ...p, isPeak });
    }
    points = [...byDay.values()];
  }

  const labels = [anchor.label, ...points.map(p => dateLabel(p.time))];
  const equitySeries = [anchor.equity, ...points.map(p => p.equity)];
  const balanceSeries = [anchor.balance, ...points.map(p => p.balance)];
  // Nothing happened in the range: a flat line from its start to now.
  if (points.length === 0) {
    labels.push(dateLabel(now));
    equitySeries.push(anchor.equity);
    balanceSeries.push(anchor.balance);
  }
  const peakInRange = points.findIndex(p => p.isPeak);
  return {
    labels, equity: equitySeries, balance: balanceSeries,
    peak, peakIndex: peakInRange >= 0 ? peakInRange + 1 : 0, current: equity,
  };
}
