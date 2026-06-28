"use client";

import { useJournalStore } from "@/store/useJournalStore";
import { useState, useMemo } from "react";
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
const formatNumber = (val: number): string => {
  return (val || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

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

function calculateStandardDeviation(values: number[], mean: number) {
  if (values.length === 0) return 0;
  const squareDiffs = values.map(val => {
    const diff = val - mean;
    return diff * diff;
  });
  const avgSquareDiff = squareDiffs.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(avgSquareDiff);
}

const formatCurrency = (val: number) => val < 0 ? `-$${formatNumber(Math.abs(val))}` : `$${formatNumber(val)}`;

export default function PerformancePage() {
  const { trades, funding, isLoading } = useJournalStore();
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());
  const [selectedTf, setSelectedTf] = useState('ALL');
  const [selectedMetric, setSelectedMetric] = useState('RR');

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
    const tfs = Array.from(new Set(trades.map((t: any) => t.tf || 'none').filter(Boolean)));
    ['15m', '5m', '1m', 'none'].forEach(item => {
      if (!tfs.includes(item)) tfs.push(item);
    });
    return tfs;
  }, [trades]);

  const data = useMemo(() => {
    const hours = Array.from({ length: 24 }, (_, i) => i);
    const hourStats: Record<number, number> = {}; const hourStatsPnL: Record<number, number> = {};
    hours.forEach(h => { hourStats[h] = 0; hourStatsPnL[h] = 0; });

    const dowNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const dowStats: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
    const dowStatsPnL: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const moyStats: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 0, 11: 0 };
    const moyStatsPnL: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 0, 11: 0 };
    const moyStartBalance: Record<number, number | null> = {};
    const moyPnL: Record<number, number> = {};
    for (let i = 0; i < 12; i++) { moyStartBalance[i] = null; moyPnL[i] = 0; }

    const matrix: any = {};
    const tfMatrix: any = {};

    let allTimelineEvents: any[] = [];
    trades.forEach(t => allTimelineEvents.push({ type: 'trade', timeObj: new Date(t.time.replace(' ', 'T')), data: t }));
    funding.forEach(f => allTimelineEvents.push({ type: 'funding', timeObj: new Date(f.time.replace(' ', 'T')), data: f }));
    allTimelineEvents.sort((a, b) => a.timeObj.getTime() - b.timeObj.getTime());

    let pastEvents: any[] = [];
    let currentEvents: any[] = [];

    allTimelineEvents.forEach(evt => {
      if (!isNaN(evt.timeObj.getTime()) && evt.timeObj.getTime() > 0) {
        if (evt.type === 'trade' && selectedTf !== 'ALL') {
          const tfVal = evt.data.tf || 'none';
          if (tfVal !== selectedTf) return;
        }

        const y = evt.timeObj.getFullYear();
        if (selectedYear !== 'ALL' && y < parseInt(selectedYear)) {
          pastEvents.push(evt);
        } else if (selectedYear === 'ALL' || y === parseInt(selectedYear)) {
          currentEvents.push(evt);
        }
      }
    });

    let carriedOverBalance = 0; // globalCapital is usually 0 here if not explicitly set
    pastEvents.forEach(evt => {
      if (evt.type === 'funding') {
        carriedOverBalance += evt.data.deposit - (evt.data.withdraw || 0);
      } else if (evt.type === 'trade') {
        carriedOverBalance += evt.data.profit;
      }
    });

    let runningBalance = carriedOverBalance;
    let initialDeposit = runningBalance;
    let minBalance = runningBalance;
    let peakBalance = runningBalance;
    let maxDrawdownAmt = 0;
    let maxDrawdownPct = 0;

    const perfBalanceData = [runningBalance];
    const perfBalanceLabels = ["Start"];
    const perfPnlData = [0];
    const perfPnlColors = ['transparent'];

    let tradeCount = 0;
    let grossProfit = 0, grossLoss = 0, grossBE = 0;
    let runningNetProfit = 0;
    let totalTrades = 0;
    let profitTradesCount = 0, lossTradesCount = 0, beTradesCount = 0;
    let longTrades = 0, longWon = 0;
    let shortTrades = 0, shortWon = 0;
    let largestProfit = 0, largestLoss = 0;
    let sumBE = 0, largestBE = 0;

    let currentWinCount = 0, currentLossCount = 0;
    let currentWinAmt = 0, currentLossAmt = 0;

    let maxConsWinCount = 0, maxConsLossCount = 0;
    let maxConsWinAmt = 0, maxConsLossAmt = 0;
    let countAtMaxWinAmt = 0, countAtMaxLossAmt = 0;
    let amtAtMaxWinCount = 0, amtAtMaxLossCount = 0;

    let totalWinStreaksCount = 0, sumOfWinStreaks = 0;
    let totalLossStreaksCount = 0, sumOfLossStreaks = 0;

    let allProfits: number[] = [];

    let onPlanTrades = 0, onPlanWins = 0, onPlanLosses = 0, onPlanBE = 0, onPlanPnL = 0;
    let offPlanTrades = 0, offPlanWins = 0, offPlanLosses = 0, offPlanBE = 0, offPlanPnL = 0;
    let sumDurationWins = 0, countDurationWins = 0;
    let sumDurationLosses = 0, countDurationLosses = 0;

    const tfStats: Record<string, { trades: number; win: number; loss: number; be: number; pnl: number }> = {
      '15m': { trades: 0, win: 0, loss: 0, be: 0, pnl: 0 },
      '5m': { trades: 0, win: 0, loss: 0, be: 0, pnl: 0 },
      '1m': { trades: 0, win: 0, loss: 0, be: 0, pnl: 0 },
      'none': { trades: 0, win: 0, loss: 0, be: 0, pnl: 0 },
    };

    currentEvents.forEach((evt) => {
      if (evt.type === 'funding') {
        if (initialDeposit === 0 && evt.data.deposit > 0) {
          initialDeposit = evt.data.deposit;
        }
        runningBalance += evt.data.deposit;
        runningBalance -= (evt.data.withdraw || 0);

        if (runningBalance > peakBalance) peakBalance = runningBalance;
        if (runningBalance < minBalance) minBalance = runningBalance;

        perfBalanceData.push(runningBalance);
        perfPnlData.push(0);
        perfPnlColors.push('transparent');

        let dateStr = "Funding";
        if (evt.data.time) {
          try { dateStr = evt.data.time.split(' ')[0]; } catch (e) { }
        }
        perfBalanceLabels.push(dateStr);
      } else if (evt.type === 'trade') {
        const t = evt.data;
        let hr = evt.timeObj.getHours();
        const rrVal = t.rr || 0;
        const pnl = t.profit || 0;
        
        let isBE = false;
        const rawRisk = parseFloat(t.risk || 0);
        if (rawRisk > 0) {
          const calculatedRR = pnl / rawRisk;
          isBE = (calculatedRR >= -0.4 && calculatedRR <= 0.4);
        } else {
          isBE = (t.resultType === 'BE' || pnl === 0);
        }

        runningNetProfit += pnl;
        totalTrades++;
        allProfits.push(pnl);

        const planStatus = t.isOnPlan !== false;
        if (planStatus) {
          onPlanTrades++;
          onPlanPnL += pnl;
          if (isBE) onPlanBE++;
          else if (pnl > 0 || (!isBE && t.resultType === 'TP')) onPlanWins++;
          else onPlanLosses++;
        } else {
          offPlanTrades++;
          offPlanPnL += pnl;
          if (isBE) offPlanBE++;
          else if (pnl > 0 || (!isBE && t.resultType === 'TP')) offPlanWins++;
          else offPlanLosses++;
        }

        const validDuration = (!t.duration || t.duration <= 0) ? 60 : t.duration;
        if (!isBE) {
          if (pnl > 0 || (!isBE && t.resultType === 'TP')) {
            sumDurationWins += validDuration;
            countDurationWins++;
          } else if (pnl < 0 || (!isBE && t.resultType === 'SL')) {
            sumDurationLosses += validDuration;
            countDurationLosses++;
          }
        }

        if (isBE) {
          grossBE += pnl;
          sumBE += pnl;
          if (Math.abs(pnl) > Math.abs(largestBE)) largestBE = pnl;
          beTradesCount++;
        } else if (pnl > 0 || (!isBE && t.resultType === 'TP')) {
          grossProfit += pnl;
          profitTradesCount++;
          if (pnl > largestProfit) largestProfit = pnl;

          currentWinCount++;
          currentWinAmt += pnl;
          if (currentLossCount > 0) {
            totalLossStreaksCount++;
            sumOfLossStreaks += currentLossCount;
            currentLossCount = 0;
            currentLossAmt = 0;
          }

          if (currentWinCount > maxConsWinCount) {
            maxConsWinCount = currentWinCount;
            amtAtMaxWinCount = currentWinAmt;
          }
          if (currentWinAmt > maxConsWinAmt) {
            maxConsWinAmt = currentWinAmt;
            countAtMaxWinAmt = currentWinCount;
          }

        } else if (pnl < 0 || (!isBE && t.resultType === 'SL')) {
          grossLoss += Math.abs(pnl);
          lossTradesCount++;
          if (pnl < largestLoss) largestLoss = pnl;

          currentLossCount++;
          currentLossAmt += Math.abs(pnl);
          if (currentWinCount > 0) {
            totalWinStreaksCount++;
            sumOfWinStreaks += currentWinCount;
            currentWinCount = 0;
            currentWinAmt = 0;
          }

          if (currentLossCount > maxConsLossCount) {
            maxConsLossCount = currentLossCount;
            amtAtMaxLossCount = currentLossAmt;
          }
          if (currentLossAmt > maxConsLossAmt) {
            maxConsLossAmt = currentLossAmt;
            countAtMaxLossAmt = currentLossCount;
          }
        }

        if (t.side === 'BUY') {
          longTrades++;
          if (!isBE && (pnl > 0 || t.resultType === 'TP')) longWon++;
        } else if (t.side === 'SELL') {
          shortTrades++;
          if (!isBE && (pnl > 0 || t.resultType === 'TP')) shortWon++;
        }

        const tfKey = t.tf && ['15m', '5m', '1m'].includes(t.tf) ? t.tf : 'none';
        tfStats[tfKey].trades++;
        tfStats[tfKey].pnl += pnl;
        if (isBE) {
          tfStats[tfKey].be++;
        } else if (pnl > 0 || (!isBE && t.resultType === 'TP')) {
          tfStats[tfKey].win++;
        } else {
          tfStats[tfKey].loss++;
        }

        if (!isNaN(hr)) {
          hourStats[hr] += rrVal;
          hourStatsPnL[hr] += pnl;
        }

        if (!isNaN(evt.timeObj.getTime())) {
          const mMonth = evt.timeObj.getMonth();
          if (moyStartBalance[mMonth] === null) moyStartBalance[mMonth] = runningBalance - pnl;
          moyPnL[mMonth] += pnl;

          dowStats[evt.timeObj.getDay()] += rrVal;
          dowStatsPnL[evt.timeObj.getDay()] += pnl;
          moyStats[mMonth] += rrVal;
          moyStatsPnL[mMonth] += pnl;
        }

        if (!matrix[t.symbol]) {
          matrix[t.symbol] = {
            BUY: { trades: 0, win: 0, loss: 0, pnl: 0, rr: 0, rrCount: 0 },
            SELL: { trades: 0, win: 0, loss: 0, pnl: 0, rr: 0, rrCount: 0 }
          };
        }
        const tfValKey = t.tf && t.tf !== 'none' ? t.tf : 'none';
        if (!tfMatrix[tfValKey]) {
          tfMatrix[tfValKey] = {
            BUY: { trades: 0, win: 0, loss: 0, pnl: 0, rr: 0, rrCount: 0 },
            SELL: { trades: 0, win: 0, loss: 0, pnl: 0, rr: 0, rrCount: 0 }
          };
        }
        const side = t.side === 'BUY' || t.side === 'SELL' ? t.side : null;
        if (side) {
          const m = matrix[t.symbol][side];
          m.trades++;
          m.pnl += pnl;
          if (!isBE) {
            if (pnl > 0 || t.resultType === 'TP') m.win++;
            if (pnl < 0 || t.resultType === 'SL') m.loss++;
          }
          if (t.rr) { m.rr += t.rr; m.rrCount++; }

          const tm = tfMatrix[tfValKey][side];
          tm.trades++;
          tm.pnl += pnl;
          if (!isBE) {
            if (pnl > 0 || t.resultType === 'TP') tm.win++;
            if (pnl < 0 || t.resultType === 'SL') tm.loss++;
          }
          if (t.rr) { tm.rr += t.rr; tm.rrCount++; }
        }

        runningBalance += pnl;
        if (runningBalance < minBalance) minBalance = runningBalance;
        if (runningBalance > peakBalance) peakBalance = runningBalance;

        let currentDD = peakBalance - runningBalance;
        let currentDDPct = peakBalance > 0 ? (currentDD / peakBalance) * 100 : 0;

        if (currentDD > maxDrawdownAmt) maxDrawdownAmt = currentDD;
        if (currentDDPct > maxDrawdownPct) maxDrawdownPct = currentDDPct;

        perfBalanceData.push(runningBalance);
        perfPnlData.push(pnl);
        perfPnlColors.push(isBE ? '#d6d3d1' : (pnl >= 0 ? '#fb923c' : '#7f1d1d'));

        tradeCount++;
        let dateStr = "Trade " + tradeCount;
        if (t.time) {
          try { dateStr = t.time.split(' ')[0]; } catch (e) { }
        }
        perfBalanceLabels.push(dateStr);
      }
    });

    if (currentWinCount > 0) { totalWinStreaksCount++; sumOfWinStreaks += currentWinCount; }
    if (currentLossCount > 0) { totalLossStreaksCount++; sumOfLossStreaks += currentLossCount; }

    if (initialDeposit === 0) initialDeposit = carriedOverBalance > 0 ? carriedOverBalance : 1;

    const netProfit = runningNetProfit;
    const profitFactor = grossLoss === 0 ? grossProfit : (grossProfit / grossLoss);
    const expectedPayoff = totalTrades > 0 ? (netProfit / totalTrades) : 0;
    const absoluteDD = (initialDeposit - minBalance) > 0 ? (initialDeposit - minBalance) : 0;
    const recoveryFactor = maxDrawdownAmt > 0 ? (netProfit / maxDrawdownAmt) : 0;
    const avgWin = profitTradesCount > 0 ? (grossProfit / profitTradesCount) : 0;
    const avgLoss = lossTradesCount > 0 ? (grossLoss / lossTradesCount) : 0;
    const avgBE = beTradesCount > 0 ? (sumBE / beTradesCount) : 0;

    const stdDev = calculateStandardDeviation(allProfits, totalTrades > 0 ? (netProfit / totalTrades) : 0);
    const sharpeRatio = stdDev !== 0 ? ((netProfit / totalTrades) / stdDev) : 0;

    const winPct = totalTrades > 0 ? (profitTradesCount / totalTrades) * 100 : 0;
    const lossPct = totalTrades > 0 ? (lossTradesCount / totalTrades) * 100 : 0;
    const bePct = totalTrades > 0 ? (beTradesCount / totalTrades) * 100 : 0;
    
    const resolvedTrades = profitTradesCount + lossTradesCount;
    const mainWinRate = resolvedTrades > 0 ? (profitTradesCount / resolvedTrades) * 100 : 0;
    
    const longWinPct = longTrades > 0 ? (longWon / longTrades) * 100 : 0;
    const shortWinPct = shortTrades > 0 ? (shortWon / shortTrades) * 100 : 0;
    
    const totalPlanTrades = onPlanTrades + offPlanTrades;
    const onPlanPct = totalPlanTrades > 0 ? (onPlanTrades / totalPlanTrades) * 100 : 0;
    const offPlanPct = totalPlanTrades > 0 ? (offPlanTrades / totalPlanTrades) * 100 : 0;

    const onPlanWR = (onPlanWins + onPlanLosses) > 0 ? formatNumber((onPlanWins / (onPlanWins + onPlanLosses)) * 100) : '0.00';
    const offPlanWR = (offPlanWins + offPlanLosses) > 0 ? formatNumber((offPlanWins / (offPlanWins + offPlanLosses)) * 100) : '0.00';

    function formatDuration(sec: number) {
      if (!sec || sec <= 0) return '0s';
      const d = Math.floor(sec / (24 * 3600)); sec %= (24 * 3600);
      const h = Math.floor(sec / 3600); sec %= 3600;
      const m = Math.floor(sec / 60); const s = Math.floor(sec % 60);
      if (d > 0) return `${d}d ${h}h`;
      if (h > 0) return `${h}h ${m}m`;
      if (m > 0) return `${m}m ${s}s`;
      return `${s}s`;
    }

    const holdWin = countDurationWins > 0 ? formatDuration(sumDurationWins / countDurationWins) : '-';
    const holdLoss = countDurationLosses > 0 ? formatDuration(sumDurationLosses / countDurationLosses) : '-';

    // Chart Data Generation
    const hourlyDataArr = hours.map(h => selectedMetric === 'RR' ? hourStats[h] : hourStatsPnL[h]);
    const hourlyColors = hourlyDataArr.map(v => v >= 0 ? '#fb923c' : '#7f1d1d');

    const activeDowKeys = Object.keys(dowStats).filter(k => selectedMetric === 'RR' ? dowStats[k as any as number] !== 0 : dowStatsPnL[k as any as number] !== 0).map(Number);
    const activeDowNames = activeDowKeys.map(k => dowNames[k]);
    const activeDowData = activeDowKeys.map(k => selectedMetric === 'RR' ? dowStats[k] : dowStatsPnL[k]);
    const dowColors = activeDowData.map(v => v >= 0 ? '#fb923c' : '#7f1d1d');

    const activeMoyKeys = Object.keys(moyStats).filter(k => (selectedMetric === 'RR' ? moyStats[k as any as number] !== 0 : moyStatsPnL[k as any as number] !== 0) || moyPnL[k as any as number] !== 0).map(Number);
    const activeMoyNames = activeMoyKeys.map(k => monthNames[k]);
    const moyRRData = activeMoyKeys.map(k => selectedMetric === 'RR' ? moyStats[k] : moyStatsPnL[k]);
    const moyRRColors = moyRRData.map(v => v >= 0 ? '#fb923c' : '#7f1d1d');
    const moyGainData = activeMoyKeys.map(k => {
      let sb = moyStartBalance[k] || 1;
      return (moyPnL[k] / sb) * 100;
    });
    const moyGainColors = moyGainData.map(v => v >= 0 ? '#fed7aa' : '#b91c1c');

    const matrixSorted = Object.entries(matrix).sort((a: any, b: any) => (b[1].BUY.pnl + b[1].SELL.pnl) - (a[1].BUY.pnl + a[1].SELL.pnl));
    const tfMatrixSorted = Object.entries(tfMatrix).sort((a: any, b: any) => (b[1].BUY.pnl + b[1].SELL.pnl) - (a[1].BUY.pnl + a[1].SELL.pnl));

    return {
      tfStats, tfMatrixSorted,
      netProfit, profitFactor, expectedPayoff, mainWinRate,
      totalTrades, winPct, lossPct, bePct, profitTradesCount, lossTradesCount, beTradesCount,
      longWinPct, shortWinPct, longTrades, shortTrades,
      onPlanPct, offPlanPct, onPlanWR, offPlanWR, onPlanPnL, offPlanPnL,
      avgWin, avgLoss, avgBE, holdWin, holdLoss,
      largestProfit, largestLoss, grossProfit, grossLoss, sharpeRatio,
      maxDrawdownAmt, absoluteDD, maxDrawdownPct, recoveryFactor,
      maxConsWinAmt, maxConsLossAmt, countAtMaxWinAmt, countAtMaxLossAmt,
      avgConsWin: totalWinStreaksCount > 0 ? Math.round(sumOfWinStreaks / totalWinStreaksCount) : 0,
      avgConsLoss: totalLossStreaksCount > 0 ? Math.round(sumOfLossStreaks / totalLossStreaksCount) : 0,
      perfBalanceLabels, perfBalanceData, perfPnlData, perfPnlColors,
      hourlyDataArr, hourlyColors, activeDowNames, activeDowData, dowColors,
      activeMoyNames, moyRRData, moyRRColors, moyGainData, moyGainColors,
      matrixSorted
    };
  }, [trades, funding, selectedYear, selectedTf, selectedMetric]);

  const lastBalancePointPlugin: Plugin<'line'> = useMemo(() => ({
    id: 'lastBalancePointPlugin',
    afterDatasetsDraw(chart) {
      const ctx = chart.ctx;
      const meta = chart.getDatasetMeta(0);
      if (!meta.hidden && meta.data.length > 0) {
        const lastElement = meta.data[meta.data.length - 1];
        const lastVal = chart.data.datasets[0].data[meta.data.length - 1] as number;
        const position = (lastElement as any).tooltipPosition();

        ctx.save();
        ctx.beginPath();
        ctx.arc(position.x, position.y, 6, 0, 2 * Math.PI);
        ctx.fillStyle = '#1c1917';
        ctx.fill();

        ctx.fillStyle = '#1c1917';
        ctx.font = 'bold 11px "Plus Jakarta Sans", sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(formatNumber(lastVal), position.x + 12, position.y);
        ctx.restore();
      }
    }
  }), []);

  const customDowLabels: Plugin<'bar'> = useMemo(() => ({
    id: 'customDowLabels',
    afterDatasetsDraw(chart) {
      const { ctx } = chart;
      chart.data.datasets.forEach((dataset, i) => {
        const meta = chart.getDatasetMeta(i);
        if (!meta.hidden) {
          meta.data.forEach((element, index) => {
            ctx.fillStyle = '#78716c';
            ctx.font = 'bold 10px "Plus Jakarta Sans", sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            const val = dataset.data[index] as number;
            const text = selectedMetric === 'RR' ? formatNumber(val) + 'R' : '$' + formatNumber(val);

            const position = (element as any).tooltipPosition();
            const yOffset = val >= 0 ? -12 : 14;
            ctx.fillText(text, position.x, position.y + yOffset);
          });
        }
      });
    }
  }), [selectedMetric]);

  const customMoyLabels: Plugin<'bar'> = useMemo(() => ({
    id: 'customMoyLabels',
    afterDatasetsDraw(chart) {
      const { ctx } = chart;
      chart.data.datasets.forEach((dataset, i) => {
        const meta = chart.getDatasetMeta(i);
        if (!meta.hidden) {
          meta.data.forEach((element, index) => {
            ctx.fillStyle = '#78716c';
            ctx.font = 'bold 10px "Plus Jakarta Sans", sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            const val = dataset.data[index] as number;
            let text = formatNumber(val);
            if (i === 0) text = selectedMetric === 'RR' ? text + 'R' : '$' + formatNumber(val);
            else text += '%';

            const position = (element as any).tooltipPosition();
            const yOffset = val >= 0 ? -12 : 14;
            ctx.fillText(text, position.x, position.y + yOffset);
          });
        }
      });
    }
  }), [selectedMetric]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-stone-500 font-semibold animate-pulse">Loading performance...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4">
        <div>
          <h2 className="text-3xl font-extrabold text-stone-950 tracking-tight">Performance</h2>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-stone-500 uppercase tracking-widest">Year:</span>
            <select value={selectedYear} onChange={(e) => setSelectedYear(e.target.value)}
              className="bg-white border border-stone-200 text-stone-950 text-sm font-bold rounded-xl px-4 py-2 shadow-sm focus:outline-none focus:border-orange-400 cursor-pointer">
              {availableYears.map(y => (
                 <option key={y} value={y.toString()}>{y}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-stone-500 uppercase tracking-widest">TF:</span>
            <select value={selectedTf} onChange={(e) => setSelectedTf(e.target.value)}
              className="bg-white border border-stone-200 text-stone-950 text-sm font-bold rounded-xl px-4 py-2 shadow-sm focus:outline-none focus:border-orange-400 cursor-pointer">
              <option value="ALL">ALL</option>
              {availableTfs.map(tf => (
                <option key={tf} value={tf}>{tf}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="glass-card p-6 h-[400px] flex flex-col w-full">
        <h3 className="text-xs font-black text-stone-950 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
          <span className="w-2 h-2 bg-orange-400 rounded-full"></span> Profit and Balance
        </h3>
        <div className="flex-1 relative w-full h-full">
          <Line
            data={{
              labels: data.perfBalanceLabels,
              datasets: [
                {
                  label: 'Account Balance',
                  data: data.perfBalanceData,
                  borderColor: 'transparent',
                  borderWidth: 0,
                  backgroundColor: 'rgba(0, 0, 0, 0.03)',
                  fill: true,
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
                  yAxisID: 'y1'
                }
              ] as any
            }}
            options={{
              responsive: true, maintainAspectRatio: false,
              layout: { padding: { top: 20, right: 80 } },
              plugins: { legend: { display: false } },
              scales: {
                x: { display: false },
                y: { display: false, grace: '10%' },
                y1: { display: true, position: 'left', grid: { color: '#fafaf9', drawOnChartArea: true }, ticks: { display: false }, border: { display: false }, grace: '10%' }
              }
            }}
            plugins={[lastBalancePointPlugin]}
          />
        </div>
      </div>

      <div className="bg-stone-100/60 border border-stone-200 rounded-[1.25rem] p-6 flex flex-col w-full shadow-[0_4px_6px_-1px_rgba(0,0,0,0.02),0_2px_4px_-1px_rgba(0,0,0,0.02)]">
        <h3 className="text-xs font-black text-stone-950 uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
          <span className="w-2 h-2 bg-orange-400 rounded-full"></span> Results
        </h3>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5 mt-4">
          <div className="bg-white p-5 rounded-[1.25rem] border border-stone-200 shadow-sm flex flex-col justify-center items-center text-center">
            <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1">Net Profit</span>
            <span className={`text-xl font-black ${data.netProfit >= 0 ? 'text-orange-400' : 'text-red-900'}`}>{formatCurrency(data.netProfit)}</span>
          </div>
          <div className="bg-orange-400 p-5 rounded-[1.25rem] shadow-lg shadow-orange-400/20 flex flex-col justify-center items-center text-center">
            <span className="text-[10px] font-bold text-white/90 uppercase tracking-widest mb-1">Win Rate</span>
            <span className="text-xl font-black text-white">{formatNumber(data.mainWinRate)}%</span>
          </div>
          <div className="bg-white p-5 rounded-[1.25rem] border border-stone-200 shadow-sm flex flex-col justify-center items-center text-center">
            <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1">Profit Factor</span>
            <span className="text-xl font-black text-stone-950">{formatNumber(data.profitFactor)}</span>
          </div>
          <div className="bg-white p-5 rounded-[1.25rem] border border-stone-200 shadow-sm flex flex-col justify-center items-center text-center">
            <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1">Expectancy</span>
            <span className="text-xl font-black text-stone-950">{formatCurrency(data.expectedPayoff)}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-5">
          <div className="bg-white p-5 rounded-xl border border-stone-200 shadow-sm flex flex-col justify-between space-y-2.5">
            <div className="flex justify-between items-end">
              <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Outcomes</span>
            </div>
            <div className="w-full h-2.5 bg-stone-100 rounded-full overflow-hidden flex">
              <div className="h-full bg-orange-400 transition-all duration-500" style={{ width: `${data.winPct}%` }}></div>
              <div className="h-full bg-stone-200 transition-all duration-500" style={{ width: `${data.bePct}%` }}></div>
              <div className="h-full bg-red-900 transition-all duration-500" style={{ width: `${data.lossPct}%` }}></div>
            </div>
            <div className="flex justify-between text-[10px] font-bold">
              <span className="text-orange-400 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-orange-400 shrink-0"></span><span>{formatNumber(data.winPct)}%</span></span>
              <span className="text-stone-400 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-stone-200 shrink-0"></span><span>{formatNumber(data.bePct)}%</span></span>
              <span className="text-red-900 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-red-900 shrink-0"></span><span>{formatNumber(data.lossPct)}%</span></span>
            </div>
            <div className="grid grid-cols-3 gap-2 pt-0.5">
              <div className="bg-orange-50/60 border border-orange-200 rounded-lg p-1.5 text-center flex flex-col justify-center items-center shadow-sm">
                <span className="text-[9px] font-bold text-orange-400 uppercase tracking-wider">TP</span>
                <span className="text-xs font-black text-orange-500">{data.profitTradesCount}</span>
              </div>
              <div className="bg-stone-50 border border-stone-200 rounded-lg p-1.5 text-center flex flex-col justify-center items-center shadow-sm">
                <span className="text-[9px] font-bold text-stone-400 uppercase tracking-wider">BE</span>
                <span className="text-xs font-black text-stone-700">{data.beTradesCount}</span>
              </div>
              <div className="bg-red-50/60 border border-red-200 rounded-lg p-1.5 text-center flex flex-col justify-center items-center shadow-sm">
                <span className="text-[9px] font-bold text-red-800 uppercase tracking-wider">SL</span>
                <span className="text-xs font-black text-red-900">{data.lossTradesCount}</span>
              </div>
            </div>
          </div>

          <div className="bg-white p-5 rounded-xl border border-stone-200 shadow-sm space-y-4">
            <div className="flex justify-between items-end">
              <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Direction</span>
            </div>
            <div className="space-y-3 mt-2">
              <div>
                <div className="flex justify-between text-[10px] font-bold mb-1">
                  <span className="text-stone-600">Buy <span className="text-stone-400 font-normal">({data.longTrades})</span></span>
                  <span className="text-stone-950">{formatNumber(data.longWinPct)}%</span>
                </div>
                <div className="w-full h-1.5 bg-stone-100 rounded-full overflow-hidden"><div className="h-full bg-stone-950 transition-all duration-500" style={{ width: `${data.longWinPct}%` }}></div></div>
              </div>
              <div>
                <div className="flex justify-between text-[10px] font-bold mb-1">
                  <span className="text-stone-600">Sell <span className="text-stone-400 font-normal">({data.shortTrades})</span></span>
                  <span className="text-stone-950">{formatNumber(data.shortWinPct)}%</span>
                </div>
                <div className="w-full h-1.5 bg-stone-100 rounded-full overflow-hidden"><div className="h-full bg-stone-950 transition-all duration-500" style={{ width: `${data.shortWinPct}%` }}></div></div>
              </div>
            </div>
          </div>

          <div className="bg-white p-5 rounded-xl border border-stone-200 shadow-sm space-y-4">
            <div className="flex justify-between items-end">
              <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Discipline</span>
            </div>
            <div className="w-full h-3 bg-stone-100 rounded-full overflow-hidden flex mt-2">
              <div className="h-full bg-orange-400 transition-all duration-500" style={{ width: `${data.onPlanPct}%` }}></div>
              <div className="h-full bg-red-900 transition-all duration-500" style={{ width: `${data.offPlanPct}%` }}></div>
            </div>
            <div className="flex justify-between text-[10px] font-bold mt-3">
              <div className="flex flex-col gap-1">
                <span className="text-orange-400 flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-400"></span><span>{data.onPlanWR}%</span></span>
                <span className="text-orange-400">On Plan</span>
                <span className="text-orange-400">{formatCurrency(data.onPlanPnL)}</span>
              </div>
              <div className="flex flex-col gap-1 items-end text-right">
                <span className="text-red-900 flex items-center gap-1 justify-end"><span className="w-2 h-2 rounded-full bg-red-900"></span><span>{data.offPlanWR}%</span></span>
                <span className="text-red-900">Off Plan</span>
                <span className="text-red-900">{formatCurrency(data.offPlanPnL)}</span>
              </div>
            </div>
          </div>

          <div className="bg-white p-5 rounded-xl border border-stone-200 shadow-sm space-y-4">
            <div className="flex justify-between items-end">
              <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Timeframe</span>
            </div>
            <div className="space-y-3 mt-2">
              {['15m', '5m', '1m'].map(tf => {
                const stat = data.tfStats[tf];
                const resolved = stat.win + stat.loss;
                const wr = resolved > 0 ? (stat.win / resolved) * 100 : 0;
                return (
                  <div key={tf}>
                    <div className="flex justify-between text-[10px] font-bold mb-1">
                      <span className="text-stone-600">{tf} <span className="text-stone-400 font-normal">({stat.trades})</span></span>
                      <span className="text-stone-950 flex items-center gap-1.5">
                        <span className={stat.pnl >= 0 ? 'text-orange-400' : 'text-red-900'}>{formatCurrency(stat.pnl)}</span>
                        <span>| {formatNumber(wr)}%</span>
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-stone-100 rounded-full overflow-hidden">
                      <div className="h-full bg-stone-950 transition-all duration-500" style={{ width: `${wr}%` }}></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-sm text-xs space-y-2">
            <div className="text-[9px] font-bold text-stone-400 uppercase tracking-widest border-b border-stone-100 pb-1.5 mb-2">Averages & Time</div>
            <div className="flex justify-between"><span className="text-stone-500">Avg Win</span><span className="font-bold text-orange-400">{formatCurrency(data.avgWin)}</span></div>
            <div className="flex justify-between"><span className="text-stone-500">Avg Loss</span><span className="font-bold text-red-900">{formatCurrency(-data.avgLoss)}</span></div>
            <div className="flex justify-between"><span className="text-stone-500">Avg BE</span><span className="font-bold text-stone-400">{formatCurrency(data.avgBE)}</span></div>
            <div className="flex justify-between pt-1"><span className="text-stone-500">Hold (Win)</span><span className="font-bold text-stone-950">{data.holdWin}</span></div>
            <div className="flex justify-between"><span className="text-stone-500">Hold (Loss)</span><span className="font-bold text-stone-950">{data.holdLoss}</span></div>
          </div>
          <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-sm text-xs space-y-2">
            <div className="text-[9px] font-bold text-stone-400 uppercase tracking-widest border-b border-stone-100 pb-1.5 mb-2">Totals & Extremes</div>
            <div className="flex justify-between"><span className="text-stone-500">Gross Profit</span><span className="font-bold text-orange-400">{formatCurrency(data.grossProfit)}</span></div>
            <div className="flex justify-between"><span className="text-stone-500">Gross Loss</span><span className="font-bold text-red-900">{formatCurrency(-data.grossLoss)}</span></div>
            <div className="flex justify-between pt-1"><span className="text-stone-500">Largest Win</span><span className="font-bold text-orange-400">{formatCurrency(data.largestProfit)}</span></div>
            <div className="flex justify-between"><span className="text-stone-500">Largest Loss</span><span className="font-bold text-red-900">{formatCurrency(data.largestLoss)}</span></div>
          </div>
          <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-sm text-xs space-y-2">
            <div className="text-[9px] font-bold text-stone-400 uppercase tracking-widest border-b border-stone-100 pb-1.5 mb-2">Risk & Drawdowns</div>
            <div className="flex justify-between"><span className="text-stone-500">Absolute DD</span><span className="font-bold text-red-900">{formatCurrency(data.absoluteDD)}</span></div>
            <div className="flex justify-between"><span className="text-stone-500">Maximal DD</span><span className="font-bold text-red-900">{formatCurrency(data.maxDrawdownAmt)}</span></div>
            <div className="flex justify-between"><span className="text-stone-500">Relative DD</span><span className="font-bold text-red-900">{formatNumber(data.maxDrawdownPct)}%</span></div>
            <div className="flex justify-between pt-1"><span className="text-stone-500">Recovery</span><span className="font-bold text-stone-950">{formatNumber(data.recoveryFactor)}</span></div>
            <div className="flex justify-between"><span className="text-stone-500">Sharpe Ratio</span><span className="font-bold text-stone-950">{formatNumber(data.sharpeRatio)}</span></div>
          </div>
          <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-sm text-xs space-y-2">
            <div className="text-[9px] font-bold text-stone-400 uppercase tracking-widest border-b border-stone-100 pb-1.5 mb-2">Streaks</div>
            <div className="flex justify-between"><span className="text-stone-500">Max Cons Win</span><span className="font-bold text-orange-400">{data.countAtMaxWinAmt} ({formatCurrency(data.maxConsWinAmt)})</span></div>
            <div className="flex justify-between"><span className="text-stone-500">Max Cons Loss</span><span className="font-bold text-red-900">{data.countAtMaxLossAmt} ({formatCurrency(-data.maxConsLossAmt)})</span></div>
            <div className="flex justify-between pt-1"><span className="text-stone-500">Avg Cons Win</span><span className="font-bold text-stone-950">{data.avgConsWin}</span></div>
            <div className="flex justify-between"><span className="text-stone-500">Avg Cons Loss</span><span className="font-bold text-stone-950">{data.avgConsLoss}</span></div>
          </div>
        </div>
      </div>

      <div className="flex justify-end items-center gap-3 mt-4 mb-2">
        <span className="text-xs font-bold text-stone-500 uppercase tracking-widest">Chart Metric</span>
        <select value={selectedMetric} onChange={(e) => setSelectedMetric(e.target.value)}
          className="bg-white border border-stone-200 text-stone-950 text-sm font-bold rounded-xl px-4 py-2 shadow-sm focus:outline-none focus:border-orange-400 cursor-pointer">
          <option value="RR">Risk/Reward (RR)</option>
          <option value="PNL">Net P&L ($)</option>
        </select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass-card p-6 h-[400px] flex flex-col">
          <h3 className="text-xs font-black text-stone-950 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
            <span className="w-2 h-2 bg-orange-400 rounded-full"></span> Hour of Day
          </h3>
          <div className="flex-1 relative w-full h-full">
            <Bar
              data={{
                labels: Array.from({ length: 24 }, (_, i) => `${i}:00`),
                datasets: [{ label: selectedMetric === 'RR' ? 'Net RR' : 'Net P&L ($)', data: data.hourlyDataArr, backgroundColor: data.hourlyColors, borderRadius: 6 }]
              }}
              options={{
                responsive: true, maintainAspectRatio: false,
                scales: { 
                  y: { border: { display: false }, grid: { color: '#fafaf9' }, ticks: { display: false } }, 
                  x: { grid: { display: false } } 
                },
                plugins: { legend: { display: false } }
              }}
            />
          </div>
        </div>
        <div className="glass-card p-6 h-[400px] flex flex-col">
          <h3 className="text-xs font-black text-stone-950 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
            <span className="w-2 h-2 bg-orange-400 rounded-full"></span> Day of Week
          </h3>
          <div className="flex-1 relative w-full h-full">
            <Bar
              key={`dow-${selectedMetric}`}
              data={{
                labels: data.activeDowNames,
                datasets: [{ label: selectedMetric === 'RR' ? 'Net RR' : 'Net P&L ($)', data: data.activeDowData, backgroundColor: data.dowColors, borderRadius: 6 }]
              }}
              options={{
                responsive: true, maintainAspectRatio: false,
                layout: { padding: { top: 20, bottom: 20 } },
                scales: {
                  y: { border: { display: false }, grid: { color: '#fafaf9' }, ticks: { display: false }, grace: '20%' },
                  x: { grid: { display: false } }
                },
                plugins: { legend: { display: false } }
              }}
              plugins={[customDowLabels]}
            />
          </div>
        </div>
      </div>

      <div className="glass-card p-6 h-[400px] flex flex-col w-full">
        <h3 className="text-xs font-black text-stone-950 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
          <span className="w-2 h-2 bg-orange-400 rounded-full"></span> Month of Year
        </h3>
        <div className="flex-1 relative w-full h-full">
          <Bar
            key={`moy-${selectedMetric}`}
            data={{
              labels: data.activeMoyNames,
              datasets: [
                {
                  label: selectedMetric === 'RR' ? 'Net RR' : 'Net P&L ($)',
                  data: data.moyRRData,
                  backgroundColor: data.moyRRColors,
                  borderRadius: 6,
                  yAxisID: 'y'
                },
                {
                  label: 'Gain',
                  data: data.moyGainData,
                  backgroundColor: data.moyGainColors,
                  borderRadius: 6,
                  yAxisID: 'y1'
                }
              ] as any
            }}
            options={{
              responsive: true, maintainAspectRatio: false,
              layout: { padding: { top: 20, bottom: 20 } },
              scales: {
                y: { border: { display: false }, grid: { color: '#fafaf9' }, ticks: { display: false }, grace: '20%' },
                y1: { display: false, grid: { drawOnChartArea: false }, grace: '20%' },
                x: { grid: { display: false } }
              },
              plugins: { legend: { position: 'top', labels: { usePointStyle: true, boxWidth: 8 } } }
            }}
            plugins={[customMoyLabels]}
          />
        </div>
      </div>

      <div className="glass-card p-6 overflow-hidden flex flex-col">
        <h3 className="text-xs font-black text-stone-950 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
          <span className="w-2 h-2 bg-orange-400 rounded-full"></span> Buy VS Sell Analysis
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-center text-sm whitespace-nowrap border-collapse">
            <thead>
              <tr className="text-stone-400 bg-stone-100">
                <th className="py-2 px-4 rounded-tl-xl"></th>
                <th colSpan={4} className="py-2 px-4 font-black text-stone-950 uppercase text-[10px] tracking-widest text-center border-l border-stone-200">Buy</th>
                <th colSpan={4} className="py-2 px-4 font-black text-stone-950 uppercase text-[10px] tracking-widest text-center border-l border-stone-200">Sell</th>
                <th className="py-2 px-4 rounded-tr-xl border-l border-stone-200"></th>
              </tr>
              <tr className="text-stone-400 bg-stone-100">
                <th className="py-2 px-4 font-bold uppercase text-[10px] tracking-widest text-center align-middle">Symbol</th>
                <th className="py-2 px-4 font-bold uppercase text-[9px] text-center align-middle border-l border-stone-200">Trades</th>
                <th className="py-2 px-4 font-bold uppercase text-[9px] text-center align-middle">Win %</th>
                <th className="py-2 px-4 font-bold uppercase text-[9px] text-center align-middle">Avg RR</th>
                <th className="py-2 px-4 font-bold uppercase text-[9px] text-center align-middle">P&L</th>
                <th className="py-2 px-4 font-bold uppercase text-[9px] text-center align-middle border-l border-stone-200">Trades</th>
                <th className="py-2 px-4 font-bold uppercase text-[9px] text-center align-middle">Win %</th>
                <th className="py-2 px-4 font-bold uppercase text-[9px] text-center align-middle">Avg RR</th>
                <th className="py-2 px-4 font-bold uppercase text-[9px] text-center align-middle">P&L</th>
                <th className="py-2 px-4 font-bold uppercase text-[10px] text-center align-middle border-l border-stone-200">Net P&L</th>
              </tr>
            </thead>
            <tbody className="text-[12px]">
              {data.matrixSorted.map(([sym, mData]: [string, any]) => {
                const b = mData.BUY, s = mData.SELL;
                const bWR = (b.win + b.loss) > 0 ? formatNumber(b.win / (b.win + b.loss) * 100) + '%' : '-';
                const sWR = (s.win + s.loss) > 0 ? formatNumber(s.win / (s.win + s.loss) * 100) + '%' : '-';
                const bRR = b.rrCount ? formatNumber((b.rr / b.rrCount)) + 'R' : '-';
                const sRR = s.rrCount ? formatNumber((s.rr / s.rrCount)) + 'R' : '-';
                const total = b.pnl + s.pnl;

                return (
                  <tr key={sym} className="hover:bg-stone-50 transition duration-150">
                    <td className="py-3 px-4 font-extrabold text-stone-950 text-[11px] text-center">{sym}</td>
                    <td className="py-3 px-4 text-center font-semibold text-stone-950 border-l border-stone-200">{b.trades}</td>
                    <td className="py-3 px-4 text-center font-bold text-stone-950">{bWR}</td>
                    <td className={`py-3 px-4 text-center font-bold ${b.rr >= 0 ? 'text-orange-400' : 'text-red-900'}`}>{bRR}</td>
                    <td className={`py-3 px-4 text-center font-black ${b.pnl >= 0 ? 'text-orange-400' : 'text-red-900'}`}>{formatCurrency(b.pnl)}</td>
                    <td className="py-3 px-4 text-center font-semibold text-stone-950 border-l border-stone-200">{s.trades}</td>
                    <td className="py-3 px-4 text-center font-bold text-stone-950">{sWR}</td>
                    <td className={`py-3 px-4 text-center font-bold ${s.rr >= 0 ? 'text-orange-400' : 'text-red-900'}`}>{sRR}</td>
                    <td className={`py-3 px-4 text-center font-black ${s.pnl >= 0 ? 'text-orange-400' : 'text-red-900'}`}>{formatCurrency(s.pnl)}</td>
                    <td className={`py-3 px-4 text-center font-black border-l border-stone-200 ${total >= 0 ? 'text-orange-400' : 'text-red-900'}`}>{formatCurrency(total)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="glass-card p-6 overflow-hidden flex flex-col">
        <h3 className="text-xs font-black text-stone-950 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
          <span className="w-2 h-2 bg-orange-400 rounded-full"></span> Timeframe Analysis
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-center text-sm whitespace-nowrap border-collapse">
            <thead>
              <tr className="text-stone-400 bg-stone-100">
                <th className="py-2 px-4 rounded-tl-xl"></th>
                <th colSpan={4} className="py-2 px-4 font-black text-stone-950 uppercase text-[10px] tracking-widest text-center border-l border-stone-200">Buy</th>
                <th colSpan={4} className="py-2 px-4 font-black text-stone-950 uppercase text-[10px] tracking-widest text-center border-l border-stone-200">Sell</th>
                <th className="py-2 px-4 rounded-tr-xl border-l border-stone-200"></th>
              </tr>
              <tr className="text-stone-400 bg-stone-100">
                <th className="py-2 px-4 font-bold uppercase text-[10px] tracking-widest text-center align-middle">Timeframe</th>
                <th className="py-2 px-4 font-bold uppercase text-[9px] text-center align-middle border-l border-stone-200">Trades</th>
                <th className="py-2 px-4 font-bold uppercase text-[9px] text-center align-middle">Win %</th>
                <th className="py-2 px-4 font-bold uppercase text-[9px] text-center align-middle">Avg RR</th>
                <th className="py-2 px-4 font-bold uppercase text-[9px] text-center align-middle">P&L</th>
                <th className="py-2 px-4 font-bold uppercase text-[9px] text-center align-middle border-l border-stone-200">Trades</th>
                <th className="py-2 px-4 font-bold uppercase text-[9px] text-center align-middle">Win %</th>
                <th className="py-2 px-4 font-bold uppercase text-[9px] text-center align-middle">Avg RR</th>
                <th className="py-2 px-4 font-bold uppercase text-[9px] text-center align-middle">P&L</th>
                <th className="py-2 px-4 font-bold uppercase text-[10px] text-center align-middle border-l border-stone-200">Net P&L</th>
              </tr>
            </thead>
            <tbody className="text-[12px]">
              {data.tfMatrixSorted.map(([tf, mData]: [string, any]) => {
                const b = mData.BUY, s = mData.SELL;
                const bWR = (b.win + b.loss) > 0 ? formatNumber(b.win / (b.win + b.loss) * 100) + '%' : '-';
                const sWR = (s.win + s.loss) > 0 ? formatNumber(s.win / (s.win + s.loss) * 100) + '%' : '-';
                const bRR = b.rrCount ? formatNumber((b.rr / b.rrCount)) + 'R' : '-';
                const sRR = s.rrCount ? formatNumber((s.rr / s.rrCount)) + 'R' : '-';
                const total = b.pnl + s.pnl;

                return (
                  <tr key={tf} className="hover:bg-stone-50 transition duration-150">
                    <td className="py-3 px-4 font-extrabold text-stone-950 text-[11px] text-center">{tf}</td>
                    <td className="py-3 px-4 text-center font-semibold text-stone-950 border-l border-stone-200">{b.trades}</td>
                    <td className="py-3 px-4 text-center font-bold text-stone-950">{bWR}</td>
                    <td className={`py-3 px-4 text-center font-bold ${b.rr >= 0 ? 'text-orange-400' : 'text-red-900'}`}>{bRR}</td>
                    <td className={`py-3 px-4 text-center font-black ${b.pnl >= 0 ? 'text-orange-400' : 'text-red-900'}`}>{formatCurrency(b.pnl)}</td>
                    <td className="py-3 px-4 text-center font-semibold text-stone-950 border-l border-stone-200">{s.trades}</td>
                    <td className="py-3 px-4 text-center font-bold text-stone-950">{sWR}</td>
                    <td className={`py-3 px-4 text-center font-bold ${s.rr >= 0 ? 'text-orange-400' : 'text-red-900'}`}>{sRR}</td>
                    <td className={`py-3 px-4 text-center font-black ${s.pnl >= 0 ? 'text-orange-400' : 'text-red-900'}`}>{formatCurrency(s.pnl)}</td>
                    <td className={`py-3 px-4 text-center font-black border-l border-stone-200 ${total >= 0 ? 'text-orange-400' : 'text-red-900'}`}>{formatCurrency(total)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
