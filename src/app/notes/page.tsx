"use client";

import { useMemo, useState } from "react";
import { CalendarRange, PenLine, Plus, Search, XCircle } from "lucide-react";
import DisciplineSummary from "@/components/DisciplineSummary";
import { useJournalStore } from "@/store/useJournalStore";
import DayNoteModal, { MoodIcon, moodTone, formatDayLabel } from "@/components/DayNoteModal";
import WeekNoteModal from "@/components/WeekNoteModal";
import { summarizeDay, type DaySummary } from "@/lib/dayNotes";
import { useTradingDay } from "@/components/useTradingDay";
import { weekKeyOfDay, groupNotesByWeek, summarizeWeek, formatWeekRange } from "@/lib/weekNotes";
import { formatNumber } from "@/lib/utils";

import PageHeader, { HeaderButton } from "@/components/PageHeader";
const WEEKS_PER_PAGE = 5;

// "$12.40 · 3 trades", or "No trades".
function ResultLine({ summary, isPrivacyMode }: { summary: DaySummary; isPrivacyMode: boolean }) {
  if (summary.count === 0) return <>No trades</>;
  const pnlClass = summary.pnl > 0 ? 'text-accent' : summary.pnl < 0 ? 'text-loss' : 'text-ink-faint';
  return (
    <>
      <span className={pnlClass}>{isPrivacyMode ? `${formatNumber(summary.rr)} R` : `${summary.pnl < 0 ? '-' : ''}$${formatNumber(Math.abs(summary.pnl))}`}</span>
      {' · '}{summary.count} {summary.count > 1 ? 'trades' : 'trade'}
    </>
  );
}

