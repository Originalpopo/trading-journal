"use client";

import { useJournalStore } from "@/store/useJournalStore";
import { useState, useMemo, useRef, useEffect } from "react";
import { ChevronLeft, ChevronRight, ChevronDown, Check, SlidersHorizontal } from "lucide-react";
import { formatNumber, tooltipPositionOf, fitFontSize } from "@/lib/utils";
import { healthTierFromProfitFactor } from "@/lib/stats";
import HealthWeather from "@/components/HealthWeather";
import { computePerformance, isRecentPeriod, type SideMatrix } from "@/lib/performance";
import { loadBahtRate, formatApproxBaht, type BahtRate } from "@/lib/bahtRate";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  Plugin
} from 'chart.js';
import { Line, Bar } from 'react-chartjs-2';

import PageHeader from "@/components/PageHeader";
import { pageContentLeft } from "@/components/pageEdge";
import SystemReview from "@/components/SystemReview";
import "@/lib/chartTooltip";
import { themeColor } from '@/lib/themeColors';
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

// The Balance area's grey carried out past the chart, as on the Dashboard: from the last Balance point to the
// page's right edge (and from the left edge to the first point), and under the chart's bottom down to the canvas edge, where the Results band (same grey)
// takes over.
const BALANCE_FILL = 'rgba(0, 0, 0, 0.03)';
const balanceFillPlugin: Plugin<'line'> = {
  id: 'balanceFill',
  beforeDatasetsDraw: (chart) => {
    const points = chart.getDatasetMeta(0).data;
    const first = points[0];
    const last = points[points.length - 1];
    if (!first || !last) return;
    const x = Math.round(last.x);
    const x0 = Math.round(first.x);
    const { bottom } = chart.chartArea;
    const ctx = chart.ctx;
    ctx.save();
    ctx.fillStyle = BALANCE_FILL;
    ctx.fillRect(0, first.y, x0, bottom - first.y); // left of the first point, from the page's left edge
    ctx.fillRect(x, last.y, chart.width - x, bottom - last.y);
    ctx.fillRect(0, bottom, chart.width, chart.height - bottom);
    ctx.restore();
  },
};

const formatCurrencyHelper =(val: number, isPrivacyMode?: boolean) => {
  if (isPrivacyMode) return '***';
  return val < 0 ? `-$${formatNumber(Math.abs(val))}` : `$${formatNumber(val)}`;
};

