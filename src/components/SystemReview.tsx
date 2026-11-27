"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { useJournalStore } from "@/store/useJournalStore";
import { useDailyTargets } from "./useDailyTargets";
import { useTradingDay } from "./useTradingDay";
import { formatNumber } from "@/lib/utils";
import { REVIEW_PHASES, inReviewOrder, nextPhase, systemReview, systemScore, type ScorePart } from "@/lib/systemReview";
import { cardClass, CardTitle } from "@/components/Card";
import { Select } from "@/components/Field";

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
      {/* Its points as the chosen report's circles, in light grey; drawn first so an orange one on the same spot covers it. */}
      {earlier?.parts.map((p, i) => {
        const [x, y] = spoke(i, Math.min(1, Math.max(0, p.value)));
        return <circle key={p.key} cx={x} cy={y} r={5} className="fill-card stroke-ink-disabled" strokeWidth={2.5} />;
      })}
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

// The last box of the Performance page: a report on trades 1–100, 1–200, … 1–1,000, or on all trades so far,
// over every trade (the Results filters do not apply). Until 100 trades it is folded to its title and the count.
export default function SystemReview() {
  const { trades } = useJournalStore();
  const { days } = useDailyTargets();
  const { startHour } = useTradingDay();
  const ordered = useMemo(() => inReviewOrder(trades), [trades]);
  const count = ordered.length;
  const reached = REVIEW_PHASES.filter(p => p <= count);
  const next = nextPhase(count);

  // A phase (trades 1–N) or "all", every trade so far. Until the first phase is reached nothing is shown.
  const [picked, setPicked] = useState<number | "all" | null>(null);
  const latest = reached[reached.length - 1];
  const phase = picked === "all" ? (latest ? "all" : undefined) : picked && picked <= count ? picked : latest;
  const reportSize = phase === "all" ? count : phase;
  const report = useMemo(() => (reportSize ? systemReview(ordered, reportSize, days, startHour) : null), [ordered, reportSize, days, startHour]);
  const score = report ? systemScore(report) : null;
  // A second report is drawn faded beneath the chosen one to compare against. With a phase chosen it is always
  // All (every trade so far); when the count sits exactly on that phase All would be the same report, so the
  // phase before it is used. With All chosen it is the latest phase (or the one before, as above).
  const other = !phase
    ? null
    : phase === "all"
      ? (latest < count ? latest : reached[reached.length - 2] ?? null)
      : phase < count ? count : reached[reached.findIndex(p => p === phase) - 1] ?? null;
  const earlier = useMemo(() => {
    const rep = other ? systemReview(ordered, other, days, startHour) : null;
    return other && rep ? { trades: other, isAll: other === count, parts: systemScore(rep).parts } : null;
  }, [ordered, other, count, days, startHour]);

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
    <div className={cardClass()}>
      <button
        type="button"
        onClick={toggle}
        disabled={!canFold}
        aria-expanded={canFold ? isOpen : undefined}
        className="w-full flex items-center justify-between gap-3 text-left -m-2 p-2 box-content rounded-box enabled:hover:bg-surface transition-colors disabled:cursor-default"
      >
        <CardTitle className="whitespace-nowrap">System Review</CardTitle>
        <span className="flex items-center gap-2">
          <span className="text-small font-bold text-ink-faint tabular-nums whitespace-nowrap" title={next ? `Next report at ${next} trades` : "All 10 reports reached"}>
            <span className="text-ink">{count}</span>{next ? ` / ${next}` : ""} trades
          </span>
          {canFold && <ChevronDown className={`w-5 h-5 shrink-0 text-ink-faint transition-transform ${isOpen ? "rotate-180" : ""}`} />}
        </span>
      </button>

      {report && score && isOpen && (
        <>
          {/* Which report: the phases reached so far, then All. */}
          <div className="mt-4">
            <Select
              size="sm"
              aria-label="Report"
              value={String(phase)}
              onChange={e => setPicked(e.target.value === "all" ? "all" : Number(e.target.value))}
              className="tabular-nums"
            >
              {reached.map(p => (
                <option key={p} value={p}>Trades 1–{p.toLocaleString("en-US")}</option>
              ))}
              <option value="all">All (1–{count.toLocaleString("en-US")})</option>
            </Select>
          </div>

          {/* The score's five parts as a radar, the total beside it (below it on a phone). */}
          <div className="mt-4 flex flex-col md:flex-row items-center justify-center gap-4 md:gap-10">
            <ScoreRadar parts={score.parts} earlier={earlier} />
            <div className="text-center md:text-left">
              <p className="text-caption font-bold text-ink uppercase tracking-widest">System Score</p>
              <p className="text-display font-black tabular-nums text-accent">
                {formatNumber(score.total)}<span className="text-body font-bold text-ink-faint"> / 10</span>
              </p>
              <p className="mt-2 text-caption font-semibold text-ink-faint">
                Trades 1–{report.trades} · {dateOf(report.firstTime)} – {dateOf(report.lastTime)}
              </p>
              {earlier && (
                <p className="mt-1 text-caption font-semibold text-ink-faint flex items-center gap-1.5 justify-center md:justify-start">
                  <svg width="18" height="6" aria-hidden><line x1="0" y1="3" x2="18" y2="3" className="stroke-ink-disabled" strokeWidth={1.5} strokeDasharray="4 3" /></svg>
                  {earlier.isAll ? `All (1–${earlier.trades})` : `Trades 1–${earlier.trades}`}
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
