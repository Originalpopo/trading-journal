"use client";

import { Search, AlertTriangle, X } from "lucide-react";
import { EMPTY_FILTERS, isFilterActive, type HistoryFilters, type ResultLabel } from "@/lib/historyFilter";

interface HistoryFilterBarProps {
  filters: HistoryFilters;
  onChange: (filters: HistoryFilters) => void;
  shownCount: number;
  totalCount: number;
}

const RESULT_STYLES: Record<ResultLabel, string> = {
  TP: 'bg-orange-50 text-orange-400 border-orange-200',
  BE: 'bg-stone-100 text-stone-500 border-stone-300',
  SL: 'bg-red-50 text-red-900 border-red-200',
};

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex items-center bg-stone-100 p-0.5 rounded-lg">
      {options.map(opt => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`text-[11px] font-bold px-3 py-1 rounded-md transition ${
            value === opt.value ? 'bg-white text-stone-950 shadow-sm' : 'text-stone-400 hover:text-stone-600'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export default function HistoryFilterBar({ filters, onChange, shownCount, totalCount }: HistoryFilterBarProps) {
  const set = (patch: Partial<HistoryFilters>) => onChange({ ...filters, ...patch });
  const toggleResult = (r: ResultLabel) =>
    set({ results: filters.results.includes(r) ? filters.results.filter(x => x !== r) : [...filters.results, r] });
  const active = isFilterActive(filters);

  return (
    <div className="flex flex-col gap-3 mb-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="w-3.5 h-3.5 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={filters.search}
            onChange={(e) => set({ search: e.target.value })}
            placeholder="Search symbol or notes"
            className="w-full bg-stone-50 border border-stone-200 text-stone-950 text-xs font-semibold rounded-lg pl-8 pr-3 py-2 focus:outline-none focus:border-orange-400 transition"
          />
        </div>

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
              className={`px-2.5 py-1 border rounded-md text-[10px] font-black uppercase transition ${
                filters.results.includes(r) ? RESULT_STYLES[r] : 'bg-white text-stone-300 border-stone-200 hover:text-stone-500'
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
          className={`flex items-center gap-1 px-2.5 py-1 border rounded-md text-[10px] font-black uppercase transition ${
            filters.needsCheck ? 'bg-red-50 text-red-900 border-red-200' : 'bg-white text-stone-300 border-stone-200 hover:text-stone-500'
          }`}
        >
          <AlertTriangle className="w-3 h-3" /> Check
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold text-stone-400">
        <span>From</span>
        <input
          type="date"
          value={filters.from}
          max={filters.to || undefined}
          onChange={(e) => set({ from: e.target.value })}
          className="bg-stone-50 border border-stone-200 rounded-lg px-2 py-1 text-stone-700 focus:outline-none focus:border-orange-400"
        />
        <span>To</span>
        <input
          type="date"
          value={filters.to}
          min={filters.from || undefined}
          onChange={(e) => set({ to: e.target.value })}
          className="bg-stone-50 border border-stone-200 rounded-lg px-2 py-1 text-stone-700 focus:outline-none focus:border-orange-400"
        />
        {active && (
          <>
            <span className="ml-2 text-stone-500">Showing {shownCount} of {totalCount}</span>
            <button
              type="button"
              onClick={() => onChange(EMPTY_FILTERS)}
              className="flex items-center gap-1 text-orange-400 hover:text-orange-500 transition"
            >
              <X className="w-3 h-3" /> Clear filters
            </button>
          </>
        )}
      </div>
    </div>
  );
}
