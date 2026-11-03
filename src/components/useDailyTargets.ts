"use client";

import { useMemo } from "react";
import { useJournalStore } from "@/store/useJournalStore";
import { dailyTargets, daysTradedAfterTarget, pctOnDay, DEFAULT_TARGET_PCT } from "@/lib/dailyTarget";
import { useTradingDay } from "./useTradingDay";

// Every trading day's target and what happened after it, plus today's (before its first trade too).
// Each day is held to the % in force on it, or to the % set now when Settings says so.
export function useDailyTargets() {
  const trades = useJournalStore(state => state.trades);
  const funding = useJournalStore(state => state.funding);
  const pct = useJournalStore(state => state.preferences.dailyTargetPct) ?? DEFAULT_TARGET_PCT;
  const history = useJournalStore(state => state.preferences.dailyTargetHistory);
  const isByHistory = useJournalStore(state => state.preferences.dailyTargetMode) !== "current";
  const { startHour, today } = useTradingDay();
  const days = useMemo(
    () => dailyTargets(trades, funding, isByHistory ? (day: string) => pctOnDay(history, day, pct) : pct, startHour, today),
    [trades, funding, pct, history, isByHistory, startHour, today],
  );
  const tradedAfter = useMemo(() => daysTradedAfterTarget(days), [days]);
  return { days, pct, today, tradedAfter };
}
