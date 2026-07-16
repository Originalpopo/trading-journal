"use client";

import { useJournalStore } from "@/store/useJournalStore";
import { useMemo, useState } from "react";
import { CloudRainWind, CloudLightning, Cloud, CloudSun, SunMedium } from "lucide-react";
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
import { formatNumber } from "@/lib/utils";

const dashboardLastPointsPlugin: Plugin<'line'> = {
  id: 'dashboardLastPointsPlugin',
  afterDatasetsDraw: (chart) => {
    if (chart.data.datasets.length < 2) return;
    const ctx = chart.ctx;
    const meta0 = chart.getDatasetMeta(0);
    const meta1 = chart.getDatasetMeta(1);
    let pos0: any = null;
    let val0: any = null;
    if (!meta0.hidden && meta0.data.length > 0) {
      const lastIdx = meta0.data.length - 1;
      pos0 = (meta0.data[lastIdx] as any).tooltipPosition();
      val0 = chart.data.datasets[0].data[lastIdx];
    }

    let pos1: any = null;
    let val1: any = null;
    if (!meta1.hidden && meta1.data.length > 0) {
      const lastIdx = meta1.data.length - 1;
      pos1 = (meta1.data[lastIdx] as any).tooltipPosition();
      val1 = chart.data.datasets[1].data[lastIdx];
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

function calculateStandardDeviation(values: number[], mean: number) {
  if (values.length === 0) return 0;
  const squareDiffs = values.map(val => {
    const diff = val - mean;
    return diff * diff;
  });
  const avgSquareDiff = squareDiffs.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(avgSquareDiff);
}

export default function Dashboard() {
  const { trades, funding, isLoading, isPrivacyMode } = useJournalStore();
  const [ddMode, setDdMode] = useState<'equity' | 'balance' | 'twr'>('twr');

  const data = useMemo(() => {
    let totalFunded = 0;
    let totalDeposit = 0;
    let totalWithdraw = 0;

    if (funding.length > 0) {
      funding.forEach(f => {
        totalDeposit += Number(f.deposit || 0);
        totalWithdraw += Number(f.withdraw || 0);
      });
      totalFunded = totalDeposit - totalWithdraw;
    }

    const timelineEvents: { type: string, timeObj: number, data: any }[] = [];
    trades.forEach(t => timelineEvents.push({ type: 'trade', timeObj: new Date(t.time.replace(' ', 'T')).getTime(), data: t }));
    funding.forEach(f => timelineEvents.push({ type: 'funding', timeObj: new Date(f.time.replace(' ', 'T')).getTime(), data: f }));
    timelineEvents.sort((a, b) => a.timeObj - b.timeObj);

    let runningBalance = 0;
    let highestBalance = 0;
    let maxDDValue = 0;
    let maxDDPercent = 0;
    let cumulativePnL = 0;

    let highestEquity = 0;
    let maxEquityDDValue = 0;
    let maxEquityDDPercent = 0;

    let twrBalance = 0;
    let highestTwrBalance = 0;
    let maxTwrDDValue = 0;
    let maxTwrDDPercent = 0;

    const equityData = [0];
    const balanceData = [0];
    const chartLabels = ['Start'];
    const dailyPoints = new Map<string, { balance: number, pnl: number, timestamp: number }>();
    const shouldAggregate = timelineEvents.length > 500;

    let net = 0, wins = 0, losses = 0, gProfit = 0, gLoss = 0, countTP = 0, countSL = 0, countBE = 0;
    let totalRR = 0, rrCount = 0;
    let slTotalRR = 0, slRRCount = 0;
    let maxTPRR = 0, maxSLRR = 0;
    let streakL = 0, maxStreakL = 0, streakW = 0, maxStreakW = 0;
    let netRR = 0;
    const profits: number[] = [];

    timelineEvents.forEach(evt => {
      if (evt.type === 'funding') {
        runningBalance += evt.data.deposit;
        runningBalance -= evt.data.withdraw;

        twrBalance += evt.data.deposit;

        if (runningBalance > highestBalance) highestBalance = runningBalance;

        let currentDD = highestBalance - runningBalance;
        let currentDDPct = highestBalance > 0 ? (currentDD / highestBalance) * 100 : 0;
        if (currentDD > maxDDValue) { maxDDValue = currentDD; maxDDPercent = currentDDPct; }

        if (twrBalance > highestTwrBalance) highestTwrBalance = twrBalance;
        let currentTwrDD = highestTwrBalance - twrBalance;
        let currentTwrDDPct = highestTwrBalance > 0 ? (currentTwrDD / highestTwrBalance) * 100 : 0;
        if (currentTwrDD > maxTwrDDValue) { maxTwrDDValue = currentTwrDD; maxTwrDDPercent = currentTwrDDPct; }

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
        net += t.profit;
        profits.push(t.profit);

        runningBalance += t.profit;

        if (runningBalance > highestBalance) highestBalance = runningBalance;

        let currentDD = highestBalance - runningBalance;
        let currentDDPct = highestBalance > 0 ? (currentDD / highestBalance) * 100 : 0;
        if (currentDD > maxDDValue) { maxDDValue = currentDD; maxDDPercent = currentDDPct; }

        twrBalance += t.profit;
        if (twrBalance > highestTwrBalance) highestTwrBalance = twrBalance;
        let currentTwrDD = highestTwrBalance - twrBalance;
        let currentTwrDDPct = highestTwrBalance > 0 ? (currentTwrDD / highestTwrBalance) * 100 : 0;
        if (currentTwrDD > maxTwrDDValue) { maxTwrDDValue = currentTwrDD; maxTwrDDPercent = currentTwrDDPct; }

        cumulativePnL += t.profit;
        
        if (cumulativePnL > highestEquity) highestEquity = cumulativePnL;

        let currentEquityDD = highestEquity - cumulativePnL;
        let currentEquityDDPct = highestEquity > 0 ? (currentEquityDD / highestEquity) * 100 : 0;
        if (currentEquityDD > maxEquityDDValue) {
          maxEquityDDValue = currentEquityDD;
          maxEquityDDPercent = currentEquityDDPct;
        }

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

        let isBE = false;
        const rawRisk = t.risk || 0;
        if (rawRisk > 0) {
          const calculatedRR = (t.profit || 0) / rawRisk;
          isBE = (calculatedRR >= -0.4 && calculatedRR <= 0.4);
        } else {
          isBE = (t.resultType === 'BE' || (t.profit || 0) === 0);
        }
        netRR += (t.rr || 0);

        if (isBE) {
          countBE++;
        }
        else if (t.profit > 0 || t.resultType === 'TP') {
          wins++; gProfit += t.profit; countTP++; streakW++; streakL = 0;
          if (streakW > maxStreakW) maxStreakW = streakW;
          if (t.rr > 0) {
            totalRR += t.rr;
            rrCount++;
            if (t.rr > maxTPRR) maxTPRR = t.rr;
          }
        }
        else if (t.profit < 0 || t.resultType === 'SL') {
          losses++; gLoss += Math.abs(t.profit); countSL++; streakL++; streakW = 0;
          if (streakL > maxStreakL) maxStreakL = streakL;
          if (t.rr < 0) {
            slTotalRR += t.rr;
            slRRCount++;
            if (t.rr < maxSLRR) maxSLRR = t.rr;
          }
        }
      }
    });

    if (shouldAggregate) {
      const sortedDaily = Array.from(dailyPoints.values()).sort((a, b) => a.timestamp - b.timestamp);
      sortedDaily.forEach(day => {
        equityData.push(day.pnl);
        balanceData.push(day.balance);
        const d = new Date(day.timestamp);
        chartLabels.push(`${d.getDate()}/${d.getMonth()+1}/${d.getFullYear().toString().slice(-2)}`);
      });
    }

    let activeDDValue = highestBalance - runningBalance;
    let activeDDPercent = highestBalance > 0 ? (activeDDValue / highestBalance) * 100 : 0;

    let activeEquityDDValue = highestEquity - cumulativePnL;
    let activeEquityDDPercent = highestEquity > 0 ? (activeEquityDDValue / highestEquity) * 100 : 0;

    let activeTwrDDValue = highestTwrBalance - twrBalance;
    let activeTwrDDPercent = highestTwrBalance > 0 ? (activeTwrDDValue / highestTwrBalance) * 100 : 0;

    const winRate = (wins + losses) > 0 ? (wins / (wins + losses)) : 0;
    const stdDev = calculateStandardDeviation(profits, trades.length ? net / trades.length : 0);

    return {
      totalFunded, totalDeposit, totalWithdraw, runningBalance, net, winRate,
      countTP, countBE, countSL, totalTrades: trades.length,
      netRR, gProfit, gLoss, stdDev, 
      avgTPRR: rrCount ? (totalRR / rrCount) : 0, maxTPRR,
      avgSLRR: slRRCount ? (slTotalRR / slRRCount) : 0, maxSLRR,
      maxStreakW, maxStreakL,
      maxDDValue, maxDDPercent, activeDDValue, activeDDPercent,
      maxEquityDDValue, maxEquityDDPercent, activeEquityDDValue, activeEquityDDPercent,
      maxTwrDDValue, maxTwrDDPercent, activeTwrDDValue, activeTwrDDPercent,
      equityData, balanceData, chartLabels
    };
  }, [trades, funding]);

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

  const displayMaxDDPercent = ddMode === 'balance' ? data.maxDDPercent : (ddMode === 'twr' ? data.maxTwrDDPercent : data.maxEquityDDPercent);
  const displayMaxDDValue = ddMode === 'balance' ? data.maxDDValue : (ddMode === 'twr' ? data.maxTwrDDValue : data.maxEquityDDValue);
  const displayMaxDDLabel = ddMode === 'balance' ? 'Max DD' : (ddMode === 'twr' ? 'TWR MAX DD' : 'EQ. Max DD');
  const displayActiveDDPercent = ddMode === 'balance' ? data.activeDDPercent : (ddMode === 'twr' ? data.activeTwrDDPercent : data.activeEquityDDPercent);
  const displayActiveDDValue = ddMode === 'balance' ? data.activeDDValue : (ddMode === 'twr' ? data.activeTwrDDValue : data.activeEquityDDValue);

  const ddScaleMax = Math.max(displayMaxDDPercent * 1.25, 10);
  const activeBarHeightPct = Math.min(100, Math.max(6, (displayActiveDDPercent / ddScaleMax) * 100));
  const maxCapBottomPct = Math.min(95, Math.max(activeBarHeightPct, (displayMaxDDPercent / ddScaleMax) * 100));

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-stone-500 font-semibold animate-pulse">Loading dashboard...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <section>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="glass-card p-6 flex flex-col justify-center items-center text-center">
            <p className="text-stone-400 text-[10px] font-bold uppercase tracking-wider mb-1">Balance</p>
            <p className="text-3xl font-extrabold stat-value text-stone-950">
              {isPrivacyMode ? '***' : `$${formatNumber(data.runningBalance)}`}
            </p>
          </div>
          <div className="glass-card p-6 flex flex-col justify-center items-center text-center">
            <p className="text-stone-400 text-[10px] font-bold uppercase tracking-wider mb-1">Net Profit</p>
            <p className={`text-3xl font-extrabold stat-value ${data.net >= 0 ? 'text-orange-400' : 'text-red-900'}`}>
              {isPrivacyMode ? '***' : `${data.net < 0 ? '-' : ''}$${formatNumber(Math.abs(data.net))}`}
            </p>
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
              {data.totalFunded > 0 ? formatNumber((data.net / data.totalFunded) * 100) : '0.00'}%
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
                <p className="text-[10px] font-black text-stone-400 uppercase tracking-widest mb-1">{displayMaxDDLabel}</p>
                <p className="text-2xl font-extrabold text-red-950">{formatNumber(displayMaxDDPercent)}%</p>
                <p className="text-[11px] font-bold text-stone-500">{isPrivacyMode ? '***' : `$${formatNumber(displayMaxDDValue)}`}</p>
              </div>
              
              <div className="w-full border-t border-stone-200 my-auto"></div>

              <div>
                <p className="text-[10px] font-black text-stone-400 uppercase tracking-widest mb-1">Active DD</p>
                <p className="text-2xl font-extrabold text-red-900">{formatNumber(displayActiveDDPercent)}%</p>
                <p className="text-[11px] font-bold text-stone-500">{isPrivacyMode ? '***' : `$${formatNumber(displayActiveDDValue)}`}</p>
              </div>
            </div>

            <div className="w-16 h-full bg-stone-50 rounded-xl p-1.5 border border-stone-200 flex flex-col justify-end items-center relative z-10 shadow-inner">
              <div className="absolute inset-0 flex flex-col justify-between p-2 pointer-events-none opacity-10">
                <div className="w-full border-b border-stone-950"></div>
                <div className="w-full border-b border-stone-950"></div>
                <div className="w-full border-b border-stone-950"></div>
                <div className="w-full border-b border-stone-950"></div>
                <div className="w-full border-b border-stone-950"></div>
                <div className="w-full border-b border-stone-950"></div>
                <div className="w-full border-b border-stone-950"></div>
              </div>

              {/* Max DD Cap (Peak Indicator) */}
              <div 
                className="absolute left-1.5 right-1.5 h-1.5 bg-red-950 rounded-full shadow-[0_0_8px_rgba(69,10,10,0.4)] transition-all duration-700 ease-out z-20"
                style={{ bottom: `${maxCapBottomPct}%` }}
              />

              {/* Active DD Bar */}
              <div 
                className="w-full bg-red-900 rounded-lg shadow-[0_0_12px_rgba(127,29,29,0.4)] transition-all duration-700 ease-out relative z-10"
                style={{ height: `${activeBarHeightPct}%` }}
              />
            </div>
          </div>
          
          <div className="absolute bottom-4 left-0 right-0 flex justify-center">
            <div className="flex items-center bg-stone-100 p-0.5 rounded-md border border-stone-200 shadow-sm">
              <button
                onClick={() => setDdMode('equity')}
                className={`text-[9px] font-bold px-3 py-1 rounded transition-all ${
                  ddMode === 'equity' 
                    ? 'bg-white text-stone-950 shadow-md' 
                    : 'text-stone-400 hover:text-stone-600'
                }`}
              >
                Equity
              </button>
              <button
                onClick={() => setDdMode('twr')}
                className={`text-[9px] font-bold px-3 py-1 rounded transition-all ${
                  ddMode === 'twr' 
                    ? 'bg-white text-stone-950 shadow-md' 
                    : 'text-stone-400 hover:text-stone-600'
                }`}
              >
                TWR
              </button>
              <button
                onClick={() => setDdMode('balance')}
                className={`text-[9px] font-bold px-3 py-1 rounded transition-all ${
                  ddMode === 'balance' 
                    ? 'bg-white text-stone-950 shadow-md' 
                    : 'text-stone-400 hover:text-stone-600'
                }`}
              >
                Balance
              </button>
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
              <span className="font-black text-stone-950">{(data.gLoss === 0 ? formatNumber(data.gProfit) : formatNumber(data.gProfit / data.gLoss))}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-stone-400">Expectancy</span>
              <span className="font-black text-stone-950">{(() => {
                if (data.totalTrades === 0) return '0.00 R';
                const avgLoss = data.countSL > 0 ? (data.gLoss / data.countSL) : 0;
                const expectedPayoff = data.net / data.totalTrades;
                return avgLoss > 0 ? `${formatNumber(expectedPayoff / avgLoss)} R` : '0.00 R';
              })()}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-stone-400">Sharpe Ratio</span>
              <span className="font-black text-stone-950">{data.stdDev !== 0 ? formatNumber((data.net / data.totalTrades) / data.stdDev) : '0.00'}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-stone-400">Net RR</span>
              <span className="font-black text-stone-950">
                {formatNumber(data.netRR)} R
              </span>
            </div>
          </div>
          {(() => {
            let healthTier = 3;
            if (data.totalTrades > 0) {
              const pf = data.gLoss === 0 ? data.gProfit : (data.gProfit / data.gLoss);
              if (pf >= 2.0) healthTier = 5;
              else if (pf >= 1.2) healthTier = 4;
              else if (pf >= 0.8) healthTier = 3;
              else if (pf >= 0.5) healthTier = 2;
              else healthTier = 1;
            }
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
