// The system review on the Performance page: a report on the first 100, 200, … 1,000 trades, each read
// once that many trades exist, so a phase's report stays the same as more trades come in.
// Kept free of app imports so it can be unit-tested with `node --test`.
import { classifyTrade, summarizeTrades, isOnPlan, type StatTrade } from './stats.ts';
import { addMoney } from './money.ts';
import { dayKeyOfTime } from './dayNotes.ts';
import type { DayTarget } from './dailyTarget.ts';

export const REVIEW_PHASES = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000] as const;

// How many trades an hour, or how many days that traded on after the target, before a verdict is given.
export const HOUR_MIN_TRADES = 20;
export const AFTER_TARGET_MIN_DAYS = 15;

export interface ReviewTrade extends StatTrade {
  time: string; // close time
  entryTime?: string;
  checklists?: string[];
  isOnPlan?: boolean;
}

export interface RGroup {
  count: number;
  netR: number;
  avgR: number; // 0 with no trades
}

export interface TimeBlock extends RGroup {
  label: string;
  from: number; // hour, inclusive
  to: number; // hour, exclusive
}

export interface SystemReport {
  trades: number;
  firstTime: string;
  lastTime: string;
  // 1. The result
  wins: number;
  losses: number;
  bes: number;
  winRate: number; // 0..1, break-evens left out
  avgWinR: number;
  avgLossR: number; // below 0
  expectancyR: number;
  profitFactor: number;
  netR: number;
  netPnl: number;
  // 2. The same in the first and second half
  firstHalfR: number; // R per trade
  secondHalfR: number;
  // 3. How much rests on the biggest win
  largestWinR: number;
  netRWithoutLargest: number;
  // 4. The longest run of losses
  maxLossStreak: number; // trades; a break-even does not end it
  // 5. Time of day, by entry time (Bangkok clock)
  blocks: TimeBlock[];
  hours: RGroup[]; // 24, by the hour
  // 6. Trading on after the daily target; null when no target was set
  afterTarget: { daysReached: number; daysTradedOn: number; trades: number; netR: number; pnl: number } | null;
  // 7. On plan against off plan
  onPlan: RGroup;
  offPlan: RGroup;
}

const msOf = (time: string | undefined) => (time ? new Date(time.replace(' ', 'T')).getTime() : NaN);

const group = (rs: number[]): RGroup => {
  const netR = rs.reduce((a, b) => a + b, 0);
  return { count: rs.length, netR, avgR: rs.length ? netR / rs.length : 0 };
};

// The four parts of a Bangkok day, so a trend shows before single hours have enough trades.
const BLOCKS = [
  { label: 'Night', from: 0, to: 5 },
  { label: 'Morning', from: 5, to: 12 },
  { label: 'Afternoon', from: 12, to: 18 },
  { label: 'Evening', from: 18, to: 24 },
];

// The trades in order of closing, oldest first: the order "the first N trades" counts in.
export const inReviewOrder = <T extends ReviewTrade>(trades: T[]): T[] =>
  trades.filter(t => !Number.isNaN(msOf(t.time))).sort((a, b) => msOf(a.time) - msOf(b.time));

