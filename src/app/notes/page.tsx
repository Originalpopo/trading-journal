"use client";

import { useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import { useJournalStore } from "@/store/useJournalStore";
import DayNoteModal, { MoodIcon, formatDayLabel } from "@/components/DayNoteModal";
import { dayKey, searchDayNotes, summarizeDay } from "@/lib/dayNotes";
import { formatNumber } from "@/lib/utils";

const NOTES_PER_PAGE = 10;

// Every day note, newest day first, each beside what was traded that day.
export default function NotesPage() {
  const { dayNotes, trades, isLoading, isPrivacyMode } = useJournalStore();
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<{ date: string; edit: boolean } | null>(null);

  const found = useMemo(() => searchDayNotes(dayNotes, query), [dayNotes, query]);
  const totalPages = Math.max(1, Math.ceil(found.length / NOTES_PER_PAGE));
  const currentPage = Math.min(page, totalPages);
  const shown = found.slice((currentPage - 1) * NOTES_PER_PAGE, currentPage * NOTES_PER_PAGE);

  const today = dayKey(new Date());
  const hasToday = dayNotes.some(n => n.date === today);

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
          <p className="text-sm text-stone-500 font-medium mt-1">One note per day, next to that day&apos;s result. Any day can be opened from the Calendar.</p>
        </div>
        <button
          onClick={() => setOpen({ date: today, edit: true })}
          className="bg-orange-400 hover:bg-orange-500 text-white px-4 py-2 rounded-lg text-xs font-bold transition shadow-sm flex items-center justify-center gap-2 h-9">
          <Plus className="w-3.5 h-3.5" />
          {hasToday ? "Add to today's note" : "Write today's note"}
        </button>
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
              {dayNotes.length === 0
                ? "No notes yet. Write today's, or double-click any day on the Calendar."
                : "No note matches your search."}
            </div>
          ) : (
            shown.map(note => {
              const day = summarizeDay(trades, note.date);
              const pnlClass = day.pnl > 0 ? 'text-orange-400' : day.pnl < 0 ? 'text-red-900' : 'text-stone-400';
              return (
                <div
                  key={note.date}
                  className="py-4 px-2 hover:bg-stone-50 transition cursor-pointer flex gap-4 items-start"
                  onClick={() => setOpen({ date: note.date, edit: false })}
                >
                  <div className="w-10 h-10 rounded-full bg-orange-50 text-orange-400 flex items-center justify-center shrink-0 mt-0.5">
                    <MoodIcon mood={note.mood} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-baseline gap-4 mb-1">
                      <h4 className="text-sm font-bold text-stone-900 truncate">{formatDayLabel(note.date)}</h4>
                      <span className="text-xs font-bold shrink-0 text-stone-400">
                        {day.count === 0 ? 'No trades' : (
                          <>
                            <span className={pnlClass}>{isPrivacyMode ? `${formatNumber(day.rr)} R` : `${day.pnl < 0 ? '-' : ''}$${formatNumber(Math.abs(day.pnl))}`}</span>
                            {' · '}{day.count} {day.count > 1 ? 'trades' : 'trade'}
                          </>
                        )}
                      </span>
                    </div>
                    <p className="text-sm text-stone-500 line-clamp-2 whitespace-pre-line">{note.content}</p>
                  </div>
                </div>
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

      {open && <DayNoteModal key={open.date} date={open.date} startEditing={open.edit} onClose={() => setOpen(null)} />}
    </div>
  );
}
