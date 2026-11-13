"use client";

import { useEffect, useMemo, useState } from "react";
import { Target, CalendarRange, Check, X, ChevronLeft, ChevronRight } from "lucide-react";
import { useJournalStore } from "@/store/useJournalStore";
import { useDailyTargets } from "./useDailyTargets";
import { weekdayTargets, weekTotals, type WeekdayState, type WeekdayTarget } from "@/lib/dailyTarget";
import { weekKeyOfDay } from "@/lib/weekNotes";
import { dayKey } from "@/lib/dayNotes";
import { formatNumber } from "@/lib/utils";

// Lucide's Flame, the app's logo, drawn filled at the tip of the bar.
const FLAME_PATH = "M12 3q1 4 4 6.5t3 5.5a1 1 0 0 1-14 0 5 5 0 0 1 1-3 1 1 0 0 0 5 0c0-2-1.5-3-1.5-5q0-2 2.5-4";

// The bar is marked into this many equal parts (20% each).
const SEGMENTS = 5;

const usd =(n: number) => `${n < 0 ? "-" : ""}$${formatNumber(Math.abs(n))}`;

// One bar that fills up, with a white mark every 20% so how far it has come reads at a glance. While the day
// is not above 0 after going below it, the bar grows to the left of a 0 point by the deepest it went since it was last above 0
// (`depth`, a share of the target): the whole bar is that plus the full target, split at 0 into two bars with
// a small gap between. The left one holds the deepest point and fills red, leftwards from 0, by the loss now;
// the right one is the way to the target. The marks go on every 20% of the target on both sides.
// The Calendar's week cells use it plain and thin: `isPlain` leaves out the marks and the flame.
export function SegmentBar({ share, depth, isShown, isHit, isPlain = false, heightClass = "h-4", trackClass = "bg-line" }: {
  share: number; depth: number; isShown: boolean; isHit: boolean; isPlain?: boolean; heightClass?: string; trackClass?: string;
}) {
  const loss = Math.max(0, -share);
  const total = 1 + depth;
  const at = (value: number) => `${((depth + value) * 100) / total}%`; // where a share of the target sits on the bar
  const marks = isPlain ? [] : [
    ...Array.from({ length: Math.ceil(depth * SEGMENTS) - 1 }, (_, i) => -(i + 1) / SEGMENTS).filter(v => v > -depth),
    ...Array.from({ length: SEGMENTS - 1 }, (_, i) => (i + 1) / SEGMENTS),
  ];
  return (
    <div className="relative">
      <div className={`relative ${heightClass} rounded-full overflow-hidden ${depth > 0 ? "" : trackClass}`} role="progressbar" aria-valuemin={-100} aria-valuemax={100} aria-valuenow={Math.round(share * 100)}>
        {depth > 0 ? (
          <>
            <div className={`absolute inset-y-0 left-0 rounded-full ${trackClass} overflow-hidden`} style={{ width: `calc(${at(0)} - 2px)` }}>
              <div className="absolute inset-y-0 right-0 rounded-full bg-loss transition-[width] duration-1000 ease-out motion-reduce:transition-none" style={{ width: isShown ? `${(loss * 100) / depth}%` : "0%" }} />
            </div>
            <div className={`absolute inset-y-0 right-0 rounded-full ${trackClass}`} style={{ left: `calc(${at(0)} + 2px)` }} />
          </>
        ) : (
          <div className={`h-full rounded-full bg-accent transition-[width] duration-1000 ease-out motion-reduce:transition-none ${isHit ? "shadow-[0_0_8px_color-mix(in_srgb,var(--accent)_60%,transparent)]" : ""}`} style={{ width: `${isShown ? share * 100 : 0}%` }} />
        )}
        {marks.map(v => (
          <span key={v} aria-hidden="true" className="absolute top-1 bottom-1 w-0.5 -translate-x-1/2 rounded-full bg-card" style={{ left: at(v) }} />
        ))}
      </div>
      {/* The app's flame, lit at the tip of the orange fill: a reward shown only while the bar is past its last mark
          (over 80% of the target). It lights once the fill has grown to it, then moves with the tip, and stays at
          the end once the target is reached. Trading the profit back to 80% or below puts it out. */}
      {!isPlain && share > (SEGMENTS - 1) / SEGMENTS && (
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          style={{ left: `${Math.min(share, 1) * 100}%` }}
          className="flame-light absolute top-1/2 w-7 h-7 -translate-x-1/2 -translate-y-[60%] overflow-visible pointer-events-none drop-shadow-[0_1px_2px_color-mix(in_srgb,var(--accent)_45%,transparent)] transition-[left] duration-1000 ease-out motion-reduce:transition-none"
        >
          {/* A white edge under the flame keeps it apart from the orange bar behind it. */}
          <g className="flame-outer" strokeLinejoin="round">
            <path className="fill-white stroke-white" strokeWidth={4.5} d={FLAME_PATH} />
            <path className="fill-accent stroke-accent" strokeWidth={1.5} d={FLAME_PATH} />
          </g>
          <path
            className="flame-inner fill-accent-soft"
            d="M12 20.5a3.2 3.2 0 0 1-3.2-3.2c0-1.8 1.3-2.9 2.1-4.4.3 1 1.1 1.8 2 2.4 1.3.8 2.3 1.6 2.3 3a3.2 3.2 0 0 1-3.2 2.2z"
          />
        </svg>
      )}
    </div>
  );
}

