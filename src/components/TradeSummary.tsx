"use client";

import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { formatNumber } from "@/lib/utils";

// "03/11/2026 20:55" from a stored or form time ("2026-11-03 20:55:33", "2026-11-03T20:55:33").
const dateAndClock = (value?: string) => {
  const d = value ? new Date(value.replace(" ", "T")) : null;
  if (!d || isNaN(d.getTime())) return { date: "", clock: "" };
  return {
    date: d.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" }),
    clock: d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
  };
};

// A trade in one line: symbol, side, size, when, P&L and R. Shown as the folded bar over a trade's details,
// in the trade popup and in Edit Trade alike.
export function TradeSummaryLine({ symbol, side, size, entryTime, exitTime, pnl, rr, isPrivacyMode }: {
  symbol: string;
  side?: string;
  size?: string | number;
  entryTime?: string;
  exitTime?: string;
  pnl: number;
  rr?: number;
  isPrivacyMode: boolean;
}) {
  const entry = dateAndClock(entryTime);
  const exit = dateAndClock(exitTime);
  const tone = pnl > 0 ? "text-accent" : pnl < 0 ? "text-loss" : "text-ink-faint";
  const parts: ReactNode[] = [
    <span key="symbol" className="text-ink">{symbol.toUpperCase() || "-"}</span>,
    side && <span key="side">{side}</span>,
    size !== undefined && size !== "" && <span key="size">{size} lot</span>,
    entry.date && (
      <span key="time" className="tabular-nums">
        {entry.date} {entry.clock}{exit.clock && ` → ${exit.date && exit.date !== entry.date ? `${exit.date} ` : ""}${exit.clock}`}
      </span>
    ),
    <span key="pnl" className={`tabular-nums ${tone}`}>
      {isPrivacyMode ? "***" : `${pnl < 0 ? "-" : pnl > 0 ? "+" : ""}$${formatNumber(Math.abs(pnl))}`}
    </span>,
    rr !== undefined && rr !== 0 && <span key="rr" className={`tabular-nums ${tone}`}>{formatNumber(rr)} R</span>,
  ].filter(Boolean);
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-bold text-ink-muted normal-case tracking-normal">
      {parts.map((part, i) => (
        <span key={i} className="flex items-center gap-x-2">
          {i > 0 && <span aria-hidden="true" className="text-ink-disabled">·</span>}
          {part}
        </span>
      ))}
    </span>
  );
}

// A bar that shows `header` and folds `children` under it.
export function FoldBar({ header, isOpen, onToggle, hasError = false, children }: {
  header: ReactNode;
  isOpen: boolean;
  onToggle: () => void;
  hasError?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`border rounded-xl ${hasError ? "border-loss" : "border-line"}`}>
      <button type="button" onClick={onToggle} aria-expanded={isOpen}
        className="w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left rounded-xl hover:bg-surface transition">
        <span className="min-w-0 flex-1">{header}</span>
        <ChevronDown className={`w-4 h-4 shrink-0 text-ink-faint transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>
      {/* Open, a grey line keeps the summary apart from what it unfolds. */}
      {isOpen && <div className="mx-3 pt-3 pb-3 border-t border-line">{children}</div>}
    </div>
  );
}

