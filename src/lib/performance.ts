// Everything the Performance page shows, computed from the trades and funding of the chosen
// filters. Kept free of app imports so it can be unit-tested with `node --test`.
import { classifyTrade, summarizeTrades, isOnPlan, type StatTrade } from './stats.ts';
import { addMoney, subMoney } from './money.ts';
import { formatDurationDetailed, calculateDurationInSeconds } from './utils.ts';

export interface PerfTrade extends StatTrade {
  time: string;
  symbol?: string;
  side?: string;
  tf?: string;
  checklists?: string[];
  isOnPlan?: boolean;
  entryTime?: string;
  exitTime?: string;
  duration?: number;
}

export interface PerfFunding {
  time: string;
  deposit: number;
  withdraw: number;
}

export interface PerformanceFilters {
  selectedYear: string; // a year, or 'ALL'
  selectedTfs: string[]; // empty = every timeframe
  selectedPlan: string; // 'ALL' | 'On Plan' | 'Off Plan'
  selectedMetric: string; // 'COUNT' | 'RR' | 'PNL' | 'GAIN'
}

export interface SideStats { trades: number; win: number; loss: number; pnl: number; rr: number; rrCount: number }
export type SideMatrix = Record<'BUY' | 'SELL', SideStats>;

type PerfEvent =
  | { type: 'trade'; timeObj: Date; data: PerfTrade }
  | { type: 'funding'; timeObj: Date; data: PerfFunding };

const emptySideMatrix = (): SideMatrix => ({
  BUY: { trades: 0, win: 0, loss: 0, pnl: 0, rr: 0, rrCount: 0 },
  SELL: { trades: 0, win: 0, loss: 0, pnl: 0, rr: 0, rrCount: 0 },
});

const byTotalPnl = (a: [string, SideMatrix], b: [string, SideMatrix]) => (b[1].BUY.pnl + b[1].SELL.pnl) - (a[1].BUY.pnl + a[1].SELL.pnl);

