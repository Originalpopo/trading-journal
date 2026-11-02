"use client";

import { useJournalStore } from "@/store/useJournalStore";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, AlertTriangle, Check, X, Flame } from "lucide-react";
import { disciplineStreak } from "@/lib/discipline";
import DailyTargetBar from "@/components/DailyTargetBar";
import { useDailyTargets } from "@/components/useDailyTargets";
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
import { summarizeTrades, healthTierFromProfitFactor, computePnlDrawdown, calcAccountGrowth } from "@/lib/stats";
import { addMoney, subMoney } from "@/lib/money";
import { loadBahtRate, formatApproxBaht, type BahtRate } from "@/lib/bahtRate";
import { reconcileBalance, hasActivityAfter, localTimestamp, toCheckRecord } from "@/lib/reconcile";
import BalanceCheckModal from "@/components/BalanceCheckModal";

import PageHeader from "@/components/PageHeader";
const LAST_POINT_FONT = 'bold 11px "Plus Jakarta Sans", sans-serif';
const LAST_POINT_GAP = 12; // from the dot's centre to its number

// How wide a last-point number is drawn, so the chart leaves just that much room on its right.
let measureCtx: CanvasRenderingContext2D | null = null;
const lastPointLabelWidth = (text: string) => {
  measureCtx ??= document.createElement('canvas').getContext('2d');
  if (!measureCtx) return 60;
  measureCtx.font = LAST_POINT_FONT;
  return measureCtx.measureText(text).width;
};

// A dot on the last point of each line, with its number beside it unless `labels` is off (phones show the numbers above the chart).
const dashboardLastPointsPlugin: Plugin<'line', { labels?: boolean }> = {
  id: 'dashboardLastPointsPlugin',
  afterDatasetsDraw: (chart, _args, options) => {
    const showLabels = options.labels !== false;
    if (chart.data.datasets.length < 2) return;
    const ctx = chart.ctx;
    const meta0 = chart.getDatasetMeta(0);
    const meta1 = chart.getDatasetMeta(1);
    let pos0: { x: number; y: number } | null = null;
    let val0 = 0;
    if (!meta0.hidden && meta0.data.length > 0) {
      const lastIdx = meta0.data.length - 1;
      pos0 = tooltipPositionOf(meta0.data[lastIdx]);
      val0 = chart.data.datasets[0].data[lastIdx] as number;
    }

    let pos1: { x: number; y: number } | null = null;
    let val1 = 0;
    if (!meta1.hidden && meta1.data.length > 0) {
      const lastIdx = meta1.data.length - 1;
      pos1 = tooltipPositionOf(meta1.data[lastIdx]);
      val1 = chart.data.datasets[1].data[lastIdx] as number;
    }

    let yOffset0 = 0;
    let yOffset1 = 0;

    if (pos0 && pos1) {
      const yDiff = Math.abs(pos0.y - pos1.y);
      if (yDiff < 22) {
        if (pos0.y <= pos1.y) {
          yOffset0 = -12;
          yOffset1 = 12;
        } else {
          yOffset0 = 12;
          yOffset1 = -12;
        }
      }
    }

    if (pos0) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(pos0.x, pos0.y, 6, 0, 2 * Math.PI);
      ctx.fillStyle = '#fb923c';
      ctx.fill();

      if (showLabels) {
        ctx.fillStyle = '#fb923c';
        ctx.font = LAST_POINT_FONT;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        const isPrivacyMode = useJournalStore.getState().isPrivacyMode;
        ctx.fillText(isPrivacyMode ? '***' : formatNumber(val0), pos0.x + LAST_POINT_GAP, pos0.y + yOffset0);
      }
      ctx.restore();
    }

    if (pos1) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(pos1.x, pos1.y, 6, 0, 2 * Math.PI);
      ctx.fillStyle = '#1c1917';
      ctx.fill();

      if (showLabels) {
        ctx.fillStyle = '#1c1917';
        ctx.font = LAST_POINT_FONT;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        const isPrivacyMode = useJournalStore.getState().isPrivacyMode;
        ctx.fillText(isPrivacyMode ? '***' : formatNumber(val1), pos1.x + LAST_POINT_GAP, pos1.y + yOffset1);
      }
      ctx.restore();
    }
  }
};

