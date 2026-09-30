import { useJournalStore } from '@/store/useJournalStore';
import { mostCommonRisk } from './risk';

// 1R for trades whose initial stop is unknown: the Settings value, else the most common $ risk
// among trades whose risk was itself a default (or set before stops were used), else 0.
export function useDefaultRisk(): number {
  const preferences = useJournalStore(state => state.preferences);
  const trades = useJournalStore(state => state.trades);
  if (preferences.defaultRisk && preferences.defaultRisk > 0) return preferences.defaultRisk;
  return mostCommonRisk(trades.filter(t => t.riskIsEstimate !== false)) ?? 0;
}
