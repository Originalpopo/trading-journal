"use client";

import { useJournalStore } from "@/store/useJournalStore";
import { useState, useMemo, useEffect, useRef } from "react";
import { RotateCcw, AlertTriangle } from "lucide-react";
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
import { classifyTrade, parseRisk } from "@/lib/stats";
import { addMoney, subMoney } from "@/lib/money";
import {
  simulatePath, simulateOutlook, binaryOutcomes, cautiousWinRate,
  type SimParams, type SimPath, type SimOutlook,
} from "@/lib/simulation";

const PATH_COLORS = ['#fb923c', '#1c1917', '#78716c'];

// Below this many trades the measured win rate says little about the true one.
const SMALL_SAMPLE = 100;

type SimReport = Omit<SimPath, 'balances'> & { id: string; index: number; color: string };

interface SimulationResults {
  runId: number; // changes only when a new simulation is run, so the chart redraws only then
  labels: string[];
  datasets: { label: string; data: number[]; borderColor: string; backgroundColor: string; pointBorderColor: string; borderWidth: number; tension: number; pointRadius: number; fill: boolean }[];
  reports: SimReport[];
  winRate: number; // 0..1, as measured or as typed
  outlook: SimOutlook;
  sampleSize: number; // trades the win rate was measured on; 0 when unknown
  cautious: { winRate: number; outlook: SimOutlook } | null;
}

// 'journal' replays the R results of the real trades; 'averages' uses one win rate and one RR.
type OutcomeSource = 'journal' | 'averages';
type RiskMode = 'fixed' | 'percent';

interface SimForm {
  balance: string;
  riskMode: RiskMode;
  risk: string;
  riskPct: string;
  source: OutcomeSource;
  wr: string;
  rr: string;
  trades: string;
}

let runCounter = 0;

// Three drawn paths for the chart, plus what many runs of the same inputs say together: once with
// the win rate as measured, once with the lowest win rate the sample still supports.
function buildResults(params: SimParams, sampleSize: number): SimulationResults {
  const labels = ['Start'];
  for (let i = 1; i <= params.trades; i++) labels.push('T' + i);

  const paths = PATH_COLORS.map(() => simulatePath(params));
  const lowWinRate = sampleSize > 0 ? cautiousWinRate(params.winRate, sampleSize) : null;
  return {
    runId: ++runCounter,
    labels,
    datasets: paths.map((path, i) => ({
      label: `Sim ${i + 1}`,
      data: path.balances,
      borderColor: PATH_COLORS[i],
      backgroundColor: PATH_COLORS[i],
      pointBorderColor: 'transparent',
      borderWidth: 2,
      tension: 0.3,
      pointRadius: 0,
      fill: false,
    })),
    reports: paths.map((path, i) => {
      const stats: Omit<SimPath, 'balances'> & { balances?: number[] } = { ...path };
      delete stats.balances;
      return { ...stats, id: `sim-${i}`, index: i, color: PATH_COLORS[i] };
    }),
    winRate: params.winRate,
    outlook: simulateOutlook(params),
    sampleSize,
    cautious: lowWinRate === null ? null : { winRate: lowWinRate, outlook: simulateOutlook({ ...params, winRate: lowWinRate }) },
  };
}

const INPUT = "w-full bg-stone-50 border border-stone-200 text-stone-950 text-sm font-bold rounded-lg px-3 py-2 focus:outline-none focus:border-stone-500 transition";
const LABEL = "block text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1";

