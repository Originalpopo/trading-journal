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
    setSimBalance(defaultStats.balance.toString());
    setSimRisk(defaultStats.avgRisk > 0 ? defaultStats.avgRisk.toFixed(2) : "10");
    setSimWR(defaultStats.winRate > 0 ? defaultStats.winRate.toFixed(2) : "50");
    setSimRR(defaultStats.avgRR > 0 ? defaultStats.avgRR.toFixed(2) : "1");
    setSimTrades("1000");
  }, [defaultStats]);

  const runSimulation = useCallback(() => {
    const tradesCount = parseInt(simTrades) || 1000;
    const bal = parseFloat(simBalance) || 0;
    const risk = parseFloat(simRisk) || 0;
    const wr = (parseFloat(simWR) / 100) || 0;
    const rr = parseFloat(simRR) || 0;

    const shades = ['#f97316', '#0f172a', '#94a3b8'];
    const datasets = [];
    const labels = ['Start'];
    for (let i = 1; i <= tradesCount; i++) labels.push('T' + i);

    const reports = [];

    for (let i = 0; i < 3; i++) {
      let currentBal = bal;
      let peakBal = bal;
      let maxDD = 0;
      let data = [currentBal];
      let simWins = 0;
      for (let t = 0; t < tradesCount; t++) {
        if (Math.random() <= wr) {
          currentBal += (risk * rr);
          simWins++;
        } else {
          currentBal -= risk;
        }
        if (currentBal > peakBal) peakBal = currentBal;
        const dd = peakBal - currentBal;
        if (dd > maxDD) maxDD = dd;
        data.push(currentBal);
      }

      const simWinRate = (simWins / tradesCount) * 100;
      const netProfit = currentBal - bal;
      const growth = bal > 0 ? ((netProfit / bal) * 100) : 0;

      reports.push({
        id: `sim-${i}`,
        index: i,
        color: shades[i],
        currentBal,
        netProfit,
        growth,
        simWinRate,
        maxDD
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

        const shades = ['#f97316', '#0f172a', '#94a3b8'];
        const datasets = [];
        const labels = ['Start'];
        for (let i = 1; i <= tradesCount; i++) labels.push('T' + i);

        const reports = [];

        for (let i = 0; i < 3; i++) {
          let currentBal = bal;
          let peakBal = bal;
          let maxDD = 0;
          let data = [currentBal];
          let simWins = 0;
          for (let t = 0; t < tradesCount; t++) {
            if (Math.random() <= wr) {
              currentBal += (risk * rr);
              simWins++;
            } else {
              currentBal -= risk;
            }
            if (currentBal > peakBal) peakBal = currentBal;
            const dd = peakBal - currentBal;
            if (dd > maxDD) maxDD = dd;
            data.push(currentBal);
          }

          const simWinRate = (simWins / tradesCount) * 100;
          const netProfit = currentBal - bal;
          const growth = bal > 0 ? ((netProfit / bal) * 100) : 0;

          reports.push({
            id: `sim-${i}`,
            index: i,
            color: shades[i],
            currentBal,
            netProfit,
            growth,
            simWinRate,
            maxDD
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
        <p className="text-slate-500 font-semibold animate-pulse">Loading simulation...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="glass-card p-6 flex flex-col space-y-4 lg:col-span-1">
          <h3 className="text-xs font-black text-slate-800 uppercase tracking-[0.2em] mb-2 flex items-center gap-2">
            <span className="w-2 h-2 bg-orange-500 rounded-full"></span> Setup
          </h3>

          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Starting Balance ($)</label>
            <input type="number" value={simBalance} onChange={(e) => setSimBalance(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-sm font-bold rounded-lg px-3 py-2 focus:outline-none focus:border-slate-500 transition" />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Risk per Trade ($)</label>
            <input type="number" value={simRisk} onChange={(e) => setSimRisk(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-sm font-bold rounded-lg px-3 py-2 focus:outline-none focus:border-slate-500 transition" />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Win Rate (%)</label>
            <input type="number" step="0.1" max="100" value={simWR} onChange={(e) => setSimWR(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-sm font-bold rounded-lg px-3 py-2 focus:outline-none focus:border-slate-500 transition" />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Average RR</label>
            <input type="number" step="0.1" value={simRR} onChange={(e) => setSimRR(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-sm font-bold rounded-lg px-3 py-2 focus:outline-none focus:border-slate-500 transition" />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Number of Trades</label>
            <input type="number" value={simTrades} onChange={(e) => setSimTrades(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-sm font-bold rounded-lg px-3 py-2 focus:outline-none focus:border-slate-500 transition" />
          </div>

          <div className="pt-4 mt-auto flex gap-3">
            <button onClick={() => { resetDefaults(); setTimeout(runSimulation, 50); }} className="bg-slate-100 hover:bg-slate-200 text-slate-500 font-bold py-3 px-4 rounded-xl transition shadow-sm flex items-center justify-center shrink-0">
              <RotateCcw className="w-4 h-4" strokeWidth={2.5} />
            </button>
            <button onClick={runSimulation} className="flex-1 bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 px-4 rounded-xl transition shadow-lg shadow-slate-200">
              Start
            </button>
          </div>
        </div>

        <div className="glass-card p-6 flex flex-col lg:col-span-3 min-h-[400px]">
          <h3 className="text-xs font-black text-slate-800 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
            <span className="w-2 h-2 bg-orange-500 rounded-full"></span> Simulation
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
                      grid: { color: '#f1f5f9' }
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
          const netClass = report.netProfit >= 0 ? 'text-slate-800' : 'text-red-500';
          const growthClass = report.netProfit >= 0 ? 'text-orange-500' : 'text-red-500';

          return (
            <div key={report.id} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-center items-center text-center">
              <div className="flex items-center gap-2 mb-3">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: report.color }}></span>
                <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Sim {report.index + 1}</span>
              </div>
              <div className={`text-2xl font-black ${netClass} mb-1`}>
                ${report.currentBal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-4">
                Net: ${report.netProfit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className="grid grid-cols-3 gap-2 w-full mt-auto border-t border-slate-100 pt-4">
                <div>
                  <div className="text-[9px] text-slate-400 uppercase tracking-widest mb-1">Growth</div>
                  <div className={`text-sm font-bold ${growthClass}`}>{report.growth.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%</div>
                </div>
                <div>
                  <div className="text-[9px] text-slate-400 uppercase tracking-widest mb-1">Win Rate</div>
                  <div className="text-sm font-bold text-slate-700">{report.simWinRate.toFixed(1)}%</div>
                </div>
                <div>
                  <div className="text-[9px] text-slate-400 uppercase tracking-widest mb-1">Max DD</div>
                  <div className="text-sm font-bold text-red-500">${report.maxDD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
