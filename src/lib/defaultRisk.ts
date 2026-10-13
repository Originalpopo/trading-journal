import { useJournalStore } from '@/store/useJournalStore';
import { resolveDefaultRisk } from './risk';

// 1R for trades whose initial stop is unknown: the Settings value, else the most common $ risk
// among trades whose risk is itself a default, else 0.
export function useDefaultRisk(): number {
  const preferences = useJournalStore(state => state.preferences);
  const trades = useJournalStore(state => state.trades);
  return resolveDefaultRisk(preferences.defaultRisk, trades);
}
