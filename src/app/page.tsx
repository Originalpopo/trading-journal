"use client";

import { useJournalStore } from "@/store/useJournalStore";
import { useMemo } from "react";
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
      ctx.fillText(formatNumber(val0), pos0.x + 12, pos0.y + yOffset0);
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
      ctx.fillText(formatNumber(val1), pos1.x + 12, pos1.y + yOffset1);
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
  const { trades, funding, isLoading } = useJournalStore();

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

        if (runningBalance > highestBalance) highestBalance = runningBalance;

        let currentDD = highestBalance - runningBalance;
        let currentDDPct = highestBalance > 0 ? (currentDD / highestBalance) * 100 : 0;
        if (currentDD > maxDDValue) { maxDDValue = currentDD; maxDDPercent = currentDDPct; }

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

        cumulativePnL += t.profit;
        
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
              ${formatNumber(data.runningBalance)}
            </p>
          </div>
          <div className="glass-card p-6 flex flex-col justify-center items-center text-center">
            <p className="text-stone-400 text-[10px] font-bold uppercase tracking-wider mb-1">Net Profit</p>
            <p className={`text-3xl font-extrabold stat-value ${data.net >= 0 ? 'text-orange-400' : 'text-red-900'}`}>
              ${formatNumber(data.net)}
            </p>
          </div>
          <div className="bg-orange-400 p-6 rounded-[1.25rem] shadow-lg shadow-orange-400/20 flex flex-col justify-center items-center text-center">
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

      <div className="glass-card p-6 h-[460px] flex flex-col">
        <h3 className="text-xs font-black text-stone-950 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
          <span className="w-2 h-2 bg-orange-400 rounded-full"></span> Equity and Balance
        </h3>
        <div className="flex-1 relative w-full h-full">
          <Line data={chartDataConfig} options={chartOptions} plugins={[dashboardLastPointsPlugin]} />
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
              <span className="font-black text-red-900 text-sm">${formatNumber(data.totalDeposit)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-stone-400">Total Withdraw</span>
              <span className="font-black text-orange-400 text-sm">${formatNumber(data.totalWithdraw)}</span>
            </div>
            <div className="flex justify-between items-center pt-2 border-t border-stone-200">
              <span className="text-xs font-bold text-stone-400">Capital</span>
              <span className="font-black text-stone-950 text-sm">${formatNumber(data.totalFunded)}</span>
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

        <div className="glass-card p-6 space-y-5">
          <h3 className="text-xs font-black text-stone-950 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
            <span className="w-2 h-2 bg-orange-400 rounded-full"></span> Drawdown
          </h3>
          <div className="space-y-4 pt-2">
            <div className="flex flex-col gap-3 mb-4">
              <div className="p-3 bg-stone-50 rounded-xl flex flex-col items-center text-center border border-stone-200">
                <p className="text-[9px] font-black text-stone-400 uppercase tracking-widest mb-1">Active DD</p>
                <p className="text-2xl font-extrabold stat-value text-stone-950 mb-1">{formatNumber(data.activeDDPercent)}%</p>
                <p className="text-[10px] font-bold text-stone-400">${formatNumber(data.activeDDValue)}</p>
              </div>
              <div className="p-3 bg-red-50 rounded-xl flex flex-col items-center text-center border border-red-200">
                <p className="text-[9px] font-black text-red-900 uppercase tracking-widest mb-1">Max DD</p>
                <p className="text-2xl font-extrabold stat-value text-red-900 mb-1">{formatNumber(data.maxDDPercent)}%</p>
                <p className="text-[10px] font-bold text-red-900">${formatNumber(data.maxDDValue)}</p>
              </div>
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
              <span className="text-xs font-bold text-stone-400">Expected Payoff</span>
              <span className="font-black text-stone-950">${data.totalTrades > 0 ? formatNumber((data.net / data.totalTrades)) : '0.00'}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-stone-400">Sharpe Ratio</span>
              <span className="font-black text-stone-950">{data.stdDev !== 0 ? formatNumber((data.net / data.totalTrades) / data.stdDev) : '0.00'}</span>
            </div>
          </div>
          <div className="pt-4 border-t border-stone-200 flex-1">
            <div className="flex justify-between items-center">
              <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Net RR</span>
              <span className="font-black text-xl text-stone-950">
                {formatNumber(data.netRR)} <span className="text-[10px] font-bold text-stone-950">R</span>
              </span>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
