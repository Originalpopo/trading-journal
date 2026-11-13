"use client";

import { useState, useSyncExternalStore } from "react";
import { Columns3, RotateCcw } from "lucide-react";

// The History table's columns. By default each shows from a screen width up (as the table always has);
// the Columns button turns any of them on or off on top of that, remembered on this device only.
export const HISTORY_COLUMNS = [
  { key: "time", label: "Time", from: "always" },
  { key: "symbol", label: "Symbol", from: "always" },
  { key: "tf", label: "TF", from: "lg" },
  { key: "onPlan", label: "On Plan", from: "lg" },
  { key: "side", label: "Side", from: "md" },
  { key: "result", label: "Result", from: "always" },
  { key: "risk", label: "Risk", from: "lg" },
  { key: "rr", label: "RR", from: "always" },
  { key: "pnl", label: "PNL", from: "always" },
  { key: "actions", label: "Actions", from: "lg" },
] as const;
export type HistoryColumn = typeof HISTORY_COLUMNS[number]["key"];

// Time is always shown: a row needs something to tell it apart.
const LOCKED: HistoryColumn = "time";
const STORAGE_KEY = "historyColumns";
type Overrides = Partial<Record<HistoryColumn, boolean>>;

const DEFAULT_CLASS = { always: "", md: "hidden md:table-cell", lg: "hidden lg:table-cell" } as const;

// Tailwind's md and lg widths, to tell which columns the screen shows by default.
function useMinWidth(px: number) {
  const query = `(min-width: ${px}px)`;
  return useSyncExternalStore(
    onChange => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => true,
  );
}

export function useHistoryColumns() {
  const [overrides, setOverrides] = useState<Overrides>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      return saved && typeof saved === "object" ? saved : {};
    } catch { return {}; }
  });
  const isMd = useMinWidth(768);
  const isLg = useMinWidth(1024);

  const save = (next: Overrides) => {
    setOverrides(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { }
  };

  const columnOf = (key: HistoryColumn) => HISTORY_COLUMNS.find(c => c.key === key)!;
  const isShown = (key: HistoryColumn) => {
    if (key === LOCKED) return true;
    const from = columnOf(key).from;
    return overrides[key] ?? (from === "always" || (from === "md" && isMd) || (from === "lg" && isLg));
  };
  // The classes that show or hide a column's cells; left to the screen width until it is turned on or off.
  const colClass = (key: HistoryColumn) => {
    const override = key === LOCKED ? undefined : overrides[key];
    return override === undefined ? DEFAULT_CLASS[columnOf(key).from] : override ? "" : "hidden";
  };
  const toggle = (key: HistoryColumn) => {
    if (key !== LOCKED) save({ ...overrides, [key]: !isShown(key) });
  };
  const reset = () => save({});

  return { colClass, isShown, toggle, reset, isChanged: Object.keys(overrides).length > 0 };
}

type Columns = ReturnType<typeof useHistoryColumns>;

export function HistoryColumnsButton({ isOpen, onToggle }: { isOpen: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={isOpen}
      aria-label="Columns"
      title="Choose which columns to show"
      className={`flex items-center justify-center h-8 w-8 border rounded-lg transition ${
        isOpen ? "bg-accent-soft text-accent border-accent-line" : "bg-card text-ink-muted border-line hover:text-ink"
      }`}
    >
      <Columns3 className="w-3.5 h-3.5" />
    </button>
  );
}

// Opened under the buttons' row, like the filters: one toggle per column (Time, always shown, has none).
export function HistoryColumnsPanel({ columns }: { columns: Columns }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 mb-4">
      {HISTORY_COLUMNS.filter(c => c.key !== LOCKED).map(({ key, label }) => {
        const isOn = columns.isShown(key);
        return (
          <button
            key={key}
            type="button"
            onClick={() => columns.toggle(key)}
            aria-pressed={isOn}
            className={`px-2.5 py-2 md:py-1 border rounded-md text-[10px] font-black uppercase transition ${
              isOn ? "bg-accent-soft text-accent border-accent-line" : "bg-card text-ink-disabled border-line hover:text-ink-muted"
            }`}
          >
            {label}
          </button>
        );
      })}
      {columns.isChanged && (
        <button
          type="button"
          onClick={columns.reset}
          className="flex items-center gap-1 px-1.5 text-[11px] font-bold text-accent hover:text-accent-strong transition"
        >
          <RotateCcw className="w-3 h-3" /> Default
        </button>
      )}
    </div>
  );
}
