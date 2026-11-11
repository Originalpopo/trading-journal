"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { useJournalStore } from "@/store/useJournalStore";
import { useDailyTargets } from "./useDailyTargets";
import { useTradingDay } from "./useTradingDay";
import { formatNumber } from "@/lib/utils";
import {
  REVIEW_PHASES, HOUR_MIN_TRADES, AFTER_TARGET_MIN_DAYS,
  inReviewOrder, nextPhase, systemReview, systemScore, type SystemReport, type ScorePart,
} from "@/lib/systemReview";

type Status = "good" | "bad" | "wait";

const STATUS_DOT: Record<Status, string> = { good: "bg-accent", bad: "bg-loss", wait: "bg-ink-disabled" };
const STATUS_TEXT: Record<Status, string> = { good: "text-accent", bad: "text-loss", wait: "text-ink-muted" };

const r = (v: number) => `${formatNumber(v)} R`;
const tone = (v: number) => (v > 0 ? "text-accent" : v < 0 ? "text-loss" : "text-ink-faint");
const hourName = (h: number) => `${String(h).padStart(2, "0")}:00`;
// Thai month names, Western year: "2 พ.ย. 2026".
const dateOf = (time: string) =>
  new Date(time.replace(" ", "T")).toLocaleDateString("th-TH-u-ca-gregory", { day: "numeric", month: "short", year: "numeric" });

const BLOCK_NAMES: Record<string, string> = { Night: "กลางคืน", Morning: "เช้า", Afternoon: "บ่าย", Evening: "ค่ำ" };

const SCORE_NAMES: Record<ScorePart["key"], string> = {
  expectancy: "Expectancy",
  profitFactor: "Profit factor",
  consistency: "Consistency",
  biggestWin: "Biggest Win",
  discipline: "On Plan",
};

const scoreVerdict = (total: number) =>
  total >= 8 ? "ระบบแข็งแรง"
    : total >= 6 ? "ระบบดี แต่ยังมีจุดที่ต้องดู"
      : total >= 4 ? "ยังไม่ชัดเจน ต้องเก็บข้อมูลเพิ่ม"
        : "ระบบยังไม่ได้เปรียบ";

interface Item {
  title: string;
  status: Status;
  verdict: string;
  figures: { label: string; value: string; className?: string }[];
}

