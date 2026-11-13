"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { useJournalStore } from "@/store/useJournalStore";
import { useDailyTargets } from "./useDailyTargets";
import { useTradingDay } from "./useTradingDay";
import { formatNumber } from "@/lib/utils";
import { REVIEW_PHASES, inReviewOrder, nextPhase, systemReview, systemScore, type ScorePart } from "@/lib/systemReview";

// English, as the rest of the box: "2 Nov 2026".
const dateOf = (time: string) =>
  new Date(time.replace(" ", "T")).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

const SCORE_NAMES: Record<ScorePart["key"], string> = {
  expectancy: "Expectancy",
  profitFactor: "Profit factor",
  consistency: "Consistency",
  biggestWin: "Biggest win",
  discipline: "On plan",
};

// The radar: five spokes, one per scored part, Expectancy at the top and clockwise in systemScore's order.
// Each point sits at the part's share of its full points, so a full pentagon is 10/10.
const CX = 170, CY = 150, RADIUS = 110;
const spoke = (i: number, share: number) => {
  const angle = (-90 + i * 72) * Math.PI / 180;
  return [CX + RADIUS * share * Math.cos(angle), CY + RADIUS * share * Math.sin(angle)] as const;
};
const ring = (shares: number[]) => shares.map((v, i) => spoke(i, v).map(n => n.toFixed(1)).join(",")).join(" ");
// Where each name sits, just outside its spoke's tip.
const LABEL_AT: [number, number][] = [[170, 16], [298, 102], [252, 258], [88, 258], [42, 102]];

function ScoreRadar({ parts, earlier }: { parts: ScorePart[]; earlier: { trades: number; parts: ScorePart[] } | null }) {
  const shares = parts.map(p => Math.min(1, Math.max(0, p.value)));
  // The radar stretches with the card, and its text would stretch with it; the text size is set against the
  // radar's width on screen instead, so the names stay 11px on any screen.
  const svgRef = useRef<SVGSVGElement>(null);
  const [labelSize, setLabelSize] = useState(11);
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const fit = () => { if (svg.clientWidth) setLabelSize(11 * 340 / svg.clientWidth); };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(svg);
    return () => observer.disconnect();
  }, []);
  return (
    <svg ref={svgRef} viewBox="0 0 340 285" className="w-full max-w-[440px]" role="img" aria-label={parts.map(p => `${SCORE_NAMES[p.key]} ${formatNumber(p.points)} of ${formatNumber(p.weight)}`).join(", ")}>
      {/* Only the full-score outline, white inside: no inner rings, no spokes. */}
      <polygon points={ring([1, 1, 1, 1, 1])} className="stroke-line fill-card" />
      <polygon points={ring(shares)} className="fill-accent-soft" />
      {/* The report compared against, as a faded dashed outline, so a side that grew or shrank shows at a glance. */}
      {earlier && (
        <polygon points={ring(earlier.parts.map(p => Math.min(1, Math.max(0, p.value))))} className="fill-none stroke-ink-disabled" strokeWidth={1.5} strokeDasharray="4 3" strokeLinejoin="round" />
      )}
      <polygon points={ring(shares)} className="fill-none stroke-accent" strokeWidth={2} strokeLinejoin="round" />
      {shares.map((v, i) => {
        const [x, y] = spoke(i, v);
        return <circle key={i} cx={x} cy={y} r={5} className="fill-card stroke-accent" strokeWidth={2.5} />;
      })}
      {parts.map((p, i) => (
        <text key={p.key} x={LABEL_AT[i][0]} y={LABEL_AT[i][1]} textAnchor="middle" fontSize={labelSize}>
          <tspan className="fill-ink-muted font-semibold">{SCORE_NAMES[p.key]}</tspan>
          <tspan x={LABEL_AT[i][0]} dy="1.2em" className="fill-ink-faint tabular-nums">{formatNumber(p.points)} / {formatNumber(p.weight)}</tspan>
        </text>
      ))}
    </svg>
  );
}

const FOLD_KEY = "systemReview.folded";

