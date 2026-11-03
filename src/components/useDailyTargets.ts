"use client";

import { useMemo } from "react";
import { useJournalStore } from "@/store/useJournalStore";
import { dailyTargets, daysTradedAfterTarget, DEFAULT_TARGET_PCT } from "@/lib/dailyTarget";
import { useTradingDay } from "./useTradingDay";

// Every trading day's target and what happened after it, plus today's (before its first trade too).
export function useDailyTargets() {
  const trades = useJournalStore(state => state.trades);
  const funding = useJournalStore(state => state.funding);
  const pct = useJournalStore(state => state.preferences.dailyTargetPct) ?? DEFAULT_TARGET_PCT;
  const { startHour, today } = useTradingDay();
  const days = useMemo(() => dailyTargets(trades, funding, pct, startHour, today), [trades, funding, pct, startHour, today]);
  const tradedAfter = useMemo(() => daysTradedAfterTarget(days), [days]);
  return { days, pct, today, tradedAfter };
}
