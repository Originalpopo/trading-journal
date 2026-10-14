"use client";

import { useJournalStore } from "@/store/useJournalStore";
import { useState, useMemo } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import DayNoteModal, { MoodIcon, moodTone } from "@/components/DayNoteModal";
import WeekNoteModal from "@/components/WeekNoteModal";
import { weekKeyOf } from "@/lib/weekNotes";
import { dayKey } from "@/lib/dayNotes";
import { formatNumber } from "@/lib/utils";
import { classifyTrade } from "@/lib/stats";
import { addMoney } from "@/lib/money";
import { summarizeYear } from "@/lib/calendarYear";

type CalendarView = 'month' | 'year';
const VIEW_KEY = 'calendarView';

// Below Tailwind's md breakpoint the day cells are about 46px wide.
const isPhone = () => window.matchMedia('(max-width: 767px)').matches;

// A day's P&L for a phone cell: no "$", and whole dollars from 1,000 up so it still fits. The day popup has the exact figure.
const cellMoney = (pnl: number) => {
  const abs = Math.abs(pnl);
  return `${pnl < 0 ? '-' : ''}${abs >= 1000 ? Math.round(abs).toLocaleString('en-US') : formatNumber(abs)}`;
};

export default function CalendarPage() {
  const { trades, dayNotes, weekNotes, isLoading, isPrivacyMode } = useJournalStore();
  const [openNote, setOpenNote] = useState<{ date: string; edit: boolean } | null>(null);
  const [openWeekNote, setOpenWeekNote] = useState<{ week: string; edit: boolean } | null>(null);
  const notesByDay = useMemo(() => new Map(dayNotes.map(n => [n.date, n])), [dayNotes]);
  const notesByWeek = useMemo(() => new Map(weekNotes.map(n => [n.week, n])), [weekNotes]);
  const [currentDate, setCurrentDate] = useState(new Date());

  // Month or year view, remembered on this device. The page only renders after sign-in, in the browser.
  const [view, setView] = useState<CalendarView>(() => {
    try { return localStorage.getItem(VIEW_KEY) === 'year' ? 'year' : 'month'; } catch { return 'month'; }
  });
  const changeView = (next: CalendarView) => {
    setView(next);
    try { localStorage.setItem(VIEW_KEY, next); } catch { }
  };
  const openMonth = (month: number) => {
    setCurrentDate(new Date(currentDate.getFullYear(), month, 1));
    changeView('month');
  };

  // The arrows step a month in the month view and a year in the year view.
  const changeMonth = (offset: number) => {
    setCurrentDate(prev => view === 'year'
      ? new Date(prev.getFullYear() + offset, prev.getMonth(), 1)
      : new Date(prev.getFullYear(), prev.getMonth() + offset, 1));
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
        statsMap[date].pnl = addMoney(statsMap[date].pnl, t.profit);
        statsMap[date].count++;
        statsMap[date].rr += (t.rr || 0);

        mTotalTradesAll++;

        const outcome = classifyTrade(t);
        if (outcome === 'win') mWins++;
        else if (outcome === 'loss') mLosses++;
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
        mNet = addMoney(mNet, s.pnl);
        mRR += s.rr;
        currentWeekPnL = addMoney(currentWeekPnL, s.pnl);
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
          week: weekKeyOf(new Date(year, month, day)),
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
        week: weekKeyOf(new Date(year, month, daysInMonth)),
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
      monthLabel: new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric' }).format(currentDate),
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

  const yearData = useMemo(() => summarizeYear(trades, currentDate.getFullYear()), [trades, currentDate]);
  const headline = view === 'year'
    ? { label: String(currentDate.getFullYear()), count: yearData.count, net: yearData.pnl, rr: yearData.rr, winRate: yearData.winRate }
    : { label: data.monthLabel, count: data.mTotalTradesAll, net: data.mNet, rr: data.mRR, winRate: data.winRate };

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
        <div className="flex items-center gap-3">
          <h2 className="text-3xl font-extrabold text-stone-950 tracking-tight">Calendar</h2>
        </div>
      </div>
      <div className="glass-card p-3 md:p-8">
        <div className="flex flex-col md:flex-row justify-between items-center mb-4 md:mb-8 gap-4 md:gap-6">
          <div className="flex items-center justify-center md:justify-start gap-2 md:gap-4 flex-wrap">
            <div className="flex items-center md:-ml-3">
              <button onClick={() => changeMonth(-1)} className="p-2 md:p-3 hover:bg-stone-100 rounded-full text-stone-400 transition">
                <ChevronLeft className="w-5 h-5 md:w-6 md:h-6" strokeWidth={2.5} />
              </button>
              <h2 className="text-xl md:text-3xl font-extrabold text-stone-950 min-w-[100px] md:min-w-[145px] text-center tracking-tight">
                {headline.label}
              </h2>
              <button onClick={() => changeMonth(1)} className="p-2 md:p-3 hover:bg-stone-100 rounded-full text-stone-400 transition">
                <ChevronRight className="w-5 h-5 md:w-6 md:h-6" strokeWidth={2.5} />
              </button>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex bg-stone-100 rounded-lg p-0.5">
                {(['month', 'year'] as const).map(v => (
                  <button
                    key={v}
                    onClick={() => changeView(v)}
                    className={`px-3 py-1.5 text-xs font-bold rounded-md uppercase tracking-wider transition ${view === v ? 'bg-white text-orange-400 shadow-sm' : 'text-stone-400 hover:text-stone-600'}`}
                  >
                    {v}
                  </button>
                ))}
              </div>
              <button onClick={goToToday} className="px-4 py-2 bg-orange-400 hover:bg-orange-500 text-white text-xs font-bold rounded-lg transition uppercase tracking-wider">
                Today
              </button>
              <select value={data.year} onChange={jumpToYear} className="bg-stone-50 border border-stone-200 text-stone-950 text-xs font-bold rounded-lg px-3 py-2 shadow-sm focus:outline-none focus:border-orange-400 cursor-pointer">
                {data.availableYears.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </div>
          <div className="flex md:gap-6 items-center w-full md:w-auto justify-around md:justify-end">
            <div className="flex flex-col justify-center items-center text-center flex-1 min-w-0 md:flex-none md:shrink-0 px-1 md:px-2 py-1">
              <span className="text-[9px] font-black text-stone-400 uppercase tracking-widest mb-0.5">Trades</span>
              <span className="text-sm md:text-lg font-black text-stone-400">{headline.count}</span>
            </div>
            <div className="w-[1px] bg-stone-200 h-8 my-auto shrink-0"></div>
            <div className="flex flex-col justify-center items-center text-center flex-1 min-w-0 md:flex-none md:shrink-0 px-1 md:px-2 py-1">
              <span className="text-[9px] font-black text-stone-400 uppercase tracking-widest mb-0.5">PnL</span>
              <span className={`text-sm md:text-lg font-black ${headline.net > 0 ? 'text-orange-400' : headline.net < 0 ? 'text-red-900' : 'text-stone-400'}`}>
                {isPrivacyMode ? '***' : `${headline.net < 0 ? '-' : ''}$${formatNumber(Math.abs(headline.net))}`}
              </span>
            </div>
            <div className="w-[1px] bg-stone-200 h-8 my-auto shrink-0"></div>
            <div className="flex flex-col justify-center items-center text-center flex-1 min-w-0 md:flex-none md:shrink-0 px-1 md:px-2 py-1">
              <span className="text-[9px] font-black text-stone-400 uppercase tracking-widest mb-0.5">RR</span>
              <span className="text-sm md:text-lg font-black text-stone-400">
                {formatNumber(headline.rr)} R
              </span>
            </div>
            <div className="w-[1px] bg-stone-200 h-8 my-auto shrink-0"></div>
            <div className="flex flex-col justify-center items-center text-center flex-1 min-w-0 md:flex-none md:shrink-0 px-1 md:px-2 py-1">
              <span className="text-[9px] font-black text-stone-400 uppercase tracking-widest mb-0.5">Win Rate</span>
              <span className="text-sm md:text-lg font-black text-orange-400">{formatNumber(headline.winRate)}%</span>
            </div>
          </div>
        </div>

        {view === 'year' ? (
          <YearGrid year={yearData} isPrivacyMode={isPrivacyMode} onOpenMonth={openMonth} notesByWeek={notesByWeek} onOpenWeekNote={(week, edit) => setOpenWeekNote({ week, edit })} />
        ) : (
        <div className="flex flex-col xl:flex-row gap-4">
          <div className="calendar-grid flex-1">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(dayName => (
              <div key={dayName} className="bg-stone-50 px-0 py-2 md:p-3 text-center text-[10px] font-black text-stone-400 uppercase tracking-widest">
                {dayName}
              </div>
            ))}
            {data.daysArray.map((cell: any) => {
              if (cell.type === 'empty') {
                return <div key={cell.id} className="bg-stone-50/50 min-h-[68px] md:min-h-[110px]"></div>;
              }

              const { day, isToday, stats } = cell;
              const date = dayKey(new Date(currentDate.getFullYear(), currentDate.getMonth(), day));
              const note = notesByDay.get(date);
              let bgColor = "bg-white";
              if (stats) {
                bgColor = stats.pnl > 0 ? "bg-orange-50" : (stats.pnl < 0 ? "bg-red-50" : "bg-stone-50");
              }

              const noteControl = <NoteControl mood={note?.mood} hasNote={!!note} onOpen={(edit) => setOpenNote({ date, edit })} />;

              return (
                <div
                  key={cell.id}
                  className={`${bgColor} group min-h-[68px] md:min-h-[110px] p-1 md:p-3 flex flex-col select-none touch-manipulation`}
                  title={note ? "Double-click to edit the note" : "Double-click to write a note"}
                  onDoubleClick={() => setOpenNote({ date, edit: true })}
                  // A phone has no hover or double-click: one tap opens the day.
                  onClick={() => { if (isPhone()) setOpenNote({ date, edit: false }); }}
                >
                  <div className="flex items-start justify-between h-5 md:h-6">
                    {isToday ? (
                      <span className="text-xs font-bold bg-orange-400 text-white w-5 h-5 md:w-6 md:h-6 flex items-center justify-center rounded-full shadow-sm">{day}</span>
                    ) : (
                      <span className="text-xs font-bold text-stone-400">{day}</span>
                    )}
                    {/* On a phone the cell is too small for a bottom row, so the note stays up here. */}
                    <span className="md:hidden">{noteControl}</span>
                  </div>
                  
                  {stats && (
                    <div className="mt-auto md:hidden text-center leading-tight">
                      <div className={`text-[10px] font-black tracking-tighter tabular-nums ${
                        (isPrivacyMode ? stats.rr : stats.pnl) > 0 ? 'text-orange-400' :
                        (isPrivacyMode ? stats.rr : stats.pnl) < 0 ? 'text-red-900' : 'text-stone-400'
                      }`}>
                        {isPrivacyMode ? `${formatNumber(stats.rr)}R` : cellMoney(stats.pnl)}
                      </div>
                      {!isPrivacyMode && (
                        <div className={`text-[9px] font-bold tracking-tighter tabular-nums ${stats.rr > 0 ? 'text-orange-400' : stats.rr < 0 ? 'text-red-900' : 'text-stone-400'}`}>
                          {formatNumber(stats.rr)}R
                        </div>
                      )}
                    </div>
                  )}
                  <div className="mt-auto hidden md:flex items-end justify-between gap-1">
                    <div className="min-w-0">
                    {stats && (
                    <>
                      <div className={`text-base font-black ${
                        (isPrivacyMode ? stats.rr : stats.pnl) > 0 ? 'text-orange-400' : 
                        (isPrivacyMode ? stats.rr : stats.pnl) < 0 ? 'text-red-900' : 'text-stone-400'
                      }`}>
                        {isPrivacyMode ? (
                          `${formatNumber(stats.rr)} R`
                        ) : (
                          `${stats.pnl < 0 ? '-' : ''}$${formatNumber(Math.abs(stats.pnl))}`
                        )}
                      </div>
                      {!isPrivacyMode && (
                        <div className={`text-[10px] font-bold ${stats.rr > 0 ? 'text-orange-400' : stats.rr < 0 ? 'text-red-900' : 'text-stone-400'} tracking-tight mt-1`}>
                          {formatNumber(stats.rr)} R
                        </div>
                      )}
                      <div className="text-[9px] font-bold text-stone-400 uppercase tracking-tighter mt-0.5">
                        Trades : {stats.count}
                      </div>
                    </>
                    )}
                    </div>
                    {noteControl}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="w-full xl:w-[140px] shrink-0 flex flex-col bg-stone-200 gap-[1px] border border-stone-200 rounded-xl overflow-hidden">
            <div className="bg-orange-50 p-3 text-center text-[10px] font-black text-orange-400 uppercase tracking-widest shrink-0 flex items-center justify-center xl:min-h-[41px]">
              Summary
            </div>
            {data.weeklySummaries.map((cell: any, index: number) => {
              let bgBorder = "bg-stone-50/50";
              if (cell.pnl > 0) bgBorder = "bg-orange-50";
              else if (cell.pnl < 0) bgBorder = "bg-red-50";
              const weekNote = notesByWeek.get(cell.week);

              return (
                <div
                  key={cell.id}
                  className={`${bgBorder} group px-4 py-2.5 xl:p-3 xl:min-h-[110px] flex xl:flex-col items-center xl:items-stretch gap-4 xl:gap-0 flex-1 select-none touch-manipulation`}
                  title={weekNote ? "Double-click to edit the week's note" : "Double-click to write a note for the week"}
                  onDoubleClick={() => setOpenWeekNote({ week: cell.week, edit: true })}
                  // A phone has no hover or double-click: one tap opens the week.
                  onClick={() => { if (isPhone()) setOpenWeekNote({ week: cell.week, edit: false }); }}
                >
                  <span className="mr-auto xl:mr-0 text-[10px] font-black text-stone-400 uppercase tracking-widest xl:h-6">
                    <span className="xl:hidden">Week </span><span className="hidden xl:inline">W</span>{index + 1}
                  </span>
                  <div className="xl:mt-auto flex items-center xl:items-end justify-end xl:justify-between gap-4 xl:gap-1">
                    <div className="min-w-0 flex xl:block items-center gap-4">
                      {cell.count > 0 && (
                        <>
                          {!isPrivacyMode && (
                            <div className={`text-sm xl:text-base font-black ${cell.pnl > 0 ? 'text-orange-400' : cell.pnl < 0 ? 'text-red-900' : 'text-stone-400'}`}>
                              {cell.pnl < 0 ? '-' : ''}${formatNumber(Math.abs(cell.pnl))}
                            </div>
                          )}
                          <div className={`${isPrivacyMode ? 'text-sm xl:text-base' : 'text-xs xl:text-[10px] xl:mt-1'} font-black xl:font-bold ${cell.rr > 0 ? 'text-orange-400' : cell.rr < 0 ? 'text-red-900' : 'text-stone-400'} tracking-tight`}>
                            {formatNumber(cell.rr)} R
                          </div>
                          <div className="text-[9px] font-bold text-stone-400 uppercase tracking-tighter xl:mt-0.5">
                            Trades : {cell.count}
                          </div>
                        </>
                      )}
                    </div>
                    <NoteControl mood={weekNote?.mood} hasNote={!!weekNote} label="the week's note" onOpen={(edit) => setOpenWeekNote({ week: cell.week, edit })} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        )}
      </div>

      {openNote && <DayNoteModal key={openNote.date} date={openNote.date} startEditing={openNote.edit} onClose={() => setOpenNote(null)} />}
      {openWeekNote && (
        <WeekNoteModal
          key={openWeekNote.week}
          week={openWeekNote.week}
          startEditing={openWeekNote.edit}
          onClose={() => setOpenWeekNote(null)}
          onOpenDay={(date) => { setOpenWeekNote(null); setOpenNote({ date, edit: false }); }}
        />
      )}
    </div>
  );
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const toneOf = (n: number) => (n > 0 ? 'text-orange-400' : n < 0 ? 'text-red-900' : 'text-stone-400');
const bgOf = (pnl: number, count: number) => (!count ? 'bg-white' : pnl > 0 ? 'bg-orange-50' : pnl < 0 ? 'bg-red-50' : 'bg-stone-50');
const money = (pnl: number) => `${pnl < 0 ? '-' : ''}$${formatNumber(Math.abs(pnl))}`;

// One row per month, one cell per week. No notes here: those live on days. The months' totals sit
// in their own column beside the grid, like the Summary column of the month view; every row has the
// same height so that column's cells line up with the rows.
interface YearGridProps {
  year: ReturnType<typeof summarizeYear>;
  isPrivacyMode: boolean;
  onOpenMonth: (month: number) => void;
  notesByWeek: Map<string, { mood: string }>;
  onOpenWeekNote: (week: string, edit: boolean) => void;
}

function YearGrid({ year, isPrivacyMode, onOpenMonth, notesByWeek, onOpenWeekNote }: YearGridProps) {
  return (
    <div className="flex flex-col xl:flex-row gap-4">
      <div className="flex-1 grid grid-cols-[48px_repeat(6,minmax(0,1fr))] md:grid-cols-[64px_repeat(6,minmax(0,1fr))] gap-[1px] bg-stone-200 border border-stone-200 rounded-xl overflow-hidden">
        <div className="bg-stone-50 h-10"></div>
        {[1, 2, 3, 4, 5, 6].map(n => (
          <div key={n} className="bg-stone-50 h-10 flex items-center justify-center text-[10px] font-black text-stone-400 uppercase tracking-widest">W{n}</div>
        ))}

        {year.months.map(m => (
          <div key={m.month} className="contents">
            <button
              type="button"
              onClick={() => onOpenMonth(m.month)}
              title="Open this month"
              className="bg-stone-50 hover:bg-stone-100 transition p-1 md:p-3 flex flex-col items-center justify-center text-center"
            >
              <span className="text-[10px] md:text-xs font-black text-stone-950 uppercase tracking-widest">{MONTH_NAMES[m.month]}</span>
              {/* Until the month column fits beside the grid, the total sits under the name. */}
              {m.count > 0 && (
                <span className={`xl:hidden text-[9px] font-bold tracking-tighter tabular-nums ${toneOf(isPrivacyMode ? m.rr : m.pnl)}`}>
                  {isPrivacyMode ? `${formatNumber(m.rr)}R` : cellMoney(m.pnl)}
                </span>
              )}
            </button>

            {Array.from({ length: 6 }, (_, i) => {
              const w = m.weeks[i];
              if (!w) return <div key={i} className="bg-stone-50/50"></div>;
              const weekNote = notesByWeek.get(w.week);
              const noteControl = <NoteControl mood={weekNote?.mood} hasNote={!!weekNote} label="the week's note" onOpen={(edit) => onOpenWeekNote(w.week, edit)} />;
              return (
                <div
                  key={i}
                  role="button"
                  tabIndex={0}
                  onClick={() => onOpenMonth(m.month)}
                  onKeyDown={(e) => { if (e.key === 'Enter') onOpenMonth(m.month); }}
                  title="Open this month"
                  className={`${bgOf(w.pnl, w.count)} group cursor-pointer hover:brightness-95 transition min-h-[56px] md:min-h-[92px] p-1 md:p-3 flex flex-col text-left select-none`}
                >
                  <div className="flex items-start justify-between">
                    <span className={`text-[9px] md:text-[10px] font-bold tabular-nums ${w.isFuture ? 'text-stone-300' : 'text-stone-400'}`}>
                      {w.startDay === w.endDay ? w.startDay : `${w.startDay}–${w.endDay}`}
                    </span>
                    {/* On a phone the cell is too small for a bottom row, so the note stays up here. */}
                    <span className="md:hidden">{noteControl}</span>
                  </div>
                  {w.count > 0 && (
                    <div className="mt-auto md:hidden w-full text-center leading-tight">
                      <div className={`text-[10px] font-black tracking-tighter tabular-nums ${toneOf(isPrivacyMode ? w.rr : w.pnl)}`}>
                        {isPrivacyMode ? `${formatNumber(w.rr)}R` : cellMoney(w.pnl)}
                      </div>
                      {!isPrivacyMode && (
                        <div className={`text-[9px] font-bold tracking-tighter tabular-nums ${toneOf(w.rr)}`}>{formatNumber(w.rr)}R</div>
                      )}
                    </div>
                  )}
                  <div className="mt-auto hidden md:flex items-end justify-between gap-1">
                  {w.count > 0 && (
                    <>
                      <div className="min-w-0">
                        <div className={`text-sm font-black ${toneOf(isPrivacyMode ? w.rr : w.pnl)}`}>
                          {isPrivacyMode ? `${formatNumber(w.rr)} R` : money(w.pnl)}
                        </div>
                        {!isPrivacyMode && (
                          <div className={`text-[10px] font-bold tracking-tight ${toneOf(w.rr)}`}>{formatNumber(w.rr)} R</div>
                        )}
                        <div className="text-[9px] font-bold text-stone-400 uppercase tracking-tighter mt-0.5">Trades : {w.count}</div>
                      </div>
                    </>
                  )}
                    <span className="ml-auto">{noteControl}</span>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div className="hidden xl:flex w-[140px] shrink-0 flex-col bg-stone-200 gap-[1px] border border-stone-200 rounded-xl overflow-hidden">
        <div className="bg-orange-50 h-10 shrink-0 flex items-center justify-center text-[10px] font-black text-orange-400 uppercase tracking-widest">
          Month
        </div>
        {year.months.map(m => (
          <div key={m.month} className={`${bgOf(m.pnl, m.count)} flex-1 p-3 flex flex-col items-center justify-center text-center`}>
            {m.count > 0 && (
              <>
                {!isPrivacyMode && <div className={`text-base font-black ${toneOf(m.pnl)} mb-1`}>{money(m.pnl)}</div>}
                <div className={`${isPrivacyMode ? 'text-base mb-1' : 'text-xs'} font-black tracking-tight ${toneOf(m.rr)}`}>{formatNumber(m.rr)} R</div>
                <div className="text-[9px] font-bold text-stone-400 uppercase tracking-tighter mt-1">Trades : {m.count}</div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// A day's or week's note in its cell: the mood face when there is one, else a "+" that shows on hover.
// Clicks stay on the button, so the cell's own click or double-click does not fire too.
function NoteControl({ hasNote, mood, label = "the note", onOpen }: { hasNote: boolean; mood?: string; label?: string; onOpen: (edit: boolean) => void }) {
  return hasNote ? (
    <button
      type="button"
      title={`Read ${label}`}
      onClick={(e) => { e.stopPropagation(); onOpen(false); }}
      onDoubleClick={(e) => e.stopPropagation()}
      className={`block text-stone-400 md:opacity-40 md:hover:opacity-100 ${moodTone(mood).hoverText} hover:scale-110 transition`}
    >
      <MoodIcon mood={mood} className="w-4 h-4 md:w-5 md:h-5" />
    </button>
  ) : (
    <button
      type="button"
      title={`Write ${label}`}
      onClick={(e) => { e.stopPropagation(); onOpen(true); }}
      onDoubleClick={(e) => e.stopPropagation()}
      className="hidden md:block text-stone-300 hover:text-orange-400 opacity-0 group-hover:opacity-100 focus:opacity-100 transition"
    >
      <Plus className="w-4 h-4" />
    </button>
  );
}