const dayTitle = (date: string, target: number | undefined, pnl: number | undefined, isPrivacyMode: boolean) => {
  const when = new Date(`${date}T00:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  if (target === undefined) return when;
  // The day's P&L comes before its target; privacy mode shows neither in dollars.
  const pnlLine = isPrivacyMode ? "" : `
PnL: ${usd(pnl ?? 0)}`;
  if (target <= 0) return `${when}${pnlLine}
No target`;
  return isPrivacyMode
    ? `${when}
Target reached: ${Math.round(((pnl ?? 0) / target) * 100)}%`
    : `${when}${pnlLine}
Target: ${usd(target)}`;
};

const weekdayName = (date: string) => new Date(`${date}T00:00:00`).toLocaleDateString("en-US", { weekday: "short" });

// One circle per trading day of the week (Monday to Friday, plus a weekend day that was traded): orange with a tick once the day reached its target, an empty orange ring for
// today still going, an orange ring with a cross for a day traded that ended short (red when it also ended
// below zero), an empty grey dashed ring
// for a day with no trade at all, and an empty grey ring for days to come.
// Pointing at a circle shows its date and, for a day with a target, that target (its % while in privacy mode).
function WeekSteps({ steps, isPrivacyMode }: { steps: WeekdayTarget[]; isPrivacyMode: boolean }) {
  const circle: Record<WeekdayState, string> = {
    hit: "bg-accent text-white",
    today: "border-2 border-accent bg-card",
    missed: "border-2 border-accent bg-card text-accent",
    noTrades: "border-2 border-dashed border-ink-disabled bg-surface",
    upcoming: "border-2 border-line",
  };
  return (
    <div className="flex items-center pb-4">
      {steps.map(({ date, state, target, pnl }, i) => {
        const isLoss = state === "missed" && (pnl ?? 0) < 0;
        return (
        <div key={date} className={`flex items-center ${i > 0 ? "flex-1" : ""}`}>
          {/* The line into a day is orange once that day has come. */}
          {i > 0 && <div className={`flex-1 h-0.5 mx-1 rounded-full ${state === "upcoming" ? "bg-line" : "bg-accent"}`} />}
          <div className={`relative w-6 h-6 shrink-0 rounded-full flex items-center justify-center ${isLoss ? "border-2 border-loss bg-card text-loss" : circle[state]}`} title={dayTitle(date, target, pnl, isPrivacyMode)}>
            {state === "hit" && <Check className="w-3.5 h-3.5" strokeWidth={3} />}
            {state === "missed" && <X className="w-3 h-3" strokeWidth={3} />}
            <span className={`absolute top-full mt-1 left-1/2 -translate-x-1/2 text-[10px] font-bold ${state === "today" ? "text-accent" : "text-ink-faint"}`}>
              {weekdayName(date)}
            </span>
          </div>
        </div>
        );
      })}
    </div>
  );
}

// Today's progress to the daily target, as a bar that fills up, with which days of this week reached
// theirs under it. Hidden while the target is off or the account has no balance to take a share of.
export default function DailyTargetBar() {
  const isPrivacyMode = useJournalStore(state => state.isPrivacyMode);
  const { days, pct, today } = useDailyTargets();
  // The week row shows this week, or the one before it (no further back) with the arrows.
  const [isLastWeek, setIsLastWeek] = useState(false);
  const week = useMemo(() => {
    const sunday = new Date(`${weekKeyOfDay(today)}T00:00:00`);
    if (isLastWeek) sunday.setDate(sunday.getDate() - 7);
    return weekdayTargets(days, today, dayKey(sunday));
  }, [days, today, isLastWeek]);
  const day = days.get(today);
  const hasBar = !!day && day.target > 0;

  // The bar starts empty and fills up to today's share once it is on screen, alongside the charts' own
  // opening animation.
  const [isFilled, setIsFilled] = useState(false);
  useEffect(() => {
    if (!hasBar || isFilled) return;
    const frame = requestAnimationFrame(() => setIsFilled(true));
    return () => cancelAnimationFrame(frame);
  }, [hasBar, isFilled]);

  if (!day || !hasBar) return null;

  const isHit = !!day.hitAt;
  // Below 0 on a losing day, down to -1 (a loss as large as the target); the figures show the full amount.
  const share = Math.max(-1, Math.min(1, day.pnl / day.target));
  // How deep the day went below 0, held until it is above 0 again (also within -1).
  const depth = day.pnl > 0 ? 0 : Math.min(1, Math.max(-share, -day.lowPnl / day.target));
  const percentText = `${Math.round((day.pnl / day.target) * 100)}%`;

  // The week's P&L against the sum of its days' targets up to today. Days with no trade at all have no
  // target and are left out: a day off is not a day short of the target.
  const weekSum = weekTotals(week);
  const isWeekHit = weekSum.target > 0 && weekSum.pnl >= weekSum.target;
  const weekPercentText = weekSum.target > 0 ? `${Math.round((weekSum.pnl / weekSum.target) * 100)}%` : "0%";

  // Title, bar and figures share their widths between the two lines, so the two bars line up on a computer.
  const titleClass = "order-1 md:w-44 text-xs font-black uppercase tracking-[0.2em] flex items-center gap-2 whitespace-nowrap";
  const figuresClass = "order-2 md:order-3 ml-auto md:ml-0 md:min-w-28 text-right text-xs font-black tabular-nums whitespace-nowrap";
  const figures = (pnl: number, target: number, hit: boolean, percent: string) =>
    isPrivacyMode ? (
      <span className={hit ? "text-accent" : pnl < 0 ? "text-loss" : "text-ink"}>{percent}</span>
    ) : (
      <>
        <span className={pnl > 0 ? "text-accent" : pnl < 0 ? "text-loss" : "text-ink"}>{usd(pnl)}</span>
        <span className="text-ink-faint"> / {usd(target)}</span>
      </>
    );

  return (
    <div className="flex-1 px-5 py-4 md:px-6" title={`Target: ${pct}% of the balance the day started with${isPrivacyMode ? "" : ` (${usd(day.startBalance)})`}`}>
      {/* One line on a computer: title, bar, figures. On a phone the bar takes a line of its own. */}
      <div className="flex flex-wrap md:flex-nowrap items-center gap-x-5 gap-y-2.5">
        {/* The title turns orange once the target is reached. */}
        <h3 className={`${titleClass} ${isHit ? "text-accent" : "text-ink"}`}>
          <Target className={`w-4 h-4 ${isHit ? "text-accent" : "text-ink-faint"}`} />
          Today&apos;s target
        </h3>
        <span className={figuresClass}>{figures(day.pnl, day.target, isHit, percentText)}</span>
        <div className="order-3 md:order-2 w-full md:w-auto md:flex-1">
          <SegmentBar share={share} depth={depth} isShown={isFilled} isHit={isHit} />
        </div>
      </div>


      {/* Which days of the week reached their target, always under the day's line. The arrows step between
          this week and last week. On a computer they sit in the gaps beside the circles, so the circles keep
          the day bar's width; on a phone they sit at the ends of the circles' own line. */}
      <div className="mt-6 flex flex-wrap md:flex-nowrap items-center gap-x-5 gap-y-2.5">
        <h3 className={`${titleClass} ${isWeekHit ? "text-accent" : "text-ink"}`}>
          <CalendarRange className={`w-4 h-4 ${isWeekHit ? "text-accent" : "text-ink-faint"}`} />
          {isLastWeek ? "Last week" : "This week"}
        </h3>
        <span className={figuresClass}>
          {weekSum.days === 0 ? (
            <span className="text-ink-faint">No trades</span>
          ) : (
            figures(weekSum.pnl, weekSum.target, isWeekHit, weekPercentText)
          )}
        </span>
        <div className="order-3 md:order-2 w-full md:w-auto md:flex-1 flex items-start gap-1.5 md:block md:relative">
          {([
            { label: "Show last week", Icon: ChevronLeft, isEnabled: !isLastWeek, side: "md:right-full", go: true },
            { label: "Show this week", Icon: ChevronRight, isEnabled: isLastWeek, side: "md:left-full md:order-none order-last", go: false },
          ] as const).map(({ label, Icon, isEnabled, side, go }) => (
            <button
              key={label}
              type="button"
              aria-label={label}
              disabled={!isEnabled}
              onClick={() => setIsLastWeek(go)}
              className={`${side} md:absolute md:top-0 h-6 w-5 shrink-0 flex items-center justify-center rounded-md transition-colors ${
                isEnabled ? "text-ink-faint hover:text-ink hover:bg-surface-2" : "text-ink-disabled cursor-default"
              }`}
            >
              <Icon className="w-4 h-4" strokeWidth={2.5} />
            </button>
          ))}
          <div className="flex-1">
            <WeekSteps steps={week} isPrivacyMode={isPrivacyMode} />
          </div>
        </div>
      </div>
    </div>
  );
}
