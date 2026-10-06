"use client";

import { useJournalStore } from "@/store/useJournalStore";
import { useEffect, useMemo, useState } from "react";
import { CloudRainWind, CloudLightning, Cloud, CloudSun, SunMedium, CheckCircle2, AlertTriangle, Check, X } from "lucide-react";
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
import { formatNumber, tooltipPositionOf } from "@/lib/utils";
import { summarizeTrades, healthTierFromProfitFactor, computePnlDrawdown, calcAccountGrowth } from "@/lib/stats";
import { addMoney, subMoney } from "@/lib/money";
import { loadBahtRate, formatApproxBaht, type BahtRate } from "@/lib/bahtRate";
import { reconcileBalance, hasActivityAfter, localTimestamp, toCheckRecord } from "@/lib/reconcile";
import BalanceCheckModal from "@/components/BalanceCheckModal";

const dashboardLastPointsPlugin: Plugin<'line'> = {
  id: 'dashboardLastPointsPlugin',
  afterDatasetsDraw: (chart) => {
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

      ctx.fillStyle = '#fb923c';
      ctx.font = 'bold 11px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      const isPrivacyMode = useJournalStore.getState().isPrivacyMode;
      ctx.fillText(isPrivacyMode ? '***' : formatNumber(val0), pos0.x + 12, pos0.y + yOffset0);
      ctx.restore();
    }

    if (pos1) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(pos1.x, pos1.y, 6, 0, 2 * Math.PI);
      ctx.fillStyle = '#1c1917';
      ctx.fill();

      ctx.fillStyle = '#1c1917';
      ctx.font = 'bold 11px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      const isPrivacyMode = useJournalStore.getState().isPrivacyMode;
      ctx.fillText(isPrivacyMode ? '***' : formatNumber(val1), pos1.x + 12, pos1.y + yOffset1);
      ctx.restore();
    }
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
      expectancyR: summary.expectancyR, sharpeRatio: summary.sharpeRatio,
      avgTPRR: summary.avgTPRR, maxTPRR: summary.maxTPRR,
      avgSLRR: summary.avgSLRR, maxSLRR: summary.maxSLRR,
      maxStreakW: summary.maxConsWinCount, maxStreakL: summary.maxConsLossCount,
      drawdowns,
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

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    layout: {
      padding: { right: 80, top: 35, bottom: 20 }
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        mode: 'index' as const,
        intersect: false,
      }
    },
    scales: {
      x: { display: false },
      y: {
        type: 'linear' as const,
        display: true,
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
      <section>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="relative">
          <div className="glass-card p-6 h-full flex flex-col justify-center items-center text-center">
            <p className="text-stone-400 text-[10px] font-bold uppercase tracking-wider mb-1">Balance</p>
            <p className="text-3xl font-extrabold stat-value text-stone-950">
              {isPrivacyMode ? '***' : `$${formatNumber(data.runningBalance)}`}
            </p>
            {bahtRate && !isPrivacyMode && (
              <p className="text-xs font-normal text-stone-400" title={bahtRateNote}>{formatApproxBaht(data.runningBalance, bahtRate.rate)}</p>
            )}
          </div>
          {/* The broker check sits in the gap under the card, so Balance and Net Profit stay the same three lines.
              The gap fits one line: a mismatch first, else the question when a check is due, else the last match. */}
          <div className="absolute top-full inset-x-0 mt-1 flex justify-center whitespace-nowrap">
            {brokerCheck && (!needsBrokerCheck || !brokerCheck.matches) && (
              <button
                type="button"
                onClick={() => setIsBalanceCheckOpen(true)}
                title="Open the broker balance check"
                className={`text-[10px] font-bold flex items-center gap-1 transition hover:opacity-70 ${brokerCheck.matches ? 'text-orange-400' : 'text-red-900'}`}
              >
                {brokerCheck.matches
                  ? <><CheckCircle2 className="w-3 h-3" /> Matched broker on {balanceCheck!.time.split('T')[0]}</>
                  : <><AlertTriangle className="w-3 h-3" /> {isPrivacyMode
                      ? 'Differs from broker'
                      : `$${formatNumber(Math.abs(brokerCheck.difference))} ${brokerCheck.difference > 0 ? 'higher' : 'lower'} than broker`} on {balanceCheck!.time.split('T')[0]}</>}
              </button>
            )}
            {needsBrokerCheck && (!brokerCheck || brokerCheck.matches) && (
              <div className="flex items-center gap-1.5 text-[10px] font-bold text-stone-400">
                <span>{isPrivacyMode ? 'Same as broker?' : `Broker shows $${formatNumber(data.runningBalance)}?`}</span>
                <button
                  type="button"
                  disabled={isConfirmingMatch}
                  onClick={confirmBrokerMatch}
                  title="The broker's Balance is exactly this amount right now"
                  className="px-2 py-0.5 rounded-md border bg-orange-50 text-orange-400 border-orange-200 hover:bg-orange-100 transition flex items-center gap-0.5 disabled:opacity-50"
                >
                  <Check className="w-3 h-3" /> Yes
                </button>
                <button
                  type="button"
                  onClick={() => setIsBalanceCheckOpen(true)}
                  title="The broker shows a different amount: enter it to see the difference"
                  className="px-2 py-0.5 rounded-md border bg-stone-50 text-stone-500 border-stone-200 hover:bg-stone-100 transition flex items-center gap-0.5"
                >
                  <X className="w-3 h-3" /> No
                </button>
              </div>
            )}
          </div>
          </div>
          <div className="glass-card p-6 flex flex-col justify-center items-center text-center">
            <p className="text-stone-400 text-[10px] font-bold uppercase tracking-wider mb-1">Net Profit</p>
            <p className={`text-3xl font-extrabold stat-value ${data.net >= 0 ? 'text-orange-400' : 'text-red-900'}`}>
              {isPrivacyMode ? '***' : `${data.net < 0 ? '-' : ''}$${formatNumber(Math.abs(data.net))}`}
            </p>
            {bahtRate && !isPrivacyMode && (
              <p className="text-xs font-normal text-stone-400" title={bahtRateNote}>{formatApproxBaht(data.net, bahtRate.rate)}</p>
            )}
          </div>
          <div className="bg-orange-400 p-6 rounded-[1.25rem] border border-orange-300 shadow-lg shadow-orange-400/20 flex flex-col justify-center items-center text-center">
            <span className="text-[10px] font-bold text-white/90 uppercase tracking-widest mb-1">Win Rate</span>
            <span className="text-3xl font-extrabold stat-value text-white">
              {formatNumber(data.winRate * 100)}%
            </span>
          </div>
          <div className="glass-card p-6 flex flex-col justify-center items-center text-center">
            <p className="text-stone-400 text-[10px] font-bold uppercase tracking-wider mb-1">Account Growth</p>
            <p className="text-3xl font-extrabold stat-value text-stone-950">
              {formatNumber(data.accountGrowth)}%
            </p>
          </div>
        </div>
      </section>

      <div className="glass-card p-6 h-[350px] flex flex-col">
        <h3 className="text-xs font-black text-stone-950 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
          <span className="w-2 h-2 bg-orange-400 rounded-full"></span> Equity and Balance
        </h3>
        <div className="flex-1 relative w-full h-full">
          <Line key={`dashboard-chart-${isPrivacyMode}`} data={chartDataConfig} options={chartOptions} plugins={[dashboardLastPointsPlugin]} />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
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
                <p className="text-[10px] font-bold text-stone-400 mt-1">{belowPeakText}</p>
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
              <span className="font-black text-stone-950">{formatNumber(data.expectancyR)} R</span>
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
          </div>
          {(() => {
            const healthTier = healthTierFromProfitFactor(data.profitFactor, data.totalTrades);
            return (
              <div className="flex justify-center items-center pt-4 mt-2 border-t border-stone-200">
                <div className="flex items-center justify-center gap-1">
                  <div title="PF < 0.5" className="flex items-center justify-center w-10 h-10 cursor-help">
                    <CloudRainWind className={`transition-all duration-500 ${healthTier === 1 ? 'w-10 h-10 text-stone-900 drop-shadow-md hover:scale-110' : 'w-4 h-4 text-stone-400 hover:scale-110'}`} />
                  </div>
                  <div title="PF 0.5 - 0.79" className="flex items-center justify-center w-10 h-10 cursor-help">
                    <CloudLightning className={`transition-all duration-500 ${healthTier === 2 ? 'w-10 h-10 text-stone-700 drop-shadow-md hover:scale-110' : 'w-4 h-4 text-stone-400 hover:scale-110'}`} />
                  </div>
                  <div title="PF 0.8 - 1.19" className="flex items-center justify-center w-10 h-10 cursor-help">
                    <Cloud className={`transition-all duration-500 ${healthTier === 3 ? 'w-10 h-10 text-stone-500 drop-shadow-md hover:scale-110' : 'w-4 h-4 text-stone-400 hover:scale-110'}`} />
                  </div>
                  <div title="PF 1.2 - 1.99" className="flex items-center justify-center w-10 h-10 cursor-help">
                    <CloudSun className={`transition-all duration-500 ${healthTier === 4 ? 'w-10 h-10 text-orange-300 drop-shadow-md hover:scale-110' : 'w-4 h-4 text-stone-400 hover:scale-110'}`} />
                  </div>
                  <div title="PF >= 2.0" className="flex items-center justify-center w-10 h-10 cursor-help">
                    <SunMedium className={`transition-all duration-500 ${healthTier === 5 ? 'w-10 h-10 text-orange-400 drop-shadow-md hover:scale-110' : 'w-4 h-4 text-stone-400 hover:scale-110'}`} />
                  </div>
                </div>
              </div>
            );
          })()}
        </div>

      </div>
    </div>
  );
}