// The seven checks of one report, each with a verdict once there is enough behind it.
function itemsOf(rep: SystemReport, isPrivacyMode: boolean): Item[] {
  const half = Math.floor(rep.trades / 2);
  const money = (v: number) => (isPrivacyMode ? "***" : `${v < 0 ? "-" : ""}$${formatNumber(Math.abs(v))}`);

  // 5. Time of day: a verdict only on hours with enough trades.
  const byHour = rep.hours.map((h, hour) => ({ ...h, hour }));
  const ready = byHour.filter(h => h.count >= HOUR_MIN_TRADES);
  const busiest = [...byHour].sort((a, b) => b.count - a.count)[0];
  const worst = [...ready].sort((a, b) => a.avgR - b.avgR)[0];
  const best = [...ready].sort((a, b) => b.avgR - a.avgR)[0];
  const timeItem: Item = {
    title: "Time of Day",
    ...(!ready.length
      ? { status: "wait" as const, verdict: `ยังไม่มีชั่วโมงไหนครบ ${HOUR_MIN_TRADES} เทรด (มากสุด ${busiest.count} เทรด ตอน ${hourName(busiest.hour)}) ดูแนวโน้มจาก 4 ช่วงของวันด้านล่างไปก่อน` }
      : worst.avgR < 0
        ? { status: "bad" as const, verdict: `ชั่วโมงที่แย่สุดคือ ${hourName(worst.hour)} ได้ ${r(worst.avgR)} ต่อเทรด จาก ${worst.count} เทรด ส่วนชั่วโมงที่ดีสุดคือ ${hourName(best.hour)} ได้ ${r(best.avgR)} ต่อเทรด` }
        : { status: "good" as const, verdict: `ทุกชั่วโมงที่มี ${HOUR_MIN_TRADES} เทรดขึ้นไปเป็นบวก ดีสุดคือ ${hourName(best.hour)} ได้ ${r(best.avgR)} ต่อเทรด` }),
    figures: rep.blocks.map(b => ({
      label: `${BLOCK_NAMES[b.label] ?? b.label} ${hourName(b.from)}–${hourName(b.to % 24)}`,
      value: b.count ? `${r(b.avgR)} · ${b.count} เทรด` : "–",
      className: tone(b.avgR),
    })),
  };

  // 6. After the daily target.
  const at = rep.afterTarget;
  const afterItem: Item = !at
    ? { title: "After Daily Target", status: "wait", verdict: "ไม่ได้ตั้งเป้ารายวันในช่วงของเทรดเหล่านี้", figures: [] }
    : {
        title: "After Daily Target",
        status: at.daysTradedOn < AFTER_TARGET_MIN_DAYS ? "wait" : at.netR >= 0 ? "good" : "bad",
        verdict: at.daysTradedOn < AFTER_TARGET_MIN_DAYS
          ? `มีวันที่เทรดต่อหลังถึงเป้า ${at.daysTradedOn} จาก ${AFTER_TARGET_MIN_DAYS} วัน ยังน้อยเกินไปที่จะสรุป`
          : at.netR >= 0
            ? `เทรดต่อหลังถึงเป้าได้ ${r(at.netR)} จาก ${at.trades} เทรด ถ้าหยุดที่เป้าจะเสียส่วนนี้ไป`
            : `เทรดต่อหลังถึงเป้าเสีย ${r(-at.netR)} จาก ${at.trades} เทรด ถ้าหยุดที่เป้าจะประหยัดส่วนนี้ได้`,
        figures: [
          { label: "วันที่ถึงเป้า", value: String(at.daysReached) },
          { label: "วันที่เทรดต่อ", value: String(at.daysTradedOn) },
          { label: "เทรดหลังถึงเป้า", value: String(at.trades) },
          { label: "ผลหลังถึงเป้า", value: `${money(at.pnl)} · ${r(at.netR)}`, className: tone(at.netR) },
        ],
      };

  const planRow = (label: string, g: SystemReport["onPlan"]) =>
    ({ label, value: `${r(g.avgR)} ต่อเทรด · ${g.count} เทรด`, className: tone(g.avgR) });

  return [
    {
      title: "Result",
      status: rep.expectancyR > 0 ? "good" : "bad",
      verdict: rep.expectancyR > 0 ? `ระบบได้ ${r(rep.expectancyR)} ต่อเทรด` : `ระบบเสีย ${r(-rep.expectancyR)} ต่อเทรด`,
      figures: [
        { label: "Win rate", value: `${formatNumber(rep.winRate * 100)}%` },
        { label: "Profit factor", value: formatNumber(rep.profitFactor) },
        { label: "Avg win", value: r(rep.avgWinR), className: "text-accent" },
        { label: "Avg loss", value: r(rep.avgLossR), className: "text-loss" },
        { label: "Net", value: `${money(rep.netPnl)} · ${r(rep.netR)}`, className: tone(rep.netR) },
        { label: "TP / BE / SL", value: `${rep.wins} / ${rep.bes} / ${rep.losses}` },
      ],
    },
    {
      title: "Consistency",
      status: rep.firstHalfR > 0 && rep.secondHalfR > 0 ? "good" : rep.firstHalfR < 0 && rep.secondHalfR < 0 ? "bad" : "wait",
      verdict: rep.firstHalfR > 0 && rep.secondHalfR > 0
        ? "เป็นบวกทั้งครึ่งแรกและครึ่งหลัง ผลไม่ได้มาจากช่วงที่โชคดีช่วงเดียว"
        : rep.firstHalfR < 0 && rep.secondHalfR < 0
          ? "ติดลบทั้งครึ่งแรกและครึ่งหลัง"
          : "ครึ่งหนึ่งเป็นบวก อีกครึ่งติดลบ ควรเก็บข้อมูลเพิ่มก่อนเชื่อผล",
      figures: [
        { label: `เทรดที่ 1–${half}`, value: `${r(rep.firstHalfR)} ต่อเทรด`, className: tone(rep.firstHalfR) },
        { label: `เทรดที่ ${half + 1}–${rep.trades}`, value: `${r(rep.secondHalfR)} ต่อเทรด`, className: tone(rep.secondHalfR) },
      ],
    },
    {
      title: "Biggest Win",
      status: rep.netRWithoutLargest > 0 ? "good" : "wait",
      verdict: rep.netRWithoutLargest > 0
        ? "ตัดไม้ที่ชนะมากที่สุดออกแล้ว ผลยังเป็นบวก"
        : "ถ้าตัดไม้ที่ชนะมากที่สุดออก ผลจะไม่เป็นบวก ระบบพึ่งไม้ใหญ่ที่เกิดไม่บ่อย การพลาด setup ไม้เดียวจึงเสียมาก",
      figures: [
        { label: "ไม้ที่ชนะมากที่สุด", value: r(rep.largestWinR), className: "text-accent" },
        { label: "รวมเมื่อตัดไม้นี้ออก", value: r(rep.netRWithoutLargest), className: tone(rep.netRWithoutLargest) },
      ],
    },
    {
      title: "Losing Streak",
      status: "wait",
      verdict: `แพ้ติดกันนานสุด ${rep.maxLossStreak} ไม้ ควรวาง risk ต่อเทรดให้ผ่านช่วงแบบนี้ได้`,
      figures: [{ label: "แพ้ติดกันนานสุด", value: `${rep.maxLossStreak} ไม้`, className: "text-loss" }],
    },
    timeItem,
    afterItem,
    rep.offPlan.count === 0
      ? { title: "On Plan / Off Plan", status: "good", verdict: "ทุกเทรดเป็น On Plan", figures: [planRow("On Plan", rep.onPlan)] }
      : {
          title: "On Plan / Off Plan",
          status: rep.offPlan.avgR < rep.onPlan.avgR ? "bad" : "good",
          verdict: rep.offPlan.avgR < rep.onPlan.avgR
            ? `เทรด Off Plan ทำได้แย่กว่า On Plan รวม ${r(rep.offPlan.netR)}`
            : "เทรด Off Plan ไม่ได้แย่กว่า On Plan",
          figures: [planRow("On Plan", rep.onPlan), planRow("Off Plan", rep.offPlan)],
        },
  ];
}

