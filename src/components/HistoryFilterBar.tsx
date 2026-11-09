"use client";

import { useState, type ReactNode } from "react";
import { Search, AlertTriangle, X, SlidersHorizontal } from "lucide-react";
import { EMPTY_FILTERS, isFilterActive, type HistoryFilters, type ResultLabel } from "@/lib/historyFilter";

interface HistoryFilterBarProps {
  filters: HistoryFilters;
  onChange: (filters: HistoryFilters) => void;
  shownCount: number;
  totalCount: number;
  leading?: ReactNode; // shown before the Filter button
}

const RESULT_STYLES: Record<ResultLabel, string> = {
  TP: 'bg-accent-soft text-accent border-accent-line',
  BE: 'bg-surface-2 text-ink-muted border-line',
  SL: 'bg-loss-soft text-loss border-loss-line',
};

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex items-center bg-surface-2 p-0.5 rounded-lg">
      {options.map(opt => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`text-[11px] font-bold px-3 py-2 md:py-1 rounded-md transition ${
            value === opt.value ? 'bg-white text-ink shadow-sm' : 'text-ink-faint hover:text-ink'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export default function HistoryFilterBar({ filters, onChange, shownCount, totalCount, leading }: HistoryFilterBarProps) {
  const set = (patch: Partial<HistoryFilters>) => onChange({ ...filters, ...patch });
  const toggleResult = (r: ResultLabel) =>
    set({ results: filters.results.includes(r) ? filters.results.filter(x => x !== r) : [...filters.results, r] });
  const active = isFilterActive(filters);
  // Folded away until it is needed; filters left on stay visible on the button's row.
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="flex flex-col gap-3 mb-4">
      <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold text-ink-faint">
        {leading}
        <button
          type="button"
          onClick={() => setIsOpen(open => !open)}
          aria-expanded={isOpen}
          aria-label="Filter"
          title="Filter"
          className={`flex items-center justify-center h-8 w-8 border rounded-lg transition ${
            isOpen || active ? 'bg-accent-soft text-accent border-accent-line' : 'bg-white text-ink-muted border-line hover:text-ink'
          }`}
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
        </button>
        {/* Opened, the search and the date range sit on the button's row; the toggles go below. */}
        {isOpen && (
          <>
            <div className="relative flex-1 min-w-[180px] max-w-xs">
              <Search className="w-3.5 h-3.5 text-ink-faint absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={filters.search}
                onChange={(e) => set({ search: e.target.value })}
                placeholder="Search symbol or notes"
                className="w-full bg-surface border border-line text-ink text-xs font-semibold rounded-lg h-8 pl-8 pr-3 py-0 focus:outline-none focus:border-accent transition"
              />
            </div>
            <div className="flex items-center gap-1.5 md:gap-2 w-full md:w-auto">
              <span>From</span>
              <input
                type="date"
                value={filters.from}
                max={filters.to || undefined}
                onChange={(e) => set({ from: e.target.value })}
                className="flex-1 min-w-0 md:flex-none bg-surface border border-line rounded-lg h-8 px-2 py-0 text-ink focus:outline-none focus:border-accent"
              />
              <span>To</span>
              <input
                type="date"
                value={filters.to}
                min={filters.from || undefined}
                onChange={(e) => set({ to: e.target.value })}
                className="flex-1 min-w-0 md:flex-none bg-surface border border-line rounded-lg h-8 px-2 py-0 text-ink focus:outline-none focus:border-accent"
              />
            </div>
          </>
        )}
        {active && (
          <>
            <span className="text-ink-muted">Showing {shownCount} of {totalCount}</span>
            <button
              type="button"
              onClick={() => onChange(EMPTY_FILTERS)}
              className="flex items-center gap-1 text-accent hover:text-accent-strong transition"
            >
              <X className="w-3 h-3" /> Clear filters
            </button>
          </>
        )}
      </div>

      {isOpen && (
      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          value={filters.kind}
          onChange={(kind) => set({ kind })}
          options={[{ value: 'all', label: 'All' }, { value: 'trades', label: 'Trades' }, { value: 'funding', label: 'Funding' }]}
        />

        <div className="flex items-center gap-1">
          {(['TP', 'BE', 'SL'] as ResultLabel[]).map(r => (
            <button
              key={r}
              type="button"
              onClick={() => toggleResult(r)}
              className={`px-2.5 py-2 md:py-1 border rounded-md text-[10px] font-black uppercase transition ${
                filters.results.includes(r) ? RESULT_STYLES[r] : 'bg-white text-ink-disabled border-line hover:text-ink-muted'
              }`}
            >
              {r}
            </button>
          ))}
        </div>

        <Segmented
          value={filters.side}
          onChange={(side) => set({ side })}
          options={[{ value: 'all', label: 'Both' }, { value: 'BUY', label: 'Buy' }, { value: 'SELL', label: 'Sell' }]}
        />

        <button
          type="button"
          onClick={() => set({ needsCheck: !filters.needsCheck })}
          title="Trades whose exit time couldn't be read from the broker data"
          className={`flex items-center gap-1 px-2.5 py-2 md:py-1 border rounded-md text-[10px] font-black uppercase transition ${
            filters.needsCheck ? 'bg-loss-soft text-loss border-loss-line' : 'bg-white text-ink-disabled border-line hover:text-ink-muted'
          }`}
        >
          <AlertTriangle className="w-3 h-3" /> Check
        </button>
      </div>
      )}
    </div>
  );
}
