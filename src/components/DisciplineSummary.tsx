"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Flame, XCircle } from "lucide-react";
import { useJournalStore } from "@/store/useJournalStore";
import { planCost, ruleCounts, disciplineStreak, type PlanSide } from "@/lib/discipline";
import { formatNumber } from "@/lib/utils";
import { summarizeTargets } from "@/lib/dailyTarget";
import { useDailyTargets } from "./useDailyTargets";
import { useTradingDay } from "./useTradingDay";

type Period = "month" | "all";

const toneOf = (n: number) => (n > 0 ? "text-accent" : n < 0 ? "text-loss" : "text-ink-faint");

// "$12.40 · 1.20 R", or the R alone in privacy mode.
function SideResult({ side, isPrivacyMode }: { side: PlanSide; isPrivacyMode: boolean }) {
  return (
    <span className="tabular-nums">
      {!isPrivacyMode && <span className={toneOf(side.pnl)}>{side.pnl < 0 ? "-" : ""}${formatNumber(Math.abs(side.pnl))}</span>}
      {!isPrivacyMode && <span className="text-ink-disabled"> · </span>}
      <span className={toneOf(side.rr)}>{formatNumber(side.rr)} R</span>
    </span>
  );
}

// The top of the Notes page: clean days in a row, what trading off plan cost, and the rules broken most.
export default function DisciplineSummary() {
  const { trades, dayNotes, preferences, isPrivacyMode } = useJournalStore();
  const rules = useMemo(() => preferences.disciplineRules ?? [], [preferences.disciplineRules]);
  const [period, setPeriod] = useState<Period>("month");

  // The month starts on the 1st of the trading day's month ("YYYY-MM-01").
  const { startHour, today } = useTradingDay();
  const from = period === "all" ? undefined : `${today.slice(0, 8)}01`;

  const { days, pct } = useDailyTargets();
  // Trading on after the daily target does not break the streak: whether it pays is being measured (below).
  const streak = useMemo(() => disciplineStreak(trades, dayNotes, startHour), [trades, dayNotes, startHour]);
  const target = useMemo(() => summarizeTargets(days, from), [days, from]);
  const cost = useMemo(() => planCost(trades, startHour, from), [trades, startHour, from]);
  const broken = useMemo(() => ruleCounts(dayNotes, rules, from).slice(0, 3), [dayNotes, rules, from]);
  const mostBroken = broken[0]?.count ?? 0;

  return (
    <div className="bg-white rounded-2xl shadow-sm p-4 md:p-5">
      <div className="flex items-center justify-between gap-2 mb-4">
        <h3 className="text-[10px] font-black text-accent uppercase tracking-widest">Discipline</h3>
        <div className="flex bg-surface-2 rounded-lg p-0.5">
          {([["month", "This month"], ["all", "All time"]] as const).map(([value, label]) => (
            <button key={value} type="button" onClick={() => setPeriod(value)}
              className={`h-7 px-3 text-[11px] font-bold rounded-md transition ${period === value ? "bg-white text-accent shadow-sm" : "text-ink-faint hover:text-stone-600"}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        <div className="bg-surface rounded-xl p-4" title="Trading days in a row with every trade on plan, no rule broken. Days without trades are skipped.">
          <p className="text-[10px] font-bold text-ink-faint uppercase tracking-widest mb-1">On plan in a row</p>
          <p className="flex items-center gap-2 text-2xl font-black text-ink">
            <Flame className={`w-6 h-6 ${streak.current > 0 ? "text-accent" : "text-ink-disabled"}`} />
            {streak.current} <span className="text-sm font-bold text-ink-faint">{streak.current === 1 ? "day" : "days"}</span>
          </p>
          <p className="text-[11px] font-semibold text-ink-faint mt-1">Best: {streak.best} {streak.best === 1 ? "day" : "days"} · all time</p>
        </div>

        <div className="bg-surface rounded-xl p-4">
          <p className="text-[10px] font-bold text-ink-faint uppercase tracking-widest mb-1">Off plan</p>
          {cost.offPlan.count === 0 ? (
            <p className="text-sm font-bold text-ink-faint mt-2">{cost.onPlan.count === 0 ? "No trades yet" : "Every trade on plan"}</p>
          ) : (
            <>
              <p className="text-lg font-black"><SideResult side={cost.offPlan} isPrivacyMode={isPrivacyMode} /></p>
              <p className="text-[11px] font-semibold text-ink-faint mt-1">{cost.offPlan.count} of {cost.offPlan.count + cost.onPlan.count} trades</p>
            </>
          )}
          {cost.onPlan.count > 0 && (
            <p className="text-[11px] font-semibold text-ink-faint mt-1">On plan: <SideResult side={cost.onPlan} isPrivacyMode={isPrivacyMode} /></p>
          )}
        </div>

        <div className="bg-surface rounded-xl p-4" title={`Daily target: ${pct}% of the balance each day started with (Settings)`}>
          <p className="text-[10px] font-bold text-ink-faint uppercase tracking-widest mb-1">Daily target</p>
          {pct <= 0 ? (
            <p className="text-[11px] font-medium text-ink-faint mt-2">
              Off. <Link href="/settings" className="font-bold text-accent hover:underline">Set a daily target</Link> to see what trading on after it brings.
            </p>
          ) : target.hitDays === 0 ? (
            <p className="text-sm font-bold text-ink-faint mt-2">Not reached yet</p>
          ) : (
            <>
              {/* Plain figures, not a warning: what the trades taken after the target brought, to judge whether
                  stopping there pays. */}
              <p className="text-lg font-black text-ink">
                {target.hitDays} <span className="text-sm font-bold text-ink-faint">{target.hitDays === 1 ? "day" : "days"} reached</span>
              </p>
              <p className="text-[11px] font-semibold text-ink-faint mt-1">
                {target.afterCount > 0 ? (
                  <>
                    After the target: {target.afterCount} {target.afterCount === 1 ? "trade" : "trades"} on {target.continuedDays} {target.continuedDays === 1 ? "day" : "days"},{" "}
                    <SideResult side={{ count: target.afterCount, pnl: target.afterPnl, rr: target.afterRr }} isPrivacyMode={isPrivacyMode} />
                  </>
                ) : (
                  "No trades after the target"
                )}
              </p>
            </>
          )}
        </div>

        <div className="bg-surface rounded-xl p-4">
          <p className="text-[10px] font-bold text-ink-faint uppercase tracking-widest mb-2">Rules broken most</p>
          {rules.length === 0 ? (
            <p className="text-[11px] font-medium text-ink-faint">
              <Link href="/settings" className="font-bold text-accent hover:underline">Set your trading rules</Link>, then tick the ones you broke in a day&apos;s note.
            </p>
          ) : broken.length === 0 ? (
            <p className="text-sm font-bold text-ink-faint">None broken</p>
          ) : (
            <ul className="space-y-2">
              {broken.map(({ rule, count }) => (
                <li key={rule.id}>
                  <div className="flex items-center gap-1.5 text-xs font-bold text-loss">
                    <XCircle className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{rule.name}</span>
                    <span className="ml-auto tabular-nums shrink-0">{count}×</span>
                  </div>
                  <div className="h-1 rounded-full bg-stone-200 mt-1">
                    <div className="h-1 rounded-full bg-red-900/70" style={{ width: `${(count / mostBroken) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