// Buy / Sell / All figures of each symbol or timeframe.
function SideMatrixTable({ title, firstColumn, shortFirstColumn, rows, formatCurrency }: { title: string; firstColumn: string; shortFirstColumn?: string; rows: [string, SideMatrix][]; formatCurrency: (val: number) => string }) {
  return (
    <div className="glass-card p-4 md:p-6 overflow-hidden flex flex-col">
      <h3 className="text-xs font-black text-ink uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
        <span className="w-2 h-2 bg-accent rounded-full"></span> {title}
      </h3>
      {/* Below lg only the All group shows, so the table fits without scrolling sideways. */}
      <div className="overflow-x-auto">
        <table className="w-full text-center text-sm whitespace-nowrap border-collapse">
          <thead>
            <tr className="text-ink-faint bg-surface-2">
              <th className="py-2 px-1.5 md:px-4 rounded-tl-xl"></th>
              <th colSpan={4} className="hidden lg:table-cell py-2 px-1.5 md:px-4 font-black text-ink uppercase text-[10px] tracking-widest text-center border-l border-line">Buy</th>
              <th colSpan={4} className="hidden lg:table-cell py-2 px-1.5 md:px-4 font-black text-ink uppercase text-[10px] tracking-widest text-center border-l border-line">Sell</th>
              <th colSpan={4} className="py-2 px-1.5 md:px-4 font-black text-ink uppercase text-[10px] tracking-widest text-center border-l border-line rounded-tr-xl">All</th>
            </tr>
            <tr className="text-ink-faint bg-surface-2">
              <th className="py-2 px-1.5 md:px-4 font-bold uppercase text-[10px] tracking-widest text-center align-middle">{shortFirstColumn ? <><span className="md:hidden">{shortFirstColumn}</span><span className="hidden md:inline">{firstColumn}</span></> : firstColumn}</th>
              <th className="hidden lg:table-cell py-2 px-1.5 md:px-4 font-bold uppercase text-[9px] text-center align-middle border-l border-line">Trades</th>
              <th className="hidden lg:table-cell py-2 px-1.5 md:px-4 font-bold uppercase text-[9px] text-center align-middle">Win %</th>
              <th className="hidden lg:table-cell py-2 px-1.5 md:px-4 font-bold uppercase text-[9px] text-center align-middle">RR</th>
              <th className="hidden lg:table-cell py-2 px-1.5 md:px-4 font-bold uppercase text-[9px] text-center align-middle">P&L</th>
              <th className="hidden lg:table-cell py-2 px-1.5 md:px-4 font-bold uppercase text-[9px] text-center align-middle border-l border-line">Trades</th>
              <th className="hidden lg:table-cell py-2 px-1.5 md:px-4 font-bold uppercase text-[9px] text-center align-middle">Win %</th>
              <th className="hidden lg:table-cell py-2 px-1.5 md:px-4 font-bold uppercase text-[9px] text-center align-middle">RR</th>
              <th className="hidden lg:table-cell py-2 px-1.5 md:px-4 font-bold uppercase text-[9px] text-center align-middle">P&L</th>
              <th className="py-2 px-1.5 md:px-4 font-bold uppercase text-[9px] text-center align-middle border-l border-line">Trades</th>
              <th className="py-2 px-1.5 md:px-4 font-bold uppercase text-[9px] text-center align-middle">Win %</th>
              <th className="py-2 px-1.5 md:px-4 font-bold uppercase text-[9px] text-center align-middle">RR</th>
              <th className="py-2 px-1.5 md:px-4 font-bold uppercase text-[9px] text-center align-middle">Net P&L</th>
            </tr>
          </thead>
          <tbody className="text-[12px]">
            {rows.map(([sym, mData]) => {
              const b = mData.BUY, s = mData.SELL;
              const bWR = (b.win + b.loss) > 0 ? formatNumber(b.win / (b.win + b.loss) * 100) + '%' : '-';
              const sWR = (s.win + s.loss) > 0 ? formatNumber(s.win / (s.win + s.loss) * 100) + '%' : '-';
              const bRR = b.rrCount ? formatNumber(b.rr) + ' R' : '-';
              const sRR = s.rrCount ? formatNumber(s.rr) + ' R' : '-';
              const allTrades = b.trades + s.trades;
              const allWin = b.win + s.win;
              const allLoss = b.loss + s.loss;
              const allWR = (allWin + allLoss) > 0 ? formatNumber(allWin / (allWin + allLoss) * 100) + '%' : '-';
              const allRRCount = (b.rrCount || 0) + (s.rrCount || 0);
              const allRR = allRRCount ? formatNumber((b.rr || 0) + (s.rr || 0)) + ' R' : '-';
              const total = b.pnl + s.pnl;
              return (
                <tr key={sym} className="hover:bg-surface transition duration-150">
                  <td className="py-3 px-1.5 md:px-4 font-extrabold text-ink text-[11px] text-center">{sym}</td>
                  <td className="hidden lg:table-cell py-3 px-1.5 md:px-4 text-center font-semibold text-ink-muted border-l border-line">{b.trades}</td>
                  <td className="hidden lg:table-cell py-3 px-1.5 md:px-4 text-center font-bold text-ink-muted">{bWR}</td>
                  <td className="hidden lg:table-cell py-3 px-1.5 md:px-4 text-center font-bold text-ink-muted">{bRR}</td>
                  <td className={`hidden lg:table-cell py-3 px-1.5 md:px-4 text-center font-black ${b.pnl >= 0 ? 'text-accent' : 'text-loss'}`}>{formatCurrency(b.pnl)}</td>
                  <td className="hidden lg:table-cell py-3 px-1.5 md:px-4 text-center font-semibold text-ink-muted border-l border-line">{s.trades}</td>
                  <td className="hidden lg:table-cell py-3 px-1.5 md:px-4 text-center font-bold text-ink-muted">{sWR}</td>
                  <td className="hidden lg:table-cell py-3 px-1.5 md:px-4 text-center font-bold text-ink-muted">{sRR}</td>
                  <td className={`hidden lg:table-cell py-3 px-1.5 md:px-4 text-center font-black ${s.pnl >= 0 ? 'text-accent' : 'text-loss'}`}>{formatCurrency(s.pnl)}</td>
                  <td className="py-3 px-1.5 md:px-4 text-center font-semibold text-ink-muted border-l border-line">{allTrades}</td>
                  <td className="py-3 px-1.5 md:px-4 text-center font-bold text-ink-muted">{allWR}</td>
                  <td className="py-3 px-1.5 md:px-4 text-center font-bold text-ink-muted">{allRR}</td>
                  <td className={`py-3 px-1.5 md:px-4 text-center font-black ${total >= 0 ? 'text-accent' : 'text-loss'}`}>{formatCurrency(total)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// A row's P&L as a bar split at 0, as the Calendar's target line: losses fill red leftwards from 0, profits
// orange rightwards, each against the largest on its side among the rows shown. A side no row reaches is left
// out, and each side has an exact width, so 0 lines up on every row.
function SplitBar({ value, maxPos, maxNeg }: { value: number; maxPos: number; maxNeg: number }) {
  const total = maxPos + maxNeg;
  const negRatio = total > 0 ? (maxNeg / total) * 100 : 50;
  const posRatio = total > 0 ? (maxPos / total) * 100 : 50;
  const width = (ratio: number) => (maxPos > 0 && maxNeg > 0 ? `calc(${ratio}% - 2px)` : '100%');
  return (
    <div className="h-2.5 flex items-center justify-between">
      {maxNeg > 0 && (
        <div className="h-full shrink-0 bg-surface-2 rounded-full overflow-hidden flex justify-end" style={{ width: width(negRatio) }}>
          {value < 0 && <div className="h-full bg-loss rounded-full" style={{ width: `${(-value / maxNeg) * 100}%` }}></div>}
        </div>
      )}
      {maxPos > 0 && (
        <div className="h-full shrink-0 bg-surface-2 rounded-full overflow-hidden flex justify-start" style={{ width: width(posRatio) }}>
          {value > 0 && <div className="h-full bg-accent rounded-full" style={{ width: `${(value / maxPos) * 100}%` }}></div>}
        </div>
      )}
    </div>
  );
}

// One bar split into separate pieces by share, with a small gap between them, as the Timeframe bars split at 0.
// A piece with nothing in it is left out (the others fill the bar); a tiny one stays a round dot.
function PieceBar({ pieces, heightClass, className = '' }: {
  pieces: { key: string; share: number; color: string; label?: React.ReactNode }[];
  heightClass: string;
  className?: string;
}) {
  const shown = pieces.filter(x => x.share > 0);
  return (
    <div className={`w-full ${heightClass} flex gap-1 ${className}`}>
      {shown.length === 0 && <div className="h-full w-full rounded-full bg-surface-2" />}
      {shown.map(x => (
        <div key={x.key} className={`h-full rounded-full flex items-center justify-center ${x.color} transition-all duration-500`}
          style={{ flexGrow: x.share, flexBasis: 0, minWidth: 'var(--piece-min)' }}>
          {x.label}
        </div>
      ))}
    </div>
  );
}

export default function PerformancePage() {
  const { trades, funding, isLoading, isPrivacyMode } = useJournalStore();
  const formatCurrency = (val: number) => formatCurrencyHelper(val, isPrivacyMode);

  // Today's reference rate, for the rough baht figure under Net Profit.
  const [bahtRate, setBahtRate] = useState<BahtRate | null>(null);
  useEffect(() => {
    let isMounted = true;
    loadBahtRate().then(rate => { if (isMounted) setBahtRate(rate); });
    return () => { isMounted = false; };
  }, []);
  const bahtRateNote = bahtRate ? `Rough estimate at 1 USD = ${bahtRate.rate.toFixed(2)} THB (reference rate of ${bahtRate.date}). A bank pays less.` : undefined;
  // A year (this one to start), 'ALL', or a recent stretch: LAST_1M / LAST_3M.
  const [selectedPeriod, setSelectedPeriod] = useState(new Date().getFullYear().toString());
  const [selectedTfs, setSelectedTfs] = useState<string[]>([]);
  const [isTfMenuOpen, setIsTfMenuOpen] = useState(false);
  const tfRef = useRef<HTMLDivElement>(null);
  
  const [selectedPlan, setSelectedPlan] = useState('ALL');
  // The year, TF and plan filters stay folded behind one button until it is pressed.
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (tfRef.current && !tfRef.current.contains(event.target as Node)) {
        setIsTfMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const [selectedMetric, setSelectedMetric] = useState('GAIN');
  const [tfPage, setTfPage] = useState(0);

  // Profit and Balance has no card: as the Dashboard's Equity and Balance, the chart runs edge to edge of the
  // page (sidebar to the right edge) while its title stays in the column. `bleed` is how far the page reaches
  // past the title row on each side, measured whenever the page changes width.
  const chartTitleRef = useRef<HTMLDivElement>(null);
  const chartBoxRef = useRef<HTMLDivElement>(null);
  const [bleed, setBleed] = useState({ left: 0, right: 0, rail: 0 });
  useEffect(() => {
    const main = document.querySelector('main');
    if (!main) return;
    const observer = new ResizeObserver(() => {
      const title = chartTitleRef.current;
      if (title) {
        const box = main.getBoundingClientRect();
        const row = title.getBoundingClientRect();
        const left = Math.max(0, Math.floor(row.left - box.left - main.clientLeft));
        // The chart's box runs under the floating sidebar to the window's edge (its grey with it), while its
        // points start at the sidebar's right edge: this much padding on the chart's left.
        const rail = Math.max(0, Math.floor(pageContentLeft(main) - box.left - main.clientLeft));
        const right = Math.max(0, Math.floor(box.left + main.clientLeft + main.clientWidth - row.right));
        setBleed(b => (b.left === left && b.right === right && b.rail === rail ? b : { left, right, rail }));
      }
    });
    observer.observe(main);
    return () => observer.disconnect();
    // Again once loading is over: the chart's title row isn't on the page before that.
  }, [isLoading]);
  // A new bleed widens the chart's box; Chart.js can miss that change, so the chart is sized to it again.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const canvas = chartBoxRef.current?.querySelector('canvas');
      if (canvas) ChartJS.getChart(canvas)?.resize();
    });
    return () => cancelAnimationFrame(frame);
  }, [bleed]);

  const availableYears = useMemo(() => {
    const years = Array.from(new Set(trades.map(t => new Date(t.time.replace(' ', 'T')).getFullYear()))).sort((a, b) => b - a);
    const currentYear = new Date().getFullYear();
    if (!years.includes(currentYear)) {
      years.push(currentYear);
      years.sort((a, b) => b - a);
    }
    return years;
  }, [trades]);

  const availableTfs = useMemo(() => {
    const tfsSet = new Set<string>();
    trades.forEach(t => {
      const tfVal = t.tf || 'none';
      tfVal.split(',').forEach((item: string) => {
        const trimmed = item.trim();
        if (trimmed) tfsSet.add(trimmed);
      });
    });
    ['1h', '15m', '5m', '1m', '15s', '5s', 'none'].forEach(item => tfsSet.add(item));
    return Array.from(tfsSet);
  }, [trades]);

  const data = useMemo(
    () => computePerformance(trades, funding, { selectedPeriod, selectedTfs, selectedPlan, selectedMetric }),
    [trades, funding, selectedPeriod, selectedTfs, selectedPlan, selectedMetric],
  );


  // The Hour, Day and Month charts draw their 0 line darker, and no axis line at the bottom, so a loss
  // hangs from the line its bar starts at rather than looking as if it floats.
  const zeroLineColor = (c: { tick?: { value: number } }) => c.tick?.value === 0 ? themeColor('ink-disabled') : themeColor('surface');

  const metricLabel = selectedMetric === 'RR' ? 'Net RR' : selectedMetric === 'AVG_R' ? 'Avg R per trade' : selectedMetric === 'GAIN' ? 'Gain (%)' : 'Net P&L ($)';
  // What a bar of the Hour, Day and Month charts shows when pointed at: its value with its unit, and under it
  // how many trades it holds, so a big or small bar can be weighed by how much there is behind it.
  const chartTooltip = (counts: number[]) => ({
    callbacks: {
      label: (item: { dataset: { label?: string }; raw: unknown }) => {
        const v = Number(item.raw ?? 0);
        if (selectedMetric === 'COUNT') return `${item.dataset.label}: ${v}`;
        if (selectedMetric === 'RR' || selectedMetric === 'AVG_R') return `${metricLabel}: ${formatNumber(v)} R`;
        if (selectedMetric === 'GAIN') return `${metricLabel}: ${formatNumber(v)}%`;
        return `${metricLabel}: ${isPrivacyMode ? '***' : `${v < 0 ? '-' : ''}$${formatNumber(Math.abs(v))}`}`;
      },
      footer: (items: { dataIndex: number }[]) => {
        const n = items.length ? counts[items[0].dataIndex] ?? 0 : 0;
        return `${n} ${n === 1 ? 'trade' : 'trades'}`;
      },
    },
  });

  // Value labels drawn beside the bars of the Day of Week and Month of Year charts.
  const barValueLabels: Plugin<'bar'> = useMemo(() => ({
    id: 'barValueLabels',
    afterDatasetsDraw(chart) {
      const { ctx } = chart;
      if (selectedMetric === 'COUNT') {
        const lastDatasetIndex = chart.data.datasets.length - 1;
        if (lastDatasetIndex >= 0) {
          const meta = chart.getDatasetMeta(lastDatasetIndex);
          if (!meta.hidden) {
            meta.data.forEach((element, index) => {
              let sum = 0;
              chart.data.datasets.forEach(ds => { sum += (ds.data[index] as number || 0); });
              if (sum === 0) return;
              
              ctx.fillStyle = themeColor('ink-muted');
              ctx.font = 'bold 10px "Plus Jakarta Sans", sans-serif';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              
              const position = tooltipPositionOf(element);
              ctx.fillText(sum.toString(), position.x, position.y - 12);
            });
          }
        }
        return;
      }

      // Bars too narrow for their labels (twelve months on a phone) get them standing upright instead.
      const slotWidth = chart.chartArea.width / Math.max(1, chart.data.labels?.length ?? 1);
      chart.data.datasets.forEach((dataset, i) => {
        const meta = chart.getDatasetMeta(i);
        if (!meta.hidden) {
          meta.data.forEach((element, index) => {
            const val = dataset.data[index] as number | null;
            if (val == null) return; // a month with no trades has no bar to label
            ctx.fillStyle = themeColor('ink-muted');
            ctx.font = 'bold 10px "Plus Jakarta Sans", sans-serif';
            ctx.textBaseline = 'middle';

            let text = formatNumber(val);
            if (selectedMetric === 'RR' || selectedMetric === 'AVG_R') text += ' R';
            else if (selectedMetric === 'GAIN') text += '%';
            else text = isPrivacyMode ? '***' : val < 0 ? '-$' + formatNumber(Math.abs(val)) : '$' + formatNumber(Math.abs(val));

            const position = tooltipPositionOf(element);
            if (ctx.measureText(text).width > slotWidth - 4) {
              // Upright, reading upwards from just past the end of the bar.
              ctx.save();
              ctx.translate(position.x, position.y + (val >= 0 ? -6 : 6));
              ctx.rotate(-Math.PI / 2);
              ctx.textAlign = val >= 0 ? 'left' : 'right';
              ctx.fillText(text, 0, 0);
              ctx.restore();
              return;
            }
            ctx.textAlign = 'center';
            const yOffset = val >= 0 ? -12 : 14;
            ctx.fillText(text, position.x, position.y + yOffset);
          });
        }
      });
    }
  }), [selectedMetric, isPrivacyMode]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-ink-muted font-semibold animate-pulse">Loading performance...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Performance">
        <HealthWeather tier={healthTierFromProfitFactor(data.profitFactor, data.totalTrades)} />
      </PageHeader>

      {/* No card: the chart reaches the page's edges and its grey runs straight into the Results band below. */}
      <div className="!mb-0 pt-6 h-[350px] flex flex-col w-full">
        <div ref={chartTitleRef} className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 mb-4">
          <h3 className="text-xs font-black text-ink uppercase tracking-[0.2em] flex items-center gap-2">
            <span className="w-2 h-2 bg-accent rounded-full"></span> Profit and Balance
          </h3>
          {data.isAggregated && (
            <span className="text-[10px] font-bold text-ink-muted bg-surface-2 border border-line px-2 py-0.5 rounded-md tracking-normal normal-case">
              Daily Aggregated ({data.perfBalanceData.length - 1} Days)
            </span>
          )}
        </div>
        <div ref={chartBoxRef} className="flex-1 min-h-0 relative min-w-0" style={{ marginLeft: -bleed.left, marginRight: -bleed.right }}>
          <Line
            key={`pnl-${isPrivacyMode}`}
            data={{
              labels: data.perfBalanceLabels,
              datasets: [
                {
                  label: 'Account Balance',
                  data: data.perfBalanceData,
                  borderColor: 'transparent',
                  borderWidth: 0,
                  backgroundColor: BALANCE_FILL,
                  // Down to the chart's bottom (not the 0 line), where the grey carries on into Results.
                  fill: 'start',
                  tension: 0.4,
                  pointRadius: 0,
                  yAxisID: 'y'
                },
                {
                  type: 'bar',
                  label: 'Net P&L',
                  data: data.perfPnlData,
                  backgroundColor: data.perfPnlColors,
                  borderRadius: 4,
                  maxBarThickness: 48,
                  yAxisID: 'y1'
                }
              ] as any
            }}
            options={{
              responsive: true, maintainAspectRatio: false,
              // No dot or figure on the last Balance point; the last bar ends 16px short of the page's right edge.
              layout: { padding: { top: 20, right: 16, left: bleed.rail } },
              plugins: {
                legend: { display: false },
                tooltip: {
                  mode: 'index',
                  intersect: false,
                  callbacks: {
                    label: function(context: any) {
                      const val = context.parsed.y;
                      if (context.dataset.label === 'Account Balance') {
                        return `Balance: ${isPrivacyMode ? '***' : (val < 0 ? '-$' : '$') + formatNumber(Math.abs(val))}`;
                      }
                      if (context.dataset.label === 'Net P&L') {
                        return `Net P&L: ${isPrivacyMode ? '***' : (val < 0 ? '-$' : '$') + formatNumber(Math.abs(val))}`;
                      }
                      return `${context.dataset.label}: ${val}`;
                    }
                  }
                }
              },
              scales: {
                x: { display: false },
                y: { display: false, grace: '10%' },
                y1: { display: true, position: 'left', grid: { color: themeColor('surface'), drawOnChartArea: true }, ticks: { display: false }, border: { display: false }, grace: '10%' }
              }
            }}
            plugins={[balanceFillPlugin]}
          />
        </div>
      </div>

      {/* No card around Results: a band of the Dashboard's grey (rgba(0,0,0,0.03)) behind it, reaching the page's
          edges (sidebar to the right edge, clipped by <main>) while the content keeps to the column. */}
      <div className="bg-black/[0.03] shadow-[0_0_0_100vmax_rgba(0,0,0,0.03)] [clip-path:inset(0_-100vmax)] py-6 flex flex-col w-full">
        {/* The filters sit in the corner of Results; folded behind the button, which turns orange while open,
            or while a filter is off its default even when folded. They filter the whole page, the charts too. */}
        <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2 mb-4">
          <h3 className="text-xs font-black text-ink uppercase tracking-[0.2em] mr-auto flex items-center gap-2">
            <span className="w-2 h-2 bg-accent rounded-full"></span> Results
          </h3>
          {/* On a phone the button stays beside the title and the filters open below it as three even
              columns, each named above its box; from an iPad up they sit in a line left of the button. */}
          {isFiltersOpen && (
          <div className="order-3 md:order-2 w-full md:w-auto grid grid-cols-3 gap-2 md:flex md:items-center md:gap-4">
            <div className="flex flex-col md:flex-row md:items-center gap-1 md:gap-2 min-w-0">
              <span className="text-[10px] font-bold text-ink-faint uppercase tracking-widest">Period<span className="hidden md:inline">:</span></span>
              <select value={selectedPeriod} onChange={(e) => setSelectedPeriod(e.target.value)}
                className="w-full md:w-auto h-9 md:h-auto bg-white border border-line text-ink text-base md:text-[10px] font-bold rounded-lg px-2 md:px-3 py-1.5 shadow-sm focus:outline-none focus:border-accent cursor-pointer">
                {/* The last month or three up to today (across a year end), then each year, then everything. */}
                <option value="LAST_1M">Last 1M</option>
                <option value="LAST_3M">Last 3M</option>
                <option disabled>──────</option>
                {availableYears.map(y => (
                   <option key={y} value={y.toString()}>{y}</option>
                ))}
                <option value="ALL">All</option>
              </select>
            </div>
            <div className="flex flex-col md:flex-row md:items-center gap-1 md:gap-2 min-w-0" ref={tfRef}>
              <span className="text-[10px] font-bold text-ink-faint uppercase tracking-widest">TF<span className="hidden md:inline">:</span></span>
              <div className="relative">
                <button
                  onClick={() => setIsTfMenuOpen(!isTfMenuOpen)}
                  className="w-full md:w-auto h-9 md:h-auto bg-white border border-line text-ink text-base md:text-[10px] font-bold rounded-lg px-2 md:px-3 py-1.5 shadow-sm hover:border-accent focus:outline-none flex items-center gap-1.5 cursor-pointer md:min-w-[70px] justify-between transition-colors"
                >
                  <span className="truncate max-w-[100px]">
                    {selectedTfs.length === 0 
                      ? "ALL" 
                      : selectedTfs.length <= 2 
                        ? selectedTfs.join(", ") 
                        : `${selectedTfs.length} Selected`}
                  </span>
                  <ChevronDown className={`w-3.5 h-3.5 text-ink-faint transition-transform ${isTfMenuOpen ? 'rotate-180' : ''}`} />
                </button>
                
                {isTfMenuOpen && (
                  <div className="absolute left-0 sm:right-0 sm:left-auto top-full mt-1.5 w-40 bg-white border border-line rounded-xl shadow-lg z-50 overflow-hidden flex flex-col animate-in fade-in zoom-in duration-200">
                    <div className="p-2 border-b border-line-soft flex justify-between items-center bg-surface">
                      <span className="text-[10px] font-bold text-ink-faint uppercase">Select TFs</span>
                      {selectedTfs.length > 0 && (
                        <button 
                          onClick={() => setSelectedTfs([])}
                          className="text-[10px] font-bold text-accent hover:text-accent-strong transition-colors"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                    <div className="max-h-64 overflow-y-auto p-1.5">
                      {availableTfs.map(tf => {
                        const isSelected = selectedTfs.includes(tf);
                        return (
                          <div 
                            key={tf}
                            onClick={() => {
                              if (isSelected) {
                                setSelectedTfs(selectedTfs.filter(i => i !== tf));
                              } else {
                                setSelectedTfs([...selectedTfs, tf]);
                              }
                            }}
                            className={`flex items-center gap-2.5 px-3 py-2 text-xs font-bold rounded-lg cursor-pointer transition-colors ${
                              isSelected ? 'bg-accent-soft text-accent' : 'text-ink-muted hover:bg-surface hover:text-ink'
                            }`}
                          >
                            <div className={`w-3.5 h-3.5 rounded-[4px] border flex items-center justify-center shrink-0 transition-colors ${
                              isSelected ? 'bg-accent border-accent' : 'border-line'
                            }`}>
                              {isSelected && <Check className="w-2.5 h-2.5 text-white stroke-[3]" />}
                            </div>
                            <span className="truncate">{tf}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="flex flex-col md:flex-row md:items-center gap-1 md:gap-2 min-w-0">
              <span className="text-[10px] font-bold text-ink-faint uppercase tracking-widest">Plan<span className="hidden md:inline">:</span></span>
              <select value={selectedPlan} onChange={(e) => setSelectedPlan(e.target.value)}
                className="w-full md:w-auto h-9 md:h-auto bg-white border border-line text-ink text-base md:text-[10px] font-bold rounded-lg px-2 md:px-3 py-1.5 shadow-sm focus:outline-none focus:border-accent cursor-pointer">
                <option value="ALL">ALL</option>
                <option value="On Plan">On Plan</option>
                <option value="Off Plan">Off Plan</option>
              </select>
            </div>
          </div>
          )}
          <button
            type="button"
            onClick={() => setIsFiltersOpen(open => !open)}
            aria-expanded={isFiltersOpen}
            aria-label="Filter"
            title="Filter"
            className={`order-2 md:order-3 flex items-center justify-center h-8 w-8 border rounded-lg transition ${
              isFiltersOpen || selectedPeriod !== new Date().getFullYear().toString() || selectedTfs.length > 0 || selectedPlan !== 'ALL'
                ? 'bg-accent-soft text-accent border-accent-line'
                : 'bg-white text-ink-muted border-line hover:text-ink'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
          <div className="@container bg-white p-5 rounded-[1.25rem] border border-line shadow-sm flex flex-col justify-center items-center text-center">
            <span className="text-[10px] font-bold text-ink-faint uppercase tracking-widest mb-1">Net Profit</span>
            {/* 20px, or smaller when a large profit would not fit the card. */}
            <span style={fitFontSize(formatCurrency(data.netProfit), '1.25rem')} className={`leading-7 font-black ${data.netProfit >= 0 ? 'text-accent' : 'text-loss'}`}>{formatCurrency(data.netProfit)}</span>
            {bahtRate && !isPrivacyMode && (
              <span className="text-[11px] font-normal text-ink-faint" title={bahtRateNote}>{formatApproxBaht(data.netProfit, bahtRate.rate)}</span>
            )}
          </div>
          <div className="bg-accent p-5 rounded-[1.25rem] border border-accent shadow-lg shadow-accent/20 flex flex-col justify-center items-center text-center">
            <span className="text-[10px] font-bold text-white uppercase tracking-widest mb-1">Win Rate</span>
            <span className="text-xl font-black text-white">{formatNumber(data.mainWinRate)}%</span>
          </div>
          <div className="bg-white p-5 rounded-[1.25rem] border border-line shadow-sm flex flex-col justify-center items-center text-center">
            <span className="text-[10px] font-bold text-ink-faint uppercase tracking-widest mb-1">Profit Factor</span>
            <span className="text-xl font-black text-ink">{formatNumber(data.profitFactor)}</span>
          </div>
          <div className="bg-white p-5 rounded-[1.25rem] border border-line shadow-sm flex flex-col justify-center items-center text-center">
            <span className="text-[10px] font-bold text-ink-faint uppercase tracking-widest mb-1">Expectancy</span>
            <span className="text-xl font-black text-ink">{formatNumber(data.expectancyR)} R</span>
            {/* The same average trade in the dollars it really made. */}
            <span className="text-[11px] font-normal text-ink-faint mt-0.5" title="Average profit per trade in dollars">{formatCurrency(data.expectedPayoff)} per trade</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-5">
          <div className="bg-white p-5 rounded-xl border border-line shadow-sm flex flex-col justify-between space-y-2.5">
            <div className="flex justify-between items-end border-b border-line-soft pb-1.5 mb-2">
              <span className="text-[10px] font-bold text-ink-faint uppercase tracking-widest">Outcomes</span>
            </div>
            {/* Bad on the left, good on the right, as in Discipline (Off Plan | On Plan) and Streaks. */}
            <div className="flex justify-between text-[10px] font-bold">
              <span className="text-loss flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-loss shrink-0"></span><span>{formatNumber(data.lossPct)}%</span></span>
              <span className="text-ink-faint flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-line shrink-0"></span><span>{formatNumber(data.bePct)}%</span></span>
              <span className="text-accent flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0"></span><span>{formatNumber(data.winPct)}%</span></span>
            </div>
            <PieceBar heightClass="h-2.5 [--piece-min:0.625rem]" className="mt-1" pieces={[
              { key: 'loss', share: data.lossPct, color: 'bg-loss' },
              { key: 'be', share: data.bePct, color: 'bg-line' },
              { key: 'win', share: data.winPct, color: 'bg-accent' },
            ]} />
            <div className="grid grid-cols-3 gap-2 pt-0.5">
              <div className="bg-loss-soft border border-loss-line rounded-lg p-1.5 text-center flex flex-col justify-center items-center shadow-sm">
                <span className="text-[9px] font-bold text-loss uppercase tracking-wider">SL</span>
                <span className="text-xs font-black text-loss">{data.lossTradesCount}</span>
              </div>
              <div className="bg-surface border border-line rounded-lg p-1.5 text-center flex flex-col justify-center items-center shadow-sm">
                <span className="text-[9px] font-bold text-ink-faint uppercase tracking-wider">BE</span>
                <span className="text-xs font-black text-ink-faint">{data.beTradesCount}</span>
              </div>
              <div className="bg-accent-soft border border-accent-line rounded-lg p-1.5 text-center flex flex-col justify-center items-center shadow-sm">
                <span className="text-[9px] font-bold text-accent uppercase tracking-wider">TP</span>
                <span className="text-xs font-black text-accent">{data.profitTradesCount}</span>
              </div>
            </div>
          </div>

          <div className="bg-white p-5 rounded-xl border border-line shadow-sm space-y-4">
            <div className="flex justify-between items-end border-b border-line-soft pb-1.5 mb-2">
              <span className="text-[10px] font-bold text-ink-faint uppercase tracking-widest">Direction</span>
            </div>
            {/* Buy and Sell read as the Timeframe rows: P&L as a bar split at 0, then $ and R. Pointing at Buy or
                Sell shows its trades and win rate. */}
            {(() => {
              const sides = [
                { label: 'Buy', trades: data.longTrades, pnl: data.longPnl, rr: data.longRr, winPct: data.longWinPct },
                { label: 'Sell', trades: data.shortTrades, pnl: data.shortPnl, rr: data.shortRr, winPct: data.shortWinPct },
              ];
              const maxPos = Math.max(0, ...sides.map(x => x.pnl));
              const maxNeg = Math.max(0, ...sides.map(x => -x.pnl));
              return (
                <div className="mt-2 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-3">
                  {sides.map(x => (
                    <div key={x.label} className="contents">
                      <span className="w-7 text-[10px] font-bold text-ink" title={`${x.trades} ${x.trades === 1 ? 'trade' : 'trades'} · win rate ${formatNumber(x.winPct)}%`}>{x.label}</span>
                      {x.trades > 0 ? <SplitBar value={x.pnl} maxPos={maxPos} maxNeg={maxNeg} /> : <div className="h-2.5 bg-surface-2 rounded-full" />}
                      <div className={`text-[10px] font-bold ${x.pnl >= 0 ? 'text-accent' : 'text-loss'}`}>
                        {formatCurrency(x.pnl)} <span className="text-ink-disabled font-normal mx-0.5">|</span> <span className={x.rr >= 0 ? 'text-accent' : 'text-loss'}>{formatNumber(x.rr)} R</span>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>

          <div className="bg-white p-5 rounded-xl border border-line shadow-sm flex flex-col justify-between space-y-1">
            <div className="flex justify-between items-end border-b border-line-soft pb-1.5 mb-2">
              <span className="text-[10px] font-bold text-ink-faint uppercase tracking-widest">Discipline</span>
            </div>
            <div className="flex justify-between text-[10px] font-bold">
              <span className="text-loss flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-loss shrink-0"></span><span>{formatNumber(data.offPlanPct)}%</span></span>
              <span className="text-accent flex items-center gap-1 justify-end"><span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0"></span><span>{formatNumber(data.onPlanPct)}%</span></span>
            </div>
            <PieceBar heightClass="h-4 [--piece-min:1rem]" className="mt-1 mb-1" pieces={[
              { key: 'off', share: data.offPlanPct, color: 'bg-loss' },
              { key: 'on', share: data.onPlanPct, color: 'bg-accent' },
            ]} />
            <div className="flex justify-between text-[10px] font-bold mt-2">
              <div className="flex flex-col">
                <span className="text-loss">Off Plan</span>
                <span className="text-loss">{formatCurrency(data.offPlanPnL)}</span>
              </div>
              <div className="flex flex-col items-end text-right">
                <span className="text-accent">On Plan</span>
                <span className="text-accent">{formatCurrency(data.onPlanPnL)}</span>
              </div>
            </div>
          </div>

          {(() => {
            const validTfs = ['1h', '15m', '5m', '1m', '15s', '5s']
              .filter(tf => data.tfStats[tf] && data.tfStats[tf].trades > 0)
              .sort((a, b) => data.tfStats[b].pnl - data.tfStats[a].pnl);
              
            return (
              <div className="bg-white p-5 rounded-xl border border-line shadow-sm space-y-4">
                <div className="flex justify-between items-center border-b border-line-soft pb-1.5 mb-2">
                  <span className="text-[10px] font-bold text-ink-faint uppercase tracking-widest">Timeframe</span>
                  {validTfs.length > 4 && (
                    <div className="flex gap-1">
                      <button onClick={() => setTfPage(p => p - 1)} className="p-1 hover:bg-surface-2 rounded text-ink-faint hover:text-ink transition"><ChevronLeft className="w-3.5 h-3.5" /></button>
                      <button onClick={() => setTfPage(p => p + 1)} className="p-1 hover:bg-surface-2 rounded text-ink-faint hover:text-ink transition"><ChevronRight className="w-3.5 h-3.5" /></button>
                    </div>
                  )}
                </div>
                {/* One grid for all rows, so every bar has the same width whatever its figures. */}
                <div className="mt-2 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-3">
                  {validTfs.length === 0 ? null : (() => {
                
                const totalPages = Math.ceil(validTfs.length / 4);
                let normalizedPage = tfPage % totalPages;
                if (normalizedPage < 0) normalizedPage += totalPages;
                
                const maxPosPnl = Math.max(0, ...validTfs.map(tf => data.tfStats[tf].pnl));
                const maxNegPnl = Math.max(0, ...validTfs.map(tf => -data.tfStats[tf].pnl));

                return validTfs.slice(normalizedPage * 4, normalizedPage * 4 + 4).map(tf => {
                  const stat = data.tfStats[tf];
                  return (
                    <div key={tf} className="contents">
                      <div className="w-7 shrink-0 flex items-baseline text-[10px]">
                        <span className="font-bold text-ink">{tf}</span>
                      </div>
                      <SplitBar value={stat.pnl} maxPos={maxPosPnl} maxNeg={maxNegPnl} />
                      <div className={`w-auto shrink-0 text-left text-[10px] font-bold ${stat.pnl >= 0 ? 'text-accent' : 'text-loss'}`}>
                        {formatCurrency(stat.pnl)} <span className="text-ink-disabled font-normal mx-0.5">|</span> <span className={stat.rr >= 0 ? 'text-accent' : 'text-loss'}>{formatNumber(stat.rr)} R</span>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        );
      })()}
    </div>

        {/* No cards here: the figures sit straight on the Results grey, in colours a step darker than in a white card so they stay clear. Same gaps and inset as the cards above (20px + their 1px border), so the text lines up with theirs. */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          <div className="pt-1 px-[21px] text-[10px] space-y-2">
            <div className="text-[9px] font-bold text-ink-muted uppercase tracking-widest border-b border-line pb-1.5 mb-2">Averages & Time</div>
            <div className="flex justify-between"><span className="text-ink-muted">Avg Win</span><span className="font-bold text-accent">{formatCurrency(data.avgWin)} <span className="text-ink-faint font-normal mx-0.5">|</span> {formatNumber(data.avgWinR)} R</span></div>
            <div className="flex justify-between"><span className="text-ink-muted">Avg Loss</span><span className="font-bold text-loss">{formatCurrency(-data.avgLoss)} <span className="text-ink-faint font-normal mx-0.5">|</span> {formatNumber(data.avgLossR)} R</span></div>
            <div className="flex justify-between"><span className="text-ink-muted">Avg BE</span><span className="font-bold text-ink-muted">{formatCurrency(data.avgBE)}</span></div>
            <div className="flex justify-between pt-1"><span className="text-ink-muted">Hold (Win)</span><span className="font-bold text-ink">{data.holdWin}</span></div>
            <div className="flex justify-between"><span className="text-ink-muted">Hold (Loss)</span><span className="font-bold text-ink">{data.holdLoss}</span></div>
          </div>
          <div className="pt-1 px-[21px] text-[10px] space-y-2">
            <div className="text-[9px] font-bold text-ink-muted uppercase tracking-widest border-b border-line pb-1.5 mb-2">Extremes</div>
            <div className="flex justify-between"><span className="text-ink-muted">Largest Win</span><span className="font-bold text-accent">{formatCurrency(data.largestProfit)}</span></div>
            <div className="flex justify-between"><span className="text-ink-muted">Largest Loss</span><span className="font-bold text-loss">{formatCurrency(data.largestLoss)}</span></div>
          </div>
          <div className="pt-1 px-[21px] text-[10px] space-y-2">
            <div className="text-[9px] font-bold text-ink-muted uppercase tracking-widest border-b border-line pb-1.5 mb-2">Risk & Drawdowns</div>
            {/* The deepest fall from a peak, in dollars and, separately, the largest in % (they can be different falls). */}
            <div className="flex justify-between"><span className="text-ink-muted">Max DD</span><span className="font-bold text-loss">{formatCurrency(data.maxDrawdownAmt)}</span></div>
            <div className="flex justify-between"><span className="text-ink-muted">Max DD (%)</span><span className="font-bold text-loss">{formatNumber(data.maxDrawdownPct)}%</span></div>
            <div className="flex justify-between pt-1"><span className="text-ink-muted">Recovery</span><span className="font-bold text-ink">{formatNumber(data.recoveryFactor)}</span></div>
          </div>
          <div className="pt-1 px-[21px] space-y-4">
            <div className="text-[10px] font-bold text-ink-muted uppercase tracking-widest border-b border-line pb-1.5 mb-2">Streaks</div>
            
            {(() => {
              const maxWin = data.countAtMaxWinAmt || 0;
              const maxLoss = data.countAtMaxLossAmt || 0;
              const maxTotal = maxWin + maxLoss || 1;
              const winPct = (maxWin / maxTotal) * 100;
              const lossPct = (maxLoss / maxTotal) * 100;

              const avgWin = data.avgConsWin || 0;
              const avgLoss = data.avgConsLoss || 0;
              const avgTotal = avgWin + avgLoss || 1;
              const avgWinPct = (avgWin / avgTotal) * 100;
              const avgLossPct = (avgLoss / avgTotal) * 100;

              return (
                <>
                  <div className="flex flex-col gap-1">
                    <div className="flex justify-between text-[10px] font-bold text-ink-muted">
                      <span>Loss Streaks</span>
                      <span>Win Streaks</span>
                    </div>
                    <PieceBar heightClass="h-6 [--piece-min:1.5rem]" className="my-0.5 text-[11px] font-bold text-white" pieces={[
                      { key: 'loss', share: lossPct, color: 'bg-loss', label: maxLoss },
                      { key: 'win', share: winPct, color: 'bg-accent', label: maxWin },
                    ]} />
                  </div>

                  <div className="flex flex-col gap-1">
                    {/* Avg Loss a step darker than before, so it stands apart from the Results grey behind it. */}
                    <PieceBar heightClass="h-6 [--piece-min:1.5rem]" className="my-0.5 text-[11px] font-bold" pieces={[
                      { key: 'loss', share: avgLossPct, color: 'bg-ink-disabled text-ink', label: avgLoss },
                      { key: 'win', share: avgWinPct, color: 'bg-ink text-white', label: avgWin },
                    ]} />
                    <div className="flex justify-between text-[10px] font-bold text-ink-muted">
                      <span>AVG Loss</span>
                      <span>AVG Win</span>
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      </div>

      {/* What the three charts below measure, kept just above them. */}
      <div className="flex justify-end mt-4 mb-2">
        <div className="flex bg-surface-2 p-0.5 rounded-lg" role="group" aria-label="Chart measure">
          {([
            { value: 'COUNT', label: 'W/L', title: 'Wins and losses' },
            { value: 'RR', label: 'RR', title: 'Risk/Reward (R), total' },
            { value: 'AVG_R', label: 'Avg R', title: 'Average R per trade' },
            { value: 'PNL', label: '$', title: 'Net P&L ($)' },
            { value: 'GAIN', label: '%', title: 'Gain (%)' },
          ] as const).map(m => (
            <button
              key={m.value}
              type="button"
              onClick={() => setSelectedMetric(m.value)}
              aria-pressed={selectedMetric === m.value}
              title={m.title}
              className={`h-7 min-w-10 px-2.5 text-[11px] font-bold rounded-md transition ${
                selectedMetric === m.value ? 'bg-white text-ink shadow-sm' : 'text-ink-faint hover:text-ink'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* On a computer Hour and Day share a row and Month takes the next one whole; on an iPad and a phone
          each takes a row whole (shorter on a phone), so the twelve months have room. */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="glass-card p-6 h-[280px] md:h-[400px] flex flex-col md:col-span-2 lg:col-span-1">
          <h3 className="text-xs font-black text-ink uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
            <span className="w-2 h-2 bg-accent rounded-full"></span> Hour of Day
          </h3>
          <div className="flex-1 min-h-0 relative w-full">
            <Bar
              key={`hour-${selectedMetric}-${isPrivacyMode}`}
              data={{
                labels: Array.from({ length: 24 }, (_, i) => `${i}:00`),
              datasets: selectedMetric === 'COUNT' ? [
                  { label: 'Losses', data: data.hourlyLossesArr, backgroundColor: themeColor('loss'), borderRadius: 6, maxBarThickness: 48 },
                  { label: 'BEs', data: data.hourlyBEsArr, backgroundColor: themeColor('ink-disabled'), borderRadius: 6, maxBarThickness: 48 },
                  { label: 'Wins', data: data.hourlyWinsArr, backgroundColor: themeColor('accent'), borderRadius: 6, maxBarThickness: 48 }
                ] : [{ label: metricLabel, data: data.hourlyDataArr, backgroundColor: data.hourlyColors, borderRadius: 6, maxBarThickness: 48 }]
              }}
              options={{
                responsive: true, maintainAspectRatio: false,
                scales: { 
                  y: { border: { display: false }, grid: { color: zeroLineColor }, ticks: { display: false }, stacked: selectedMetric === 'COUNT' }, 
                  // Every hour labelled, standing upright so all 24 fit; an hour not traded in light grey.
                  x: { grid: { display: false }, border: { display: false }, stacked: selectedMetric === 'COUNT', ticks: { autoSkip: false, minRotation: 90, maxRotation: 90, color: (c: { index: number }) => data.hourTraded[c.index] ? themeColor('ink-muted') : themeColor('ink-disabled') } }
                },
                plugins: { legend: { display: false }, tooltip: chartTooltip(data.hourCounts) }
              }}
            />
          </div>
        </div>
        <div className="glass-card p-6 h-[280px] md:h-[400px] flex flex-col md:col-span-2 lg:col-span-1">
          <h3 className="text-xs font-black text-ink uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
            <span className="w-2 h-2 bg-accent rounded-full"></span> Day of Week
          </h3>
          <div className="flex-1 min-h-0 relative w-full">
            <Bar
              key={`dow-${selectedMetric}-${isPrivacyMode}`}
              data={{
                labels: data.activeDowNames,
                datasets: selectedMetric === 'COUNT' ? [
                  { label: 'Losses', data: data.activeDowLosses, backgroundColor: themeColor('loss'), borderRadius: 6, maxBarThickness: 48 },
                  { label: 'BEs', data: data.activeDowBEs, backgroundColor: themeColor('ink-disabled'), borderRadius: 6, maxBarThickness: 48 },
                  { label: 'Wins', data: data.activeDowWins, backgroundColor: themeColor('accent'), borderRadius: 6, maxBarThickness: 48 }
                ] : [{ label: metricLabel, data: data.activeDowData, backgroundColor: data.dowColors, borderRadius: 6, maxBarThickness: 48 }]
              }}
              options={{
                responsive: true, maintainAspectRatio: false,
                layout: { padding: { top: 20, bottom: 20 } },
                scales: {
                  y: { border: { display: false }, grid: { color: zeroLineColor }, ticks: { display: false }, grace: '20%', stacked: selectedMetric === 'COUNT' },
                  // A day not traded yet named in light grey.
                  x: { grid: { display: false }, border: { display: false }, stacked: selectedMetric === 'COUNT', ticks: { color: (c: { index: number }) => data.dowTraded[c.index] ? themeColor('ink-muted') : themeColor('ink-disabled') } }
                },
                plugins: { legend: { display: false }, tooltip: chartTooltip(data.activeDowCounts) }
              }}
              plugins={[barValueLabels]}
            />
          </div>
        </div>

      {/* Months only mean something over a year or more: a recent stretch would show one or two bars. */}
      {!isRecentPeriod(selectedPeriod) && (
      <div className="glass-card p-6 h-[280px] md:h-[400px] flex flex-col w-full md:col-span-2">
        <h3 className="text-xs font-black text-ink uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
          <span className="w-2 h-2 bg-accent rounded-full"></span> Month of Year
        </h3>
        <div className="flex-1 min-h-0 relative w-full">
          <Bar
            key={`moy-${selectedMetric}-${isPrivacyMode}`}
            data={{
              labels: data.activeMoyNames,
              datasets: selectedMetric === 'COUNT' ? [
                { label: 'Losses', data: data.activeMoyLosses, backgroundColor: themeColor('loss'), borderRadius: 6, maxBarThickness: 48 },
                { label: 'BEs', data: data.activeMoyBEs, backgroundColor: themeColor('ink-disabled'), borderRadius: 6, maxBarThickness: 48 },
                { label: 'Wins', data: data.activeMoyWins, backgroundColor: themeColor('accent'), borderRadius: 6, maxBarThickness: 48 }
              ] : [
                {
                  label: metricLabel,
                  data: data.moyRRData,
                  backgroundColor: data.moyRRColors,
                  borderRadius: 6,
                  maxBarThickness: 48,
                }
              ]
            }}
            options={{
              responsive: true, maintainAspectRatio: false,
              // More room above and below on a narrow screen, where the bars' labels stand upright.
              layout: { padding: (c: { chart: { width: number } }) => c.chart.width / 12 < 44 ? { top: 44, bottom: 44 } : { top: 20, bottom: 20 } },
              scales: {
                y: { border: { display: false }, grid: { color: zeroLineColor }, ticks: { display: false }, grace: '20%', stacked: selectedMetric === 'COUNT' },
                // Every month named, level, a month not traded yet in light grey; a smaller font on a phone so all twelve fit.
                x: { grid: { display: false }, border: { display: false }, stacked: selectedMetric === 'COUNT', ticks: {
                  autoSkip: false, maxRotation: 0,
                  color: (c: { index: number }) => data.moyTraded[c.index] ? themeColor('ink-muted') : themeColor('ink-disabled'),
                  font: (c: { chart: { width: number } }) => ({ size: c.chart.width / 12 < 44 ? 10 : 12 }),
                } }
              },
              plugins: { legend: { display: false }, tooltip: chartTooltip(data.activeMoyCounts) }
            }}
            plugins={[barValueLabels]}
          />
        </div>
      </div>
      )}
      </div>

      <SideMatrixTable title="Buy VS Sell Analysis" firstColumn="Symbol" rows={data.matrixSorted} formatCurrency={formatCurrency} />
      <SideMatrixTable title="Timeframe Analysis" firstColumn="Timeframe" shortFirstColumn="TF" rows={data.tfMatrixSorted} formatCurrency={formatCurrency} />
      <SystemReview />
    </div>
  );
}