// While the equity is below its highest point, a faint dashed line marks that peak.
const peakEquityLinePlugin: Plugin<'line', { peak: number | null; current: number }> = {
  id: 'peakEquityLine',
  afterDatasetsDraw: (chart, _args, options) => {
    const { peak, current } = options;
    if (peak === null || current >= peak || chart.getDatasetMeta(0).hidden) return;
    const yScale = chart.scales.y;
    if (!yScale) return;
    const { left, right } = chart.chartArea;
    const y = yScale.getPixelForValue(peak);
    const ctx = chart.ctx;
    ctx.save();
    ctx.beginPath();
    ctx.setLineDash([6, 6]);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(251, 146, 60, 0.2)'; // orange-400, 80% transparent
    ctx.moveTo(left, y);
    ctx.lineTo(right, y);
    ctx.stroke();

    ctx.setLineDash([]);
    ctx.fillStyle = '#a8a29e';
    ctx.font = '10px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    const isPrivacyMode = useJournalStore.getState().isPrivacyMode;
    ctx.fillText(
      isPrivacyMode ? 'Peak' : `Peak $${formatNumber(peak)}`,
      left + 4,
      y - 4,
    );
    ctx.restore();
  }
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
  const { tradedAfter } = useDailyTargets();
  // Clean trading days in a row, over all trades: the same figure as on the Notes page.
  const streak = useMemo(() => disciplineStreak(trades, dayNotes, tradedAfter), [trades, dayNotes, tradedAfter]);
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
  // Below md the chart's last numbers move to its title line, so the lines get the full width.
  const [isPhone, setIsPhone] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(max-width: 767px)');
    const update = () => setIsPhone(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
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
    let cumulativePnL = 0;
    // Taken from every trade, so a peak inside a day still counts when the chart shows one point per day.
    let peakPnL = 0;

    const equityData = [0];
    const balanceData = [0];
    const chartLabels = ['Start'];
    const dailyPoints = new Map<string, { balance: number, pnl: number, timestamp: number }>();
    const shouldAggregate = timelineEvents.length > 500;

    timelineEvents.forEach(evt => {
      if (evt.type === 'funding') {
        runningBalance = subMoney(addMoney(runningBalance, evt.data.deposit), evt.data.withdraw);

        if (shouldAggregate) {
          const d = new Date(evt.timeObj);
          const dateKey = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
          dailyPoints.set(dateKey, { balance: runningBalance, pnl: cumulativePnL, timestamp: evt.timeObj });
        } else {
          equityData.push(cumulativePnL);
          balanceData.push(runningBalance);
          const d = new Date(evt.timeObj);
          chartLabels.push(`${d.getDate()}/${d.getMonth()+1}/${d.getFullYear().toString().slice(-2)}`);
        }
      } else if (evt.type === 'trade') {
        const t = evt.data;
        runningBalance = addMoney(runningBalance, t.profit);
        cumulativePnL = addMoney(cumulativePnL, t.profit);
        if (cumulativePnL > peakPnL) peakPnL = cumulativePnL;

        if (shouldAggregate) {
          const d = new Date(evt.timeObj);
          const dateKey = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
          dailyPoints.set(dateKey, { balance: runningBalance, pnl: cumulativePnL, timestamp: evt.timeObj });
        } else {
          equityData.push(cumulativePnL);
          balanceData.push(runningBalance);
          const d = new Date(evt.timeObj);
          chartLabels.push(`${d.getDate()}/${d.getMonth()+1}/${d.getFullYear().toString().slice(-2)}`);
        }
      }
    });

    const summary = summarizeTrades(timelineEvents.filter(evt => evt.type === 'trade').map(evt => evt.data));
    // `type` goes last: some old imported trades have their own `type` field (order type).
    const drawdowns = computePnlDrawdown(timelineEvents.map(evt => ({ ...evt.data, type: evt.type, time: evt.timeObj })));

    if (shouldAggregate) {
      const sortedDaily = Array.from(dailyPoints.values()).sort((a, b) => a.timestamp - b.timestamp);
      sortedDaily.forEach(day => {
        equityData.push(day.pnl);
        balanceData.push(day.balance);
        const d = new Date(day.timestamp);
        chartLabels.push(`${d.getDate()}/${d.getMonth()+1}/${d.getFullYear().toString().slice(-2)}`);
      });
    }

    return {
      totalFunded, totalDeposit, totalWithdraw, runningBalance,
      net: summary.netProfit, winRate: summary.winRate,
      accountGrowth: calcAccountGrowth(summary.netProfit, totalDeposit),
      countTP: summary.wins, countBE: summary.bes, countSL: summary.losses, totalTrades: trades.length,
      netRR: summary.netRR, profitFactor: summary.profitFactor,
      // A stop moved to break-even and hit is about 0R whatever 1R was, so only the others matter.
      estimatedRCount: trades.filter(t => t.riskIsEstimate && t.resultType !== 'BE').length,
      expectancyR: summary.expectancyR, expectedPayoff: summary.expectedPayoff, sharpeRatio: summary.sharpeRatio,
      avgTPRR: summary.avgTPRR, maxTPRR: summary.maxTPRR,
      avgSLRR: summary.avgSLRR, maxSLRR: summary.maxSLRR,
      maxStreakW: summary.maxConsWinCount, maxStreakL: summary.maxConsLossCount,
      drawdowns,
      peakPnL, currentPnL: cumulativePnL,
      equityData, balanceData, chartLabels
    };
  }, [trades, funding]);

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
      labels: data.chartLabels,
      datasets: [
        {
          label: 'Equity (PnL)',
          data: data.equityData,
          borderColor: '#fb923c',
          borderWidth: 3,
          backgroundColor: 'rgba(251, 146, 60, 0.08)',
          fill: false,
          tension: 0.4,
          pointRadius: 0,
          yAxisID: 'y'
        },
        {
          label: 'Balance',
          data: data.balanceData,
          borderColor: 'transparent',
          borderWidth: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.03)',
          fill: true,
          tension: 0.4,
          pointRadius: 0,
          yAxisID: 'y1'
        }
      ]
    };
  }, [data]);

  // The top cards' big figures: 30px, or smaller when a long one would not fit its card.
  const growthText = `${formatNumber(data.accountGrowth)}%`;
  const winRateText = `${formatNumber(data.winRate * 100)}%`;
  const netText = isPrivacyMode ? '***' : `${data.net < 0 ? '-' : ''}$${formatNumber(Math.abs(data.net))}`;
  const balanceText = isPrivacyMode ? '***' : `$${formatNumber(data.runningBalance)}`;

  const lastEquity = data.equityData[data.equityData.length - 1] ?? 0;
  const lastBalance = data.balanceData[data.balanceData.length - 1] ?? 0;
  const lastLabel = (value: number) => isPrivacyMode ? '***' : formatNumber(value);
  // Room on the right for the dots, plus their numbers where they are drawn beside them.
  const chartRightPadding = isPhone
    ? 8
    : Math.ceil(LAST_POINT_GAP + Math.max(lastPointLabelWidth(lastLabel(lastEquity)), lastPointLabelWidth(lastLabel(lastBalance))) + 8);

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    layout: {
      padding: { right: chartRightPadding, top: 35, bottom: 20 }
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        mode: 'index' as const,
        intersect: false,
      },
      dashboardLastPointsPlugin: { labels: !isPhone },
      peakEquityLine: { peak: trades.length > 0 ? data.peakPnL : null, current: data.currentPnL }
    },
    scales: {
      x: { display: false },
      y: {
        type: 'linear' as const,
        display: true,
        // Keeps the peak line inside the chart even when the plotted daily points sit below it.
        suggestedMax: data.peakPnL,
        position: 'left' as const,
        grid: { color: '#fafaf9', drawOnChartArea: true },
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
  const belowPeakText = displayDD.active > 0
    ? `${displayDD.tradesBelowPeak} trade${displayDD.tradesBelowPeak === 1 ? '' : 's'}${ddDays > 0 ? ` · ${ddDays} day${ddDays === 1 ? '' : 's'}` : ''} below the peak`
    : 'At the peak';

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
        <p className="text-stone-500 font-semibold animate-pulse">Loading dashboard...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <BalanceCheckModal isOpen={isBalanceCheckOpen} onClose={() => setIsBalanceCheckOpen(false)} />
      {/* Title and cards keep the same 24px gap as the other pages' headers. */}
      <section className="space-y-6">
        <PageHeader title="Dashboard">
          <HealthWeather tier={healthTierFromProfitFactor(data.profitFactor, data.totalTrades)} />
        </PageHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="@container glass-card p-6 flex flex-col justify-center items-center text-center">
            <p className="text-stone-400 text-[10px] font-bold uppercase tracking-wider mb-1">Account Growth</p>
            <p style={fitFontSize(growthText, '1.875rem')} className="leading-9 font-extrabold stat-value text-stone-950">
              {growthText}
            </p>
          </div>
          <div className="@container bg-orange-400 p-6 rounded-[1.25rem] border border-orange-300 shadow-lg shadow-orange-400/20 flex flex-col justify-center items-center text-center">
            <span className="text-[10px] font-bold text-white/90 uppercase tracking-widest mb-1">Win Rate</span>
            <span style={fitFontSize(winRateText, '1.875rem')} className="leading-9 font-extrabold stat-value text-white">
              {winRateText}
            </span>
          </div>
          <div className="@container glass-card p-6 flex flex-col justify-center items-center text-center">
            <p className="text-stone-400 text-[10px] font-bold uppercase tracking-wider mb-1">Net Profit</p>
            <p style={fitFontSize(netText, '1.875rem')} className={`leading-9 font-extrabold stat-value ${data.net >= 0 ? 'text-orange-400' : 'text-red-900'}`}>
              {netText}
            </p>
            {bahtRate && !isPrivacyMode && (
              <p className="text-xs font-normal text-stone-400" title={bahtRateNote}>{formatApproxBaht(data.net, bahtRate.rate)}</p>
            )}
          </div>
          <div className="@container glass-card p-6 h-full flex flex-col justify-center items-center text-center">
            {/* The broker check sits as icons beside the label, so the card keeps the same three lines as Net Profit:
                a mismatch first, else Yes / No when a check is due, else the tick of the last match. */}
            <div className="flex items-center gap-1.5 mb-1">
              <p className="text-stone-400 text-[10px] font-bold uppercase tracking-wider">Balance</p>
              {brokerCheck && !brokerCheck.matches && (
                <button
                  type="button"
                  onClick={() => setIsBalanceCheckOpen(true)}
                  title={`${isPrivacyMode ? 'Differs from broker' : `$${formatNumber(Math.abs(brokerCheck.difference))} ${brokerCheck.difference > 0 ? 'higher' : 'lower'} than broker`} on ${balanceCheck!.time.split('T')[0]}: open the check`}
                  aria-label="Differs from broker: open the check"
                  className="-m-1.5 p-1.5 text-red-900 hover:opacity-70 transition"
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
                  className="-m-1.5 p-1.5 text-orange-400 hover:opacity-70 transition"
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
                    className="w-6 h-6 flex items-center justify-center rounded-md border bg-orange-50 text-orange-400 border-orange-200 hover:bg-orange-100 transition disabled:opacity-50"
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsBalanceCheckOpen(true)}
                    title="The broker shows a different amount: enter it to see the difference"
                    aria-label="Differs from broker"
                    className="w-6 h-6 flex items-center justify-center rounded-md border bg-stone-50 text-stone-500 border-stone-200 hover:bg-stone-100 transition"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </span>
              )}
            </div>
            <p style={fitFontSize(balanceText, '1.875rem')} className="leading-9 font-extrabold stat-value text-stone-950">
              {balanceText}
            </p>
            {bahtRate && !isPrivacyMode && (
              <p className="text-xs font-normal text-stone-400" title={bahtRateNote}>{formatApproxBaht(data.runningBalance, bahtRate.rate)}</p>
            )}
          </div>
        </div>
      </section>

      <DailyTargetBar />

      <div className="glass-card p-6 h-[350px] flex flex-col">
        {/* Large balances push the phone numbers onto a line of their own rather than squeezing the title. */}
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 mb-4">
          <h3 className="text-xs font-black text-stone-950 uppercase tracking-[0.2em] whitespace-nowrap flex items-center gap-2">
            <span className="w-2 h-2 bg-orange-400 rounded-full"></span> Equity and Balance
          </h3>
          <div className="md:hidden flex items-center gap-3 text-[11px] font-bold">
            <span title="Equity (PnL)" className="flex items-center gap-1 text-orange-400"><span className="w-2 h-2 rounded-full bg-orange-400"></span>{lastLabel(lastEquity)}</span>
            <span title="Balance" className="flex items-center gap-1 text-stone-900"><span className="w-2 h-2 rounded-full bg-stone-900"></span>{lastLabel(lastBalance)}</span>
          </div>
        </div>
        <div className="flex-1 relative w-full h-full">
          <Line key={`dashboard-chart-${isPrivacyMode}`} data={chartDataConfig} options={chartOptions} plugins={[dashboardLastPointsPlugin, peakEquityLinePlugin]} />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        <div className="glass-card p-6 space-y-5">
          <h3 className="text-xs font-black text-stone-950 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
            <span className="w-2 h-2 bg-orange-400 rounded-full"></span> Statistics
          </h3>
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-stone-400">Total Trades</span>
              <span className="font-black text-stone-950 text-2xl">{data.totalTrades}</span>
            </div>
            <div className="grid grid-cols-3 gap-2 mt-4">
              <div className="bg-orange-50 p-3 rounded-lg text-center border border-orange-200">
                <p className="text-[9px] font-bold text-orange-400 uppercase mb-1">TP</p>
                <p className="text-sm font-black text-orange-400">{data.countTP}</p>
              </div>
              <div className="bg-stone-50 p-3 rounded-lg text-center border border-stone-200">
                <p className="text-[9px] font-bold text-stone-400 uppercase mb-1">BE</p>
                <p className="text-sm font-black text-stone-400">{data.countBE}</p>
              </div>
              <div className="bg-red-50 p-3 rounded-lg text-center border border-red-200">
                <p className="text-[9px] font-bold text-red-900 uppercase mb-1">SL</p>
                <p className="text-sm font-black text-red-900">{data.countSL}</p>
              </div>
            </div>
            <div className="flex justify-between items-center pt-2 border-t border-stone-200">
              <span className="text-xs font-bold text-stone-400">Total Deposit</span>
              <span className="font-black text-sm text-red-900">{isPrivacyMode ? '***' : `$${formatNumber(data.totalDeposit)}`}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-stone-400">Total Withdraw</span>
              <span className="font-black text-sm text-orange-400">{isPrivacyMode ? '***' : `$${formatNumber(data.totalWithdraw)}`}</span>
            </div>
            <div className="flex justify-between items-center pt-2 border-t border-stone-200">
              <span className="text-xs font-bold text-stone-400">Capital</span>
              <span className="font-black text-sm text-stone-950">{isPrivacyMode ? '***' : `$${formatNumber(data.totalFunded)}`}</span>
            </div>
          </div>
        </div>

        <div className="glass-card p-6 space-y-5">
          <h3 className="text-xs font-black text-stone-950 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
            <span className="w-2 h-2 bg-orange-400 rounded-full"></span> Reward to Risk
          </h3>
          <div className="space-y-4 pt-2">
            <div className="flex justify-between items-center">
              <span className="text-[11px] font-bold text-stone-400">Avg TP RR</span>
              <span className="text-[12px] font-black text-orange-400">{formatNumber(data.avgTPRR)} R</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[11px] font-bold text-stone-400">Max TP RR</span>
              <span className="text-[12px] font-black text-orange-400">{data.maxTPRR > 0 ? formatNumber(data.maxTPRR) : '0.00'} R</span>
            </div>
            <div className="flex justify-between items-center pt-2 border-t border-stone-200">
              <span className="text-[11px] font-bold text-stone-400">Avg SL RR</span>
              <span className="text-[12px] font-black text-red-900">{formatNumber(data.avgSLRR)} R</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[11px] font-bold text-stone-400">Max SL RR</span>
              <span className="text-[12px] font-black text-red-900">{data.maxSLRR < 0 ? formatNumber(data.maxSLRR) : '0.00'} R</span>
            </div>
            <div className="flex justify-between items-center pt-2 border-t border-stone-200">
              <span className="text-[11px] font-bold text-stone-400">Consecutive Loss (Max)</span>
              <span className="text-[12px] font-black text-red-900">{data.maxStreakL}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[11px] font-bold text-stone-400">Consecutive Win (Max)</span>
              <span className="text-[12px] font-black text-orange-400">{data.maxStreakW}</span>
            </div>
          </div>
        </div>

        <div className="glass-card p-6 flex flex-col h-full relative">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-black text-stone-950 uppercase tracking-[0.2em] flex items-center gap-2">
              <span className="w-2 h-2 bg-orange-400 rounded-full"></span> Drawdown
            </h3>
          </div>

          <div className="flex items-stretch justify-between gap-4 pt-2 flex-1 min-h-[200px] mb-8">
            <div className="flex flex-col justify-between z-10 flex-1 pr-2 py-1">
              <div>
                <p className="text-[10px] font-black text-stone-400 uppercase tracking-widest mb-1">Max DD</p>
                <p className="text-2xl font-extrabold text-red-950">{formatNumber(ddMax)}{ddUnit}</p>
                {!isRMode && (
                  <p className="text-[11px] font-bold text-stone-500" title="The largest drop in dollars. It can be a different drop from the deepest percentage.">
                    {isPrivacyMode ? '***' : `$${formatNumber(displayDD.max)}`}
                  </p>
                )}
              </div>

              <div className="w-full border-t border-stone-200 my-auto"></div>

              <div>
                <p className="text-[10px] font-black text-stone-400 uppercase tracking-widest mb-1">Active DD</p>
                <p className="text-2xl font-extrabold text-red-900">{formatNumber(ddActive)}{ddUnit}</p>
                {!isRMode && (
                  <p className="text-[11px] font-bold text-stone-500">{isPrivacyMode ? '***' : `$${formatNumber(displayDD.active)}`}</p>
                )}
                <p className="text-[10px] font-normal text-stone-400 mt-1">{belowPeakText}</p>
              </div>
            </div>

            <div title={gaugeNote} className="w-16 h-full bg-stone-50 rounded-xl p-1.5 border border-stone-200 flex flex-col justify-end items-center relative z-10 shadow-inner">
              <div className="absolute inset-0 flex flex-col justify-between p-2 pointer-events-none opacity-10">
                <div className="w-full border-b border-stone-950"></div>
                <div className="w-full border-b border-stone-950"></div>
                <div className="w-full border-b border-stone-950"></div>
                <div className="w-full border-b border-stone-950"></div>
                <div className="w-full border-b border-stone-950"></div>
                <div className="w-full border-b border-stone-950"></div>
                <div className="w-full border-b border-stone-950"></div>
              </div>

              {/* Deepest point of the drawdown still under way */}
              {isInDrawdown && <div 
                className="absolute left-1.5 right-1.5 h-1.5 bg-red-900 rounded-full shadow-[0_0_8px_rgba(127,29,29,0.4)] transition-all duration-700 ease-out z-20"
                style={{ bottom: `${maxCapBottomPct}%` }}
                title={`Deepest point of this drawdown: ${formatNumber(ddActiveMax)}${ddUnit}`}
              />}

              {/* Active DD Bar */}
              <div 
                className="w-full bg-stone-300/50 rounded-lg transition-all duration-700 ease-out relative z-10"
                style={{ height: `${activeBarHeightPct}%` }}
              />
            </div>
          </div>
          
          <div className="absolute bottom-4 left-0 right-0 flex justify-center">
            <div className="flex items-center bg-stone-100 p-0.5 rounded-md border border-stone-200 shadow-sm">
              {([['r', 'R', 'Drawdown of your cumulative R'], ['usd', '$', 'Drawdown of your cumulative profit and loss in dollars']] as const).map(([mode, label, hint]) => (
                <button
                  key={mode}
                  onClick={() => setDdMode(mode)}
                  title={`${hint}; deposits and withdrawals are not counted`}
                  className={`text-[10px] font-bold px-5 py-1.5 md:py-1 rounded transition-all ${
                    ddMode === mode
                      ? 'bg-white text-stone-950 shadow-md'
                      : 'text-stone-400 hover:text-stone-600'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="glass-card p-6 flex flex-col space-y-5 h-full">
          <h3 className="text-xs font-black text-stone-950 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
            <span className="w-2 h-2 bg-orange-400 rounded-full"></span> Performance
          </h3>
          <div className="space-y-4 pt-2">
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-stone-400">Profit Factor</span>
              <span className="font-black text-stone-950">{formatNumber(data.profitFactor)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-stone-400">Expectancy</span>
              {/* The average trade in the dollars it really made, and in R, as if every trade risked the same. */}
              <span className="font-black text-stone-950">
                {!isPrivacyMode && (
                  <span className="mr-1.5 text-[11px] font-bold text-stone-400" title="Average profit per trade in dollars">
                    {data.expectedPayoff < 0 ? '-' : ''}${formatNumber(Math.abs(data.expectedPayoff))}
                  </span>
                )}
                {formatNumber(data.expectancyR)} R
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-stone-400">Sharpe Ratio</span>
              <span className="font-black text-stone-950">{formatNumber(data.sharpeRatio)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-stone-400">Net RR</span>
              <span className="font-black text-stone-950">
                {formatNumber(data.netRR)} R
              </span>
            </div>
            {/* One row, label over the best run, so the card stays the height of its neighbours. */}
            <div className="flex justify-between items-center gap-3 pt-2 border-t border-stone-200"
              title="Trading days in a row with every trade on plan, no rule broken in the day's note and nothing entered after the daily target. Days without trades are skipped.">
              <div className="min-w-0">
                <p className="text-xs font-bold text-stone-400">On Plan in a Row</p>
                <p className="text-[10px] font-semibold text-stone-400">Best {streak.best} {streak.best === 1 ? 'day' : 'days'}</p>
              </div>
              <span className="font-black text-stone-950 flex items-center gap-1 shrink-0">
                <Flame className={`w-4 h-4 ${streak.current > 0 ? 'text-orange-400' : 'text-stone-300'}`} />
                {streak.current} <span className="text-[11px] font-bold text-stone-400">{streak.current === 1 ? 'day' : 'days'}</span>
              </span>
            </div>
            {data.estimatedRCount > 0 && (
              <p className="text-[10px] font-semibold text-stone-400 text-right" title="Their first stop is unknown, so R uses the default 1R. Enter the first stop on the trade (marked ≈ in History) to make it exact.">
                ≈ {data.estimatedRCount} {data.estimatedRCount > 1 ? 'trades' : 'trade'} on a default 1R
              </p>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
