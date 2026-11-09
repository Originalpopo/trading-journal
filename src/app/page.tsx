"use client";

import { useJournalStore } from "@/store/useJournalStore";
import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, AlertTriangle, Check, X, Flame } from "lucide-react";
import { disciplineStreak } from "@/lib/discipline";
import DailyTargetBar from "@/components/DailyTargetBar";
import RiskPerTrade from "@/components/RiskPerTrade";
import { useTradingDay } from "@/components/useTradingDay";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  Plugin
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { formatNumber, tooltipPositionOf, fitFontSize } from "@/lib/utils";
import HealthWeather from "@/components/HealthWeather";
import { summarizeTrades, healthTierFromProfitFactor, computePnlDrawdown, calcAccountGrowth, calcTimeWeightedReturn } from "@/lib/stats";
import { addMoney, subMoney } from "@/lib/money";
import { equitySeries, CHART_RANGES, DEFAULT_CHART_RANGE, type ChartRange } from "@/lib/equitySeries";
import { loadBahtRate, formatApproxBaht, type BahtRate } from "@/lib/bahtRate";
import { reconcileBalance, hasActivityAfter, localTimestamp, toCheckRecord } from "@/lib/reconcile";
import BalanceCheckModal from "@/components/BalanceCheckModal";

import PageHeader from "@/components/PageHeader";
import { pageContentLeft } from "@/components/pageEdge";
import "@/lib/chartTooltip";
import { themeColor } from '@/lib/themeColors';
const LAST_DOT_RADIUS = 6;
// A dot on the Equity line's last point (its number is on the chart's title line): orange, or red while the equity
// is below the Low line.
const dashboardLastPointsPlugin: Plugin<'line', { isBelowLow: boolean }> = {
  id: 'dashboardLastPointsPlugin',
  afterDatasetsDraw: (chart, _args, options) => {
    const meta = chart.getDatasetMeta(0);
    if (meta.hidden || meta.data.length === 0) return;
    const pos = tooltipPositionOf(meta.data[meta.data.length - 1]);
    const ctx = chart.ctx;
    ctx.save();
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, LAST_DOT_RADIUS, 0, 2 * Math.PI);
    ctx.fillStyle = options.isBelowLow ? themeColor('loss') : themeColor('accent'); // red-900 / orange-400
    ctx.fill();
    ctx.restore();
  }
};

