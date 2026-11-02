"use client";

import { Target, AlertTriangle } from "lucide-react";
import { useJournalStore } from "@/store/useJournalStore";
import { useDailyTargets } from "./useDailyTargets";
import { formatNumber } from "@/lib/utils";

const usd = (n: number) => `${n < 0 ? "-" : ""}$${formatNumber(Math.abs(n))}`;

// Today's progress to the daily target, as a bar that fills up. Hidden while the target is off or the
// account has no balance to take a share of.
export default function DailyTargetBar() {
  const isPrivacyMode = useJournalStore(state => state.isPrivacyMode);
  const { days, pct, today } = useDailyTargets();
  const day = days.get(today);
  if (!day || day.target <= 0) return null;

  const isHit = !!day.hitAt;
  const share = Math.max(0, Math.min(1, day.pnl / day.target));
  const percentText = `${Math.round(Math.max(0, day.pnl / day.target) * 100)}%`;

  return (
    <div className="glass-card px-5 py-4 md:px-6" title={`Target: ${pct}% of the balance the day started with${isPrivacyMode ? "" : ` (${usd(day.startBalance)})`}`}>
      {/* One line on a computer: title, bar, figures. On a phone the bar takes a line of its own. */}
      <div className="flex flex-wrap md:flex-nowrap items-center gap-x-5 gap-y-2.5">
        <h3 className="order-1 text-xs font-black text-stone-950 uppercase tracking-[0.2em] flex items-center gap-2 whitespace-nowrap">
          <Target className={`w-4 h-4 ${isHit ? "text-orange-400" : "text-stone-400"}`} />
          {isHit ? "Target reached" : "Today's target"}
        </h3>
        <span className="order-2 md:order-3 ml-auto md:ml-0 text-xs font-black tabular-nums whitespace-nowrap">
          {isPrivacyMode ? (
            <span className={isHit ? "text-orange-400" : "text-stone-950"}>{percentText}</span>
          ) : (
            <>
              <span className={day.pnl > 0 ? "text-orange-400" : day.pnl < 0 ? "text-red-900" : "text-stone-950"}>{usd(day.pnl)}</span>
              <span className="text-stone-400"> / {usd(day.target)}</span>
            </>
          )}
        </span>
        <div className="order-3 md:order-2 w-full md:w-auto md:flex-1 h-4 rounded-full bg-stone-100 overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(share * 100)}>
          <div className={`h-full rounded-full bg-orange-400 transition-[width] duration-700 ease-out ${isHit ? "shadow-[0_0_8px_rgba(251,146,60,0.6)]" : ""}`} style={{ width: `${share * 100}%` }} />
        </div>
      </div>

      {isHit && (
        <p className={`mt-2 text-[11px] font-bold flex items-center gap-1.5 ${day.afterCount > 0 ? "text-red-900" : "text-orange-400"}`}>
          {day.afterCount > 0 ? (
            <>
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              Traded after the target: {day.afterCount} {day.afterCount === 1 ? "trade" : "trades"}
              {!isPrivacyMode && <>, {usd(day.afterPnl)}</>} · {formatNumber(day.afterRr)} R
            </>
          ) : (
            <>Stop for today. Setups after this are not for today.</>
          )}
        </p>
      )}
    </div>
  );
}
