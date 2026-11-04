"use client";

import { useJournalStore } from "@/store/useJournalStore";
import { useState, useMemo, useRef, useEffect } from "react";
import { ChevronLeft, ChevronRight, ChevronDown, Check, SlidersHorizontal } from "lucide-react";
import { formatNumber, tooltipPositionOf, fitFontSize } from "@/lib/utils";
import { healthTierFromProfitFactor } from "@/lib/stats";
import HealthWeather from "@/components/HealthWeather";
import { computePerformance, type SideMatrix } from "@/lib/performance";
import { loadBahtRate, formatApproxBaht, type BahtRate } from "@/lib/bahtRate";
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

import PageHeader from "@/components/PageHeader";
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

const formatCurrencyHelper = (val: number, isPrivacyMode?: boolean) => {
  if (isPrivacyMode) return '***';
  return val < 0 ? `-$${formatNumber(Math.abs(val))}` : `$${formatNumber(val)}`;
};

// Buy / Sell / All figures of each symbol or timeframe.
function SideMatrixTable({ title, firstColumn, shortFirstColumn, rows, formatCurrency }: { title: string; firstColumn: string; shortFirstColumn?: string; rows: [string, SideMatrix][]; formatCurrency: (val: number) => string }) {
  return (
    <div className="glass-card p-4 md:p-6 overflow-hidden flex flex-col">
      <h3 className="text-xs font-black text-stone-950 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
        <span className="w-2 h-2 bg-orange-400 rounded-full"></span> {title}
      </h3>
      {/* Below lg only the All group shows, so the table fits without scrolling sideways. */}
      <div className="overflow-x-auto">
        <table className="w-full text-center text-sm whitespace-nowrap border-collapse">
          <thead>
            <tr className="text-stone-400 bg-stone-100">
              <th className="py-2 px-1.5 md:px-4 rounded-tl-xl"></th>
              <th colSpan={4} className="hidden lg:table-cell py-2 px-1.5 md:px-4 font-black text-stone-950 uppercase text-[10px] tracking-widest text-center border-l border-stone-200">Buy</th>
              <th colSpan={4} className="hidden lg:table-cell py-2 px-1.5 md:px-4 font-black text-stone-950 uppercase text-[10px] tracking-widest text-center border-l border-stone-200">Sell</th>
              <th colSpan={4} className="py-2 px-1.5 md:px-4 font-black text-stone-950 uppercase text-[10px] tracking-widest text-center border-l border-stone-200 rounded-tr-xl">All</th>
            </tr>
            <tr className="text-stone-400 bg-stone-100">
              <th className="py-2 px-1.5 md:px-4 font-bold uppercase text-[10px] tracking-widest text-center align-middle">{shortFirstColumn ? <><span className="md:hidden">{shortFirstColumn}</span><span className="hidden md:inline">{firstColumn}</span></> : firstColumn}</th>
              <th className="hidden lg:table-cell py-2 px-1.5 md:px-4 font-bold uppercase text-[9px] text-center align-middle border-l border-stone-200">Trades</th>
              <th className="hidden lg:table-cell py-2 px-1.5 md:px-4 font-bold uppercase text-[9px] text-center align-middle">Win %</th>
              <th className="hidden lg:table-cell py-2 px-1.5 md:px-4 font-bold uppercase text-[9px] text-center align-middle">RR</th>
              <th className="hidden lg:table-cell py-2 px-1.5 md:px-4 font-bold uppercase text-[9px] text-center align-middle">P&L</th>
              <th className="hidden lg:table-cell py-2 px-1.5 md:px-4 font-bold uppercase text-[9px] text-center align-middle border-l border-stone-200">Trades</th>
              <th className="hidden lg:table-cell py-2 px-1.5 md:px-4 font-bold uppercase text-[9px] text-center align-middle">Win %</th>
              <th className="hidden lg:table-cell py-2 px-1.5 md:px-4 font-bold uppercase text-[9px] text-center align-middle">RR</th>
              <th className="hidden lg:table-cell py-2 px-1.5 md:px-4 font-bold uppercase text-[9px] text-center align-middle">P&L</th>
              <th className="py-2 px-1.5 md:px-4 font-bold uppercase text-[9px] text-center align-middle border-l border-stone-200">Trades</th>
              <th className="py-2 px-1.5 md:px-4 font-bold uppercase text-[9px] text-center align-middle">Win %</th>
              <th className="py-2 px-1.5 md:px-4 font-bold uppercase text-[9px] text-center align-middle">RR</th>
              <th className="py-2 px-1.5 md:px-4 font-bold uppercase text-[9px] text-center align-middle">Net P&L</th>
            </tr>
          </thead>
          <tbody className="text-[12px]">
            {rows.map(([sym, mData]) => {
              const b = mData.BUY, s = mData.SELL;
              const bWR = (b.win + b.loss) > 0 ? formatNumber(b.win / (b.win + b.loss) * 100) + '%' : '-';
              const sWR = (s.win + s.loss) > 0 ? formatNumber(s.win / (s.win + s.loss) * 100) + '%' : '-';
              const bRR = b.rrCount ? formatNumber(b.rr) + ' R' : '-';
              const sRR = s.rrCount ? formatNumber(s.rr) + ' R' : '-';
              const allTrades = b.trades + s.trades;
              const allWin = b.win + s.win;
              const allLoss = b.loss + s.loss;
              const allWR = (allWin + allLoss) > 0 ? formatNumber(allWin / (allWin + allLoss) * 100) + '%' : '-';
              const allRRCount = (b.rrCount || 0) + (s.rrCount || 0);
              const allRR = allRRCount ? formatNumber((b.rr || 0) + (s.rr || 0)) + ' R' : '-';
              const total = b.pnl + s.pnl;
              return (
                <tr key={sym} className="hover:bg-stone-50 transition duration-150">
                  <td className="py-3 px-1.5 md:px-4 font-extrabold text-stone-950 text-[11px] text-center">{sym}</td>
                  <td className="hidden lg:table-cell py-3 px-1.5 md:px-4 text-center font-semibold text-stone-500 border-l border-stone-200">{b.trades}</td>
                  <td className="hidden lg:table-cell py-3 px-1.5 md:px-4 text-center font-bold text-stone-500">{bWR}</td>
                  <td className="hidden lg:table-cell py-3 px-1.5 md:px-4 text-center font-bold text-stone-500">{bRR}</td>
                  <td className={`hidden lg:table-cell py-3 px-1.5 md:px-4 text-center font-black ${b.pnl >= 0 ? 'text-orange-400' : 'text-red-900'}`}>{formatCurrency(b.pnl)}</td>
                  <td className="hidden lg:table-cell py-3 px-1.5 md:px-4 text-center font-semibold text-stone-500 border-l border-stone-200">{s.trades}</td>
                  <td className="hidden lg:table-cell py-3 px-1.5 md:px-4 text-center font-bold text-stone-500">{sWR}</td>
                  <td className="hidden lg:table-cell py-3 px-1.5 md:px-4 text-center font-bold text-stone-500">{sRR}</td>
                  <td className={`hidden lg:table-cell py-3 px-1.5 md:px-4 text-center font-black ${s.pnl >= 0 ? 'text-orange-400' : 'text-red-900'}`}>{formatCurrency(s.pnl)}</td>
                  <td className="py-3 px-1.5 md:px-4 text-center font-semibold text-stone-500 border-l border-stone-200">{allTrades}</td>
                  <td className="py-3 px-1.5 md:px-4 text-center font-bold text-stone-500">{allWR}</td>
                  <td className="py-3 px-1.5 md:px-4 text-center font-bold text-stone-500">{allRR}</td>
                  <td className={`py-3 px-1.5 md:px-4 text-center font-black ${total >= 0 ? 'text-orange-400' : 'text-red-900'}`}>{formatCurrency(total)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function PerformancePage() {
  const { trades, funding, isLoading, isPrivacyMode } = useJournalStore();
  const formatCurrency = (val: number) => formatCurrencyHelper(val, isPrivacyMode);

  // Today's reference rate, for the rough baht figure under Net Profit.
  const [bahtRate, setBahtRate] = useState<BahtRate | null>(null);
  useEffect(() => {
    let isMounted = true;
    loadBahtRate().then(rate => { if (isMounted) setBahtRate(rate); });
    return () => { isMounted = false; };
  }, []);
  const bahtRateNote = bahtRate ? `Rough estimate at 1 USD = ${bahtRate.rate.toFixed(2)} THB (reference rate of ${bahtRate.date}). A bank pays less.` : undefined;
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());
  const [selectedTfs, setSelectedTfs] = useState<string[]>([]);
  const [isTfMenuOpen, setIsTfMenuOpen] = useState(false);
  const tfRef = useRef<HTMLDivElement>(null);
  
  const [selectedPlan, setSelectedPlan] = useState('ALL');
  // The year, TF and plan filters stay folded behind one button until it is pressed.
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (tfRef.current && !tfRef.current.contains(event.target as Node)) {
        setIsTfMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const [selectedMetric, setSelectedMetric] = useState('GAIN');
  const [tfPage, setTfPage] = useState(0);

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
    const tfsSet = new Set<string>();
    trades.forEach(t => {
      const tfVal = t.tf || 'none';
      tfVal.split(',').forEach((item: string) => {
        const trimmed = item.trim();
        if (trimmed) tfsSet.add(trimmed);
      });
    });
    ['1h', '15m', '5m', '1m', '15s', '5s', 'none'].forEach(item => tfsSet.add(item));
    return Array.from(tfsSet);
  }, [trades]);

  const data = useMemo(
    () => computePerformance(trades, funding, { selectedYear, selectedTfs, selectedPlan, selectedMetric }),
    [trades, funding, selectedYear, selectedTfs, selectedPlan, selectedMetric],
  );

  const lastBalancePointPlugin: Plugin<'line'> = useMemo(() => ({
    id: 'lastBalancePointPlugin',
    afterDatasetsDraw(chart) {
      const ctx = chart.ctx;
      const meta = chart.getDatasetMeta(0);
      if (!meta.hidden && meta.data.length > 0) {
        const lastElement = meta.data[meta.data.length - 1];
        const lastVal = chart.data.datasets[0].data[meta.data.length - 1] as number;
        const position = tooltipPositionOf(lastElement);

        ctx.save();
        ctx.beginPath();
        ctx.arc(position.x, position.y, 6, 0, 2 * Math.PI);
        ctx.fillStyle = '#1c1917';
        ctx.fill();

        ctx.fillStyle = '#1c1917';
        ctx.font = 'bold 11px "Plus Jakarta Sans", sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(isPrivacyMode ? '***' : formatNumber(lastVal), position.x + 12, position.y);
        ctx.restore();
      }
    }
  }), [isPrivacyMode]);

  // The Hour, Day and Month charts draw their 0 line darker, and no axis line at the bottom, so a loss
  // hangs from the line its bar starts at rather than looking as if it floats.
  const zeroLineColor = (c: { tick?: { value: number } }) => c.tick?.value === 0 ? '#d6d3d1' : '#fafaf9';

  const metricLabel = selectedMetric === 'RR' ? 'Net RR' : selectedMetric === 'AVG_R' ? 'Avg R per trade' : selectedMetric === 'GAIN' ? 'Gain (%)' : 'Net P&L ($)';
  // What a bar of the Hour, Day and Month charts shows when pointed at: its value with its unit, and under it
  // how many trades it holds, so a big or small bar can be weighed by how much there is behind it.
  const chartTooltip = (counts: number[]) => ({
    callbacks: {
      label: (item: { dataset: { label?: string }; raw: unknown }) => {
        const v = Number(item.raw ?? 0);
        if (selectedMetric === 'COUNT') return `${item.dataset.label}: ${v}`;
        if (selectedMetric === 'RR' || selectedMetric === 'AVG_R') return `${metricLabel}: ${formatNumber(v)} R`;
        if (selectedMetric === 'GAIN') return `${metricLabel}: ${formatNumber(v)}%`;
        return `${metricLabel}: ${isPrivacyMode ? '***' : `${v < 0 ? '-' : ''}$${formatNumber(Math.abs(v))}`}`;
      },
      footer: (items: { dataIndex: number }[]) => {
        const n = items.length ? counts[items[0].dataIndex] ?? 0 : 0;
        return `${n} ${n === 1 ? 'trade' : 'trades'}`;
      },
    },
  });

  // Value labels drawn beside the bars of the Day of Week and Month of Year charts.
  const barValueLabels: Plugin<'bar'> = useMemo(() => ({
    id: 'barValueLabels',
    afterDatasetsDraw(chart) {
      const { ctx } = chart;
      if (selectedMetric === 'COUNT') {
        const lastDatasetIndex = chart.data.datasets.length - 1;
        if (lastDatasetIndex >= 0) {
          const meta = chart.getDatasetMeta(lastDatasetIndex);
          if (!meta.hidden) {
            meta.data.forEach((element, index) => {
              let sum = 0;
              chart.data.datasets.forEach(ds => { sum += (ds.data[index] as number || 0); });
              if (sum === 0) return;
              
              ctx.fillStyle = '#78716c';
              ctx.font = 'bold 10px "Plus Jakarta Sans", sans-serif';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              
              const position = tooltipPositionOf(element);
              ctx.fillText(sum.toString(), position.x, position.y - 12);
            });
          }
        }
        return;
      }

      // Bars too narrow for their labels (twelve months on a phone) get them standing upright instead.
      const slotWidth = chart.chartArea.width / Math.max(1, chart.data.labels?.length ?? 1);
      chart.data.datasets.forEach((dataset, i) => {
        const meta = chart.getDatasetMeta(i);
        if (!meta.hidden) {
          meta.data.forEach((element, index) => {
            const val = dataset.data[index] as number | null;
            if (val == null) return; // a month with no trades has no bar to label
            ctx.fillStyle = '#78716c';
            ctx.font = 'bold 10px "Plus Jakarta Sans", sans-serif';
            ctx.textBaseline = 'middle';

            let text = formatNumber(val);
            if (selectedMetric === 'RR' || selectedMetric === 'AVG_R') text += ' R';
            else if (selectedMetric === 'GAIN') text += '%';
            else text = isPrivacyMode ? '***' : val < 0 ? '-$' + formatNumber(Math.abs(val)) : '$' + formatNumber(Math.abs(val));

            const position = tooltipPositionOf(element);
            if (ctx.measureText(text).width > slotWidth - 4) {
              // Upright, reading upwards from just past the end of the bar.
              ctx.save();
              ctx.translate(position.x, position.y + (val >= 0 ? -6 : 6));
              ctx.rotate(-Math.PI / 2);
              ctx.textAlign = val >= 0 ? 'left' : 'right';
              ctx.fillText(text, 0, 0);
              ctx.restore();
              return;
            }
            ctx.textAlign = 'center';
            const yOffset = val >= 0 ? -12 : 14;
            ctx.fillText(text, position.x, position.y + yOffset);
          });
        }
      });
    }
  }), [selectedMetric, isPrivacyMode]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-stone-500 font-semibold animate-pulse">Loading performance...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Performance">
        <HealthWeather tier={healthTierFromProfitFactor(data.profitFactor, data.totalTrades)} />
      </PageHeader>

      <div className="glass-card p-6 h-[350px] flex flex-col w-full">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xs font-black text-stone-950 uppercase tracking-[0.2em] flex items-center gap-2">
            <span className="w-2 h-2 bg-orange-400 rounded-full"></span> Profit and Balance
          </h3>
          {data.isAggregated && (
            <span className="text-[10px] font-bold text-stone-500 bg-stone-100/90 border border-stone-200/70 px-2 py-0.5 rounded-md tracking-normal normal-case">
              Daily Aggregated ({data.perfBalanceData.length - 1} Days)
            </span>
          )}
        </div>
        <div className="flex-1 relative w-full h-full">
          <Line
            key={`pnl-${isPrivacyMode}`}
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
                  maxBarThickness: 48,
                  yAxisID: 'y1'
                }
              ] as any
            }}
            options={{
              responsive: true, maintainAspectRatio: false,
              layout: { padding: { top: 20, right: 80 } },
              plugins: {
                legend: { display: false },
                tooltip: {
                  mode: 'index',
                  intersect: false,
                  callbacks: {
                    label: function(context: any) {
                      const val = context.parsed.y;
                      if (context.dataset.label === 'Account Balance') {
                        return ` Balance: ${isPrivacyMode ? '***' : (val < 0 ? '-$' : '$') + formatNumber(Math.abs(val))}`;
                      }
                      if (context.dataset.label === 'Net P&L') {
                        return ` Net P&L: ${isPrivacyMode ? '***' : (val < 0 ? '-$' : '$') + formatNumber(Math.abs(val))}`;
                      }
                      return ` ${context.dataset.label}: ${val}`;
                    }
                  }
                }
              },
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
        {/* The filters sit in the corner of Results; folded behind the button, which turns orange while open,
            or while a filter is off its default even when folded. They filter the whole page, the charts too. */}
        <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2 mb-4">
          <h3 className="text-xs font-black text-stone-950 uppercase tracking-[0.2em] mr-auto flex items-center gap-2">
            <span className="w-2 h-2 bg-orange-400 rounded-full"></span> Results
          </h3>
          {/* On a phone the button stays beside the title and the filters open below it as three even
              columns, each named above its box; from an iPad up they sit in a line left of the button. */}
          {isFiltersOpen && (
          <div className="order-3 md:order-2 w-full md:w-auto grid grid-cols-3 gap-2 md:flex md:items-center md:gap-4">
            <div className="flex flex-col md:flex-row md:items-center gap-1 md:gap-2 min-w-0">
              <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Year<span className="hidden md:inline">:</span></span>
              <select value={selectedYear} onChange={(e) => setSelectedYear(e.target.value)}
                className="w-full md:w-auto h-9 md:h-auto bg-white border border-stone-200 text-stone-950 text-base md:text-[10px] font-bold rounded-lg px-2 md:px-3 py-1.5 shadow-sm focus:outline-none focus:border-orange-400 cursor-pointer">
                {availableYears.map(y => (
                   <option key={y} value={y.toString()}>{y}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col md:flex-row md:items-center gap-1 md:gap-2 min-w-0" ref={tfRef}>
              <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">TF<span className="hidden md:inline">:</span></span>
              <div className="relative">
                <button
                  onClick={() => setIsTfMenuOpen(!isTfMenuOpen)}
                  className="w-full md:w-auto h-9 md:h-auto bg-white border border-stone-200 text-stone-950 text-base md:text-[10px] font-bold rounded-lg px-2 md:px-3 py-1.5 shadow-sm hover:border-orange-400 focus:outline-none flex items-center gap-1.5 cursor-pointer md:min-w-[70px] justify-between transition-colors"
                >
                  <span className="truncate max-w-[100px]">
                    {selectedTfs.length === 0 
                      ? "ALL" 
                      : selectedTfs.length <= 2 
                        ? selectedTfs.join(", ") 
                        : `${selectedTfs.length} Selected`}
                  </span>
                  <ChevronDown className={`w-3.5 h-3.5 text-stone-400 transition-transform ${isTfMenuOpen ? 'rotate-180' : ''}`} />
                </button>
                
                {isTfMenuOpen && (
                  <div className="absolute left-0 sm:right-0 sm:left-auto top-full mt-1.5 w-40 bg-white border border-stone-200 rounded-xl shadow-lg z-50 overflow-hidden flex flex-col animate-in fade-in zoom-in duration-200">
                    <div className="p-2 border-b border-stone-100 flex justify-between items-center bg-stone-50/50">
                      <span className="text-[10px] font-bold text-stone-400 uppercase">Select TFs</span>
                      {selectedTfs.length > 0 && (
                        <button 
                          onClick={() => setSelectedTfs([])}
                          className="text-[10px] font-bold text-orange-400 hover:text-orange-500 transition-colors"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                    <div className="max-h-64 overflow-y-auto p-1.5">
                      {availableTfs.map(tf => {
                        const isSelected = selectedTfs.includes(tf);
                        return (
                          <div 
                            key={tf}
                            onClick={() => {
                              if (isSelected) {
                                setSelectedTfs(selectedTfs.filter(i => i !== tf));
                              } else {
                                setSelectedTfs([...selectedTfs, tf]);
                              }
                            }}
                            className={`flex items-center gap-2.5 px-3 py-2 text-xs font-bold rounded-lg cursor-pointer transition-colors ${
                              isSelected ? 'bg-orange-50 text-orange-400' : 'text-stone-600 hover:bg-stone-50 hover:text-stone-900'
                            }`}
                          >
                            <div className={`w-3.5 h-3.5 rounded-[4px] border flex items-center justify-center shrink-0 transition-colors ${
                              isSelected ? 'bg-orange-400 border-orange-400' : 'border-stone-200'
                            }`}>
                              {isSelected && <Check className="w-2.5 h-2.5 text-white stroke-[3]" />}
                            </div>
                            <span className="truncate">{tf}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="flex flex-col md:flex-row md:items-center gap-1 md:gap-2 min-w-0">
              <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Plan<span className="hidden md:inline">:</span></span>
              <select value={selectedPlan} onChange={(e) => setSelectedPlan(e.target.value)}
                className="w-full md:w-auto h-9 md:h-auto bg-white border border-stone-200 text-stone-950 text-base md:text-[10px] font-bold rounded-lg px-2 md:px-3 py-1.5 shadow-sm focus:outline-none focus:border-orange-400 cursor-pointer">
                <option value="ALL">ALL</option>
                <option value="On Plan">On Plan</option>
                <option value="Off Plan">Off Plan</option>
              </select>
            </div>
          </div>
          )}
          <button
            type="button"
            onClick={() => setIsFiltersOpen(open => !open)}
            aria-expanded={isFiltersOpen}
            aria-label="Filter"
            title="Filter"
            className={`order-2 md:order-3 flex items-center justify-center h-8 w-8 border rounded-lg transition ${
              isFiltersOpen || selectedYear !== new Date().getFullYear().toString() || selectedTfs.length > 0 || selectedPlan !== 'ALL'
                ? 'bg-orange-50 text-orange-400 border-orange-200'
                : 'bg-white text-stone-500 border-stone-200 hover:text-stone-950'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
          <div className="@container bg-white p-5 rounded-[1.25rem] border border-stone-200 shadow-sm flex flex-col justify-center items-center text-center">
            <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1">Net Profit</span>
            {/* 20px, or smaller when a large profit would not fit the card. */}
            <span style={fitFontSize(formatCurrency(data.netProfit), '1.25rem')} className={`leading-7 font-black ${data.netProfit >= 0 ? 'text-orange-400' : 'text-red-900'}`}>{formatCurrency(data.netProfit)}</span>
            {bahtRate && !isPrivacyMode && (
              <span className="text-xs font-normal text-stone-400" title={bahtRateNote}>{formatApproxBaht(data.netProfit, bahtRate.rate)}</span>
            )}
          </div>
          <div className="bg-orange-400 p-5 rounded-[1.25rem] border border-orange-300 shadow-lg shadow-orange-400/20 flex flex-col justify-center items-center text-center">
            <span className="text-[10px] font-bold text-white/90 uppercase tracking-widest mb-1">Win Rate</span>
            <span className="text-xl font-black text-white">{formatNumber(data.mainWinRate)}%</span>
          </div>
          <div className="bg-white p-5 rounded-[1.25rem] border border-stone-200 shadow-sm flex flex-col justify-center items-center text-center">
            <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1">Profit Factor</span>
            <span className="text-xl font-black text-stone-950">{formatNumber(data.profitFactor)}</span>
          </div>
          <div className="bg-white p-5 rounded-[1.25rem] border border-stone-200 shadow-sm flex flex-col justify-center items-center text-center">
            <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1">Expectancy</span>
            <span className="text-xl font-black text-stone-950">{formatNumber(data.expectancyR)} R</span>
            {/* The same average trade in the dollars it really made. */}
            <span className="text-[11px] font-normal text-stone-400 mt-0.5" title="Average profit per trade in dollars">{formatCurrency(data.expectedPayoff)} per trade</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-5">
          <div className="bg-white p-5 rounded-xl border border-stone-200 shadow-sm flex flex-col justify-between space-y-2.5">
            <div className="flex justify-between items-end border-b border-stone-100 pb-1.5 mb-2">
              <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Outcomes</span>
            </div>
            <div className="flex justify-between text-[10px] font-bold">
              <span className="text-orange-400 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-orange-400 shrink-0"></span><span>{formatNumber(data.winPct)}%</span></span>
              <span className="text-stone-400 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-stone-200 shrink-0"></span><span>{formatNumber(data.bePct)}%</span></span>
              <span className="text-red-900 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-red-900 shrink-0"></span><span>{formatNumber(data.lossPct)}%</span></span>
            </div>
            <div className="w-full h-2.5 bg-stone-100 rounded-full overflow-hidden flex mt-1">
              <div className="h-full bg-orange-400 transition-all duration-500" style={{ width: `${data.winPct}%` }}></div>
              <div className="h-full bg-stone-200 transition-all duration-500" style={{ width: `${data.bePct}%` }}></div>
              <div className="h-full bg-red-900 transition-all duration-500" style={{ width: `${data.lossPct}%` }}></div>
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
            <div className="flex justify-between items-end border-b border-stone-100 pb-1.5 mb-2">
              <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Direction</span>
            </div>
            <div className="space-y-3 mt-2">
              <div>
                <div className="flex justify-between text-[10px] font-bold mb-1">
                  <span className="text-stone-600">Buy <span className="text-stone-400 font-normal">({data.longTrades})</span></span>
                  <span className="text-stone-950">{formatNumber(data.longWinPct)}%</span>
                </div>
                <div className="w-full h-2.5 bg-stone-100 rounded-full overflow-hidden"><div className="h-full bg-stone-950 transition-all duration-500" style={{ width: `${data.longWinPct}%` }}></div></div>
              </div>
              <div>
                <div className="flex justify-between text-[10px] font-bold mb-1">
                  <span className="text-stone-600">Sell <span className="text-stone-400 font-normal">({data.shortTrades})</span></span>
                  <span className="text-stone-950">{formatNumber(data.shortWinPct)}%</span>
                </div>
                <div className="w-full h-2.5 bg-stone-100 rounded-full overflow-hidden"><div className="h-full bg-stone-950 transition-all duration-500" style={{ width: `${data.shortWinPct}%` }}></div></div>
              </div>
            </div>
          </div>

          <div className="bg-white p-5 rounded-xl border border-stone-200 shadow-sm flex flex-col justify-between space-y-1">
            <div className="flex justify-between items-end border-b border-stone-100 pb-1.5 mb-2">
              <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Discipline</span>
            </div>
            <div className="flex justify-between text-[10px] font-bold">
              <span className="text-red-900 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-red-900 shrink-0"></span><span>{formatNumber(data.offPlanPct)}%</span></span>
              <span className="text-orange-400 flex items-center gap-1 justify-end"><span className="w-1.5 h-1.5 rounded-full bg-orange-400 shrink-0"></span><span>{formatNumber(data.onPlanPct)}%</span></span>
            </div>
            <div className="w-full h-4 bg-stone-100 rounded-full overflow-hidden flex mt-1 mb-1">
              <div className="h-full bg-red-900 transition-all duration-500" style={{ width: `${data.offPlanPct}%` }}></div>
              <div className="h-full bg-orange-400 transition-all duration-500" style={{ width: `${data.onPlanPct}%` }}></div>
            </div>
            <div className="flex justify-between text-[10px] font-bold mt-2">
              <div className="flex flex-col">
                <span className="text-red-900">Off Plan</span>
                <span className="text-red-900">{formatCurrency(data.offPlanPnL)}</span>
              </div>
              <div className="flex flex-col items-end text-right">
                <span className="text-orange-400">On Plan</span>
                <span className="text-orange-400">{formatCurrency(data.onPlanPnL)}</span>
              </div>
            </div>
          </div>

          {(() => {
            const validTfs = ['1h', '15m', '5m', '1m', '15s', '5s']
              .filter(tf => data.tfStats[tf] && data.tfStats[tf].trades > 0)
              .sort((a, b) => data.tfStats[b].pnl - data.tfStats[a].pnl);
              
            return (
              <div className="bg-white p-5 rounded-xl border border-stone-200 shadow-sm space-y-4">
                <div className="flex justify-between items-center border-b border-stone-100 pb-1.5 mb-2">
                  <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Timeframe</span>
                  {validTfs.length > 4 && (
                    <div className="flex gap-1">
                      <button onClick={() => setTfPage(p => p - 1)} className="p-1 hover:bg-stone-100 rounded text-stone-400 hover:text-stone-600 transition"><ChevronLeft className="w-3.5 h-3.5" /></button>
                      <button onClick={() => setTfPage(p => p + 1)} className="p-1 hover:bg-stone-100 rounded text-stone-400 hover:text-stone-600 transition"><ChevronRight className="w-3.5 h-3.5" /></button>
                    </div>
                  )}
                </div>
                <div className="space-y-3 mt-2">
                  {validTfs.length === 0 ? null : (() => {
                
                const totalPages = Math.ceil(validTfs.length / 4);
                let normalizedPage = tfPage % totalPages;
                if (normalizedPage < 0) normalizedPage += totalPages;
                
                const maxPosPnl = Math.max(0, ...validTfs.map(tf => data.tfStats[tf].pnl));
                const maxNegPnl = Math.max(0, ...validTfs.map(tf => -data.tfStats[tf].pnl));
                const totalRange = maxPosPnl + maxNegPnl;
                
                const negRatio = totalRange > 0 ? (maxNegPnl / totalRange) * 100 : 50;
                const posRatio = totalRange > 0 ? (maxPosPnl / totalRange) * 100 : 50;
                
                return validTfs.slice(normalizedPage * 4, normalizedPage * 4 + 4).map(tf => {
                  const stat = data.tfStats[tf];
                  
                  let negWidth = 0;
                  let posWidth = 0;
                  if (stat.pnl < 0 && maxNegPnl > 0) negWidth = (Math.abs(stat.pnl) / maxNegPnl) * 100;
                  if (stat.pnl > 0 && maxPosPnl > 0) posWidth = (stat.pnl / maxPosPnl) * 100;
                  
                  return (
                    <div key={tf} className="flex items-center gap-2">
                      <div className="w-7 shrink-0 flex items-baseline text-[10px]">
                        <span className="font-bold text-stone-950">{tf}</span>
                      </div>
                      <div className="flex-1 h-2.5 bg-stone-100 rounded-full flex items-center overflow-hidden">
                        <div className="h-full flex justify-end" style={{ width: `${negRatio}%` }}>
                          {stat.pnl < 0 && (
                            <div className="h-full bg-red-900 rounded-full" style={{ width: `${negWidth}%` }}></div>
                          )}
                        </div>
                        <div className="h-full flex justify-start" style={{ width: `${posRatio}%` }}>
                          {stat.pnl > 0 && (
                            <div className="h-full bg-orange-400 rounded-full" style={{ width: `${posWidth}%` }}></div>
                          )}
                        </div>
                      </div>
                      <div className={`w-auto shrink-0 text-left text-[10px] font-bold ${stat.pnl >= 0 ? 'text-orange-400' : 'text-red-900'}`}>
                        {formatCurrency(stat.pnl)} <span className="text-stone-300 font-normal mx-0.5">|</span> <span className={stat.rr >= 0 ? 'text-orange-400' : 'text-red-900'}>{formatNumber(stat.rr)} R</span>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        );
      })()}
    </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-sm text-[10px] space-y-2">
            <div className="text-[9px] font-bold text-stone-400 uppercase tracking-widest border-b border-stone-100 pb-1.5 mb-2">Averages & Time</div>
            <div className="flex justify-between"><span className="text-stone-500">Avg Win</span><span className="font-bold text-orange-400">{formatCurrency(data.avgWin)}</span></div>
            <div className="flex justify-between"><span className="text-stone-500">Avg Loss</span><span className="font-bold text-red-900">{formatCurrency(-data.avgLoss)}</span></div>
            <div className="flex justify-between"><span className="text-stone-500">Avg BE</span><span className="font-bold text-stone-400">{formatCurrency(data.avgBE)}</span></div>
            <div className="flex justify-between pt-1"><span className="text-stone-500">Hold (Win)</span><span className="font-bold text-stone-950">{data.holdWin}</span></div>
            <div className="flex justify-between"><span className="text-stone-500">Hold (Loss)</span><span className="font-bold text-stone-950">{data.holdLoss}</span></div>
          </div>
          <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-sm text-[10px] space-y-2">
            <div className="text-[9px] font-bold text-stone-400 uppercase tracking-widest border-b border-stone-100 pb-1.5 mb-2">Totals & Extremes</div>
            <div className="flex justify-between"><span className="text-stone-500">Gross Profit</span><span className="font-bold text-orange-400">{formatCurrency(data.grossProfit)}</span></div>
            <div className="flex justify-between"><span className="text-stone-500">Gross Loss</span><span className="font-bold text-red-900">{formatCurrency(-data.grossLoss)}</span></div>
            <div className="flex justify-between pt-1"><span className="text-stone-500">Largest Win</span><span className="font-bold text-orange-400">{formatCurrency(data.largestProfit)}</span></div>
            <div className="flex justify-between"><span className="text-stone-500">Largest Loss</span><span className="font-bold text-red-900">{formatCurrency(data.largestLoss)}</span></div>
          </div>
          <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-sm text-[10px] space-y-2">
            <div className="text-[9px] font-bold text-stone-400 uppercase tracking-widest border-b border-stone-100 pb-1.5 mb-2">Risk & Drawdowns</div>
            <div className="flex justify-between"><span className="text-stone-500">Absolute DD</span><span className="font-bold text-red-900">{formatCurrency(data.absoluteDD)}</span></div>
            <div className="flex justify-between"><span className="text-stone-500">Maximal DD</span><span className="font-bold text-red-900">{formatCurrency(data.maxDrawdownAmt)}</span></div>
            <div className="flex justify-between"><span className="text-stone-500">Relative DD</span><span className="font-bold text-red-900">{formatNumber(data.maxDrawdownPct)}%</span></div>
            <div className="flex justify-between pt-1"><span className="text-stone-500">Recovery</span><span className="font-bold text-stone-950">{formatNumber(data.recoveryFactor)}</span></div>
            <div className="flex justify-between"><span className="text-stone-500">Sharpe Ratio</span><span className="font-bold text-stone-950">{formatNumber(data.sharpeRatio)}</span></div>
          </div>
          <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-sm space-y-4">
            <div className="text-[10px] font-bold text-stone-400 uppercase tracking-widest border-b border-stone-100 pb-1.5 mb-2">Streaks</div>
            
            {(() => {
              const maxWin = data.countAtMaxWinAmt || 0;
              const maxLoss = data.countAtMaxLossAmt || 0;
              const maxTotal = maxWin + maxLoss || 1;
              const winPct = (maxWin / maxTotal) * 100;
              const lossPct = (maxLoss / maxTotal) * 100;

              const avgWin = data.avgConsWin || 0;
              const avgLoss = data.avgConsLoss || 0;
              const avgTotal = avgWin + avgLoss || 1;
              const avgWinPct = (avgWin / avgTotal) * 100;
              const avgLossPct = (avgLoss / avgTotal) * 100;

              return (
                <>
                  <div className="flex flex-col gap-1">
                    <div className="flex justify-between text-[10px] font-bold text-stone-600">
                      <span>Win Streaks</span>
                      <span>Loss Streaks</span>
                    </div>
                    <div className="w-full h-6 bg-stone-100 rounded-full overflow-hidden flex my-0.5 text-[11px] font-bold">
                      <div className="h-full bg-orange-400 flex items-center justify-center text-white transition-all duration-500" style={{ width: `${winPct}%` }}>
                        {maxWin > 0 ? maxWin : ''}
                      </div>
                      <div className="h-full bg-red-900 flex items-center justify-center text-white transition-all duration-500" style={{ width: `${lossPct}%` }}>
                        {maxLoss > 0 ? maxLoss : ''}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1">
                    <div className="w-full h-6 bg-stone-100 rounded-full overflow-hidden flex my-0.5 text-[11px] font-bold">
                      <div className="h-full bg-stone-950 flex items-center justify-center text-white transition-all duration-500" style={{ width: `${avgWinPct}%` }}>
                        {avgWin > 0 ? avgWin : ''}
                      </div>
                      <div className="h-full bg-stone-100 flex items-center justify-center text-stone-500 transition-all duration-500" style={{ width: `${avgLossPct}%` }}>
                        {avgLoss > 0 ? avgLoss : ''}
                      </div>
                    </div>
                    <div className="flex justify-between text-[10px] font-bold text-stone-600">
                      <span>AVG Win</span>
                      <span>AVG Loss</span>
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      </div>

      {/* What the three charts below measure, kept just above them. */}
      <div className="flex justify-end mt-4 mb-2">
        <div className="flex bg-stone-100 p-0.5 rounded-lg" role="group" aria-label="Chart measure">
          {([
            { value: 'COUNT', label: 'W/L', title: 'Wins and losses' },
            { value: 'RR', label: 'RR', title: 'Risk/Reward (R), total' },
            { value: 'AVG_R', label: 'Avg R', title: 'Average R per trade' },
            { value: 'PNL', label: '$', title: 'Net P&L ($)' },
            { value: 'GAIN', label: '%', title: 'Gain (%)' },
          ] as const).map(m => (
            <button
              key={m.value}
              type="button"
              onClick={() => setSelectedMetric(m.value)}
              aria-pressed={selectedMetric === m.value}
              title={m.title}
              className={`h-7 min-w-10 px-2.5 text-[11px] font-bold rounded-md transition ${
                selectedMetric === m.value ? 'bg-white text-stone-950 shadow-sm' : 'text-stone-400 hover:text-stone-600'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* On a computer Hour and Day share a row and Month takes the next one whole; on an iPad and a phone
          each takes a row whole (shorter on a phone), so the twelve months have room. */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="glass-card p-6 h-[280px] md:h-[400px] flex flex-col md:col-span-2 lg:col-span-1">
          <h3 className="text-xs font-black text-stone-950 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
            <span className="w-2 h-2 bg-orange-400 rounded-full"></span> Hour of Day
          </h3>
          <div className="flex-1 relative w-full h-full">
            <Bar
              key={`hour-${selectedMetric}-${isPrivacyMode}`}
              data={{
                labels: Array.from({ length: 24 }, (_, i) => `${i}:00`),
              datasets: selectedMetric === 'COUNT' ? [
                  { label: 'Losses', data: data.hourlyLossesArr, backgroundColor: '#7f1d1d', borderRadius: 6, maxBarThickness: 48 },
                  { label: 'BEs', data: data.hourlyBEsArr, backgroundColor: '#d6d3d1', borderRadius: 6, maxBarThickness: 48 },
                  { label: 'Wins', data: data.hourlyWinsArr, backgroundColor: '#fb923c', borderRadius: 6, maxBarThickness: 48 }
                ] : [{ label: metricLabel, data: data.hourlyDataArr, backgroundColor: data.hourlyColors, borderRadius: 6, maxBarThickness: 48 }]
              }}
              options={{
                responsive: true, maintainAspectRatio: false,
                scales: { 
                  y: { border: { display: false }, grid: { color: zeroLineColor }, ticks: { display: false }, stacked: selectedMetric === 'COUNT' }, 
                  // Every hour labelled, standing upright so all 24 fit; an hour not traded in light grey.
                  x: { grid: { display: false }, border: { display: false }, stacked: selectedMetric === 'COUNT', ticks: { autoSkip: false, minRotation: 90, maxRotation: 90, color: (c: { index: number }) => data.hourTraded[c.index] ? '#78716c' : '#d6d3d1' } }
                },
                plugins: { legend: { display: false }, tooltip: chartTooltip(data.hourCounts) }
              }}
            />
          </div>
        </div>
        <div className="glass-card p-6 h-[280px] md:h-[400px] flex flex-col md:col-span-2 lg:col-span-1">
          <h3 className="text-xs font-black text-stone-950 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
            <span className="w-2 h-2 bg-orange-400 rounded-full"></span> Day of Week
          </h3>
          <div className="flex-1 relative w-full h-full">
            <Bar
              key={`dow-${selectedMetric}-${isPrivacyMode}`}
              data={{
                labels: data.activeDowNames,
                datasets: selectedMetric === 'COUNT' ? [
                  { label: 'Losses', data: data.activeDowLosses, backgroundColor: '#7f1d1d', borderRadius: 6, maxBarThickness: 48 },
                  { label: 'BEs', data: data.activeDowBEs, backgroundColor: '#d6d3d1', borderRadius: 6, maxBarThickness: 48 },
                  { label: 'Wins', data: data.activeDowWins, backgroundColor: '#fb923c', borderRadius: 6, maxBarThickness: 48 }
                ] : [{ label: metricLabel, data: data.activeDowData, backgroundColor: data.dowColors, borderRadius: 6, maxBarThickness: 48 }]
              }}
              options={{
                responsive: true, maintainAspectRatio: false,
                layout: { padding: { top: 20, bottom: 20 } },
                scales: {
                  y: { border: { display: false }, grid: { color: zeroLineColor }, ticks: { display: false }, grace: '20%', stacked: selectedMetric === 'COUNT' },
                  // A day not traded yet named in light grey.
                  x: { grid: { display: false }, border: { display: false }, stacked: selectedMetric === 'COUNT', ticks: { color: (c: { index: number }) => data.dowTraded[c.index] ? '#78716c' : '#d6d3d1' } }
                },
                plugins: { legend: { display: false }, tooltip: chartTooltip(data.activeDowCounts) }
              }}
              plugins={[barValueLabels]}
            />
          </div>
        </div>

      <div className="glass-card p-6 h-[280px] md:h-[400px] flex flex-col w-full md:col-span-2">
        <h3 className="text-xs font-black text-stone-950 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
          <span className="w-2 h-2 bg-orange-400 rounded-full"></span> Month of Year
        </h3>
        <div className="flex-1 relative w-full h-full">
          <Bar
            key={`moy-${selectedMetric}-${isPrivacyMode}`}
            data={{
              labels: data.activeMoyNames,
              datasets: selectedMetric === 'COUNT' ? [
                { label: 'Losses', data: data.activeMoyLosses, backgroundColor: '#7f1d1d', borderRadius: 6, maxBarThickness: 48 },
                { label: 'BEs', data: data.activeMoyBEs, backgroundColor: '#d6d3d1', borderRadius: 6, maxBarThickness: 48 },
                { label: 'Wins', data: data.activeMoyWins, backgroundColor: '#fb923c', borderRadius: 6, maxBarThickness: 48 }
              ] : [
                {
                  label: metricLabel,
                  data: data.moyRRData,
                  backgroundColor: data.moyRRColors,
                  borderRadius: 6,
                  maxBarThickness: 48,
                }
              ]
            }}
            options={{
              responsive: true, maintainAspectRatio: false,
              // More room above and below on a narrow screen, where the bars' labels stand upright.
              layout: { padding: (c: { chart: { width: number } }) => c.chart.width / 12 < 44 ? { top: 44, bottom: 44 } : { top: 20, bottom: 20 } },
              scales: {
                y: { border: { display: false }, grid: { color: zeroLineColor }, ticks: { display: false }, grace: '20%', stacked: selectedMetric === 'COUNT' },
                // Every month named, level, a month not traded yet in light grey; a smaller font on a phone so all twelve fit.
                x: { grid: { display: false }, border: { display: false }, stacked: selectedMetric === 'COUNT', ticks: {
                  autoSkip: false, maxRotation: 0,
                  color: (c: { index: number }) => data.moyTraded[c.index] ? '#78716c' : '#d6d3d1',
                  font: (c: { chart: { width: number } }) => ({ size: c.chart.width / 12 < 44 ? 10 : 12 }),
                } }
              },
              plugins: { legend: { display: false }, tooltip: chartTooltip(data.activeMoyCounts) }
            }}
            plugins={[barValueLabels]}
          />
        </div>
      </div>
      </div>

      <SideMatrixTable title="Buy VS Sell Analysis" firstColumn="Symbol" rows={data.matrixSorted} formatCurrency={formatCurrency} />
      <SideMatrixTable title="Timeframe Analysis" firstColumn="Timeframe" shortFirstColumn="TF" rows={data.tfMatrixSorted} formatCurrency={formatCurrency} />
    </div>
  );
}
