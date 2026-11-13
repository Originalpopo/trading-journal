// The Dashboard's Equity and Balance chart, for a chosen stretch of time: the newest part of the account fills
// the chart however long the history grows. The equity is always the P&L since the first trade. On All the
// Peak and Low lines are all-time; on a shorter range (Today, 1W ... 1Y) they are the range's own: its highest
// point (counting where it started) and the low before that, so the Active DD area is the drop from the range's top.
// Kept free of app imports so it can be unit-tested with `node --test`.
import { addMoney, subMoney } from './money.ts';
import { tradingDayOf, tradingDayStartMs, DEFAULT_DAY_START_HOUR, type DayStart } from './dayNotes.ts';

// TODAY is today's trading day, counted like the Today's Target bar (a day starts at the hour set in Settings).
export const CHART_RANGES = ['TODAY', '1W', '1M', '3M', '1Y', 'ALL'] as const;
export const CHART_RANGE_LABELS: Record<ChartRange, string> = { TODAY: 'Today', '1W': '1W', '1M': '1M', '3M': '3M', '1Y': '1Y', ALL: 'All' };
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
  peak: number; // All: highest equity ever (0 before any profit); a range: its highest, counting its start
  peakIndex: number; // where the peak is in this series; 0 = the left edge (All: it came before the range)
  // The lowest the equity fell between the peak before the latest one and the latest one (the Low line). All: null
  // when the equity has not yet dipped and made a new high since. A shorter range always has one: with no peak
  // before its top, the lowest point before the top, or the top itself when the range started there.
  low: number | null;
  lowIndex: number; // where that low is in this series; 0 = the left edge
  current: number; // equity now
}

// When a range starts, or null for all of it.
export function rangeStart(range: ChartRange, now: number, dayStart: DayStart = DEFAULT_DAY_START_HOUR): number | null {
  if (range === 'ALL') return null;
  if (range === 'TODAY') return tradingDayStartMs(tradingDayOf(new Date(now), dayStart), dayStart);
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
// Within one day the time tells the points apart.
const timeLabel = (ms: number) => {
  const d = new Date(ms);
  return `${dateLabel(ms)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
const dayOf = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

interface Point { time: number; equity: number; balance: number; isPeak: boolean; isLow?: boolean }

// The low between the latest peak and the peak before it: walking back from the latest peak, the first earlier new
// high that the equity fell below before climbing to the latest peak is the peak before it, and the lowest point
// in between is the low. A run of new highs one after another, with no dip between, is one climb, not several peaks.
export function lowBeforePeak(points: { equity: number; isNewHigh: boolean }[], peakAt: number): number {
  let lowAt = -1;
  for (let i = peakAt - 1; i >= 0; i--) {
    if (points[i].isNewHigh && lowAt >= 0 && points[lowAt].equity < points[i].equity) return lowAt;
    if (lowAt < 0 || points[i].equity < points[lowAt].equity) lowAt = i;
  }
  return -1;
}

// Events must be in chronological order.
export function equitySeries(events: SeriesEvent[], range: ChartRange, now: number, dayStart: DayStart = DEFAULT_DAY_START_HOUR): EquitySeries {
  const label = range === 'TODAY' ? timeLabel : dateLabel;
  // Every event as a point, all-time, and which one set the peak.
  const all: Point[] = [];
  let equity = 0, balance = 0, peak = 0, peakAt = -1;
  const isNewHigh: boolean[] = [];
  for (const evt of events) {
    if (evt.type === 'funding') {
      balance = subMoney(addMoney(balance, evt.deposit), evt.withdraw);
    } else {
      balance = addMoney(balance, evt.profit);
      equity = addMoney(equity, evt.profit);
      if (equity > peak) { peak = equity; peakAt = all.length; isNewHigh[all.length] = true; }
    }
    all.push({ time: evt.time, equity, balance, isPeak: false });
  }
  if (peakAt >= 0) all[peakAt].isPeak = true;
  const lowAt = peakAt > 0 ? lowBeforePeak(all.map((p, i) => ({ equity: p.equity, isNewHigh: !!isNewHigh[i] })), peakAt) : -1;
  if (lowAt >= 0) all[lowAt].isLow = true;

  const start = rangeStart(range, now, dayStart);
  const firstIn = start === null ? 0 : all.findIndex(p => p.time >= start);
  const inRange = firstIn < 0 ? [] : all.slice(firstIn);
  // Where the line starts: where the account stood when the range began, or nothing yet ("Start").
  const before = firstIn < 0 ? all[all.length - 1] : all[firstIn - 1];
  const anchor = before
    ? { label: label(start ?? before.time), equity: before.equity, balance: before.balance }
    : { label: 'Start', equity: 0, balance: 0 };

  // A shorter range: the Peak and Low lines of its own, from its start (the anchor) on.
  let points = inRange;
  let rangePeak = peak, rangeLow: number | null = lowAt >= 0 ? all[lowAt].equity : null;
  if (start !== null) {
    const seq = [anchor.equity, ...inRange.map(p => p.equity)];
    const isHigh = [true];
    let topAt = 0;
    for (let i = 1; i < seq.length; i++) if (seq[i] > seq[topAt]) { topAt = i; isHigh[i] = true; }
    let bottomAt = topAt > 0 ? lowBeforePeak(seq.map((equity, i) => ({ equity, isNewHigh: !!isHigh[i] })), topAt) : -1;
    // No peak before the top to measure from (the user's rule): the lowest point before the top is the Low line;
    // and when nothing came before it lower (the top is where the range started), the Low line is the top itself,
    // so any drop below it is under the Low line (red).
    if (bottomAt < 0) {
      bottomAt = 0;
      for (let i = 1; i < topAt; i++) if (seq[i] < seq[bottomAt]) bottomAt = i;
    }
    rangePeak = seq[topAt];
    rangeLow = bottomAt >= 0 ? seq[bottomAt] : null;
    points = inRange.map((p, i) => ({ ...p, isPeak: i + 1 === topAt, isLow: i + 1 === bottomAt }));
  }
  if (points.length > MAX_POINTS) {
    // The last point of each day; the day the peak (or the low) was set keeps it.
    const byDay = new Map<string, Point>();
    for (const p of points) {
      const key = dayOf(p.time);
      const isPeak = p.isPeak || !!byDay.get(key)?.isPeak;
      const isLow = p.isLow || !!byDay.get(key)?.isLow;
      byDay.set(key, { ...p, isPeak, isLow });
    }
    points = [...byDay.values()];
  }

  const labels = [anchor.label, ...points.map(p => label(p.time))];
  const equitySeries = [anchor.equity, ...points.map(p => p.equity)];
  const balanceSeries = [anchor.balance, ...points.map(p => p.balance)];
  // Nothing happened in the range: a flat line from its start to now.
  if (points.length === 0) {
    labels.push(label(now));
    equitySeries.push(anchor.equity);
    balanceSeries.push(anchor.balance);
  }
  const peakInRange = points.findIndex(p => p.isPeak);
  const lowInRange = points.findIndex(p => p.isLow);
  return {
    labels, equity: equitySeries, balance: balanceSeries,
    peak: rangePeak, peakIndex: peakInRange >= 0 ? peakInRange + 1 : 0,
    low: rangeLow, lowIndex: lowInRange >= 0 ? lowInRange + 1 : 0,
    current: equity,
  };
}
