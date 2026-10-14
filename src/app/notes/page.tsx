"use client";

import { useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import { useJournalStore } from "@/store/useJournalStore";
import DayNoteModal, { MoodIcon, moodTone, formatDayLabel } from "@/components/DayNoteModal";
import WeekNoteModal from "@/components/WeekNoteModal";
import { dayKey, summarizeDay, type DaySummary } from "@/lib/dayNotes";
import { weekKeyOf, groupNotesByWeek, summarizeWeek, formatWeekRange } from "@/lib/weekNotes";
import { formatNumber } from "@/lib/utils";

const WEEKS_PER_PAGE = 5;

// "$12.40 · 3 trades", or "No trades".
function ResultLine({ summary, isPrivacyMode }: { summary: DaySummary; isPrivacyMode: boolean }) {
  if (summary.count === 0) return <>No trades</>;
  const pnlClass = summary.pnl > 0 ? 'text-orange-400' : summary.pnl < 0 ? 'text-red-900' : 'text-stone-400';
  return (
    <>
      <span className={pnlClass}>{isPrivacyMode ? `${formatNumber(summary.rr)} R` : `${summary.pnl < 0 ? '-' : ''}$${formatNumber(Math.abs(summary.pnl))}`}</span>
      {' · '}{summary.count} {summary.count > 1 ? 'trades' : 'trade'}
    </>
  );
}

// One note in the list: its mood, a title, a two-line preview, and the result beside it.
function NoteRow({ mood, title, content, summary, isPrivacyMode, onClick }: { mood: string; title: string; content: string; summary: DaySummary; isPrivacyMode: boolean; onClick: () => void }) {
  return (
    <div className="py-3 px-2 rounded-xl hover:bg-stone-50 transition cursor-pointer flex gap-4 items-start" onClick={onClick}>
      <div className={`w-10 h-10 rounded-full ${moodTone(mood).badge} flex items-center justify-center shrink-0 mt-0.5`}>
        <MoodIcon mood={mood} />
      </div>
      {/* The preview keeps to its own column, two lines at most; the whole note opens on click. */}
      <div className="flex-1 min-w-0">
        <h4 className="text-sm font-bold text-stone-900 truncate mb-1">{title}</h4>
        <p className="text-sm text-stone-500 line-clamp-2 whitespace-pre-line max-w-2xl">{content}</p>
      </div>
      <span className="text-xs font-bold shrink-0 text-stone-400 mt-0.5">
        <ResultLine summary={summary} isPrivacyMode={isPrivacyMode} />
      </span>
    </div>
  );
}

// Every note, grouped by week, newest week first: the week's own note on top, its day notes below.
export default function NotesPage() {
  const { dayNotes, weekNotes, trades, isLoading, isPrivacyMode } = useJournalStore();
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [openDay, setOpenDay] = useState<{ date: string; edit: boolean } | null>(null);
  const [openWeek, setOpenWeek] = useState<{ week: string; edit: boolean } | null>(null);

  const found = useMemo(() => groupNotesByWeek(dayNotes, weekNotes, query), [dayNotes, weekNotes, query]);
  const totalPages = Math.max(1, Math.ceil(found.length / WEEKS_PER_PAGE));
  const currentPage = Math.min(page, totalPages);
  const shown = found.slice((currentPage - 1) * WEEKS_PER_PAGE, currentPage * WEEKS_PER_PAGE);

  const now = new Date();
  const today = dayKey(now);
  const thisWeek = weekKeyOf(now);
  const hasToday = dayNotes.some(n => n.date === today);
  const hasThisWeek = weekNotes.some(n => n.week === thisWeek);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[500px]">
        <p className="text-stone-500 font-semibold animate-pulse">Loading notes...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shrink-0">
        <div>
          <h2 className="text-3xl font-extrabold text-stone-950 tracking-tight">Notes</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setOpenWeek({ week: thisWeek, edit: true })}
            className="bg-white hover:bg-orange-50 text-orange-400 border border-orange-200 px-4 py-2 rounded-lg text-xs font-bold transition shadow-sm flex items-center justify-center gap-2 h-9">
            <Plus className="w-3.5 h-3.5" />
            {hasThisWeek ? "Add to this week's note" : "Write this week's note"}
          </button>
          <button
            onClick={() => setOpenDay({ date: today, edit: true })}
            className="bg-orange-400 hover:bg-orange-500 text-white px-4 py-2 rounded-lg text-xs font-bold transition shadow-sm flex items-center justify-center gap-2 h-9">
            <Plus className="w-3.5 h-3.5" />
            {hasToday ? "Add to today's note" : "Write today's note"}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm p-4 flex flex-col">
        <div className="relative mb-2">
          <Search className="w-4 h-4 text-stone-300 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setPage(1); }}
            placeholder="Search notes"
            className="w-full bg-stone-50 border border-stone-200 rounded-lg pl-9 pr-4 py-2 text-sm font-medium text-stone-950 focus:outline-none focus:border-orange-400 transition placeholder:text-stone-300"
          />
        </div>

        <div className="flex flex-col divide-y divide-stone-100">
          {found.length === 0 ? (
            <div className="py-8 text-center text-stone-400 font-semibold">
              {dayNotes.length === 0 && weekNotes.length === 0
                ? "No notes yet. Write today's or this week's, or double-click a day or a week on the Calendar."
                : "No note matches your search."}
            </div>
          ) : (
            shown.map(group => {
              const week = summarizeWeek(trades, group.week);
              return (
                <section key={group.week} className="py-4">
                  <div className="flex items-center gap-2 px-2 mb-1">
                    <span className="text-[10px] font-black text-orange-400 uppercase tracking-widest">Week</span>
                    <h3 className="text-sm font-black text-stone-950 truncate">{formatWeekRange(group.week)}</h3>
                    <span className="ml-auto text-xs font-bold shrink-0 text-stone-400">
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
                      className="mx-2 my-1 text-xs font-bold text-stone-400 hover:text-orange-400 transition flex items-center gap-1.5"
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
                          summary={summarizeDay(trades, note.date)}
                          isPrivacyMode={isPrivacyMode}
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
              className="px-3 py-1.5 border border-stone-200 rounded-lg text-[11px] font-bold text-stone-600 disabled:opacity-50">Prev</button>
            <span className="text-[11px] font-bold text-stone-400">{currentPage} / {totalPages}</span>
            <button onClick={() => setPage(currentPage + 1)} disabled={currentPage === totalPages}
              className="px-3 py-1.5 border border-stone-200 rounded-lg text-[11px] font-bold text-stone-600 disabled:opacity-50">Next</button>
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
