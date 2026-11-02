"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Flame, XCircle } from "lucide-react";
import { useJournalStore } from "@/store/useJournalStore";
import { dayKey } from "@/lib/dayNotes";
import { planCost, ruleCounts, disciplineStreak, type PlanSide } from "@/lib/discipline";
import { formatNumber } from "@/lib/utils";

type Period = "month" | "all";

const toneOf = (n: number) => (n > 0 ? "text-orange-400" : n < 0 ? "text-red-900" : "text-stone-400");

// "$12.40 · 1.20 R", or the R alone in privacy mode.
function SideResult({ side, isPrivacyMode }: { side: PlanSide; isPrivacyMode: boolean }) {
  return (
    <span className="tabular-nums">
      {!isPrivacyMode && <span className={toneOf(side.pnl)}>{side.pnl < 0 ? "-" : ""}${formatNumber(Math.abs(side.pnl))}</span>}
      {!isPrivacyMode && <span className="text-stone-300"> · </span>}
      <span className={toneOf(side.rr)}>{formatNumber(side.rr)} R</span>
    </span>
  );
}

// The top of the Notes page: clean days in a row, what trading off plan cost, and the rules broken most.
export default function DisciplineSummary() {
  const { trades, dayNotes, preferences, isPrivacyMode } = useJournalStore();
  const rules = useMemo(() => preferences.disciplineRules ?? [], [preferences.disciplineRules]);
  const [period, setPeriod] = useState<Period>("month");

  const from = useMemo(() => {
    if (period === "all") return undefined;
    const now = new Date();
    return dayKey(new Date(now.getFullYear(), now.getMonth(), 1));
  }, [period]);

  const streak = useMemo(() => disciplineStreak(trades, dayNotes), [trades, dayNotes]);
  const cost = useMemo(() => planCost(trades, from), [trades, from]);
  const broken = useMemo(() => ruleCounts(dayNotes, rules, from).slice(0, 3), [dayNotes, rules, from]);
  const mostBroken = broken[0]?.count ?? 0;

  return (
    <div className="bg-white rounded-2xl shadow-sm p-4 md:p-5">
      <div className="flex items-center justify-between gap-2 mb-4">
        <h3 className="text-[10px] font-black text-orange-400 uppercase tracking-widest">Discipline</h3>
        <div className="flex bg-stone-100 rounded-lg p-0.5">
          {([["month", "This month"], ["all", "All time"]] as const).map(([value, label]) => (
            <button key={value} type="button" onClick={() => setPeriod(value)}
              className={`h-7 px-3 text-[11px] font-bold rounded-md transition ${period === value ? "bg-white text-orange-400 shadow-sm" : "text-stone-400 hover:text-stone-600"}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="bg-stone-50 rounded-xl p-4" title="Trading days in a row with every trade on plan and no rule broken. Days without trades are skipped.">
          <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1">On plan in a row</p>
          <p className="flex items-center gap-2 text-2xl font-black text-stone-950">
            <Flame className={`w-6 h-6 ${streak.current > 0 ? "text-orange-400" : "text-stone-300"}`} />
            {streak.current} <span className="text-sm font-bold text-stone-400">{streak.current === 1 ? "day" : "days"}</span>
          </p>
          <p className="text-[11px] font-semibold text-stone-400 mt-1">Best: {streak.best} {streak.best === 1 ? "day" : "days"} · all time</p>
        </div>

        <div className="bg-stone-50 rounded-xl p-4">
          <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1">Off plan</p>
          {cost.offPlan.count === 0 ? (
            <p className="text-sm font-bold text-stone-400 mt-2">{cost.onPlan.count === 0 ? "No trades yet" : "Every trade on plan"}</p>
          ) : (
            <>
              <p className="text-lg font-black"><SideResult side={cost.offPlan} isPrivacyMode={isPrivacyMode} /></p>
              <p className="text-[11px] font-semibold text-stone-400 mt-1">{cost.offPlan.count} of {cost.offPlan.count + cost.onPlan.count} trades</p>
            </>
          )}
          {cost.onPlan.count > 0 && (
            <p className="text-[11px] font-semibold text-stone-400 mt-1">On plan: <SideResult side={cost.onPlan} isPrivacyMode={isPrivacyMode} /></p>
          )}
        </div>

        <div className="bg-stone-50 rounded-xl p-4">
          <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-2">Rules broken most</p>
          {rules.length === 0 ? (
            <p className="text-[11px] font-medium text-stone-400">
              <Link href="/settings" className="font-bold text-orange-400 hover:underline">Set your trading rules</Link>, then tick the ones you broke in a day&apos;s note.
            </p>
          ) : broken.length === 0 ? (
            <p className="text-sm font-bold text-stone-400">None broken</p>
          ) : (
            <ul className="space-y-2">
              {broken.map(({ rule, count }) => (
                <li key={rule.id}>
                  <div className="flex items-center gap-1.5 text-xs font-bold text-red-900">
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
