"use client";

import { useMemo } from "react";
import { useJournalStore } from "@/store/useJournalStore";
import { dailyTargets, daysTradedAfterTarget, pctOnDay, DEFAULT_TARGET_PCT } from "@/lib/dailyTarget";
import { useTradingDay } from "./useTradingDay";

// Every trading day's target and what happened after it, plus today's (before its first trade too).
// Each day is held to the % in force on it; a change in Settings counts from that day on.
export function useDailyTargets() {
  const trades = useJournalStore(state => state.trades);
  const funding = useJournalStore(state => state.funding);
  const pct = useJournalStore(state => state.preferences.dailyTargetPct) ?? DEFAULT_TARGET_PCT;
  const history = useJournalStore(state => state.preferences.dailyTargetHistory);
  const { startHour, today } = useTradingDay();
  const days = useMemo(
    () => dailyTargets(trades, funding, (day: string) => pctOnDay(history, day, pct), startHour, today),
    [trades, funding, pct, history, startHour, today],
  );
  const tradedAfter = useMemo(() => daysTradedAfterTarget(days), [days]);
  return { days, pct, today, tradedAfter };
}
