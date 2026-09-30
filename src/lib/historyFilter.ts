import { classifyTrade, outcomeLabel } from './stats.ts';

// A row of the History table: a trade, or a funding entry dressed up with symbol/profit.
export interface HistoryRow {
  id: string;
  time: string;
  isFunding: boolean;
  symbol?: string;
  side?: string;
  profit?: number;
  risk?: number | string;
  resultType?: string;
  strategy?: string;
  notes?: string;
  exitTimeConfidence?: string;
}

export type ResultLabel = 'TP' | 'BE' | 'SL';

export interface HistoryFilters {
  search: string;
  kind: 'all' | 'trades' | 'funding';
  results: ResultLabel[]; // empty = any result
  side: 'all' | 'BUY' | 'SELL';
  needsCheck: boolean; // only trades whose exit time couldn't be read from the broker data
  from: string; // YYYY-MM-DD, inclusive; '' = no limit
  to: string;
}

export const EMPTY_FILTERS: HistoryFilters = {
  search: '', kind: 'all', results: [], side: 'all', needsCheck: false, from: '', to: '',
};

export const isFilterActive = (f: HistoryFilters) =>
  f.search.trim() !== '' || f.kind !== 'all' || f.results.length > 0 || f.side !== 'all' || f.needsCheck || f.from !== '' || f.to !== '';

// Local calendar date of a stored time, as YYYY-MM-DD.
const localDate = (time: string) => {
  const d = new Date(time.replace(' ', 'T'));
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export function filterHistoryRows<T extends HistoryRow>(rows: T[], f: HistoryFilters): T[] {
  const search = f.search.trim().toLowerCase();
  // Result, side and "needs check" only describe trades, so they hide funding rows.
  const tradeOnly = f.results.length > 0 || f.side !== 'all' || f.needsCheck;

  return rows.filter(row => {
    if (f.kind === 'trades' && row.isFunding) return false;
    if (f.kind === 'funding' && !row.isFunding) return false;
    if (tradeOnly && row.isFunding) return false;

    if (!row.isFunding) {
      if (f.side !== 'all' && (row.side || '').toUpperCase() !== f.side) return false;
      if (f.needsCheck && row.exitTimeConfidence !== 'uncertain') return false;
      if (f.results.length > 0 && !f.results.includes(outcomeLabel(classifyTrade(row)))) return false;
    }

    if (f.from || f.to) {
      const date = localDate(row.time);
      if (f.from && date < f.from) return false;
      if (f.to && date > f.to) return false;
    }

    if (search) {
      const haystack = `${row.symbol || ''} ${row.strategy || ''} ${row.notes || ''}`.toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });
}
