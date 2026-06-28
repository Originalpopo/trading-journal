"use client";

import { useJournalStore } from "@/store/useJournalStore";
import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { RotateCcw } from "lucide-react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { formatNumber } from "@/lib/utils";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

export default function SimulationPage() {
  const { trades, funding, isLoading } = useJournalStore();
  
  const defaultStats = useMemo(() => {
    let mWins = 0, mLosses = 0;
    let totalRisk = 0;
    let totalRR = 0;
    let riskCount = 0;
    let rrCount = 0;
    let runningBalance = 0;
    let gProfit = 0;
    let gLoss = 0;

    funding.forEach(f => {
      runningBalance += f.deposit - (f.withdraw || 0);
    });

    trades.forEach(t => {
      const pnl = t.profit || 0;
      runningBalance += pnl;

      let isBE = false;
      const rawRisk = parseFloat(t.risk as any || 0);
      if (rawRisk > 0) {
        totalRisk += rawRisk;
        riskCount++;
        const calculatedRR = pnl / rawRisk;
        isBE = (calculatedRR >= -0.4 && calculatedRR <= 0.4);
      } else {
        isBE = (t.resultType === 'BE' || pnl === 0);
      }

      if (!isBE) {
        if (pnl > 0 || t.resultType === 'TP') {
          mWins++;
          gProfit += pnl;
          if (t.rr) {
            totalRR += parseFloat(t.rr as any);
            rrCount++;
          }
        }
        else if (pnl < 0 || t.resultType === 'SL') {
          mLosses++;
          gLoss += pnl;
        }
      }
    });

    const avgW = mWins ? gProfit / mWins : 0;
    const avgL = mLosses ? gLoss / mLosses : 0;

    return {
      balance: runningBalance,
      winRate: (mWins + mLosses) > 0 ? (mWins / (mWins + mLosses)) * 100 : 50,
      avgRR: rrCount > 0 ? totalRR / rrCount : (avgW / (avgL === 0 ? 1 : Math.abs(avgL))),
      avgRisk: riskCount > 0 ? totalRisk / riskCount : (runningBalance * 0.01)
    };
  }, [trades, funding]);

  const [simBalance, setSimBalance] = useState("");
  const [simRisk, setSimRisk] = useState("");
  const [simWR, setSimWR] = useState("");
  const [simRR, setSimRR] = useState("");
  const [simTrades, setSimTrades] = useState("");

  const [simulationResults, setSimulationResults] = useState<any>(null);
  const isInitialized = useRef(false);

  const resetDefaults = useCallback(() => {
    setSimBalance(defaultStats.balance.toFixed(2));
    setSimRisk(defaultStats.avgRisk > 0 ? defaultStats.avgRisk.toFixed(2) : "10.00");
    setSimWR(defaultStats.winRate > 0 ? defaultStats.winRate.toFixed(2) : "50.00");
    setSimRR(defaultStats.avgRR > 0 ? defaultStats.avgRR.toFixed(2) : "1.00");
    setSimTrades("1000");
  }, [defaultStats]);

  const runSimulation = useCallback(() => {
    const tradesCount = parseInt(simTrades) || 1000;
    const bal = parseFloat(simBalance) || 0;
    const risk = parseFloat(simRisk) || 0;
    const wr = (parseFloat(simWR) / 100) || 0;
    const rr = parseFloat(simRR) || 0;

    const shades = ['#fb923c', '#1c1917', '#78716c'];
    const datasets = [];
    const labels = ['Start'];
    for (let i = 1; i <= tradesCount; i++) labels.push('T' + i);

    const reports = [];

    for (let i = 0; i < 3; i++) {
      let currentBal = bal;
      let peakBal = bal;
      let lowestBal = bal;
      let maxDD = 0;
      let maxDDPct = 0;
      let data = [currentBal];
      let simWins = 0;
      let currentConsWins = 0;
      let currentConsLosses = 0;
      let maxConsWins = 0;
      let maxConsLosses = 0;

      for (let t = 0; t < tradesCount; t++) {
        if (Math.random() <= wr) {
          currentBal += (risk * rr);
          simWins++;
          currentConsWins++;
          currentConsLosses = 0;
          if (currentConsWins > maxConsWins) maxConsWins = currentConsWins;
        } else {
          currentBal -= risk;
          currentConsLosses++;
          currentConsWins = 0;
          if (currentConsLosses > maxConsLosses) maxConsLosses = currentConsLosses;
        }
        if (currentBal > peakBal) peakBal = currentBal;
        if (currentBal < lowestBal) lowestBal = currentBal;

        const dd = peakBal - currentBal;
        if (dd > maxDD) maxDD = dd;
        
        const ddPct = peakBal > 0 ? (dd / peakBal) * 100 : 0;
        if (ddPct > maxDDPct) maxDDPct = ddPct;

        data.push(currentBal);
      }

      const simWinRate = (simWins / tradesCount) * 100;
      const netProfit = currentBal - bal;
      const growth = bal > 0 ? ((netProfit / bal) * 100) : 0;
      const recoveryFactor = maxDD > 0 ? (netProfit / maxDD) : 0;

      reports.push({
        id: `sim-${i}`,
        index: i,
        color: shades[i],
        currentBal,
        netProfit,
        growth,
        simWinRate,
        maxDD,
        maxDDPct,
        lowestBal,
        recoveryFactor,
        maxConsWins,
        maxConsLosses
      });

      datasets.push({
        label: `Sim ${i + 1}`,
        data: data,
        borderColor: shades[i],
        backgroundColor: shades[i],
        pointBorderColor: 'transparent',
        borderWidth: 2,
        tension: 0.3,
        pointRadius: 0,
        fill: false
      });
    }

    setSimulationResults({ labels, datasets, reports });
  }, [simBalance, simRisk, simRR, simTrades, simWR]);

  useEffect(() => {
    if (!isLoading && !isInitialized.current) {
      isInitialized.current = true;
      resetDefaults();
      // We use a small timeout to let the state update before running the simulation
      setTimeout(() => {
        // Run with the direct default values to avoid race conditions with state
        const tradesCount = 1000;
        const bal = defaultStats.balance;
        const risk = defaultStats.avgRisk || 10;
        const wr = (defaultStats.winRate || 50) / 100;
        const rr = defaultStats.avgRR || 1;

        const shades = ['#fb923c', '#1c1917', '#78716c'];
        const datasets = [];
        const labels = ['Start'];
        for (let i = 1; i <= tradesCount; i++) labels.push('T' + i);

        const reports = [];

        for (let i = 0; i < 3; i++) {
          let currentBal = bal;
          let peakBal = bal;
          let lowestBal = bal;
          let maxDD = 0;
          let maxDDPct = 0;
          let data = [currentBal];
          let simWins = 0;
          let currentConsWins = 0;
          let currentConsLosses = 0;
          let maxConsWins = 0;
          let maxConsLosses = 0;

          for (let t = 0; t < tradesCount; t++) {
            if (Math.random() <= wr) {
              currentBal += (risk * rr);
              simWins++;
              currentConsWins++;
              currentConsLosses = 0;
              if (currentConsWins > maxConsWins) maxConsWins = currentConsWins;
            } else {
              currentBal -= risk;
              currentConsLosses++;
              currentConsWins = 0;
              if (currentConsLosses > maxConsLosses) maxConsLosses = currentConsLosses;
            }
            if (currentBal > peakBal) peakBal = currentBal;
            if (currentBal < lowestBal) lowestBal = currentBal;

            const dd = peakBal - currentBal;
            if (dd > maxDD) maxDD = dd;
            
            const ddPct = peakBal > 0 ? (dd / peakBal) * 100 : 0;
            if (ddPct > maxDDPct) maxDDPct = ddPct;

            data.push(currentBal);
          }

          const simWinRate = (simWins / tradesCount) * 100;
          const netProfit = currentBal - bal;
          const growth = bal > 0 ? ((netProfit / bal) * 100) : 0;
          const recoveryFactor = maxDD > 0 ? (netProfit / maxDD) : 0;

          reports.push({
            id: `sim-${i}`,
            index: i,
            color: shades[i],
            currentBal,
            netProfit,
            growth,
            simWinRate,
            maxDD,
            maxDDPct,
            lowestBal,
            recoveryFactor,
            maxConsWins,
            maxConsLosses
          });

          datasets.push({
            label: `Sim ${i + 1}`,
            data: data,
            borderColor: shades[i],
            backgroundColor: shades[i],
            pointBorderColor: 'transparent',
            borderWidth: 2,
            tension: 0.3,
            pointRadius: 0,
            fill: false
          });
        }

        setSimulationResults({ labels, datasets, reports });
      }, 0);
    }
  }, [isLoading, resetDefaults, defaultStats]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-stone-500 font-semibold animate-pulse">Loading simulation...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shrink-0">
        <div>
          <h2 className="text-3xl font-extrabold text-stone-950 tracking-tight">Simulation</h2>
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="glass-card p-6 flex flex-col space-y-4 lg:col-span-1">
          <h3 className="text-xs font-black text-stone-950 uppercase tracking-[0.2em] mb-2 flex items-center gap-2">
            <span className="w-2 h-2 bg-orange-400 rounded-full"></span> Setup
          </h3>

          <div>
            <label className="block text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1">Starting Balance ($)</label>
            <input type="number" value={simBalance} onChange={(e) => setSimBalance(e.target.value)}
              className="w-full bg-stone-50 border border-stone-200 text-stone-950 text-sm font-bold rounded-lg px-3 py-2 focus:outline-none focus:border-stone-500 transition" />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1">Risk per Trade ($)</label>
            <input type="number" value={simRisk} onChange={(e) => setSimRisk(e.target.value)}
              className="w-full bg-stone-50 border border-stone-200 text-stone-950 text-sm font-bold rounded-lg px-3 py-2 focus:outline-none focus:border-stone-500 transition" />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1">Win Rate (%)</label>
            <input type="number" step="0.1" max="100" value={simWR} onChange={(e) => setSimWR(e.target.value)}
              className="w-full bg-stone-50 border border-stone-200 text-stone-950 text-sm font-bold rounded-lg px-3 py-2 focus:outline-none focus:border-stone-500 transition" />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1">Average RR</label>
            <input type="number" step="0.1" value={simRR} onChange={(e) => setSimRR(e.target.value)}
              className="w-full bg-stone-50 border border-stone-200 text-stone-950 text-sm font-bold rounded-lg px-3 py-2 focus:outline-none focus:border-stone-500 transition" />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1">Number of Trades</label>
            <input type="number" value={simTrades} onChange={(e) => setSimTrades(e.target.value)}
              className="w-full bg-stone-50 border border-stone-200 text-stone-950 text-sm font-bold rounded-lg px-3 py-2 focus:outline-none focus:border-stone-500 transition" />
          </div>

          <div className="pt-4 mt-auto flex gap-3">
            <button onClick={() => { resetDefaults(); setTimeout(runSimulation, 50); }} className="bg-stone-100 hover:bg-stone-200 text-stone-500 font-bold py-3 px-4 rounded-xl transition shadow-sm flex items-center justify-center shrink-0">
              <RotateCcw className="w-4 h-4" strokeWidth={2.5} />
            </button>
            <button onClick={runSimulation} className="flex-1 bg-orange-400 hover:bg-orange-500 text-white font-bold py-3 px-4 rounded-xl transition shadow-lg shadow-stone-200">
              Start
            </button>
          </div>
        </div>

        <div className="glass-card p-6 flex flex-col lg:col-span-3 min-h-[400px]">
          <h3 className="text-xs font-black text-stone-950 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
            <span className="w-2 h-2 bg-orange-400 rounded-full"></span> Simulation
          </h3>
          <div className="flex-1 relative w-full h-full min-h-[300px]">
            {simulationResults && (
              <Line
                key={Date.now()}
                data={{
                  labels: simulationResults.labels,
                  datasets: simulationResults.datasets
                }}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  interaction: { mode: 'index', intersect: false },
                  plugins: {
                    legend: {
                      display: true,
                      position: 'top',
                      labels: { usePointStyle: true, boxWidth: 8 }
                    }
                  },
                  scales: {
                    x: { display: false },
                    y: {
                      position: 'right',
                      grid: { color: '#fafaf9' }
                    }
                  }
                }}
              />
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {simulationResults?.reports.map((report: any) => {
          const netClass = report.netProfit >= 0 ? 'text-stone-950' : 'text-red-900';
          const growthClass = report.netProfit >= 0 ? 'text-orange-400' : 'text-red-900';

          return (
            <div key={report.id} className="bg-white p-5 rounded-xl shadow-sm flex flex-col justify-center items-center text-center">
              <div className="flex items-center gap-2 mb-3">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: report.color }}></span>
                <span className="text-xs font-bold text-stone-500 uppercase tracking-widest">Sim {report.index + 1}</span>
              </div>
              <div className={`text-2xl font-black ${netClass} mb-1`}>
                ${formatNumber(report.currentBal)}
              </div>
              <div className="text-[10px] text-stone-400 font-bold uppercase tracking-wider mb-4">
                Net: ${formatNumber(report.netProfit)}
              </div>
              <div className="w-full mt-auto flex flex-col">
                <div className="grid grid-cols-3 gap-y-3 gap-x-2 w-full border-t border-stone-100 pt-4 text-center pb-4">
                  <div>
                    <div className="text-[9px] text-stone-400 uppercase tracking-widest mb-0.5">Growth</div>
                    <div className={`text-sm font-bold ${growthClass}`}>{formatNumber(report.growth)}%</div>
                  </div>
                  <div>
                    <div className="text-[9px] text-stone-400 uppercase tracking-widest mb-0.5">Win Rate</div>
                    <div className="text-sm font-bold text-stone-950">{formatNumber(report.simWinRate)}%</div>
                  </div>
                  <div>
                    <div className="text-[9px] text-stone-400 uppercase tracking-widest mb-0.5">Max DD (%)</div>
                    <div className="text-sm font-bold text-red-900">{formatNumber(report.maxDDPct)}%</div>
                  </div>
                  <div>
                    <div className="text-[9px] text-stone-400 uppercase tracking-widest mb-0.5">Recovery</div>
                    <div className="text-sm font-bold text-stone-950">{formatNumber(report.recoveryFactor)}</div>
                  </div>
                  <div>
                    <div className="text-[9px] text-stone-400 uppercase tracking-widest mb-0.5">Lowest Bal</div>
                    <div className="text-sm font-bold text-stone-950">${formatNumber(report.lowestBal)}</div>
                  </div>
                  <div>
                    <div className="text-[9px] text-stone-400 uppercase tracking-widest mb-0.5">Max DD</div>
                    <div className="text-sm font-bold text-red-900">${formatNumber(report.maxDD)}</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 w-full border-t border-stone-100 pt-4 text-center">
                  <div>
                    <div className="text-[9px] text-stone-400 uppercase tracking-widest mb-0.5">Max Cons Win</div>
                    <div className="text-sm font-bold text-orange-400">{report.maxConsWins}</div>
                  </div>
                  <div>
                    <div className="text-[9px] text-stone-400 uppercase tracking-widest mb-0.5">Max Cons Loss</div>
                    <div className="text-sm font-bold text-red-900">{report.maxConsLosses}</div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
