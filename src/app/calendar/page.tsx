"use client";

import { useJournalStore } from "@/store/useJournalStore";
import { useState, useMemo, useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { weekdayTargets, weekTotals } from "@/lib/dailyTarget";
import { useDailyTargets } from "@/components/useDailyTargets";
import { SegmentBar } from "@/components/DailyTargetBar";
import DayNoteModal, { MoodIcon, moodTone } from "@/components/DayNoteModal";
import WeekNoteModal from "@/components/WeekNoteModal";
import { weekKeyOf } from "@/lib/weekNotes";
import { dayKey, dayKeyOfTime } from "@/lib/dayNotes";
import { useTradingDay } from "@/components/useTradingDay";
import { formatNumber, fitFontSize } from "@/lib/utils";
import { classifyTrade } from "@/lib/stats";
import { addMoney } from "@/lib/money";
import { summarizeYear } from "@/lib/calendarYear";
import { loadBahtRate, formatApproxBaht, formatPnl, toBaht, type BahtRate } from "@/lib/bahtRate";

import PageHeader from "@/components/PageHeader";
type CalendarView = 'month' | 'year';
const VIEW_KEY = 'calendarView';
type CalendarCurrency = 'USD' | 'THB';
const CURRENCY_KEY = 'calendarCurrency';

// Below Tailwind's md breakpoint the day cells are about 46px wide.
const isPhone = () => window.matchMedia('(max-width: 767px)').matches;

// A day's P&L for a phone cell: no "$", whole dollars from 1,000 up, and K / M from 100,000 up so it still fits. The day popup has the exact figure.
// In baht (with `rate`), whole baht and no "฿", shortened the same way.
const cellMoney = (pnl: number, rate?: number | null) => {
  const value = rate ? Math.round(toBaht(pnl, rate)) : pnl;
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  // Rounded first, so 999,600 reads 1.00M rather than 1000K, and 9,996,000 reads 10.0M rather than 10.00M.
  if (abs >= 100_000 && Math.round(abs / 1000) < 1000) return `${sign}${Math.round(abs / 1000)}K`;
  if (abs >= 100_000) {
    const millions = abs / 1_000_000;
    return `${sign}${Number(millions.toFixed(2)) >= 10 ? millions.toFixed(1) : millions.toFixed(2)}M`;
  }
  if (rate || abs >= 1000) return `${sign}${Math.round(abs).toLocaleString('en-US')}`;
  return `${sign}${formatNumber(abs)}`;
};

// Font size for a figure in a phone cell (an @container): `max`, or smaller when a long figure would not fit.
// 180 keeps a figure within about 95% of the cell, measured at 375px wide (the smallest iPhone).
// The target line along the bottom of a day or week cell: thin on a phone, a little thicker on a computer. Its
// unfilled part is the same grey as the Dashboard's (line), so a bar short of the target reads apart from a full line.
const TARGET_LINE_HEIGHT = "h-[3px] md:h-1.5";
const TARGET_LINE_TRACK = "bg-line";

const phoneFit = (text: string, max: string) => fitFontSize(text, max, 180);

export default function CalendarPage() {
  const { trades, dayNotes, weekNotes, isLoading, isPrivacyMode } = useJournalStore();
  const { days: targetDays, pct: targetPct, today: targetToday } = useDailyTargets();
  const [openNote, setOpenNote] = useState<{ date: string; edit: boolean } | null>(null);
  const [openWeekNote, setOpenWeekNote] = useState<{ week: string; edit: boolean } | null>(null);
  const notesByDay = useMemo(() => new Map(dayNotes.map(n => [n.date, n])), [dayNotes]);
  const notesByWeek = useMemo(() => new Map(weekNotes.map(n => [n.week, n])), [weekNotes]);
  const { startHour, hourNow, today } = useTradingDay();
  const [currentDate, setCurrentDate] = useState(() => new Date(`${today}T00:00:00`));
  const [statIndex, setStatIndex] = useState(1); // PnL
  const touchStartX = useRef<number | null>(null);

  // Month or year view, remembered on this device. The page only renders after sign-in, in the browser.
  const [view, setView] = useState<CalendarView>(() => {
    try { return localStorage.getItem(VIEW_KEY) === 'year' ? 'year' : 'month'; } catch { return 'month'; }
  });
  const changeView = (next: CalendarView) => {
    setView(next);
    try { localStorage.setItem(VIEW_KEY, next); } catch { }
  };
  // Dollars or baht at today's reference rate, remembered on this device. Without a rate the page stays in dollars.
  const [currency, setCurrency] = useState<CalendarCurrency>(() => {
    try { return localStorage.getItem(CURRENCY_KEY) === 'THB' ? 'THB' : 'USD'; } catch { return 'USD'; }
  });
  const changeCurrency = (next: CalendarCurrency) => {
    setCurrency(next);
    try { localStorage.setItem(CURRENCY_KEY, next); } catch { }
  };
  const [bahtRate, setBahtRate] = useState<BahtRate | null>(null);
  useEffect(() => {
    let isMounted = true;
    loadBahtRate().then(rate => { if (isMounted) setBahtRate(rate); });
    return () => { isMounted = false; };
  }, []);
  const rate = currency === 'THB' && bahtRate ? bahtRate.rate : null;
  const bahtRateNote = bahtRate ? `Rough estimate at 1 USD = ${bahtRate.rate.toFixed(2)} THB (reference rate of ${bahtRate.date}). A bank pays less.` : undefined;

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
    setCurrentDate(new Date(`${today}T00:00:00`));
  };

  const jumpToYear = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setCurrentDate(prev => new Date(parseInt(e.target.value), prev.getMonth(), 1));
  };

  const data = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    // Days are trading days: before the start hour (Settings) it is still yesterday, and a trade closed
    // then counts for yesterday.
    const isCurrentMonth = today.startsWith(`${year}-${String(month + 1).padStart(2, '0')}-`);
    const currentDay = Number(today.slice(8, 10));

    const firstDay = new Date(year, month, 1).getDay(); // Sunday is 0, Monday is 1, etc.
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const statsMap: Record<number, { pnl: number, count: number, rr: number }> = {};
    let mWins = 0;
    let mLosses = 0;
    let mTotalTradesAll = 0;

    trades.forEach(t => {
      const key = dayKeyOfTime(t.time, startHour);
      if (key && Number(key.slice(0, 4)) === year && Number(key.slice(5, 7)) === month + 1) {
        const date = Number(key.slice(8, 10));
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

    const availableYears = Array.from(new Set(trades.flatMap(t => {
      const key = dayKeyOfTime(t.time, startHour);
      return key ? [Number(key.slice(0, 4))] : [];
    }))).sort((a, b) => b - a);
    const thisYear = Number(today.slice(0, 4));
    if (!availableYears.includes(thisYear)) {
      availableYears.unshift(thisYear);
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
  }, [trades, currentDate, startHour, today]);

  const yearData = useMemo(() => summarizeYear(trades, currentDate.getFullYear(), startHour), [trades, currentDate, startHour]);
  const headline = view === 'year'
    ? { label: String(currentDate.getFullYear()), count: yearData.count, net: yearData.pnl, rr: yearData.rr, winRate: yearData.winRate }
    : { label: data.monthLabel, count: data.mTotalTradesAll, net: data.mNet, rr: data.mRR, winRate: data.winRate };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-ink-muted font-semibold animate-pulse">Loading calendar...</p>
      </div>
    );
  }

  // The month or year's figures: all four beside the title on a computer, one at a time on a phone.
  const stats = [
    { label: 'Trades', value: String(headline.count), tone: 'text-ink-faint' },
    { label: 'PnL', value: isPrivacyMode ? '***' : rate ? formatApproxBaht(headline.net, rate) : `${headline.net < 0 ? '-' : ''}$${formatNumber(Math.abs(headline.net))}`, tone: headline.net > 0 ? 'text-accent' : headline.net < 0 ? 'text-loss' : 'text-ink-faint', title: rate ? bahtRateNote : undefined },
    { label: 'RR', value: `${formatNumber(headline.rr)} R`, tone: 'text-ink-faint' },
    { label: 'Win Rate', value: `${formatNumber(headline.winRate)}%`, tone: 'text-accent' },
  ];
  const shownStat = stats[statIndex];
  const stepStat = (offset: number) => setStatIndex(i => (i + offset + stats.length) % stats.length);

  return (
    <div className="space-y-6">
      <PageHeader title="Calendar">
        <div className="hidden md:flex gap-4 items-center justify-end">
          {stats.map((stat, i) => (
            <div key={stat.label} className="flex items-center gap-4">
              {i > 0 && <div className="w-[1px] bg-line h-8 shrink-0"></div>}
              <div className="flex flex-col justify-center items-center text-center shrink-0 px-2">
                <span className="text-[9px] leading-none font-black text-ink-faint uppercase tracking-widest mb-1">{stat.label}</span>
                <span title={stat.title} className={`text-lg leading-none font-black ${stat.tone}`}>{stat.value}</span>
              </div>
            </div>
          ))}
        </div>
        {/* Phone: one figure, stepped with the small arrows or a swipe, going round. */}
        <div
          className="md:hidden flex flex-col items-center text-center shrink-0 min-w-[120px] select-none"
          onTouchStart={(e) => { touchStartX.current = e.touches[0].clientX; }}
          onTouchEnd={(e) => {
            if (touchStartX.current === null) return;
            const dx = e.changedTouches[0].clientX - touchStartX.current;
            touchStartX.current = null;
            if (Math.abs(dx) > 30) stepStat(dx < 0 ? 1 : -1);
          }}
        >
          <div className="flex items-center gap-3 mb-1">
            <button onClick={() => stepStat(-1)} aria-label="Previous figure" className="p-2 -m-2 text-ink-disabled hover:text-ink-muted transition">
              <ChevronLeft className="w-3 h-3" strokeWidth={3} />
            </button>
            <span className="text-[9px] leading-none font-black text-ink-faint uppercase tracking-widest min-w-[52px]">{shownStat.label}</span>
            <button onClick={() => stepStat(1)} aria-label="Next figure" className="p-2 -m-2 text-ink-disabled hover:text-ink-muted transition">
              <ChevronRight className="w-3 h-3" strokeWidth={3} />
            </button>
          </div>
          <span title={shownStat.title} className={`text-lg font-black leading-none ${shownStat.tone}`}>{shownStat.value}</span>
        </div>
      </PageHeader>
      <div className="glass-card p-3 md:p-8">
        <div className="flex flex-col md:flex-row justify-between items-center mb-4 md:mb-8 gap-2 md:gap-4">
          <div className="flex items-center md:-ml-3">
            <button onClick={() => changeMonth(-1)} className="p-2 md:p-3 hover:bg-surface-2 rounded-full text-ink-faint transition">
              <ChevronLeft className="w-5 h-5 md:w-6 md:h-6" strokeWidth={2.5} />
            </button>
            <h2 className="text-xl md:text-3xl font-extrabold text-ink min-w-[100px] md:min-w-[145px] text-center tracking-tight">
              {headline.label}
            </h2>
            <button onClick={() => changeMonth(1)} className="p-2 md:p-3 hover:bg-surface-2 rounded-full text-ink-faint transition">
              <ChevronRight className="w-5 h-5 md:w-6 md:h-6" strokeWidth={2.5} />
            </button>
          </div>
          <div className="flex items-center gap-1 md:gap-2">
            <div className="flex bg-surface-2 rounded-lg p-0.5">
              {(['month', 'year'] as const).map(v => (
                <button
                  key={v}
                  onClick={() => changeView(v)}
                  className={`h-7 px-2.5 md:px-3 text-xs font-bold rounded-md uppercase md:tracking-wider transition ${view === v ? 'bg-card text-accent shadow-sm' : 'text-ink-faint hover:text-ink'}`}
                >
                  {v}
                </button>
              ))}
            </div>
            <div className="flex bg-surface-2 rounded-lg p-0.5" title={bahtRate ? bahtRateNote : 'The exchange rate could not be loaded'}>
              {(['USD', 'THB'] as const).map(c => (
                <button
                  key={c}
                  onClick={() => changeCurrency(c)}
                  disabled={c === 'THB' && !bahtRate}
                  className={`h-7 min-w-8 px-2.5 text-xs font-bold rounded-md transition disabled:opacity-40 disabled:cursor-not-allowed ${(c === 'THB' ? !!rate : !rate) ? 'bg-card text-accent shadow-sm' : 'text-ink-faint hover:text-ink'}`}
                >
                  {c === 'USD' ? '$' : '฿'}
                </button>
              ))}
            </div>
            <button onClick={goToToday} className="h-8 px-3 md:px-4 bg-accent hover:bg-accent-strong text-white text-xs font-bold rounded-lg transition uppercase md:tracking-wider">
              Today
            </button>
            <select value={data.year} onChange={jumpToYear} className="bg-surface border border-line text-ink text-xs font-bold rounded-lg h-8 px-2 md:px-3 py-0 shadow-sm focus:outline-none focus:border-accent cursor-pointer">
              {data.availableYears.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>

        {view === 'year' ? (
          <YearGrid year={yearData} isPrivacyMode={isPrivacyMode} rate={rate} onOpenMonth={openMonth} notesByWeek={notesByWeek} onOpenWeekNote={(week, edit) => setOpenWeekNote({ week, edit })} />
        ) : (
        <div className="flex flex-col xl:flex-row gap-4">
          <div className="calendar-grid flex-1">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(dayName => (
              <div key={dayName} className="bg-surface px-0 py-2 md:p-3 text-center text-[10px] font-black text-ink-faint uppercase tracking-widest">
                {dayName}
              </div>
            ))}
            {data.daysArray.map((cell: any) => {
              if (cell.type === 'empty') {
                return <div key={cell.id} className="bg-surface-2 min-h-[68px] md:min-h-[110px]"></div>;
              }

              const { day, isToday, stats } = cell;
              const date = dayKey(new Date(currentDate.getFullYear(), currentDate.getMonth(), day));
              const note = notesByDay.get(date);
              let bgColor = "bg-card";
              if (stats) {
                bgColor = stats.pnl > 0 ? "bg-accent-soft" : (stats.pnl < 0 ? "bg-loss-soft" : "bg-surface");
              }

              const noteControl = <NoteControl mood={note?.mood} hasNote={!!note} onOpen={(edit) => setOpenNote({ date, edit })} />;
              // The daily target, as a line along the bottom of the cell: full orange once the day reached it (trading
              // on after it is warned about on the Dashboard only). Today, short of it, the line is a bar of how far the
              // day has come, as on the Dashboard (no marks, no flame), with the loss side holding the deepest point of
              // the current dip; reaching the target fills it into the full line.
              const targetDay = targetDays.get(date);
              const todayBar = date === targetToday && targetDay && targetDay.target > 0 && !targetDay.hitAt ? (() => {
                const share = Math.max(-1, Math.min(1, targetDay.pnl / targetDay.target));
                const depth = targetDay.pnl > 0 ? 0 : Math.min(1, Math.max(-share, -targetDay.lowPnl / targetDay.target));
                const title = isPrivacyMode
                  ? `Today's target: ${Math.round((targetDay.pnl / targetDay.target) * 100)}%`
                  : `Today's target: ${formatPnl(targetDay.pnl, rate)} / ${formatPnl(targetDay.target, rate)}`;
                return { share, depth, title };
              })() : null;

              return (
                <div
                  key={cell.id}
                  className={`${bgColor} relative @container group min-h-[68px] md:min-h-[110px] p-1 pb-2 md:p-3 md:pb-[18px] flex flex-col select-none touch-manipulation`}
                  title={note ? "Double-click to edit the note" : "Double-click to write a note"}
                  onDoubleClick={() => setOpenNote({ date, edit: true })}
                  // A phone has no hover or double-click: one tap opens the day.
                  onClick={() => { if (isPhone()) setOpenNote({ date, edit: false }); }}
                >
                  <div className="flex items-start justify-between h-5 md:h-6">
                    <span className="flex items-center gap-1.5">
                      {isToday ? (
                        <span className="text-xs font-bold bg-accent text-white w-5 h-5 md:w-6 md:h-6 flex items-center justify-center rounded-full shadow-sm">{day}</span>
                      ) : (
                        <span className="text-xs font-bold text-ink-faint">{day}</span>
                      )}
                    </span>
                    {/* On a phone the cell is too small for a bottom row, so the note stays up here. */}
                    <span className="md:hidden">{noteControl}</span>
                  </div>
                  {/* The daily target line, kept a little in from the cell's edges. */}
                  {todayBar && (
                    <span title={todayBar.title} className="absolute inset-x-1.5 bottom-1 md:inset-x-3 md:bottom-1.5">
                      <SegmentBar share={todayBar.share} depth={todayBar.depth} isShown isHit={false} isPlain heightClass={TARGET_LINE_HEIGHT} trackClass={TARGET_LINE_TRACK} />
                    </span>
                  )}
                  {targetDay?.hitAt && (
                    <span title="Target reached" className={`absolute inset-x-1.5 bottom-1 md:inset-x-3 md:bottom-1.5 ${TARGET_LINE_HEIGHT} rounded-full bg-accent`} />
                  )}

                  {stats && (
                    <div className="mt-auto md:hidden text-center leading-tight">
                      <div style={phoneFit(isPrivacyMode ? `${formatNumber(stats.rr)}R` : cellMoney(stats.pnl, rate), '10px')} className={`whitespace-nowrap font-black tracking-tighter tabular-nums ${
                        (isPrivacyMode ? stats.rr : stats.pnl) > 0 ? 'text-accent' :
                        (isPrivacyMode ? stats.rr : stats.pnl) < 0 ? 'text-loss' : 'text-ink-faint'
                      }`}>
                        {isPrivacyMode ? `${formatNumber(stats.rr)}R` : cellMoney(stats.pnl, rate)}
                      </div>
                      {!isPrivacyMode && (
                        <div style={phoneFit(`${formatNumber(stats.rr)}R`, '9px')} className={`whitespace-nowrap font-bold tracking-tighter tabular-nums ${stats.rr > 0 ? 'text-accent' : stats.rr < 0 ? 'text-loss' : 'text-ink-faint'}`}>
                          {formatNumber(stats.rr)}R
                        </div>
                      )}
                    </div>
                  )}
                  <div className="mt-auto hidden md:flex items-end justify-between gap-1">
                    <div className="min-w-0">
                    {stats && (
                    <>
                      {/* 16px, or smaller when a long figure would not fit the cell; 160 leaves room for the note icon beside it. */}
                      <div style={fitFontSize(isPrivacyMode ? `${formatNumber(stats.rr)} R` : formatPnl(stats.pnl, rate), '1rem', 160)} className={`leading-6 font-black whitespace-nowrap ${
                        (isPrivacyMode ? stats.rr : stats.pnl) > 0 ? 'text-accent' : 
                        (isPrivacyMode ? stats.rr : stats.pnl) < 0 ? 'text-loss' : 'text-ink-faint'
                      }`}>
                        {isPrivacyMode ? (
                          `${formatNumber(stats.rr)} R`
                        ) : (
                          formatPnl(stats.pnl, rate)
                        )}
                      </div>
                      {!isPrivacyMode && (
                        <div className={`text-[10px] font-bold ${stats.rr > 0 ? 'text-accent' : stats.rr < 0 ? 'text-loss' : 'text-ink-faint'} tracking-tight mt-1`}>
                          {formatNumber(stats.rr)} R
                        </div>
                      )}
                      <div className="text-[9px] font-normal text-ink-faint uppercase tracking-tighter mt-0.5">
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

          <div className="w-full xl:w-[140px] shrink-0 flex flex-col bg-line gap-[1px] border border-line rounded-xl overflow-hidden">
            <div className="bg-accent-soft p-3 text-center text-[10px] font-black text-accent uppercase tracking-widest shrink-0 flex items-center justify-center xl:min-h-[41px]">
              Summary
            </div>
            {data.weeklySummaries.map((cell: any, index: number) => {
              let bgBorder = "bg-surface-2";
              if (cell.pnl > 0) bgBorder = "bg-accent-soft";
              else if (cell.pnl < 0) bgBorder = "bg-loss-soft";
              const weekNote = notesByWeek.get(cell.week);
              // The whole week (also its days in the next or last month), as on the Dashboard: its P&L reached the
              // sum of its days' targets up to today.
              const weekSum = weekTotals(weekdayTargets(targetDays, targetToday, cell.week));
              const isWeekHit = weekSum.target > 0 && weekSum.pnl >= weekSum.target;
              // Shown as the days' target line along the bottom: short of it, a bar of how far the week has come (orange
              // right of 0, red left of it when the week is down); reached, the full orange line. Falling back under
              // the target brings the bar back.
              const weekShare = weekSum.target > 0 ? Math.max(-1, Math.min(1, weekSum.pnl / weekSum.target)) : 0;
              const weekTitle = isPrivacyMode
                ? `Week target: ${weekSum.target > 0 ? Math.round((weekSum.pnl / weekSum.target) * 100) : 0}%`
                : `Week target: ${formatPnl(weekSum.pnl, rate)} / ${formatPnl(weekSum.target, rate)}`;

              return (
                <div
                  key={cell.id}
                  className={`${bgBorder} relative group px-4 py-2.5 md:pb-3.5 xl:p-3 xl:pb-[18px] xl:min-h-[110px] flex xl:flex-col items-center xl:items-stretch gap-4 xl:gap-0 flex-1 select-none touch-manipulation`}
                  title={weekNote ? "Double-click to edit the week's note" : "Double-click to write a note for the week"}
                  onDoubleClick={() => setOpenWeekNote({ week: cell.week, edit: true })}
                  // A phone has no hover or double-click: one tap opens the week.
                  onClick={() => { if (isPhone()) setOpenWeekNote({ week: cell.week, edit: false }); }}
                >
                  {isWeekHit ? (
                    <span title={weekTitle} className={`absolute inset-x-4 bottom-1 xl:inset-x-3 xl:bottom-1.5 ${TARGET_LINE_HEIGHT} rounded-full bg-accent`} />
                  ) : weekSum.target > 0 && (
                    <span title={weekTitle} className="absolute inset-x-4 bottom-1 xl:inset-x-3 xl:bottom-1.5">
                      <SegmentBar share={weekShare} depth={weekSum.pnl > 0 ? 0 : -weekShare} isShown isHit={false} isPlain heightClass={TARGET_LINE_HEIGHT} trackClass={TARGET_LINE_TRACK} />
                    </span>
                  )}
                  <span className="mr-auto xl:mr-0 text-[10px] font-black text-ink-faint uppercase tracking-widest xl:h-6">
                    <span className="xl:hidden">Week </span><span className="hidden xl:inline">W</span>{index + 1}
                  </span>
                  <div className="xl:mt-auto flex items-center xl:items-end justify-end xl:justify-between gap-4 xl:gap-1">
                    <div className="min-w-0 flex xl:block items-center gap-4">
                      {cell.count > 0 && (
                        <>
                          {!isPrivacyMode && (
                            <div className={`text-sm xl:text-base font-black ${cell.pnl > 0 ? 'text-accent' : cell.pnl < 0 ? 'text-loss' : 'text-ink-faint'}`}>
                              {formatPnl(cell.pnl, rate)}
                            </div>
                          )}
                          <div className={`${isPrivacyMode ? 'text-sm xl:text-base' : 'text-xs xl:text-[10px] xl:mt-1'} font-black xl:font-bold ${cell.rr > 0 ? 'text-accent' : cell.rr < 0 ? 'text-loss' : 'text-ink-faint'} tracking-tight`}>
                            {formatNumber(cell.rr)} R
                          </div>
                          <div className="text-[9px] font-normal text-ink-faint uppercase tracking-tighter xl:mt-0.5">
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

      {((view === 'month' && targetPct > 0) || hourNow > 0) && (
        <div className="-mt-3 px-1 md:px-2 space-y-1.5 text-[10px] font-bold text-ink-faint">
          {view === 'month' && targetPct > 0 && (
            <div className="flex flex-wrap items-center justify-center md:justify-start gap-x-5 gap-y-1">
              {/* The line along the bottom of a day or a week: a bar while short of the target, full once reached. */}
              <span className="flex items-center gap-1.5">
                <span className="w-4 h-[3px] rounded-full bg-line overflow-hidden"><span className="block h-full w-1/2 rounded-full bg-accent" /></span>
                Progress to the target
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-4 h-[3px] rounded-full bg-accent" />
                Target reached
              </span>
            </div>
          )}
          {/* Why a month here can differ a little from the monthly statement, which keeps the real date. */}
          {hourNow > 0 && (
            <p className="text-center md:text-left font-normal">
              Days start at {String(hourNow).padStart(2, '0')}:00 (Settings): a trade closed before then counts for the day before. The statement keeps the real date.
            </p>
          )}
        </div>
      )}

      {openNote && <DayNoteModal key={openNote.date} date={openNote.date} startEditing={openNote.edit} bahtRate={rate} onClose={() => setOpenNote(null)} />}
      {openWeekNote && (
        <WeekNoteModal
          key={openWeekNote.week}
          week={openWeekNote.week}
          startEditing={openWeekNote.edit}
          bahtRate={rate}
          onClose={() => setOpenWeekNote(null)}
          onOpenDay={(date) => { setOpenWeekNote(null); setOpenNote({ date, edit: false }); }}
        />
      )}
    </div>
  );
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const toneOf = (n: number) => (n > 0 ? 'text-accent' : n < 0 ? 'text-loss' : 'text-ink-faint');
const bgOf = (pnl: number, count: number) => (!count ? 'bg-card' : pnl > 0 ? 'bg-accent-soft' : pnl < 0 ? 'bg-loss-soft' : 'bg-surface');

// One row per month, one cell per week. No notes here: those live on days. The months' totals sit
// in their own column beside the grid, like the Summary column of the month view; every row has the
// same height so that column's cells line up with the rows.
interface YearGridProps {
  year: ReturnType<typeof summarizeYear>;
  isPrivacyMode: boolean;
  rate: number | null; // baht per dollar when the page shows baht
  onOpenMonth: (month: number) => void;
  notesByWeek: Map<string, { mood: string }>;
  onOpenWeekNote: (week: string, edit: boolean) => void;
}

function YearGrid({ year, isPrivacyMode, rate, onOpenMonth, notesByWeek, onOpenWeekNote }: YearGridProps) {
  return (
    <div className="flex flex-col xl:flex-row gap-4">
      <div className="flex-1 grid grid-cols-[48px_repeat(6,minmax(0,1fr))] md:grid-cols-[64px_repeat(6,minmax(0,1fr))] gap-[1px] bg-line border border-line rounded-xl overflow-hidden">
        <div className="bg-surface h-10"></div>
        {[1, 2, 3, 4, 5, 6].map(n => (
          <div key={n} className="bg-surface h-10 flex items-center justify-center text-[10px] font-black text-ink-faint uppercase tracking-widest">W{n}</div>
        ))}

        {year.months.map(m => (
          <div key={m.month} className="contents">
            <button
              type="button"
              onClick={() => onOpenMonth(m.month)}
              title="Open this month"
              className="bg-surface hover:bg-surface-2 transition p-1 md:p-3 flex flex-col items-center justify-center text-center"
            >
              <span className="text-[10px] md:text-xs font-black text-ink uppercase tracking-widest">{MONTH_NAMES[m.month]}</span>
              {/* Until the month column fits beside the grid, the total sits under the name. */}
              {m.count > 0 && (
                <span className={`xl:hidden text-[9px] font-bold tracking-tighter tabular-nums ${toneOf(isPrivacyMode ? m.rr : m.pnl)}`}>
                  {isPrivacyMode ? `${formatNumber(m.rr)}R` : cellMoney(m.pnl, rate)}
                </span>
              )}
            </button>

            {Array.from({ length: 6 }, (_, i) => {
              const w = m.weeks[i];
              if (!w) return <div key={i} className="bg-surface-2"></div>;
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
                  className={`${bgOf(w.pnl, w.count)} @container group cursor-pointer hover:brightness-95 transition min-h-[56px] md:min-h-[92px] p-1 md:p-3 flex flex-col text-left select-none`}
                >
                  <div className="flex items-start justify-between">
                    <span className={`text-[9px] md:text-[10px] font-bold tabular-nums ${w.isFuture ? 'text-ink-disabled' : 'text-ink-faint'}`}>
                      {w.startDay === w.endDay ? w.startDay : `${w.startDay}–${w.endDay}`}
                    </span>
                    {/* On a phone the cell is too small for a bottom row, so the note stays up here. */}
                    <span className="md:hidden">{noteControl}</span>
                  </div>
                  {w.count > 0 && (
                    <div className="mt-auto md:hidden w-full text-center leading-tight">
                      <div style={phoneFit(isPrivacyMode ? `${formatNumber(w.rr)}R` : cellMoney(w.pnl, rate), '10px')} className={`whitespace-nowrap font-black tracking-tighter tabular-nums ${toneOf(isPrivacyMode ? w.rr : w.pnl)}`}>
                        {isPrivacyMode ? `${formatNumber(w.rr)}R` : cellMoney(w.pnl, rate)}
                      </div>
                      {!isPrivacyMode && (
                        <div style={phoneFit(`${formatNumber(w.rr)}R`, '9px')} className={`whitespace-nowrap font-bold tracking-tighter tabular-nums ${toneOf(w.rr)}`}>{formatNumber(w.rr)}R</div>
                      )}
                    </div>
                  )}
                  <div className="mt-auto hidden md:flex items-end justify-between gap-1">
                  {w.count > 0 && (
                    <>
                      <div className="min-w-0">
                        <div className={`text-sm font-black ${toneOf(isPrivacyMode ? w.rr : w.pnl)}`}>
                          {isPrivacyMode ? `${formatNumber(w.rr)} R` : formatPnl(w.pnl, rate)}
                        </div>
                        {!isPrivacyMode && (
                          <div className={`text-[10px] font-bold tracking-tight ${toneOf(w.rr)}`}>{formatNumber(w.rr)} R</div>
                        )}
                        <div className="text-[9px] font-normal text-ink-faint uppercase tracking-tighter mt-0.5">Trades : {w.count}</div>
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

      <div className="hidden xl:flex w-[140px] shrink-0 flex-col bg-line gap-[1px] border border-line rounded-xl overflow-hidden">
        <div className="bg-accent-soft h-10 shrink-0 flex items-center justify-center text-[10px] font-black text-accent uppercase tracking-widest">
          Month
        </div>
        {year.months.map(m => (
          <div key={m.month} className={`${bgOf(m.pnl, m.count)} flex-1 p-3 flex flex-col items-center justify-center text-center`}>
            {m.count > 0 && (
              <>
                {!isPrivacyMode && <div className={`text-base font-black ${toneOf(m.pnl)} mb-1`}>{formatPnl(m.pnl, rate)}</div>}
                <div className={`${isPrivacyMode ? 'text-base mb-1' : 'text-xs'} font-black tracking-tight ${toneOf(m.rr)}`}>{formatNumber(m.rr)} R</div>
                <div className="text-[9px] font-normal text-ink-faint uppercase tracking-tighter mt-1">Trades : {m.count}</div>
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
      className={`block text-ink-faint md:opacity-40 md:hover:opacity-100 ${moodTone(mood).hoverText} hover:scale-110 transition`}
    >
      <MoodIcon mood={mood} className="w-4 h-4 md:w-5 md:h-5" />
    </button>
  ) : (
    <button
      type="button"
      title={`Write ${label}`}
      onClick={(e) => { e.stopPropagation(); onOpen(true); }}
      onDoubleClick={(e) => e.stopPropagation()}
      className="hidden md:block text-ink-disabled hover:text-accent opacity-0 group-hover:opacity-100 focus:opacity-100 transition"
    >
      <Plus className="w-4 h-4" />
    </button>
  );
}