function Toggle<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string; title: string }[]; onChange: (value: T) => void }) {
  return (
    <div className="flex items-center bg-stone-100 p-0.5 rounded-md border border-stone-200">
      {options.map(option => (
        <button
          key={option.value}
          type="button"
          title={option.title}
          onClick={() => onChange(option.value)}
          className={`flex-1 text-[10px] font-bold px-2 py-1 rounded transition whitespace-nowrap ${
            value === option.value ? 'bg-white text-stone-950 shadow-md' : 'text-stone-400 hover:text-stone-600'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function OutlookRow({ title, note, outlook }: { title: string; note: string; outlook: SimOutlook }) {
  const stats: { label: string; tip: string; value: string; color: string }[] = [
    { label: 'Typical end', tip: 'ครึ่งหนึ่งของการจำลองจบสูงกว่านี้ อีกครึ่งจบต่ำกว่านี้', value: `$${formatNumber(outlook.medianEnd)}`, color: 'text-stone-950' },
    { label: 'Unlucky end', tip: '1 ใน 20 ครั้งจบต่ำกว่านี้ (กรณีโชคร้าย)', value: `$${formatNumber(outlook.lowEnd)}`, color: 'text-red-900' },
    { label: 'Lucky end', tip: '1 ใน 20 ครั้งจบสูงกว่านี้ (กรณีโชคดี)', value: `$${formatNumber(outlook.highEnd)}`, color: 'text-orange-400' },
    { label: 'Chance of loss', tip: 'สัดส่วนของการจำลองที่จบต่ำกว่ายอดเริ่มต้น', value: `${formatNumber(outlook.chanceOfLoss)}%`, color: 'text-stone-950' },
    { label: 'Chance of wipeout', tip: 'สัดส่วนของการจำลองที่ยอดเงินหมดพอร์ต (ถึงศูนย์แล้วหยุดเทรด)', value: `${formatNumber(outlook.chanceOfWipeout)}%`, color: 'text-red-900' },
    { label: 'Typical max DD', tip: 'Max drawdown ตรงกลาง: ครึ่งหนึ่งของการจำลองเจอลึกกว่านี้', value: `${formatNumber(outlook.medianMaxDDPct)}%`, color: 'text-stone-950' },
    { label: 'Bad max DD', tip: '1 ใน 20 ครั้งเจอ max drawdown ลึกกว่านี้', value: `${formatNumber(outlook.badMaxDDPct)}%`, color: 'text-red-900' },
  ];
  return (
    <div>
      <p className="text-[11px] font-bold text-stone-950">{title} <span className="font-medium text-stone-400">{note}</span></p>
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4 text-center mt-2">
        {stats.map(stat => (
          <div key={stat.label} title={stat.tip}>
            <div className="text-[9px] text-stone-400 uppercase tracking-widest mb-0.5">{stat.label}</div>
            <div className={`text-sm font-bold ${stat.color}`}>{stat.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

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
    // Every trade's result in R, split the way the journal classifies trades.
    const winOutcomes: number[] = [];
    const otherOutcomes: number[] = [];

    funding.forEach(f => {
      runningBalance = subMoney(addMoney(runningBalance, f.deposit), f.withdraw);
    });

    trades.forEach(t => {
      const pnl = t.profit || 0;
      runningBalance = addMoney(runningBalance, pnl);

      const rawRisk = parseRisk(t.risk);
      if (rawRisk > 0) {
        totalRisk += rawRisk;
        riskCount++;
      }

      const outcome = classifyTrade(t);
      if (rawRisk > 0) (outcome === 'win' ? winOutcomes : otherOutcomes).push(pnl / rawRisk);

      if (outcome === 'win') {
        mWins++;
        gProfit = addMoney(gProfit, pnl);
        if (t.rr) {
          totalRR += Number(t.rr);
          rrCount++;
        }
      } else if (outcome === 'loss') {
        mLosses++;
        gLoss = addMoney(gLoss, pnl);
      }
    });

    const avgW = mWins ? gProfit / mWins : 0;
    const avgL = mLosses ? gLoss / mLosses : 0;

    return {
      balance: runningBalance,
      winRate: (mWins + mLosses) > 0 ? (mWins / (mWins + mLosses)) * 100 : 50,
      avgRR: rrCount > 0 ? totalRR / rrCount : (avgW / (avgL === 0 ? 1 : Math.abs(avgL))),
      avgRisk: riskCount > 0 ? totalRisk / riskCount : (runningBalance * 0.01),
      decisiveTrades: mWins + mLosses,
      winOutcomes,
      otherOutcomes,
    };
  }, [trades, funding]);

  const journalTrades = defaultStats.winOutcomes.length + defaultStats.otherOutcomes.length;
  const canUseJournal = defaultStats.winOutcomes.length > 0 && defaultStats.otherOutcomes.length > 0;

  const defaultForm = useMemo((): SimForm => ({
    balance: defaultStats.balance.toFixed(2),
    riskMode: 'fixed',
    risk: defaultStats.avgRisk > 0 ? defaultStats.avgRisk.toFixed(2) : "10.00",
    riskPct: defaultStats.avgRisk > 0 && defaultStats.balance > 0 ? ((defaultStats.avgRisk / defaultStats.balance) * 100).toFixed(2) : "1.00",
    source: canUseJournal ? 'journal' : 'averages',
    wr: defaultStats.winRate > 0 ? defaultStats.winRate.toFixed(2) : "50.00",
    rr: defaultStats.avgRR > 0 ? defaultStats.avgRR.toFixed(2) : "1.00",
    trades: "1000",
  }), [defaultStats, canUseJournal]);

  const [form, setForm] = useState<SimForm>(defaultForm);
  const setField = <K extends keyof SimForm>(key: K, value: SimForm[K]) => setForm(prev => ({ ...prev, [key]: value }));

  const [simulationResults, setSimulationResults] = useState<SimulationResults | null>(null);
  const isInitialized = useRef(false);

  const run = (f: SimForm) => {
    const base = {
      balance: parseFloat(f.balance) || 0,
      risk: parseFloat(f.risk) || 0,
      riskPercent: f.riskMode === 'percent' ? (parseFloat(f.riskPct) || 0) : undefined,
      trades: Math.max(1, parseInt(f.trades) || 1000),
    };
    if (f.source === 'journal' && canUseJournal) {
      setSimulationResults(buildResults({
        ...base,
        winRate: defaultStats.winOutcomes.length / journalTrades,
        winOutcomes: defaultStats.winOutcomes,
        otherOutcomes: defaultStats.otherOutcomes,
      }, journalTrades));
    } else {
      setSimulationResults(buildResults({
        ...base,
        winRate: (parseFloat(f.wr) / 100) || 0,
        ...binaryOutcomes(parseFloat(f.rr) || 0),
      }, defaultStats.decisiveTrades));
    }
  };

  // Latest values for the one-off start below, read after the journal has loaded.
  const startRef = useRef({ defaultForm, run });
  useEffect(() => {
    startRef.current = { defaultForm, run };
  });

  useEffect(() => {
    if (isLoading || isInitialized.current) return;
    isInitialized.current = true;
    // Deferred so the journal-based defaults are in place before the first run.
    setTimeout(() => {
      setForm(startRef.current.defaultForm);
      startRef.current.run(startRef.current.defaultForm);
    }, 0);
  }, [isLoading]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-stone-500 font-semibold animate-pulse">Loading simulation...</p>
      </div>
    );
  }

  const results = simulationResults;

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
            <label className={LABEL}>Starting Balance ($)</label>
            <input type="number" value={form.balance} onChange={(e) => setField('balance', e.target.value)} className={INPUT} />
          </div>

          <div>
            <label className={LABEL}>Risk per Trade</label>
            <Toggle
              value={form.riskMode}
              onChange={(value) => setField('riskMode', value)}
              options={[
                { value: 'fixed', label: '$ fixed', title: 'เสี่ยงเป็นจำนวนเงินเท่าเดิมทุกเทรด ไม่ว่าพอร์ตจะโตหรือเล็กลง' },
                { value: 'percent', label: '% of balance', title: 'เสี่ยงเป็นเปอร์เซ็นต์ของยอดพอร์ต ณ ตอนนั้น พอร์ตโตก็เสี่ยงมากขึ้น พอร์ตเล็กลงก็เสี่ยงน้อยลง' },
              ]}
            />
            {form.riskMode === 'fixed' ? (
              <input type="number" step="0.01" value={form.risk} onChange={(e) => setField('risk', e.target.value)} className={`${INPUT} mt-2`} />
            ) : (
              <input type="number" step="0.1" value={form.riskPct} onChange={(e) => setField('riskPct', e.target.value)} className={`${INPUT} mt-2`} />
            )}
          </div>

          <div>
            <label className={LABEL}>Trade Results</label>
            <Toggle
              value={form.source}
              onChange={(value) => setField('source', value)}
              options={[
                { value: 'journal', label: 'My trades', title: 'สุ่มผลจากเทรดจริงของคุณ (เป็น R) รวมเทรดที่แพ้เกิน 1R และเทรด BE' },
                { value: 'averages', label: 'Averages', title: 'ใช้ win rate และ RR เฉลี่ยค่าเดียว ทุกเทรดที่ชนะได้เท่ากัน ทุกเทรดที่แพ้เสีย 1R' },
              ]}
            />
            {form.source === 'journal' ? (
              <p className="text-[10px] font-medium text-stone-400 mt-2">
                {canUseJournal
                  ? `Drawn from your ${journalTrades} trades: ${defaultStats.winOutcomes.length} wins, ${defaultStats.otherOutcomes.length} losses and break-evens.`
                  : 'Needs at least one winning and one losing trade with a risk amount. Using averages instead.'}
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2 mt-2">
                <div>
                  <label className={LABEL}>Win Rate (%)</label>
                  <input type="number" step="0.1" max="100" value={form.wr} onChange={(e) => setField('wr', e.target.value)} className={INPUT} />
                </div>
                <div>
                  <label className={LABEL}>Average RR</label>
                  <input type="number" step="0.1" value={form.rr} onChange={(e) => setField('rr', e.target.value)} className={INPUT} />
                </div>
              </div>
            )}
          </div>

          <div>
            <label className={LABEL}>Number of Trades</label>
            <input type="number" value={form.trades} onChange={(e) => setField('trades', e.target.value)} className={INPUT} />
          </div>

          <div className="pt-4 mt-auto flex gap-3">
            <button onClick={() => { setForm(defaultForm); run(defaultForm); }} title="Back to the values from your journal" className="bg-stone-100 hover:bg-stone-200 text-stone-500 font-bold py-3 px-4 rounded-xl transition shadow-sm flex items-center justify-center shrink-0">
              <RotateCcw className="w-4 h-4" strokeWidth={2.5} />
            </button>
            <button onClick={() => run(form)} className="flex-1 bg-orange-400 hover:bg-orange-500 text-white font-bold py-3 px-4 rounded-xl transition shadow-lg shadow-stone-200">
              Start
            </button>
          </div>
        </div>

        <div className="glass-card p-6 flex flex-col lg:col-span-3 min-h-[400px]">
          <h3 className="text-xs font-black text-stone-950 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
            <span className="w-2 h-2 bg-orange-400 rounded-full"></span> Simulation
          </h3>
          <div className="flex-1 relative w-full h-full min-h-[300px]">
            {results && (
              <Line
                key={results.runId}
                data={{
                  labels: results.labels,
                  datasets: results.datasets
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

      {results && (
        <div className="glass-card p-6 space-y-5">
          <div>
            <h3 className="text-xs font-black text-stone-950 uppercase tracking-[0.2em] mb-1 flex items-center gap-2">
              <span className="w-2 h-2 bg-orange-400 rounded-full"></span> Outlook
            </h3>
            <p className="text-[11px] text-stone-400 font-medium">
              The same setup run {results.outlook.runs.toLocaleString('en-US')} times. The three lines above are just three of them.
            </p>
          </div>

          {results.sampleSize > 0 && results.sampleSize < SMALL_SAMPLE && (
            <p className="text-[11px] font-bold text-red-900 flex items-start gap-2">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              {`The win rate comes from only ${results.sampleSize} trades, too few to know the true one. Read the first row as the hopeful case and the second as what could just as well be true.`}
            </p>
          )}

          <OutlookRow
            title="As measured"
            note={`win rate ${formatNumber(results.winRate * 100)}%`}
            outlook={results.outlook}
          />
          {results.cautious && (
            <div className="pt-5 border-t border-stone-100">
              <OutlookRow
                title="Cautious"
                note={`win rate ${formatNumber(results.cautious.winRate * 100)}%, the lowest that ${results.sampleSize} trades still fit; everything else the same`}
                outlook={results.cautious.outlook}
              />
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {results?.reports.map((report) => {
          const netClass = report.netProfit >= 0 ? 'text-stone-950' : 'text-red-900';
          const growthClass = report.netProfit >= 0 ? 'text-orange-400' : 'text-red-900';

          return (
            <div key={report.id} className="bg-white p-5 rounded-xl shadow-sm flex flex-col justify-center items-center text-center">
              <div className="flex items-center gap-2 mb-3">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: report.color }}></span>
                <span className="text-xs font-bold text-stone-500 uppercase tracking-widest">Sim {report.index + 1}</span>
              </div>
              <div className={`text-2xl font-black ${netClass} mb-1`}>
                ${formatNumber(report.endBalance)}
              </div>
              <div className="text-[10px] text-stone-400 font-bold uppercase tracking-wider mb-4">
                Net: ${formatNumber(report.netProfit)}
              </div>
              {report.wipedOut && (
                <div className="text-[10px] font-bold text-red-900 uppercase tracking-wider -mt-2 mb-4">
                  Wiped out after {report.tradesTaken} trades
                </div>
              )}
              <div className="w-full mt-auto flex flex-col">
                <div className="grid grid-cols-3 gap-y-3 gap-x-2 w-full border-t border-stone-100 pt-4 text-center pb-4">
                  <div>
                    <div className="text-[9px] text-stone-400 uppercase tracking-widest mb-0.5">Growth</div>
                    <div className={`text-sm font-bold ${growthClass}`}>{formatNumber(report.growth)}%</div>
                  </div>
                  <div>
                    <div className="text-[9px] text-stone-400 uppercase tracking-widest mb-0.5">Win Rate</div>
                    <div className="text-sm font-bold text-stone-950">{formatNumber(report.winRate)}%</div>
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