const FOLD_KEY = "systemReview.folded";

// The last box of the Performance page: a report on trades 1–100, 1–200, … 1–1,000, over every trade
// (the Results filters do not apply). Until 100 trades it is folded to its title and the count.
export default function SystemReview() {
  const { trades, isPrivacyMode } = useJournalStore();
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
          <span className="text-xs font-bold text-ink-faint tabular-nums whitespace-nowrap" title={next ? `รายงานถัดไปเมื่อครบ ${next} เทรด` : "ครบทั้ง 10 รายงานแล้ว"}>
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
                title={p > count ? `เมื่อครบ ${p} เทรด` : `รายงานเทรดที่ 1–${p}`}
                className={`flex-1 shrink-0 h-7 min-w-12 px-2 text-[11px] font-bold rounded-md tabular-nums transition ${
                  p === phase ? "bg-white text-ink shadow-sm" : p > count ? "text-ink-disabled cursor-default" : "text-ink-faint hover:text-ink"
                }`}
              >
                {p.toLocaleString("en-US")}
              </button>
            ))}
          </div>

          <p className="mt-3 text-[11px] font-semibold text-ink-faint">
            เทรดที่ 1–{report.trades} · {dateOf(report.firstTime)} – {dateOf(report.lastTime)}
          </p>

          <ol className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
            {itemsOf(report, isPrivacyMode).map((item, i) => (
              <li key={item.title} className="bg-white p-5 rounded-xl border border-line shadow-sm">
                <div className="flex items-center gap-2 border-b border-line-soft pb-1.5 mb-2.5">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[item.status]}`} />
                  <span className="text-[10px] font-bold text-ink-faint uppercase tracking-widest">{i + 1}. {item.title}</span>
                </div>
                <p className={`text-xs font-bold leading-relaxed ${STATUS_TEXT[item.status]}`}>{item.verdict}</p>
                {item.figures.length > 0 && (
                  <dl className="mt-3 space-y-1.5 text-[10px]">
                    {item.figures.map(f => (
                      <div key={f.label} className="flex justify-between gap-3">
                        <dt className="text-ink-muted">{f.label}</dt>
                        <dd className={`font-bold tabular-nums text-right ${f.className ?? "text-ink"}`}>{f.value}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </li>
            ))}

            {/* 8. The score out of 10, orange as the Win Rate card: the five checks that can be scored, each
                with its points (how they are weighed is in systemScore). */}
            <li className="bg-accent p-5 rounded-xl border border-accent shadow-lg shadow-accent/20 text-white">
              <div className="flex items-center gap-2 border-b border-accent-line pb-1.5 mb-2.5">
                <span className="text-[10px] font-bold text-white uppercase tracking-widest">8. System Score</span>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-3xl font-black tabular-nums">{formatNumber(score.total)}<span className="text-base font-bold text-white"> / 10</span></p>
                <p className="text-xs font-bold text-right">{scoreVerdict(score.total)}</p>
              </div>
              <dl className="mt-3 space-y-1.5 text-[10px]">
                {score.parts.map(p => (
                  <div key={p.key} className="flex justify-between gap-3">
                    <dt className="text-white">{SCORE_NAMES[p.key]}</dt>
                    <dd className="font-bold tabular-nums">{formatNumber(p.points)} / {formatNumber(p.weight)}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-3 text-[10px] text-white">ข้อ 4–6 ไม่นำมาคิดคะแนน เพราะเป็นแนวทางการเทรด ไม่ได้บอกคุณภาพของระบบ</p>
            </li>
          </ol>
        </>
      )}
    </div>
  );
}