// The report on the first `n` trades of `ordered` (see inReviewOrder), or null while there are fewer.
// `targetDays` and `startHour` place each trade on its trading day for the after-target figures.
export function systemReview(ordered: ReviewTrade[], n: number, targetDays: Map<string, DayTarget> | null, startHour: number): SystemReport | null {
  if (n <= 0 || ordered.length < n) return null;
  const trades = ordered.slice(0, n);
  const s = summarizeTrades(trades);
  const rOf = (t: ReviewTrade) => t.rr || 0;

  const winRs: number[] = [], lossRs: number[] = [];
  for (const t of trades) {
    const outcome = classifyTrade(t);
    if (outcome === 'win') winRs.push(rOf(t));
    else if (outcome === 'loss') lossRs.push(rOf(t));
  }
  const netR = trades.reduce((a, t) => a + rOf(t), 0);
  const half = Math.floor(n / 2);
  const largestWinR = winRs.length ? Math.max(...winRs) : 0;

  // Time of day by entry time, as the Hour of Day chart.
  const byHour: number[][] = Array.from({ length: 24 }, () => []);
  for (const t of trades) {
    const at = new Date((t.entryTime || t.time).replace(' ', 'T'));
    if (!Number.isNaN(at.getTime())) byHour[at.getHours()].push(rOf(t));
  }
  const hours = byHour.map(group);
  const blocks = BLOCKS.map(b => ({ ...b, ...group(byHour.slice(b.from, b.to).flat()) }));

  // After the target: a trade entered after its day's target was reached. The first n trades end with the
  // n-th one closed, so a day counts as reached only if it got there by then.
  let afterTarget: SystemReport['afterTarget'] = null;
  if (targetDays && targetDays.size > 0) {
    const lastMs = msOf(trades[trades.length - 1].time);
    const days = new Set<string>();
    const reached = new Set<string>();
    const tradedOn = new Set<string>();
    let afterCount = 0, afterR = 0, afterPnl = 0;
    for (const t of trades) {
      const day = dayKeyOfTime(t.time, startHour);
      if (!day) continue;
      days.add(day);
      const target = targetDays.get(day);
      const hitMs = msOf(target?.hitAt);
      if (Number.isNaN(hitMs) || hitMs > lastMs) continue;
      reached.add(day);
      if (msOf(t.entryTime || t.time) > hitMs) {
        tradedOn.add(day);
        afterCount++;
        afterR += rOf(t);
        afterPnl = addMoney(afterPnl, t.profit || 0);
      }
    }
    const anyTarget = [...days].some(d => (targetDays.get(d)?.target ?? 0) > 0);
    if (anyTarget) afterTarget = { daysReached: reached.size, daysTradedOn: tradedOn.size, trades: afterCount, netR: afterR, pnl: afterPnl };
  }

  return {
    trades: n,
    firstTime: trades[0].time,
    lastTime: trades[trades.length - 1].time,
    wins: s.wins,
    losses: s.losses,
    bes: s.bes,
    winRate: s.winRate,
    avgWinR: group(winRs).avgR,
    avgLossR: group(lossRs).avgR,
    expectancyR: s.expectancyR,
    profitFactor: s.profitFactor,
    netR,
    netPnl: s.netProfit,
    firstHalfR: group(trades.slice(0, half).map(rOf)).avgR,
    secondHalfR: group(trades.slice(half).map(rOf)).avgR,
    largestWinR,
    netRWithoutLargest: netR - largestWinR,
    maxLossStreak: s.maxConsLossCount,
    blocks,
    hours,
    afterTarget,
    onPlan: group(trades.filter(t => isOnPlan(t)).map(rOf)),
    offPlan: group(trades.filter(t => !isOnPlan(t)).map(rOf)),
  };
}

// The phase the trade count is working towards (the next one not reached), or null once all ten are.
export const nextPhase = (count: number): number | null => REVIEW_PHASES.find(p => p > count) ?? null;

// The system's score out of 10, from the five checks that can be scored; the losing run, time of day and
// after-target checks guide how to trade rather than say how good the system is, so they are left out.
// Each part scores 0 to 1 and is weighted:
//   Expectancy      35%  R per trade: 0 R or less scores 0, 0.5 R or more scores 1, straight line between.
//   Profit factor   15%  1 or less scores 0, 2 or more scores 1, straight line between.
//   Consistency     20%  both halves above 0 scores 1, one of them 0.5, neither 0.
//   Biggest win     15%  how much of the biggest win the rest of the trades keep: net R / biggest win R,
//                        so 1 when the result stays at or above 0 without it, and 0 when the net is not above 0.
//   Discipline      15%  the share of trades on plan.
export interface ScorePart {
  key: 'expectancy' | 'profitFactor' | 'consistency' | 'biggestWin' | 'discipline';
  weight: number; // out of 10
  value: number; // 0..1
  points: number; // weight × value
}

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : v > 0 ? 1 : 0);

export function systemScore(rep: SystemReport): { total: number; parts: ScorePart[] } {
  const halvesUp = (rep.firstHalfR > 0 ? 1 : 0) + (rep.secondHalfR > 0 ? 1 : 0);
  const raw: [ScorePart['key'], number, number][] = [
    ['expectancy', 3.5, clamp01(rep.expectancyR / 0.5)],
    ['profitFactor', 1.5, clamp01(rep.profitFactor - 1)],
    ['consistency', 2, halvesUp / 2],
    ['biggestWin', 1.5, rep.netR > 0 && rep.largestWinR > 0 ? clamp01(rep.netR / rep.largestWinR) : rep.netR > 0 ? 1 : 0],
    ['discipline', 1.5, rep.trades > 0 ? rep.onPlan.count / rep.trades : 0],
  ];
  const parts = raw.map(([key, weight, value]) => ({ key, weight, value, points: weight * value }));
  return { total: parts.reduce((a, p) => a + p.points, 0), parts };
}