// One note in the list: its mood, a title, a two-line preview, and the result beside it.
// `brokenCount`: how many of the user's rules the day's note ticks as broken.
function NoteRow({ mood, title, content, summary, isPrivacyMode, onClick, brokenCount = 0 }: { mood: string; title: string; content: string; summary: DaySummary; isPrivacyMode: boolean; onClick: () => void; brokenCount?: number }) {
  return (
    <div className="py-3 px-2 rounded-xl hover:bg-surface transition cursor-pointer flex gap-4 items-start" onClick={onClick}>
      <div className={`w-10 h-10 rounded-full ${moodTone(mood).badge} flex items-center justify-center shrink-0 mt-0.5`}>
        <MoodIcon mood={mood} />
      </div>
      {/* The preview keeps to its own column, two lines at most; the whole note opens on click. */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 min-w-0">
          <h4 className="text-sm font-bold text-stone-900 truncate">{title}</h4>
          {brokenCount > 0 && (
            <span className="shrink-0 flex items-center gap-1 text-[10px] font-bold text-loss bg-loss-soft rounded-full px-2 py-0.5">
              <XCircle className="w-3 h-3" />
              {brokenCount} {brokenCount === 1 ? "rule" : "rules"}
            </span>
          )}
        </div>
        <p className="text-sm text-ink-muted line-clamp-2 whitespace-pre-line max-w-2xl">{content}</p>
      </div>
      <span className="text-xs font-bold shrink-0 text-ink-faint mt-0.5">
        <ResultLine summary={summary} isPrivacyMode={isPrivacyMode} />
      </span>
    </div>
  );
}

// Every note, grouped by week, newest week first: the week's own note on top, its day notes below.
export default function NotesPage() {
  const { dayNotes, weekNotes, trades, isLoading, isPrivacyMode, preferences } = useJournalStore();
  const ruleIds = useMemo(() => new Set((preferences.disciplineRules ?? []).map(r => r.id)), [preferences.disciplineRules]);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [openDay, setOpenDay] = useState<{ date: string; edit: boolean } | null>(null);
  const [openWeek, setOpenWeek] = useState<{ week: string; edit: boolean } | null>(null);

  const found = useMemo(() => groupNotesByWeek(dayNotes, weekNotes, query), [dayNotes, weekNotes, query]);
  const totalPages = Math.max(1, Math.ceil(found.length / WEEKS_PER_PAGE));
  const currentPage = Math.min(page, totalPages);
  const shown = found.slice((currentPage - 1) * WEEKS_PER_PAGE, currentPage * WEEKS_PER_PAGE);

  const { startHour, today } = useTradingDay();
  const thisWeek = weekKeyOfDay(today);
  const hasToday = dayNotes.some(n => n.date === today);
  const hasThisWeek = weekNotes.some(n => n.week === thisWeek);
  const weekLabel = hasThisWeek ? "Add to this week's note" : "Write this week's note";
  const todayLabel = hasToday ? "Add to today's note" : "Write today's note";

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[500px]">
        <p className="text-ink-muted font-semibold animate-pulse">Loading notes...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Notes">
        <HeaderButton icon={CalendarRange} label={weekLabel} variant="outline" onClick={() => setOpenWeek({ week: thisWeek, edit: true })} />
        <HeaderButton icon={PenLine} label={todayLabel} variant="primary" onClick={() => setOpenDay({ date: today, edit: true })} />
      </PageHeader>

      <DisciplineSummary />

      <div className="bg-white rounded-2xl shadow-sm p-4 flex flex-col">
        <div className="relative mb-2">
          <Search className="w-4 h-4 text-ink-disabled absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setPage(1); }}
            placeholder="Search notes"
            className="w-full bg-surface border border-line rounded-lg pl-9 pr-4 py-2 text-sm font-medium text-ink focus:outline-none focus:border-accent transition placeholder:text-ink-disabled"
          />
        </div>

        <div className="flex flex-col divide-y divide-stone-100">
          {found.length === 0 ? (
            <div className="py-8 text-center text-ink-faint font-semibold">
              {dayNotes.length === 0 && weekNotes.length === 0
                ? "No notes yet. Write today's or this week's, or double-click a day or a week on the Calendar."
                : "No note matches your search."}
            </div>
          ) : (
            shown.map(group => {
              const week = summarizeWeek(trades, group.week, startHour);
              return (
                <section key={group.week} className="py-4">
                  <div className="flex items-center gap-2 px-2 mb-1">
                    <span className="text-[10px] font-black text-accent uppercase tracking-widest">Week</span>
                    <h3 className="text-sm font-black text-ink truncate">{formatWeekRange(group.week)}</h3>
                    <span className="ml-auto text-xs font-bold shrink-0 text-ink-faint">
                      <ResultLine summary={week} isPrivacyMode={isPrivacyMode} />
                    </span>
                  </div>

                  {group.weekNote ? (
                    <NoteRow
                      mood={group.weekNote.mood}
                      title="Week note"
                      content={group.weekNote.content}
                      summary={week}
                      isPrivacyMode={isPrivacyMode}
                      onClick={() => setOpenWeek({ week: group.week, edit: false })}
                    />
                  ) : (
                    <button
                      onClick={() => setOpenWeek({ week: group.week, edit: true })}
                      className="mx-2 py-2 text-xs font-bold text-ink-faint hover:text-accent transition flex items-center gap-1.5"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Write this week&apos;s note
                    </button>
                  )}

                  {group.dayNotes.length > 0 && (
                    <div className="ml-5 md:ml-7 pl-2 md:pl-3 border-l-2 border-stone-100 mt-1">
                      {group.dayNotes.map(note => (
                        <NoteRow
                          key={note.date}
                          mood={note.mood}
                          title={formatDayLabel(note.date)}
                          content={note.content}
                          summary={summarizeDay(trades, note.date, startHour)}
                          isPrivacyMode={isPrivacyMode}
                          brokenCount={(note.brokenRules ?? []).filter(id => ruleIds.has(id)).length}
                          onClick={() => setOpenDay({ date: note.date, edit: false })}
                        />
                      ))}
                    </div>
                  )}
                </section>
              );
            })
          )}
        </div>

        {totalPages > 1 && (
          <div className="pt-4 flex justify-center items-center gap-3 border-t border-stone-100 mt-2">
            <button onClick={() => setPage(currentPage - 1)} disabled={currentPage === 1}
              className="px-3 py-1.5 border border-line rounded-lg text-[11px] font-bold text-stone-600 disabled:opacity-50">Prev</button>
            <span className="text-[11px] font-bold text-ink-faint">{currentPage} / {totalPages}</span>
            <button onClick={() => setPage(currentPage + 1)} disabled={currentPage === totalPages}
              className="px-3 py-1.5 border border-line rounded-lg text-[11px] font-bold text-stone-600 disabled:opacity-50">Next</button>
          </div>
        )}
      </div>

      {openDay && <DayNoteModal key={openDay.date} date={openDay.date} startEditing={openDay.edit} onClose={() => setOpenDay(null)} />}
      {openWeek && (
        <WeekNoteModal
          key={openWeek.week}
          week={openWeek.week}
          startEditing={openWeek.edit}
          onClose={() => setOpenWeek(null)}
          onOpenDay={(date) => { setOpenWeek(null); setOpenDay({ date, edit: false }); }}
        />
      )}
    </div>
  );
}
