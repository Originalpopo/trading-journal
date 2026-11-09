"use client";

import { useMemo } from "react";
import { useJournalStore } from "@/store/useJournalStore";
import { DEFAULT_DAY_START_HOUR, tradingDayOf, type DayStart } from "@/lib/dayNotes";
import { valueAt } from "@/lib/settingHistory";

// The hour trading days start (Settings), and today as a trading day: before that hour it is still yesterday.
// `startHour` gives each day the hour it started at then, so a change never moves a trade out of a past day;
// `hourNow` is the hour set now, for what the pages say about it.
export function useTradingDay() {
  const hourNow = useJournalStore(state => state.preferences.dayStartHour) ?? DEFAULT_DAY_START_HOUR;
  const history = useJournalStore(state => state.preferences.dayStartHistory);
  const startHour = useMemo<DayStart>(
    () => (history?.length ? (day: string) => valueAt(history, new Date(`${day}T00:00:00`).getTime(), hourNow) : hourNow),
    [history, hourNow],
  );
  return { startHour, hourNow, today: tradingDayOf(new Date(), startHour) };
}
