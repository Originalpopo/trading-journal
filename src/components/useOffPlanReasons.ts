"use client";

import { useJournalStore } from "@/store/useJournalStore";
import { reasonsOrDefault } from "@/lib/offPlan";

// The Off Plan reasons from Settings, or the starting list until the user saves their own.
export function useOffPlanReasons() {
  return reasonsOrDefault(useJournalStore(state => state.preferences.offPlanReasons));
}
