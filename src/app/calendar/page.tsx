"use client";

import { useJournalStore } from "@/store/useJournalStore";
import { useState, useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { formatNumber } from "@/lib/utils";

export default function CalendarPage() {
  const { trades, isLoading } = useJournalStore();
  const [currentDate, setCurrentDate] = useState(new Date());

  const changeMonth = (offset: number) => {
    setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() + offset, 1));
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  const jumpToYear = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setCurrentDate(prev => new Date(parseInt(e.target.value), prev.getMonth(), 1));
  };

  const data = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const today = new Date();
    const isCurrentMonth = (year === today.getFullYear() && month === today.getMonth());
    const currentDay = today.getDate();

    const firstDay = new Date(year, month, 1).getDay(); // Sunday is 0, Monday is 1, etc.
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const statsMap: Record<number, { pnl: number, count: number, rr: number }> = {};
    let mWins = 0;
    let mLosses = 0;
    let mTotalTradesAll = 0;

    trades.forEach(t => {
      const d = new Date(t.time.replace(' ', 'T'));
      if (!isNaN(d.getTime()) && d.getFullYear() === year && d.getMonth() === month) {
        const date = d.getDate();
        if (!statsMap[date]) statsMap[date] = { pnl: 0, count: 0, rr: 0 };
        statsMap[date].pnl += t.profit;
        statsMap[date].count++;
        statsMap[date].rr += (t.rr || 0);

        mTotalTradesAll++;

        let isBE = false;
        const rawRisk = t.risk || 0;
        if (rawRisk > 0) {
          const calculatedRR = (t.profit || 0) / rawRisk;
          isBE = (calculatedRR >= -0.4 && calculatedRR <= 0.4);
        } else {
          isBE = (t.resultType === 'BE' || t.profit === 0);
        }
        if (!isBE) {
          if (t.profit > 0 || t.resultType === 'TP') mWins++;
          else if (t.profit < 0 || t.resultType === 'SL') mLosses++;
        }
      }
    });

    let mNet = 0;
    let mRR = 0;
    const daysArray = [];
    const weeklySummaries = [];

    let currentWeekPnL = 0;
    let currentWeekRR = 0;
    let currentWeekCount = 0;

    for (let i = 0; i < firstDay; i++) {
      daysArray.push({ type: 'empty', id: `empty-${i}` });
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const s = statsMap[day];
      if (s) {
        mNet += s.pnl;
        mRR += s.rr;
        currentWeekPnL += s.pnl;
        currentWeekRR += s.rr;
        currentWeekCount += s.count;
      }
      
      daysArray.push({
        type: 'day',
        id: `day-${day}`,
        day,
        isToday: isCurrentMonth && day === currentDay,
        stats: s
      });

      const currentDayOfWeek = new Date(year, month, day).getDay();
      if (currentDayOfWeek === 6) {
        weeklySummaries.push({
          id: `summary-${day}`,
          pnl: currentWeekPnL,
          rr: currentWeekRR,
          count: currentWeekCount
        });
        currentWeekPnL = 0;
        currentWeekRR = 0;
        currentWeekCount = 0;
      }
    }

    const lastDayOfWeek = new Date(year, month, daysInMonth).getDay();
    if (lastDayOfWeek !== 6) {
      for (let i = lastDayOfWeek + 1; i <= 6; i++) {
        daysArray.push({ type: 'empty', id: `empty-end-${i}` });
      }
      weeklySummaries.push({
        id: `summary-end`,
        pnl: currentWeekPnL,
        rr: currentWeekRR,
        count: currentWeekCount
      });
    }

    const resolvedTrades = mWins + mLosses;
    const winRate = resolvedTrades > 0 ? (mWins / resolvedTrades) * 100 : 0;

    const availableYears = Array.from(new Set(trades.map(t => new Date(t.time.replace(' ', 'T')).getFullYear()))).sort((a, b) => b - a);
    if (!availableYears.includes(today.getFullYear())) {
      availableYears.unshift(today.getFullYear());
      availableYears.sort((a, b) => b - a);
    }

    return {
      monthLabel: new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(currentDate),
      daysArray,
      weeklySummaries,
      mNet,
      mRR,
      mTotalTradesAll,
      winRate,
      availableYears,
      year
    };
  }, [trades, currentDate]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-stone-500 font-semibold animate-pulse">Loading calendar...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shrink-0">
        <div>
          <h2 className="text-3xl font-extrabold text-stone-950 tracking-tight">Calendar</h2>
        </div>
      </div>
      <div className="glass-card p-8">
        <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-6">
          <div className="flex items-center gap-2 md:gap-4 flex-wrap">
            <div className="flex items-center">
              <button onClick={() => changeMonth(-1)} className="p-2 md:p-3 hover:bg-stone-100 rounded-full text-stone-400 transition">
                <ChevronLeft className="w-5 h-5 md:w-6 md:h-6" strokeWidth={2.5} />
              </button>
              <h2 className="text-2xl md:text-3xl font-extrabold text-stone-950 min-w-[180px] md:min-w-[240px] text-center tracking-tight">
                {data.monthLabel}
              </h2>
              <button onClick={() => changeMonth(1)} className="p-2 md:p-3 hover:bg-stone-100 rounded-full text-stone-400 transition">
                <ChevronRight className="w-5 h-5 md:w-6 md:h-6" strokeWidth={2.5} />
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={goToToday} className="px-4 py-2 bg-orange-400 hover:bg-orange-500 text-white text-xs font-bold rounded-lg transition uppercase tracking-wider">
                Today
              </button>
              <select value={data.year} onChange={jumpToYear} className="bg-stone-50 border border-stone-200 text-stone-950 text-xs font-bold rounded-lg px-3 py-2 shadow-sm focus:outline-none focus:border-orange-400 cursor-pointer">
                {data.availableYears.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-4 md:gap-6 overflow-visible flex-wrap md:flex-nowrap items-center w-full md:w-auto justify-around md:justify-end">
            <div className="flex flex-col justify-center items-center text-center shrink-0 flex-1 md:flex-none px-2 py-1">
              <span className="text-[9px] font-black text-stone-400 uppercase tracking-widest mb-0.5">Trades</span>
              <span className="text-lg font-black text-stone-400">{data.mTotalTradesAll}</span>
            </div>
            <div className="w-[1px] bg-stone-200 h-8 my-auto shrink-0"></div>
            <div className="flex flex-col justify-center items-center text-center shrink-0 flex-1 md:flex-none px-2 py-1">
              <span className="text-[9px] font-black text-stone-400 uppercase tracking-widest mb-0.5">P&L</span>
              <span className={`text-lg font-black ${data.mNet > 0 ? 'text-orange-400' : data.mNet < 0 ? 'text-red-900' : 'text-stone-400'}`}>
                {data.mNet < 0 ? '-' : ''}${formatNumber(Math.abs(data.mNet))}
              </span>
            </div>
            <div className="w-[1px] bg-stone-200 h-8 my-auto shrink-0"></div>
            <div className="flex flex-col justify-center items-center text-center shrink-0 flex-1 md:flex-none px-2 py-1">
              <span className="text-[9px] font-black text-stone-400 uppercase tracking-widest mb-0.5">RR</span>
              <span className="text-lg font-black text-stone-400">
                {formatNumber(data.mRR)}R
              </span>
            </div>
            <div className="w-[1px] bg-stone-200 h-8 my-auto shrink-0"></div>
            <div className="flex flex-col justify-center items-center text-center shrink-0 flex-1 md:flex-none px-2 py-1">
              <span className="text-[9px] font-black text-stone-400 uppercase tracking-widest mb-0.5">Win Rate</span>
              <span className="text-lg font-black text-orange-400">{formatNumber(data.winRate)}%</span>
            </div>
          </div>
        </div>

        <div className="flex flex-col xl:flex-row gap-4">
          <div className="calendar-grid flex-1">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(dayName => (
              <div key={dayName} className="bg-stone-50 p-3 text-center text-[10px] font-black text-stone-400 uppercase tracking-widest">
                {dayName}
              </div>
            ))}
            {data.daysArray.map((cell: any) => {
              if (cell.type === 'empty') {
                return <div key={cell.id} className="bg-stone-50/50 min-h-[110px]"></div>;
              }

              const { day, isToday, stats } = cell;
              let bgColor = "bg-white";
              if (stats) {
                bgColor = stats.pnl > 0 ? "bg-orange-50" : (stats.pnl < 0 ? "bg-red-50" : "bg-stone-50");
              }

              return (
                <div key={cell.id} className={`${bgColor} min-h-[110px] p-3 flex flex-col`}>
                  {isToday ? (
                    <span className="text-xs font-bold bg-orange-400 text-white w-6 h-6 flex items-center justify-center rounded-full shadow-sm mb-1">{day}</span>
                  ) : (
                    <span className="text-xs font-bold text-stone-400">{day}</span>
                  )}
                  
                  {stats && (
                    <div className="mt-auto">
                      <div className={`text-base font-black ${stats.pnl > 0 ? 'text-orange-400' : stats.pnl < 0 ? 'text-red-900' : 'text-stone-400'}`}>
                        {stats.pnl < 0 ? '-' : ''}${formatNumber(Math.abs(stats.pnl))}
                      </div>
                      <div className="flex justify-between items-center w-full mt-2">
                        <div className={`text-[10px] font-bold ${stats.rr > 0 ? 'text-orange-400' : stats.rr < 0 ? 'text-red-900' : 'text-stone-400'} tracking-tight`}>
                          {formatNumber(stats.rr)}R
                        </div>
                        <div className="text-[9px] font-bold text-stone-400 uppercase tracking-tighter">
                          Trades : {stats.count}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="w-full xl:w-[140px] shrink-0 flex flex-col bg-stone-200 gap-[1px] border border-stone-200 rounded-xl overflow-hidden">
            <div className="bg-orange-50 p-3 text-center text-[10px] font-black text-orange-400 uppercase tracking-widest shrink-0 flex items-center justify-center min-h-[41px]">
              Summary
            </div>
            {data.weeklySummaries.map((cell: any) => {
              let bgBorder = "bg-stone-50/50";
              if (cell.pnl > 0) bgBorder = "bg-orange-50";
              else if (cell.pnl < 0) bgBorder = "bg-red-50";

              return (
                <div key={cell.id} className={`${bgBorder} min-h-[110px] p-3 flex flex-col justify-center items-center flex-1`}>
                  {cell.pnl !== 0 && (
                    <>
                      <div className={`text-base font-black ${cell.pnl > 0 ? 'text-orange-400' : 'text-red-900'} mb-1`}>
                        {cell.pnl < 0 ? '-' : ''}${formatNumber(Math.abs(cell.pnl))}
                      </div>
                      <div className={`text-xs font-bold ${cell.rr > 0 ? 'text-orange-400' : cell.rr < 0 ? 'text-red-900' : 'text-stone-400'} tracking-tight`}>
                        {formatNumber(cell.rr)}R
                      </div>
                      <div className="text-[9px] font-bold text-stone-400 uppercase tracking-tighter mt-1">
                        Trades : {cell.count}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
