"use client";

import { useMemo, useState } from "react";
import { Coins, ArrowUp, ArrowDown } from "lucide-react";
import Link from "next/link";
import { useJournalStore } from "@/store/useJournalStore";
import { formatNumber } from "@/lib/utils";
import {
  DEFAULT_RISK_PCT, DEFAULT_RISK_STEP_UP_PCT, DEFAULT_RISK_STEP_DOWN_PCT, balanceOf, riskStep, riskHistoryOf, setRiskFrom,
} from "@/lib/riskStep";

// "2%", "1.5%": a set % without trailing zeros.
const pctText = (v: number) => `${+v.toFixed(2)}%`;

const dateText = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

// The Dashboard's risk per trade, beside today's target under Balance: the dollars to risk now (a % of the
// balance it was last set from), the balances that call for a step up or down, and once one is reached, a
// button that sets the risk from the balance now. Hidden while the % is 0 (Settings).
export default function RiskPerTrade() {
  const trades = useJournalStore(state => state.trades);
  const funding = useJournalStore(state => state.funding);
  const prefs = useJournalStore(state => state.preferences);
  const isPrivacyMode = useJournalStore(state => state.isPrivacyMode);
  const updatePreferences = useJournalStore(state => state.updatePreferences);
  const [isSaving, setIsSaving] = useState(false);

  const pct = prefs.riskPct ?? DEFAULT_RISK_PCT;
  const up = prefs.riskStepUpPct ?? DEFAULT_RISK_STEP_UP_PCT;
  const down = prefs.riskStepDownPct ?? DEFAULT_RISK_STEP_DOWN_PCT;
  const balance = useMemo(() => balanceOf(trades, funding), [trades, funding]);
  const step = riskStep(balance, pct, prefs.riskAnchor, up, down);

  if (pct <= 0 || balance <= 0) return null;

  const usd = (v: number) => (isPrivacyMode ? "***" : `$${formatNumber(v)}`);
  const setFromBalance = async () => {
    setIsSaving(true);
    try {
      await updatePreferences(setRiskFrom(balance, pct, new Date().toISOString(), riskHistoryOf(prefs.riskHistory, prefs.riskAnchor, pct)));
    } catch {
      alert("Failed to set the risk.");
    } finally {
      setIsSaving(false);
    }
  };

  const isSet = !!prefs.riskAnchor;
  const due = isSet && step.state !== "hold";
  const isUp = step.state === "up";
  // A new % in Settings is a step to take too, neither up nor down by the balance: orange, no arrow.
  const isPct = step.state === "pct";
  // The % the risk set was taken at (it stays until the risk is set again).
  const pctSet = step.anchorBalance > 0 ? (step.riskNow / step.anchorBalance) * 100 : pct;

  return (
    <div className="flex-1 px-5 py-4 md:px-6 flex flex-col gap-2 text-left border-stone-300 lg:border-l">
      {/* No card: a line on its left parts it from today's target from lg up (none once it drops under it). The dollars on top,
          the title with its % under them, both to the left like the ↑ row; what it was set from is in the tooltip. */}
      <p className="text-2xl font-black text-ink tabular-nums leading-none">{usd(step.riskNow)}</p>
      <h3
        className="mt-auto text-xs font-black uppercase tracking-[0.2em] flex items-center gap-2 whitespace-nowrap text-ink"
        title={isSet ? `${pctText(pctSet)} of ${usd(step.anchorBalance)}, set ${dateText(prefs.riskAnchor!.at)}` : `${pctText(pct)} of the balance now (% in Settings)`}
      >
        Risk per Trade
        <span className="flex items-center gap-1 text-ink-faint tracking-normal">
          <Coins className="w-4 h-4" />{pctText(isSet ? pctSet : pct)}
        </span>
      </h3>

      {!isSet && (
        <p className="text-[11px] font-semibold text-ink-faint">
          Not set yet · % in <Link href="/settings" className="font-bold text-accent hover:underline">Settings</Link>
        </p>
      )}

      {/* The balances that call for the next step, or, once one is reached, why and the button for it. */}
      {isSet && !due && (
        <div className="flex items-center gap-4 text-[11px] font-bold tabular-nums">
          <span className="flex items-center gap-1 text-accent" title={`Step up once the balance is ${pctText(up)} above ${usd(step.anchorBalance)}`}>
            <ArrowUp className="w-3.5 h-3.5" />{usd(step.upAt)}
          </span>
          {down > 0 && (
            <span className="flex items-center gap-1 text-loss" title={`Step down once the balance is ${pctText(down)} below ${usd(step.anchorBalance)}`}>
              <ArrowDown className="w-3.5 h-3.5" />{usd(step.downAt)}
            </span>
          )}
        </div>
      )}
      {due && (
        <p className={`text-[11px] font-bold ${isUp || isPct ? "text-accent" : "text-loss"}`}>
          {isPct
            ? `Risk changed to ${pctText(pct)} in Settings: set it to start using it.`
            : isUp ? `Balance ${usd(balance)} is ${pctText(up)}+ above` : `Balance ${usd(balance)} is ${pctText(down)}+ below`}
        </p>
      )}
      {(!isSet || due) && (
        <button
          type="button"
          onClick={setFromBalance}
          disabled={isSaving}
          className={`mt-auto w-full h-8 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition disabled:opacity-50 ${
            !isSet || isUp || isPct ? "bg-accent text-white hover:bg-accent-strong" : "bg-loss text-white hover:opacity-90"
          }`}
        >
          {isSet && !isPct && (isUp ? <ArrowUp className="w-3.5 h-3.5" /> : <ArrowDown className="w-3.5 h-3.5" />)}
          {!isSet || isPct ? `Set ${usd(step.riskAtBalance)}` : `Step ${isUp ? "up" : "down"} to ${usd(step.riskAtBalance)}`}
        </button>
      )}
    </div>
  );
}