export function computePerformance(trades: PerfTrade[], funding: PerfFunding[], filters: PerformanceFilters) {
  const { selectedYear, selectedTfs, selectedPlan, selectedMetric } = filters;
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const hourStats: Record<number, number> = {}; const hourStatsPnL: Record<number, number> = {};
  const hourWins: Record<number, number> = {}; const hourLosses: Record<number, number> = {}; const hourBEs: Record<number, number> = {};
  hours.forEach(h => { hourStats[h] = 0; hourStatsPnL[h] = 0; hourWins[h] = 0; hourLosses[h] = 0; hourBEs[h] = 0; });

  const dowNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dowStats: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
  const dowStatsPnL: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
  const dowWins: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
  const dowLosses: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
  const dowBEs: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const moyStats: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 0, 11: 0 };
  const moyStatsPnL: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 0, 11: 0 };
  const moyWins: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 0, 11: 0 };
  const moyLosses: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 0, 11: 0 };
  const moyBEs: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 0, 11: 0 };
  const moyStartBalance: Record<number, number | null> = {};
  const moyPnL: Record<number, number> = {};
  for (let i = 0; i < 12; i++) { moyStartBalance[i] = null; moyPnL[i] = 0; }

  const matrix: Record<string, SideMatrix> = {};
  const tfMatrix: Record<string, SideMatrix> = {};

  const allTimelineEvents: PerfEvent[] = [];
  trades.forEach(t => allTimelineEvents.push({ type: 'trade', timeObj: new Date(t.time.replace(' ', 'T')), data: t }));
  funding.forEach(f => allTimelineEvents.push({ type: 'funding', timeObj: new Date(f.time.replace(' ', 'T')), data: f }));
  allTimelineEvents.sort((a, b) => a.timeObj.getTime() - b.timeObj.getTime());

  const pastEvents: PerfEvent[] = [];
  const currentEvents: PerfEvent[] = [];

  allTimelineEvents.forEach(evt => {
    if (!isNaN(evt.timeObj.getTime()) && evt.timeObj.getTime() > 0) {
      if (evt.type === 'trade') {
        if (selectedTfs.length > 0) {
          const tfVal = evt.data.tf || 'none';
          const tradeTfs = tfVal.split(',').map((s: string) => s.trim());
          const matched = tradeTfs.some((tf: string) => selectedTfs.includes(tf));
          if (!matched) return;
        }
        if (selectedPlan !== 'ALL' && isOnPlan(evt.data) !== (selectedPlan === 'On Plan')) return;
      }

      const y = evt.timeObj.getFullYear();
      if (selectedYear !== 'ALL' && y < parseInt(selectedYear)) {
        pastEvents.push(evt);
      } else if (selectedYear === 'ALL' || y === parseInt(selectedYear)) {
        currentEvents.push(evt);
      }
    }
  });

  let carriedOverBalance = 0;
  pastEvents.forEach(evt => {
    if (evt.type === 'funding') {
      carriedOverBalance = subMoney(addMoney(carriedOverBalance, evt.data.deposit), evt.data.withdraw);
    } else if (evt.type === 'trade') {
      carriedOverBalance = addMoney(carriedOverBalance, evt.data.profit);
    }
  });

  let runningBalance = carriedOverBalance;
  let initialDeposit = runningBalance;
  let minBalance = runningBalance;
  let peakBalance = runningBalance;
  let maxDrawdownAmt = 0;
  let maxDrawdownPct = 0;

  const shouldAggregate = currentEvents.length > 500;
  const dailyPerfPoints = new Map<string, { balance: number, pnl: number, timestamp: number, isFundingOnly: boolean }>();

  const perfBalanceData = [runningBalance];
  const perfBalanceLabels = ["Start"];
  const perfPnlData = [0];
  const perfPnlColors = ['transparent'];

  let tradeCount = 0;
  let longTrades = 0, longWon = 0;
  let shortTrades = 0, shortWon = 0;

  let onPlanTrades = 0, onPlanPnL = 0;
  let offPlanTrades = 0, offPlanPnL = 0;
  let sumDurationWins = 0, countDurationWins = 0;
  let sumDurationLosses = 0, countDurationLosses = 0;

  const tfStats: Record<string, { trades: number; win: number; loss: number; be: number; pnl: number; rr: number }> = {
    '1h': { trades: 0, win: 0, loss: 0, be: 0, pnl: 0, rr: 0 },
    '15m': { trades: 0, win: 0, loss: 0, be: 0, pnl: 0, rr: 0 },
    '5m': { trades: 0, win: 0, loss: 0, be: 0, pnl: 0, rr: 0 },
    '1m': { trades: 0, win: 0, loss: 0, be: 0, pnl: 0, rr: 0 },
    '15s': { trades: 0, win: 0, loss: 0, be: 0, pnl: 0, rr: 0 },
    '5s': { trades: 0, win: 0, loss: 0, be: 0, pnl: 0, rr: 0 },
    'none': { trades: 0, win: 0, loss: 0, be: 0, pnl: 0, rr: 0 },
  };

  currentEvents.forEach((evt) => {
    if (evt.type === 'funding') {
      if (initialDeposit === 0 && evt.data.deposit > 0) {
        initialDeposit = evt.data.deposit;
      }
      runningBalance = subMoney(addMoney(runningBalance, evt.data.deposit), evt.data.withdraw);

      if (runningBalance > peakBalance) peakBalance = runningBalance;
      if (runningBalance < minBalance) minBalance = runningBalance;

      if (shouldAggregate) {
        const d = evt.timeObj;
        const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const existing = dailyPerfPoints.get(dateKey);
        if (existing) {
          existing.balance = runningBalance;
          existing.timestamp = evt.timeObj.getTime();
        } else {
          dailyPerfPoints.set(dateKey, { balance: runningBalance, pnl: 0, timestamp: evt.timeObj.getTime(), isFundingOnly: true });
        }
      } else {
        perfBalanceData.push(runningBalance);
        perfPnlData.push(0);
        perfPnlColors.push('transparent');

        let dateStr = "Funding";
        if (evt.data.time) {
          try { dateStr = evt.data.time.split(' ')[0]; } catch { }
        }
        perfBalanceLabels.push(dateStr);
      }
    } else if (evt.type === 'trade') {
      const t = evt.data;
      const entryTimeObj = new Date((t.entryTime || t.time).replace(' ', 'T'));
      const hr = entryTimeObj.getHours();
      const rrVal = t.rr || 0;
      const pnl = t.profit || 0;

      const outcome = classifyTrade(t);
      const isBE = outcome === 'be';
      const isWin = outcome === 'win';
      const isLoss = outcome === 'loss';

      if (isOnPlan(t)) {
        onPlanTrades++;
        onPlanPnL = addMoney(onPlanPnL, pnl);
      } else {
        offPlanTrades++;
        offPlanPnL = addMoney(offPlanPnL, pnl);
      }

      if (isWin) {
        sumDurationWins += calculateDurationInSeconds(t);
        countDurationWins++;
      } else if (isLoss) {
        sumDurationLosses += calculateDurationInSeconds(t);
        countDurationLosses++;
      }

      if (t.side === 'BUY') {
        longTrades++;
        if (isWin) longWon++;
      } else if (t.side === 'SELL') {
        shortTrades++;
        if (isWin) shortWon++;
      }

      const tfVals = t.tf ? t.tf.split(',').map((s: string) => s.trim()).filter(Boolean) : ['none'];
      if (tfVals.length === 0) tfVals.push('none');

      tfVals.forEach((tfKey: string) => {
        const validKey = ['1h', '15m', '5m', '1m', '15s', '5s'].includes(tfKey) ? tfKey : 'none';
        tfStats[validKey].trades++;
        tfStats[validKey].pnl = addMoney(tfStats[validKey].pnl, pnl);
        tfStats[validKey].rr += rrVal;
        if (isBE) {
          tfStats[validKey].be++;
        } else if (isWin) {
          tfStats[validKey].win++;
        } else {
          tfStats[validKey].loss++;
        }
      });

      if (!isNaN(hr)) {
        hourStats[hr] += rrVal;
        hourStatsPnL[hr] = addMoney(hourStatsPnL[hr], pnl);
        if (isBE) {
          hourBEs[hr]++;
        } else {
          if (isWin) hourWins[hr]++;
          else hourLosses[hr]++;
        }
      }

      if (!isNaN(entryTimeObj.getTime())) {
        const mMonth = entryTimeObj.getMonth();
        const dDay = entryTimeObj.getDay();

        // The balance before the month's first trade; this trade's P&L is added further down.
        if (moyStartBalance[mMonth] === null) moyStartBalance[mMonth] = runningBalance;
        moyPnL[mMonth] = addMoney(moyPnL[mMonth], pnl);

        dowStats[dDay] += rrVal;
        dowStatsPnL[dDay] = addMoney(dowStatsPnL[dDay], pnl);
        moyStats[mMonth] += rrVal;
        moyStatsPnL[mMonth] = addMoney(moyStatsPnL[mMonth], pnl);

        if (isBE) {
          dowBEs[dDay]++;
          moyBEs[mMonth]++;
        } else {
          if (isWin) {
            dowWins[dDay]++;
            moyWins[mMonth]++;
          } else {
            dowLosses[dDay]++;
            moyLosses[mMonth]++;
          }
        }
      }

      const symbol = String(t.symbol);
      if (!matrix[symbol]) matrix[symbol] = emptySideMatrix();
      const tfValKeys = t.tf && t.tf !== 'none' ? t.tf.split(',').map((s: string) => s.trim()).filter(Boolean) : ['none'];
      if (tfValKeys.length === 0) tfValKeys.push('none');

      const side = t.side === 'BUY' || t.side === 'SELL' ? t.side : null;
      if (side) {
        const m = matrix[symbol][side];
        m.trades++;
        m.pnl = addMoney(m.pnl, pnl);
        if (!isBE) {
          if (isWin) m.win++;
          if (isLoss) m.loss++;
        }
        if (t.rr) { m.rr += t.rr; m.rrCount++; }

        tfValKeys.forEach((tfKey: string) => {
          if (!tfMatrix[tfKey]) tfMatrix[tfKey] = emptySideMatrix();
          const tm = tfMatrix[tfKey][side];
          tm.trades++;
          tm.pnl = addMoney(tm.pnl, pnl);
          if (!isBE) {
            if (isWin) tm.win++;
            if (isLoss) tm.loss++;
          }
          if (t.rr) { tm.rr += t.rr; tm.rrCount++; }
        });
      }

      runningBalance = addMoney(runningBalance, pnl);
      if (runningBalance < minBalance) minBalance = runningBalance;
      if (runningBalance > peakBalance) peakBalance = runningBalance;

      const currentDD = subMoney(peakBalance, runningBalance);
      const currentDDPct = peakBalance > 0 ? (currentDD / peakBalance) * 100 : 0;

      if (currentDD > maxDrawdownAmt) maxDrawdownAmt = currentDD;
      if (currentDDPct > maxDrawdownPct) maxDrawdownPct = currentDDPct;

      if (shouldAggregate) {
        const d = evt.timeObj;
        const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const existing = dailyPerfPoints.get(dateKey);
        if (existing) {
          existing.balance = runningBalance;
          existing.pnl = addMoney(existing.pnl, pnl);
          existing.timestamp = evt.timeObj.getTime();
          existing.isFundingOnly = false;
        } else {
          dailyPerfPoints.set(dateKey, { balance: runningBalance, pnl: pnl, timestamp: evt.timeObj.getTime(), isFundingOnly: false });
        }
      } else {
        perfBalanceData.push(runningBalance);
        perfPnlData.push(pnl);
        perfPnlColors.push(isBE ? '#d6d3d1' : (pnl >= 0 ? '#fb923c' : '#7f1d1d'));

        tradeCount++;
        let dateStr = "Trade " + tradeCount;
        if (t.time) {
          try { dateStr = t.time.split(' ')[0]; } catch { }
        }
        perfBalanceLabels.push(dateStr);
      }
    }
  });

  if (shouldAggregate) {
    const sortedDaily = Array.from(dailyPerfPoints.entries()).sort((a, b) => a[1].timestamp - b[1].timestamp);
    sortedDaily.forEach(([, day]) => {
      perfBalanceData.push(day.balance);
      perfPnlData.push(day.pnl);
      if (day.isFundingOnly && day.pnl === 0) {
        perfPnlColors.push('transparent');
      } else if (day.pnl === 0) {
        perfPnlColors.push('#d6d3d1');
      } else if (day.pnl > 0) {
        perfPnlColors.push('#fb923c');
      } else {
        perfPnlColors.push('#7f1d1d');
      }
      const d = new Date(day.timestamp);
      perfBalanceLabels.push(`${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear().toString().slice(-2)}`);
    });
  }

  if (initialDeposit === 0) initialDeposit = carriedOverBalance > 0 ? carriedOverBalance : 1;

  const summary = summarizeTrades(currentEvents.flatMap(evt => (evt.type === 'trade' ? [evt.data] : [])));
  const {
    netProfit, profitFactor, expectedPayoff, expectancyR, sharpeRatio, totalTrades,
    avgWin, avgLoss, avgBE, largestProfit, largestLoss, grossProfit, grossLoss,
    maxConsWinAmt, maxConsLossAmt, countAtMaxWinAmt, countAtMaxLossAmt, avgConsWin, avgConsLoss,
  } = summary;
  const profitTradesCount = summary.wins;
  const lossTradesCount = summary.losses;
  const beTradesCount = summary.bes;

  const absoluteDD = (initialDeposit - minBalance) > 0 ? (initialDeposit - minBalance) : 0;
  const recoveryFactor = maxDrawdownAmt > 0 ? (netProfit / maxDrawdownAmt) : 0;

  const winPct = totalTrades > 0 ? (profitTradesCount / totalTrades) * 100 : 0;
  const lossPct = totalTrades > 0 ? (lossTradesCount / totalTrades) * 100 : 0;
  const bePct = totalTrades > 0 ? (beTradesCount / totalTrades) * 100 : 0;

  const mainWinRate = summary.winRate * 100;
  
  const longWinPct = longTrades > 0 ? (longWon / longTrades) * 100 : 0;
  const shortWinPct = shortTrades > 0 ? (shortWon / shortTrades) * 100 : 0;
  
  const totalPlanTrades = onPlanTrades + offPlanTrades;
  const onPlanPct = totalPlanTrades > 0 ? (onPlanTrades / totalPlanTrades) * 100 : 0;
  const offPlanPct = totalPlanTrades > 0 ? (offPlanTrades / totalPlanTrades) * 100 : 0;

  const holdWin = countDurationWins > 0 ? formatDurationDetailed(sumDurationWins / countDurationWins) : '-';
  const holdLoss = countDurationLosses > 0 ? formatDurationDetailed(sumDurationLosses / countDurationLosses) : '-';

  // Chart Data Generation
  const hourlyDataArr = hours.map(h => selectedMetric === 'RR' ? hourStats[h] : selectedMetric === 'GAIN' ? (hourStatsPnL[h] / initialDeposit) * 100 : hourStatsPnL[h]);
  const hourlyColors = hourlyDataArr.map(v => v >= 0 ? '#fb923c' : '#7f1d1d');
  const hourlyWinsArr = hours.map(h => hourWins[h]);
  const hourlyLossesArr = hours.map(h => hourLosses[h]);
  const hourlyBEsArr = hours.map(h => hourBEs[h]);

  const activeDowKeys = Object.keys(dowStats).filter(k => (selectedMetric === 'RR' ? dowStats[Number(k)] : dowStatsPnL[Number(k)]) !== 0 || dowWins[Number(k)] > 0 || dowLosses[Number(k)] > 0 || dowBEs[Number(k)] > 0).map(Number);
  const activeDowNames = activeDowKeys.map(k => dowNames[k]);
  const activeDowData = activeDowKeys.map(k => selectedMetric === 'RR' ? dowStats[k] : selectedMetric === 'GAIN' ? (dowStatsPnL[k] / initialDeposit) * 100 : dowStatsPnL[k]);
  const dowColors = activeDowData.map(v => v >= 0 ? '#fb923c' : '#7f1d1d');
  const activeDowWins = activeDowKeys.map(k => dowWins[k]);
  const activeDowLosses = activeDowKeys.map(k => dowLosses[k]);
  const activeDowBEs = activeDowKeys.map(k => dowBEs[k]);

  const activeMoyKeys = Object.keys(moyStats).filter(k => (selectedMetric === 'RR' ? moyStats[Number(k)] : moyStatsPnL[Number(k)]) !== 0 || moyPnL[Number(k)] !== 0 || moyWins[Number(k)] > 0 || moyLosses[Number(k)] > 0 || moyBEs[Number(k)] > 0).map(Number);
  const activeMoyNames = activeMoyKeys.map(k => monthNames[k]);
  const moyRRData = activeMoyKeys.map(k => {
    if (selectedMetric === 'RR') return moyStats[k];
    if (selectedMetric === 'GAIN') {
      const sb = moyStartBalance[k] || initialDeposit;
      return (moyPnL[k] / sb) * 100;
    }
    return moyStatsPnL[k];
  });
  const moyRRColors = moyRRData.map(v => v >= 0 ? '#fb923c' : '#7f1d1d');
  const activeMoyWins = activeMoyKeys.map(k => moyWins[k]);
  const activeMoyLosses = activeMoyKeys.map(k => moyLosses[k]);
  const activeMoyBEs = activeMoyKeys.map(k => moyBEs[k]);

  const matrixSorted = Object.entries(matrix).sort(byTotalPnl);
  const tfMatrixSorted = Object.entries(tfMatrix).sort(byTotalPnl);

  return {
    tfStats, tfMatrixSorted,
    netProfit, profitFactor, expectedPayoff, expectancyR, mainWinRate,
    totalTrades, winPct, lossPct, bePct, profitTradesCount, lossTradesCount, beTradesCount,
    longWinPct, shortWinPct, longTrades, shortTrades,
    onPlanPct, offPlanPct, onPlanPnL, offPlanPnL,
    avgWin, avgLoss, avgBE, holdWin, holdLoss,
    largestProfit, largestLoss, grossProfit, grossLoss, sharpeRatio,
    maxDrawdownAmt, absoluteDD, maxDrawdownPct, recoveryFactor,
    maxConsWinAmt, maxConsLossAmt, countAtMaxWinAmt, countAtMaxLossAmt,
    avgConsWin, avgConsLoss,
    perfBalanceLabels, perfBalanceData, perfPnlData, perfPnlColors,
    hourlyDataArr, hourlyColors, hourlyWinsArr, hourlyLossesArr, hourlyBEsArr,
    activeDowNames, activeDowData, dowColors, activeDowWins, activeDowLosses, activeDowBEs,
    activeMoyNames, moyRRData, moyRRColors, activeMoyWins, activeMoyLosses, activeMoyBEs,
    matrixSorted,
    isAggregated: shouldAggregate
  };
}