// The last box of the Performance page: a report on trades 1–100, 1–200, … 1–1,000, over every trade
// (the Results filters do not apply). Until 100 trades it is folded to its title and the count.
export default function SystemReview() {
  const { trades } = useJournalStore();
  const { days } = useDailyTargets();
  const { startHour } = useTradingDay();
  const ordered = useMemo(() => inReviewOrder(trades), [trades]);
  const count = ordered.length;
  const reached = REVIEW_PHASES.filter(p => p <= count);
  const next = nextPhase(count);

  const [picked, setPicked] = useState<number | null>(null);
  const phase = picked && picked <= count ? picked : reached[reached.length - 1];
  const report = useMemo(() => (phase ? systemReview(ordered, phase, days, startHour) : null), [ordered, phase, days, startHour]);
  const score = report ? systemScore(report) : null;
  // Once two reports exist, a second one is drawn faded beneath the chosen one to compare against: the latest
  // report when an older one is chosen (picking 1–100 brings it to the top, 1–200 goes beneath), and the one
  // before it when the latest is chosen.
  const latest = reached[reached.length - 1];
  const other = !phase || reached.length < 2 ? null : phase === latest ? reached[reached.length - 2] : latest;
  const earlier = useMemo(() => {
    const rep = other ? systemReview(ordered, other, days, startHour) : null;
    return other && rep ? { trades: other, parts: systemScore(rep).parts } : null;
  }, [ordered, other, days, startHour]);

  // Folds to its title with a click on it, as a Settings card. Remembered on this device only, so it stays folded
  // on the next visit; read after the first paint, since the page is built ahead without it.
  const [isOpen, setIsOpen] = useState(true);
  useEffect(() => {
    try { if (localStorage.getItem(FOLD_KEY) === "1") setIsOpen(false); } catch { /* storage blocked: stays open */ }
  }, []);
  const toggle = () => setIsOpen(open => {
    try { localStorage.setItem(FOLD_KEY, open ? "1" : "0"); } catch { /* not remembered, still folds */ }
    return !open;
  });
  const canFold = !!(report && score);

  return (
    <div className="glass-card p-4 md:p-6">
      <button
        type="button"
        onClick={toggle}
        disabled={!canFold}
        aria-expanded={canFold ? isOpen : undefined}
        className="w-full flex items-center justify-between gap-3 text-left -m-2 p-2 box-content rounded-xl enabled:hover:bg-surface transition-colors disabled:cursor-default"
      >
        <h3 className="text-xs font-black text-ink uppercase tracking-[0.2em] flex items-center gap-2 whitespace-nowrap">
          <span className="w-2 h-2 bg-accent rounded-full"></span> System Review
        </h3>
        <span className="flex items-center gap-2">
          <span className="text-xs font-bold text-ink-faint tabular-nums whitespace-nowrap" title={next ? `Next report at ${next} trades` : "All 10 reports reached"}>
            <span className="text-ink">{count}</span>{next ? ` / ${next}` : ""} trades
          </span>
          {canFold && <ChevronDown className={`w-5 h-5 shrink-0 text-ink-faint transition-transform ${isOpen ? "rotate-180" : ""}`} />}
        </span>
      </button>

      {report && score && isOpen && (
        <>
          {/* One tab per report; the ones not reached yet are shown faded. */}
          <div className="mt-4 flex bg-surface-2 p-0.5 rounded-lg overflow-x-auto [scrollbar-width:none]" role="tablist" aria-label="Report">
            {REVIEW_PHASES.map(p => (
              <button
                key={p}
                type="button"
                role="tab"
                aria-selected={p === phase}
                disabled={p > count}
                onClick={() => setPicked(p)}
                title={p > count ? `At ${p} trades` : `Report on trades 1–${p}`}
                className={`flex-1 shrink-0 h-7 min-w-12 px-2 text-[11px] font-bold rounded-md tabular-nums transition ${
                  p === phase ? "bg-card text-ink shadow-sm" : p > count ? "text-ink-disabled cursor-default" : "text-ink-faint hover:text-ink"
                }`}
              >
                {p.toLocaleString("en-US")}
              </button>
            ))}
          </div>

          {/* The score's five parts as a radar, the total beside it (below it on a phone). */}
          <div className="mt-4 flex flex-col md:flex-row items-center justify-center gap-4 md:gap-10">
            <ScoreRadar parts={score.parts} earlier={earlier} />
            <div className="text-center md:text-left">
              <p className="text-[11px] font-bold text-ink uppercase tracking-widest">System Score</p>
              <p className="text-4xl font-black tabular-nums text-accent">
                {formatNumber(score.total)}<span className="text-base font-bold text-ink-faint"> / 10</span>
              </p>
              <p className="mt-2 text-[11px] font-semibold text-ink-faint">
                Trades 1–{report.trades} · {dateOf(report.firstTime)} – {dateOf(report.lastTime)}
              </p>
              {earlier && (
                <p className="mt-1 text-[11px] font-semibold text-ink-faint flex items-center gap-1.5 justify-center md:justify-start">
                  <svg width="18" height="6" aria-hidden><line x1="0" y1="3" x2="18" y2="3" className="stroke-ink-disabled" strokeWidth={1.5} strokeDasharray="4 3" /></svg>
                  Trades 1–{earlier.trades}
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
