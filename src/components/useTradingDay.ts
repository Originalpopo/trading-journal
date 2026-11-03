"use client";

import { useJournalStore } from "@/store/useJournalStore";
import { DEFAULT_DAY_START_HOUR, tradingDayOf } from "@/lib/dayNotes";

// The hour a trading day starts (Settings), and today as a trading day: before that hour it is still yesterday.
export function useTradingDay() {
  const startHour = useJournalStore(state => state.preferences.dayStartHour) ?? DEFAULT_DAY_START_HOUR;
  return { startHour, today: tradingDayOf(new Date(), startHour) };
}