// The Peak line and the Active DD area wait for the chart's own animation to end, then fade in over this long.
const PEAK_FADE_MS = 300;
// When each chart's Peak line started fading in; null while the chart is animating (or has not finished yet).
const peakShownAt = new WeakMap<ChartJS<'line'>, number | null>();
const peakAlpha = (chart: ChartJS<'line'>) => {
  const shownAt = peakShownAt.get(chart);
  return shownAt == null ? 0 : Math.min(1, (performance.now() - shownAt) / PEAK_FADE_MS);
};
// Whether the chart's lines are still moving into place. Only their points count: the tooltip animates on the same
// chart, and pointing at the chart must not hide the Peak line.
type Animating = { $animations?: Record<string, { active: () => boolean }> };
const linesAnimating = (chart: ChartJS<'line'>) => chart.data.datasets.some((_, i) => {
  const meta = chart.getDatasetMeta(i);
  return [meta.dataset, ...meta.data].some(el => Object.values((el as Animating | undefined)?.$animations ?? {}).some(a => a.active()));
});
const startPeakFade = (chart: ChartJS<'line'>) => {
  peakShownAt.set(chart, performance.now());
  const step = () => {
    if (!chart.ctx) return; // destroyed
    chart.draw();
    if (peakAlpha(chart) < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
};

// While the equity is below its highest point, a faint dashed line marks that peak (the Peak line): from the peak's
// point on the orange line to its latest point, the stretch the equity has been under it.
// Below it, a red dashed line (the Low line) marks the lowest the equity fell between the peak before and the latest
// peak, shown only once the equity is under it too.
const peakEquityLinePlugin: Plugin<'line', { peak: number | null; peakIndex: number; low: number | null; lowIndex: number; current: number }> = {
  id: 'peakEquityLine',
  // Hidden while the chart animates (first load, new data); once the animation is over it fades in. The last
  // animated frame still counts as animating, so the check runs again on the frame after it.
  afterDraw: (chart) => {
    if (linesAnimating(chart)) {
      peakShownAt.set(chart, null);
      requestAnimationFrame(() => {
        if (chart.ctx && !linesAnimating(chart) && peakShownAt.get(chart) == null) startPeakFade(chart);
      });
    } else if (peakShownAt.get(chart) == null) {
      startPeakFade(chart);
    }
  },
  // The Active DD area: the gap between the Peak line and the equity below it, hatched in thin red diagonals —
  // how far it has fallen. Drawn before the lines, so the orange Equity line stays on top of it.
  beforeDatasetsDraw: (chart, _args, options) => {
    const { peak, peakIndex, current } = options;
    const meta = chart.getDatasetMeta(0);
    const alpha = peakAlpha(chart);
    if (peak === null || current >= peak || meta.hidden || !meta.dataset || alpha === 0) return;
    const yScale = chart.scales.y;
    const points = meta.data.slice(Math.min(peakIndex, meta.data.length - 1));
    if (!yScale || points.length < 2) return;
    const left = points[0].x;
    const right = points[points.length - 1].x;
    const top = yScale.getPixelForValue(peak);
    const bottom = Math.max(...points.map(p => p.y));
    if (!(bottom > top)) return;
    const ctx = chart.ctx;
    ctx.save();
    ctx.globalAlpha = alpha;
    // Only the stretch below the peak line...
    ctx.beginPath();
    ctx.rect(left, top, right - left, bottom - top);
    ctx.clip();
    // ...and above the Equity line, as drawn (curve included): its path closed along the top of the canvas.
    ctx.beginPath();
    (meta.dataset as unknown as { path: (c: CanvasRenderingContext2D) => unknown }).path(ctx);
    ctx.lineTo(meta.data[meta.data.length - 1].x, -1);
    ctx.lineTo(meta.data[0].x, -1);
    ctx.closePath();
    ctx.clip();
    ctx.beginPath();
    ctx.lineWidth = 1;
    ctx.strokeStyle = themeColor('loss', 0.35); // red-900
    const height = bottom - top;
    for (let x = left - height; x < right; x += 6) {
      ctx.moveTo(x, bottom);
      ctx.lineTo(x + height, top);
    }
    ctx.stroke();
    ctx.restore();
  },
  afterDatasetsDraw: (chart, _args, options) => {
    const { peak, peakIndex, low, lowIndex, current } = options;
    const meta = chart.getDatasetMeta(0);
    const alpha = peakAlpha(chart);
    if (peak === null || current >= peak || meta.hidden || alpha === 0) return;
    if (low !== null && current < low) drawLowLine(chart, low, lowIndex, current, alpha);
    const yScale = chart.scales.y;
    const start = meta.data[Math.min(peakIndex, meta.data.length - 1)];
    const end = meta.data[meta.data.length - 1];
    if (!yScale || !start || !end) return;
    const left = start.x;
    const right = end.x;
    const y = yScale.getPixelForValue(peak);
    const ctx = chart.ctx;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.setLineDash([6, 6]);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = themeColor('accent', 0.45); // orange-400, as faint as the Low line
    ctx.moveTo(left, y);
    ctx.lineTo(right, y);
    ctx.stroke();

    ctx.setLineDash([]);
    ctx.fillStyle = themeColor('accent', 0.7); // orange-400, as the Low label
    ctx.font = '10px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    const isPrivacyMode = useJournalStore.getState().isPrivacyMode;
    // With how far the equity now is below it, e.g. "Peak $41.08 (-$13.30)".
    const gap = subMoney(current, peak);
    const label = isPrivacyMode ? 'Peak' : `Peak $${formatNumber(peak)} (-$${formatNumber(Math.abs(gap))})`;
    // Above the line's start; moved left when it would run past the page's right edge (a recent peak).
    const labelX = Math.max(0, Math.min(left + 4, chart.width - ctx.measureText(label).width - 4));
    ctx.fillText(label, labelX, y - 4);
    ctx.restore();
  }
};

// The Low line, shown only while the equity is below it: red and dashed like the Peak line, from the low's point to
// the latest one, its label under it with how far below it the equity is. The stretch of the Equity line under it is
// drawn again in red.
const drawLowLine = (chart: ChartJS<'line'>, low: number, lowIndex: number, current: number, alpha: number) => {
  const meta = chart.getDatasetMeta(0);
  const yScale = chart.scales.y;
  const start = meta.data[Math.min(lowIndex, meta.data.length - 1)];
  const end = meta.data[meta.data.length - 1];
  if (!yScale || !start || !end) return;
  const y = yScale.getPixelForValue(low);
  const ctx = chart.ctx;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.setLineDash([6, 6]);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = themeColor('loss', 0.45); // red-900
  ctx.moveTo(start.x, y);
  ctx.lineTo(end.x, y);
  ctx.stroke();

  // The Equity line, as drawn (curve included), only where it is right of the low and below the line.
  ctx.save();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.rect(start.x, y, chart.width - start.x, chart.height - y);
  ctx.clip();
  ctx.beginPath();
  (meta.dataset as unknown as { path: (c: CanvasRenderingContext2D) => unknown }).path(ctx);
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = themeColor('loss'); // red-900
  ctx.stroke();
  ctx.restore();

  ctx.setLineDash([]);
  ctx.fillStyle = themeColor('loss', 0.7);
  ctx.font = '10px "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  const isPrivacyMode = useJournalStore.getState().isPrivacyMode;
  const gap = subMoney(current, low);
  const label = isPrivacyMode ? 'Low' : `Low $${formatNumber(low)} (-$${formatNumber(Math.abs(gap))})`;
  const labelX = Math.max(0, Math.min(start.x + 4, chart.width - ctx.measureText(label).width - 4));
  ctx.fillText(label, labelX, y + 4);
  ctx.restore();
};

// The Balance area's grey carried out past the chart, so the chart has no card around it: inside the
// canvas from the last Balance point to the right edge, and below the chart's bottom a grey block behind the
// rest of the page (in the page itself, not the scroll area's background, which iOS lags behind on a fast
// scroll). The block's place is measured on every chart draw and handed over as CSS variables.
const BALANCE_FILL = 'rgba(0, 0, 0, 0.03)';
const pageFillPlugin: Plugin<'line'> = {
  id: 'pageFill',
  beforeDatasetsDraw: (chart) => {
    const points = chart.getDatasetMeta(1).data;
    const last = points[points.length - 1];
    if (!last) return;
    const first = points[0];
    const x = Math.round(last.x);
    const x0 = Math.round(first.x);
    const ctx = chart.ctx;
    ctx.save();
    ctx.fillStyle = BALANCE_FILL;
    ctx.fillRect(x, last.y, chart.width - x, chart.chartArea.bottom - last.y);
    // Left of the first point too, under the floating sidebar to the window's edge.
    ctx.fillRect(0, first.y, x0, chart.chartArea.bottom - first.y);
    ctx.restore();
  },
  afterDraw: (chart) => {
    const main = chart.canvas.closest('main');
    const page = chart.canvas.closest<HTMLElement>('[data-page-fill]');
    if (!main || !page) return;
    const pageBox = page.getBoundingClientRect();
    const mainBox = main.getBoundingClientRect();
    const top = Math.round(chart.canvas.getBoundingClientRect().top - pageBox.top + chart.chartArea.bottom);
    page.style.setProperty('--fill-top', `${top}px`);
    page.style.setProperty('--fill-left', `${mainBox.left + main.clientLeft - pageBox.left}px`);
    page.style.setProperty('--fill-width', `${main.clientWidth}px`);
    page.style.setProperty('--fill-bottom', `-${getComputedStyle(main).paddingBottom}`);
  },
};

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

export default function Dashboard() {
  const { trades, funding, isLoading, isPrivacyMode } = useJournalStore();

  // Today's reference rate, for the rough baht figures under Balance and Net Profit.
  const [bahtRate, setBahtRate] = useState<BahtRate | null>(null);
  useEffect(() => {
    let isMounted = true;
    loadBahtRate().then(rate => { if (isMounted) setBahtRate(rate); });
    return () => { isMounted = false; };
  }, []);
  const bahtRateNote = bahtRate ? `Rough estimate at 1 USD = ${bahtRate.rate.toFixed(2)} THB (reference rate of ${bahtRate.date}). A bank pays less.` : undefined;
  const balanceCheck = useJournalStore(state => state.preferences.balanceCheck);
  const dayNotes = useJournalStore(state => state.dayNotes);
  const { startHour } = useTradingDay();
  // Clean trading days in a row, over all trades: the same figure as on the Notes page.
  // Trading on after the daily target does not break the streak: whether it pays is being measured on the Notes page.
  const streak = useMemo(() => disciplineStreak(trades, dayNotes, startHour), [trades, dayNotes, startHour]);
  const [isBalanceCheckOpen, setIsBalanceCheckOpen] = useState(false);
  // Recomputed from the saved broker balance, so a trade added or removed later shows up here.
  const brokerCheck = useMemo(
    () => (balanceCheck ? reconcileBalance(balanceCheck, trades, funding) : null),
    [balanceCheck, trades, funding],
  );
  const saveBalanceCheck = useJournalStore(state => state.saveBalanceCheck);
  const [isConfirmingMatch, setIsConfirmingMatch] = useState(false);
  // Ask again whenever the last check no longer vouches for the balance on screen.
  const needsBrokerCheck = !balanceCheck || !brokerCheck?.matches || hasActivityAfter(balanceCheck, trades, funding);
  const [ddMode, setDdMode] = useState<'r' | 'usd'>('r');
  // The chart runs edge to edge of the page (sidebar to the right edge) while its title stays in the
  // column: `bleed` is how far the page reaches past the title row on each side, measured whenever the page
  // changes width. The chart's grey below it (pageFillPlugin) is measured again then too.
  const chartTitleRef = useRef<HTMLDivElement>(null);
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
      const canvas = main.querySelector('canvas');
      if (canvas) ChartJS.getChart(canvas)?.draw();
    });
    observer.observe(main);
    return () => observer.disconnect();
    // Again once loading is over: the chart's title row isn't on the page before that.
  }, [isLoading]);
  // A new bleed widens the chart's box; Chart.js can miss that change (it kept the old width, short of the
  // right edge, on a wide screen), so the chart is sized to its box again once the margins are in.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const canvas = document.querySelector('main canvas');
      if (canvas instanceof HTMLCanvasElement) ChartJS.getChart(canvas)?.resize();
    });
    return () => cancelAnimationFrame(frame);
  }, [bleed]);
  const [now] = useState(() => Date.now()); // for "days below the peak"

  const data = useMemo(() => {
    let totalFunded = 0;
    let totalDeposit = 0;
    let totalWithdraw = 0;

    if (funding.length > 0) {
      funding.forEach(f => {
        totalDeposit = addMoney(totalDeposit, f.deposit);
        totalWithdraw = addMoney(totalWithdraw, f.withdraw);
      });
      totalFunded = subMoney(totalDeposit, totalWithdraw);
    }

    const timelineEvents: { type: 'trade' | 'funding', timeObj: number, data: any }[] = [];
    trades.forEach(t => timelineEvents.push({ type: 'trade', timeObj: new Date(t.time.replace(' ', 'T')).getTime(), data: t }));
    funding.forEach(f => timelineEvents.push({ type: 'funding', timeObj: new Date(f.time.replace(' ', 'T')).getTime(), data: f }));
    timelineEvents.sort((a, b) => a.timeObj - b.timeObj);

    let runningBalance = 0;
    timelineEvents.forEach(evt => {
      runningBalance = evt.type === 'funding'
        ? subMoney(addMoney(runningBalance, evt.data.deposit), evt.data.withdraw)
        : addMoney(runningBalance, evt.data.profit);
    });

    const summary = summarizeTrades(timelineEvents.filter(evt => evt.type === 'trade').map(evt => evt.data));
    // `type` goes last: some old imported trades have their own `type` field (order type).
    const drawdowns = computePnlDrawdown(timelineEvents.map(evt => ({ ...evt.data, type: evt.type, time: evt.timeObj })));

    return {
      totalFunded, totalDeposit, totalWithdraw, runningBalance,
      net: summary.netProfit, winRate: summary.winRate,
      // Growth from trading alone (time-weighted): a deposit or withdrawal never moves it.
      accountGrowth: calcTimeWeightedReturn(timelineEvents.map(evt => (evt.type === 'trade'
        ? { type: 'trade' as const, profit: evt.data.profit }
        : { type: 'funding' as const, deposit: evt.data.deposit, withdraw: evt.data.withdraw }))),
      // Net profit on everything deposited: what the money put in has earned, falls when more is deposited.
      returnOnDeposits: calcAccountGrowth(summary.netProfit, totalDeposit),
      countTP: summary.wins, countBE: summary.bes, countSL: summary.losses, totalTrades: trades.length,
      netRR: summary.netRR, profitFactor: summary.profitFactor,
      // A stop moved to break-even and hit is about 0R whatever 1R was, so only the others matter.
      estimatedRCount: trades.filter(t => t.riskIsEstimate && t.resultType !== 'BE').length,
      expectancyR: summary.expectancyR, expectedPayoff: summary.expectedPayoff, sharpeRatio: summary.sharpeRatio,
      avgTPRR: summary.avgTPRR, maxTPRR: summary.maxTPRR,
      avgSLRR: summary.avgSLRR, maxSLRR: summary.maxSLRR,
      maxStreakW: summary.maxConsWinCount, maxStreakL: summary.maxConsLossCount,
      drawdowns,
      // For the chart, which shows one range of it at a time.
      seriesEvents: timelineEvents.map(evt => ({ type: evt.type, time: evt.timeObj, profit: evt.data.profit, deposit: evt.data.deposit, withdraw: evt.data.withdraw })),
    };
  }, [trades, funding]);

  // The chart's range, remembered in this browser (1M until one is picked).
  const [chartRange, setChartRange] = useState<ChartRange>(() => {
    try {
      const saved = localStorage.getItem('dashboardChartRange');
      return (CHART_RANGES as readonly string[]).includes(saved ?? '') ? (saved as ChartRange) : DEFAULT_CHART_RANGE;
    } catch {
      return DEFAULT_CHART_RANGE;
    }
  });
  const pickChartRange = (range: ChartRange) => {
    setChartRange(range);
    try { localStorage.setItem('dashboardChartRange', range); } catch { /* not remembered */ }
  };
  const series = useMemo(() => equitySeries(data.seriesEvents, chartRange, now), [data.seriesEvents, chartRange, now]);
  // The Peak line and the Active DD area show on every range: they only ever show the drawdown under way now, and a
  // long one is seen whole only on a long range (on a short one it starts at the left edge).
  const showPeak = trades.length > 0;
  // Below the Low line: the line shows, and the Equity line under it and its end dot turn red.
  const isBelowLow = showPeak && series.low !== null && series.current < series.low;

  // "Yes" records that the broker showed exactly the journal's balance at this moment.
  const confirmBrokerMatch = async () => {
    setIsConfirmingMatch(true);
    try {
      await saveBalanceCheck(toCheckRecord({ time: localTimestamp(), balance: data.runningBalance }, trades, funding));
    } catch {
      alert("Failed to save the balance check.");
    } finally {
      setIsConfirmingMatch(false);
    }
  };

  const chartDataConfig = useMemo(() => {
    return {
      labels: series.labels,
      datasets: [
        {
          label: 'Equity (PnL)',
          data: series.equity,
          borderColor: themeColor('accent'),
          borderWidth: 3,
          fill: false,
          tension: 0.4,
          pointRadius: 0,
          // A small orange dot, ringed in white, on the point being looked at.
          pointHoverRadius: 4,
          pointHoverBorderWidth: 2,
          pointHoverBorderColor: themeColor('card'),
          pointHoverBackgroundColor: themeColor('accent'),
          yAxisID: 'y'
        },
        {
          label: 'Balance',
          data: series.balance,
          borderColor: 'transparent',
          borderWidth: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.03)',
          fill: true,
          tension: 0.4,
          pointRadius: 0,
          pointHoverRadius: 0,
          yAxisID: 'y1'
        }
      ]
    };
  }, [series]);

  // The top cards' big figures: 30px, or smaller when a long one would not fit its card.
  const growthText = `${formatNumber(data.accountGrowth)}%`;
  const winRateText = `${formatNumber(data.winRate * 100)}%`;
  const netText = isPrivacyMode ? '***' : `${data.net < 0 ? '-' : ''}$${formatNumber(Math.abs(data.net))}`;
  const balanceText = isPrivacyMode ? '***' : `$${formatNumber(data.runningBalance)}`;

  // The last dot ends 10px short of the page's right edge.
  const chartRightPadding = LAST_DOT_RADIUS + 10;

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    layout: {
      padding: { left: bleed.rail, right: chartRightPadding, top: 35, bottom: 20 }
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        mode: 'index' as const,
        intersect: false,
        callbacks: {
          label: (item: { datasetIndex: number; raw: unknown }) => {
            const v = Number(item.raw ?? 0);
            const name = item.datasetIndex === 0 ? 'Equity' : 'Balance';
            return `${name}: ${isPrivacyMode ? '***' : `${v < 0 ? '-' : ''}$${formatNumber(Math.abs(v))}`}`;
          },
        },
      },
      peakEquityLine: { peak: showPeak ? series.peak : null, peakIndex: series.peakIndex, low: series.low, lowIndex: series.lowIndex, current: series.current },
      dashboardLastPointsPlugin: { isBelowLow }
    },
    scales: {
      x: { display: false },
      y: {
        type: 'linear' as const,
        display: true,
        // Keeps the peak line inside the chart, also when the peak came before the range or the plotted daily
        // points sit below it.
        suggestedMax: showPeak ? series.peak : undefined,
        position: 'left' as const,
        // No line along the bottom: the Balance grey carries on below it (pageFillPlugin).
        grid: { color: (c: { index: number }) => (c.index === 0 ? 'transparent' : themeColor('surface')), drawOnChartArea: true },
        ticks: { display: false },
        border: { display: false }
      },
      y1: {
        type: 'linear' as const,
        display: false,
        position: 'right' as const,
        grid: { drawOnChartArea: false },
      }
    },
    interaction: {
      mode: 'index' as const,
      intersect: false,
    }
  };

  // Measured on the trading result alone, in R (comparable at any account size) or in dollars.
  const displayDD = data.drawdowns[ddMode];
  const isRMode = ddMode === 'r';
  const ddMax = isRMode ? displayDD.max : displayDD.maxPercent;
  const ddActive = isRMode ? displayDD.active : displayDD.activePercent;
  const ddUnit = isRMode ? ' R' : '%';
  const ddDays = displayDD.peakTime ? Math.max(0, Math.floor((now - displayDD.peakTime) / 86_400_000)) : 0;
  const stretchText = (trades: number, days: number) =>
    `${trades} trade${trades === 1 ? '' : 's'}${days > 0 ? ` · ${days} day${days === 1 ? '' : 's'}` : ''}`;
  // Two lines while below the peak, so the card never wraps it mid-phrase: "13 trades", then "2 days below the peak".
  const belowPeakLines = displayDD.active > 0
    ? [stretchText(displayDD.tradesBelowPeak, 0), `${ddDays > 0 ? `${ddDays} day${ddDays === 1 ? '' : 's'} ` : ''}below the peak`]
    : ['At the peak'];
  // The longest stretch below a peak so far, to set this one against: by trades, with that stretch's own days.
  // The one under way is the longest once it has more trades (or as many, for longer).
  const currentMs = displayDD.peakTime ? Math.max(0, now - displayDD.peakTime) : 0;
  const isLongestNow = displayDD.active > 0 && (displayDD.tradesBelowPeak > displayDD.longestTrades
    || (displayDD.tradesBelowPeak === displayDD.longestTrades && currentMs > displayDD.longestMs));
  const longestText = isLongestNow
    ? 'Longest: this one'
    : displayDD.longestTrades > 0 ? `Longest: ${stretchText(displayDD.longestTrades, Math.floor(displayDD.longestMs / 86_400_000))}` : null;

  // The gauge shows only the drawdown still under way: where it is now, and the deepest it has been.
  // Both clear at a new peak. A full gauge is the drawdown before this one, or this one once it is deeper.
  const ddActiveMax = isRMode ? displayDD.activeMax : displayDD.activeMaxPercent;
  const isInDrawdown = displayDD.active > 0;
  const ddPrevious = isRMode ? displayDD.previousMax : displayDD.previousMaxPercent;
  const ddScaleMax = Math.max(ddPrevious, ddActiveMax);
  const activeBarHeightPct = isInDrawdown ? Math.min(100, Math.max(6, (ddActive / ddScaleMax) * 100)) : 0;
  const gaugeNote = ddPrevious > 0
    ? `Full = the previous drawdown, ${formatNumber(ddPrevious)}${ddUnit} at its deepest`
    : 'Full = the deepest point of this drawdown (there is no earlier one yet)';
  const maxCapBottomPct = Math.min(95, Math.max(activeBarHeightPct, (ddActiveMax / ddScaleMax) * 100));

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-ink-muted font-semibold animate-pulse">Loading dashboard...</p>
      </div>
    );
  }

  return (
    <div data-page-fill className="relative isolate space-y-8">
      {/* The Balance grey below the chart, to the page's edges and bottom (placed by pageFillPlugin). */}
      <div
        aria-hidden="true"
        className="absolute -z-10 pointer-events-none !m-0"
        style={{ top: 'var(--fill-top, 100%)', left: 'var(--fill-left, 0)', width: 'var(--fill-width, 100%)', bottom: 'var(--fill-bottom, 0)', background: BALANCE_FILL }}
      />
      <BalanceCheckModal isOpen={isBalanceCheckOpen} onClose={() => setIsBalanceCheckOpen(false)} />
      {/* Title and cards keep the same 24px gap as the other pages' headers. */}
      <section className="space-y-6">
        <PageHeader title="Dashboard">
          <HealthWeather tier={healthTierFromProfitFactor(data.profitFactor, data.totalTrades)} />
        </PageHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="@container glass-card p-6 flex flex-col justify-center items-center text-center">
            <p className="text-ink-faint text-[10px] font-bold uppercase tracking-wider mb-1">Account Growth</p>
            {/* Pointing at the figure (or tapping it on a phone) shows the return on deposits, which unlike
                Account Growth falls when more money is deposited. */}
            <p style={fitFontSize(growthText, '1.875rem')} tabIndex={0} className="group relative leading-9 font-extrabold stat-value text-ink cursor-default outline-none">
              {growthText}
              <span role="tooltip" className="pointer-events-none absolute left-1/2 top-full -translate-x-1/2 mt-0.5 whitespace-nowrap rounded-md bg-ink px-2 py-1 text-[10px] font-bold leading-none text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus:opacity-100 z-10">
                On deposits {formatNumber(data.returnOnDeposits)}%
              </span>
            </p>
          </div>
          <div className="@container bg-accent p-6 rounded-[1.25rem] border border-accent shadow-lg shadow-accent/20 flex flex-col justify-center items-center text-center">
            <span className="text-[10px] font-bold text-white uppercase tracking-widest mb-1">Win Rate</span>
            <span style={fitFontSize(winRateText, '1.875rem')} className="leading-9 font-extrabold stat-value text-white">
              {winRateText}
            </span>
          </div>
          <div className="@container glass-card p-6 flex flex-col justify-center items-center text-center">
            <p className="text-ink-faint text-[10px] font-bold uppercase tracking-wider mb-1">Net Profit</p>
            <p style={fitFontSize(netText, '1.875rem')} className={`leading-9 font-extrabold stat-value ${data.net >= 0 ? 'text-accent' : 'text-loss'}`}>
              {netText}
            </p>
            {bahtRate && !isPrivacyMode && (
              <p className="text-[10px] font-normal text-ink-faint" title={bahtRateNote}>{formatApproxBaht(data.net, bahtRate.rate)}</p>
            )}
          </div>
          <div className="@container glass-card p-6 h-full flex flex-col justify-center items-center text-center">
            {/* The broker check sits as icons beside the label, so the card keeps the same three lines as Net Profit:
                a mismatch first, else Yes / No when a check is due, else the tick of the last match. */}
            <div className="flex items-center gap-1.5 mb-1">
              <p className="text-ink-faint text-[10px] font-bold uppercase tracking-wider">Balance</p>
              {brokerCheck && !brokerCheck.matches && (
                <button
                  type="button"
                  onClick={() => setIsBalanceCheckOpen(true)}
                  title={`${isPrivacyMode ? 'Differs from broker' : `$${formatNumber(Math.abs(brokerCheck.difference))} ${brokerCheck.difference > 0 ? 'higher' : 'lower'} than broker`} on ${balanceCheck!.time.split('T')[0]}: open the check`}
                  aria-label="Differs from broker: open the check"
                  className="-m-1.5 p-1.5 text-loss hover:opacity-70 transition"
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                </button>
              )}
              {brokerCheck?.matches && !needsBrokerCheck && (
                <button
                  type="button"
                  onClick={() => setIsBalanceCheckOpen(true)}
                  title={`Matched broker on ${balanceCheck!.time.split('T')[0]}`}
                  aria-label="Matched broker: open the check"
                  className="-m-1.5 p-1.5 text-accent hover:opacity-70 transition"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                </button>
              )}
              {needsBrokerCheck && (!brokerCheck || brokerCheck.matches) && (
                <span className="-my-1 flex items-center gap-1">
                  <button
                    type="button"
                    disabled={isConfirmingMatch}
                    onClick={confirmBrokerMatch}
                    title={isPrivacyMode ? "The broker's Balance is the same as this one" : `The broker's Balance is exactly $${formatNumber(data.runningBalance)} right now`}
                    aria-label="Same as broker"
                    className="w-6 h-6 flex items-center justify-center rounded-md border bg-accent-soft text-accent border-accent-line hover:bg-accent-line transition disabled:opacity-50"
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsBalanceCheckOpen(true)}
                    title="The broker shows a different amount: enter it to see the difference"
                    aria-label="Differs from broker"
                    className="w-6 h-6 flex items-center justify-center rounded-md border bg-surface text-ink-muted border-line hover:bg-surface-2 transition"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </span>
              )}
            </div>
            <p style={fitFontSize(balanceText, '1.875rem')} className="leading-9 font-extrabold stat-value text-ink">
              {balanceText}
            </p>
            {bahtRate && !isPrivacyMode && (
              <p className="text-[10px] font-normal text-ink-faint" title={bahtRateNote}>{formatApproxBaht(data.runningBalance, bahtRate.rate)}</p>
            )}
          </div>
        </div>
      </section>

      {/* From lg up: today's target across three columns, the risk per trade in the fourth (under Balance), one
          height. Below lg they stack. */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3 min-w-0 flex flex-col">
          <DailyTargetBar />
        </div>
        <div className="lg:col-start-4 min-w-0 flex flex-col">
          <RiskPerTrade />
        </div>
      </div>

      <div className="px-6 pt-6 h-[350px] flex flex-col">
        {/* The title alone; the equity's figure is not shown (the Peak line's label gives how far below it is). */}
        <div ref={chartTitleRef} className="flex items-center justify-between gap-3 mb-4">
          <h3 className="text-xs font-black text-ink uppercase tracking-[0.2em] whitespace-nowrap flex items-center gap-2 min-w-0">
            <span className="w-2 h-2 bg-accent rounded-full shrink-0"></span> {/* Shorter on a phone, so it shares the line with the range buttons */}
            <span className="truncate"><span className="sm:hidden">Equity</span><span className="hidden sm:inline">Equity and Balance</span></span>
          </h3>
          {/* Same look as the Drawdown card's R / $ switch. */}
          <div className="flex items-center bg-surface-2 p-0.5 rounded-md border border-line shadow-sm shrink-0">
            {CHART_RANGES.map(range => (
              <button
                key={range}
                onClick={() => pickChartRange(range)}
                className={`text-[10px] font-bold px-2.5 md:px-3 py-1.5 md:py-1 rounded transition-all ${
                  chartRange === range ? 'bg-white text-ink shadow-md' : 'text-ink-faint hover:text-ink'
                }`}
              >
                {range === 'ALL' ? 'All' : range}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 relative min-w-0" style={{ marginLeft: -bleed.left, marginRight: -bleed.right }}>
          <Line key={`dashboard-chart-${isPrivacyMode}`} data={chartDataConfig} options={chartOptions} plugins={[peakEquityLinePlugin, dashboardLastPointsPlugin, pageFillPlugin]} />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        <div className="glass-card p-6 space-y-5">
          <h3 className="text-xs font-black text-ink uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
            <span className="w-2 h-2 bg-accent rounded-full"></span> Statistics
          </h3>
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-ink-faint">Total Trades</span>
              <span className="font-black text-ink text-2xl">{data.totalTrades}</span>
            </div>
            {/* Bad on the left, good on the right, as on the Performance page. */}
            <div className="grid grid-cols-3 gap-2 mt-4">
              <div className="bg-loss-soft p-3 rounded-lg text-center border border-loss-line">
                <p className="text-[9px] font-bold text-loss uppercase mb-1">SL</p>
                <p className="text-sm font-black text-loss">{data.countSL}</p>
              </div>
              <div className="bg-surface p-3 rounded-lg text-center border border-line">
                <p className="text-[9px] font-bold text-ink-faint uppercase mb-1">BE</p>
                <p className="text-sm font-black text-ink-faint">{data.countBE}</p>
              </div>
              <div className="bg-accent-soft p-3 rounded-lg text-center border border-accent-line">
                <p className="text-[9px] font-bold text-accent uppercase mb-1">TP</p>
                <p className="text-sm font-black text-accent">{data.countTP}</p>
              </div>
            </div>
            <div className="flex justify-between items-center pt-2 border-t border-line">
              <span className="text-xs font-bold text-ink-faint">Total Deposit</span>
              <span className="font-black text-sm text-loss">{isPrivacyMode ? '***' : `$${formatNumber(data.totalDeposit)}`}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-ink-faint">Total Withdraw</span>
              <span className="font-black text-sm text-accent">{isPrivacyMode ? '***' : `$${formatNumber(data.totalWithdraw)}`}</span>
            </div>
            <div className="flex justify-between items-center pt-2 border-t border-line">
              <span className="text-xs font-bold text-ink-faint">Capital</span>
              <span className="font-black text-sm text-ink">{isPrivacyMode ? '***' : `$${formatNumber(data.totalFunded)}`}</span>
            </div>
          </div>
        </div>

        <div className="glass-card p-6 space-y-5">
          <h3 className="text-xs font-black text-ink uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
            <span className="w-2 h-2 bg-accent rounded-full"></span> Reward to Risk
          </h3>
          <div className="space-y-4 pt-2">
            <div className="flex justify-between items-center">
              <span className="text-[11px] font-bold text-ink-faint">Avg TP RR</span>
              <span className="text-[12px] font-black text-accent">{formatNumber(data.avgTPRR)} R</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[11px] font-bold text-ink-faint">Max TP RR</span>
              <span className="text-[12px] font-black text-accent">{data.maxTPRR > 0 ? formatNumber(data.maxTPRR) : '0.00'} R</span>
            </div>
            <div className="flex justify-between items-center pt-2 border-t border-line">
              <span className="text-[11px] font-bold text-ink-faint">Avg SL RR</span>
              <span className="text-[12px] font-black text-loss">{formatNumber(data.avgSLRR)} R</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[11px] font-bold text-ink-faint">Max SL RR</span>
              <span className="text-[12px] font-black text-loss">{data.maxSLRR < 0 ? formatNumber(data.maxSLRR) : '0.00'} R</span>
            </div>
            <div className="flex justify-between items-center pt-2 border-t border-line">
              <span className="text-[11px] font-bold text-ink-faint">Consecutive Loss (Max)</span>
              <span className="text-[12px] font-black text-loss">{data.maxStreakL}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[11px] font-bold text-ink-faint">Consecutive Win (Max)</span>
              <span className="text-[12px] font-black text-accent">{data.maxStreakW}</span>
            </div>
          </div>
        </div>

        <div className="glass-card p-6 flex flex-col h-full relative">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-black text-ink uppercase tracking-[0.2em] flex items-center gap-2">
              <span className="w-2 h-2 bg-accent rounded-full"></span> Drawdown
            </h3>
          </div>

          <div className="flex items-stretch justify-between gap-4 pt-2 flex-1 min-h-[200px] mb-8">
            <div className="flex flex-col justify-between z-10 flex-1 pr-2 py-1">
              {/* Active DD first: the drawdown under way now, then the deepest there has been. In $ mode the dollars
                  sit after the label, so no line moves when switching R and $. */}
              <div>
                <p className="text-[10px] font-black text-ink-faint uppercase tracking-widest mb-1">
                  Active DD
                  {!isRMode && (
                    <span className="ml-1.5 normal-case tracking-normal font-bold text-ink-muted">
                      {isPrivacyMode ? '***' : `$${formatNumber(displayDD.active)}`}
                    </span>
                  )}
                </p>
                <p className="text-2xl font-extrabold text-loss">{formatNumber(ddActive)}{ddUnit}</p>
                <p className="text-[10px] font-normal text-ink-faint mt-1">
                  {belowPeakLines.map((line, i) => <span key={i} className="block">{line}</span>)}
                </p>
                {longestText && <p className="text-[10px] font-normal text-ink-faint">{longestText}</p>}
              </div>

              <div className="w-full border-t border-line my-auto"></div>

              <div>
                <p className="text-[10px] font-black text-ink-faint uppercase tracking-widest mb-1">
                  Max DD
                  {!isRMode && (
                    <span className="ml-1.5 normal-case tracking-normal font-bold text-ink-muted" title="The same drop as the % below, in dollars.">
                      {isPrivacyMode ? '***' : `$${formatNumber(displayDD.maxPercentAmount)}`}
                    </span>
                  )}
                </p>
                <p className="text-2xl font-extrabold text-loss">{formatNumber(ddMax)}{ddUnit}</p>
              </div>
            </div>

            <div title={gaugeNote} className="w-16 h-full bg-surface rounded-xl p-1.5 border border-line flex flex-col justify-end items-center relative z-10 shadow-inner">
              {/* Deepest point of the drawdown still under way */}
              {isInDrawdown && <div 
                className="absolute left-1.5 right-1.5 h-1.5 bg-loss rounded-full shadow-[0_0_8px_rgba(127,29,29,0.4)] transition-all duration-700 ease-out z-20"
                style={{ bottom: `${maxCapBottomPct}%` }}
                title={`Deepest point of this drawdown: ${formatNumber(ddActiveMax)}${ddUnit}`}
              />}

              {/* Active DD Bar: hatched like the Active DD area on the chart (thin red-900 diagonals, 6px apart
                  across, the same slant). */}
              <div
                className="w-full rounded-lg transition-all duration-700 ease-out relative z-10"
                style={{
                  height: `${activeBarHeightPct}%`,
                  backgroundImage: `repeating-linear-gradient(-45deg, ${themeColor('loss', 0.35)} 0 1px, transparent 1px 4.24px)`,
                }}
              />
            </div>
          </div>
          
          {/* Lined up with the figures on the left (the card's 24px padding). */}
          <div className="absolute bottom-4 left-6 flex">
            <div className="flex items-center bg-surface-2 p-0.5 rounded-md border border-line shadow-sm">
              {([['r', 'R', 'Drawdown of your cumulative R'], ['usd', '$', 'Drawdown of your cumulative profit and loss in dollars']] as const).map(([mode, label, hint]) => (
                <button
                  key={mode}
                  onClick={() => setDdMode(mode)}
                  title={`${hint}; deposits and withdrawals are not counted`}
                  className={`text-[10px] font-bold px-5 py-1.5 md:py-1 rounded transition-all ${
                    ddMode === mode
                      ? 'bg-white text-ink shadow-md'
                      : 'text-ink-faint hover:text-ink'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="glass-card p-6 flex flex-col space-y-5 h-full">
          <h3 className="text-xs font-black text-ink uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
            <span className="w-2 h-2 bg-accent rounded-full"></span> Performance
          </h3>
          <div className="space-y-4 pt-2">
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-ink-faint">Profit Factor</span>
              <span className="font-black text-ink">{formatNumber(data.profitFactor)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-ink-faint">Expectancy</span>
              {/* The average trade in the dollars it really made, and in R, as if every trade risked the same. */}
              <span className="font-black text-ink">
                {!isPrivacyMode && (
                  <span className="mr-1.5 text-[11px] font-bold text-ink-faint" title="Average profit per trade in dollars">
                    {data.expectedPayoff < 0 ? '-' : ''}${formatNumber(Math.abs(data.expectedPayoff))}
                  </span>
                )}
                {formatNumber(data.expectancyR)} R
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-ink-faint">Sharpe Ratio</span>
              <span className="font-black text-ink">{formatNumber(data.sharpeRatio)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-ink-faint">Net RR</span>
              <span className="font-black text-ink">
                {formatNumber(data.netRR)} R
              </span>
            </div>
            {/* One row, label over the best run, so the card stays the height of its neighbours. */}
            <div className="flex justify-between items-center gap-3 pt-4 border-t border-line"
              title="Trading days in a row with every trade on plan, no rule broken in the day's note. Days without trades are skipped.">
              <div className="min-w-0">
                <p className="text-xs font-bold text-ink-faint">On Plan in a Row</p>
                <p className="text-[10px] font-semibold text-ink-faint">Best {streak.best} {streak.best === 1 ? 'day' : 'days'}</p>
              </div>
              <span className="font-black text-ink flex items-center gap-1 shrink-0">
                <Flame className={`w-4 h-4 ${streak.current > 0 ? 'text-accent' : 'text-ink-disabled'}`} />
                {streak.current} <span className="text-[11px] font-bold text-ink-faint">{streak.current === 1 ? 'day' : 'days'}</span>
              </span>
            </div>
            {data.estimatedRCount > 0 && (
              <p className="text-[10px] font-semibold text-ink-faint text-right" title="Their first stop is unknown, so R uses the default 1R. Enter the first stop on the trade (marked ≈ in History) to make it exact.">
                ≈ {data.estimatedRCount} {data.estimatedRCount > 1 ? 'trades' : 'trade'} on a default 1R
              </p>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
