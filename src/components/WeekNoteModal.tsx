"use client";

import { useMemo } from "react";
import { useJournalStore } from "@/store/useJournalStore";
import { summarizeWeek, formatWeekRange } from "@/lib/weekNotes";
import { formatNumber } from "@/lib/utils";
import { NoteModal, MoodIcon, moodTone } from "./DayNoteModal";

interface WeekNoteModalProps {
  week: string; // "YYYY-MM-DD" of the week's Sunday
  startEditing: boolean; // open straight in the editor (a week without a note always does)
  onClose: () => void;
  onOpenDay: (date: string) => void; // a day of the week was picked: show its note instead
}

const weekdayOf = (date: string) => new Date(`${date}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
const toneOf = (n: number) => (n > 0 ? 'text-orange-400' : n < 0 ? 'text-red-900' : 'text-stone-400');

// The note of one week beside that week's result, day by day. Weekends show only when something
// happened on them. Mount it with a `key` of the week so each week starts from its own saved note.
export default function WeekNoteModal({ week, startEditing, onClose, onOpenDay }: WeekNoteModalProps) {
  const trades = useJournalStore(state => state.trades);
  const dayNotes = useJournalStore(state => state.dayNotes);
  const note = useJournalStore(state => state.weekNotes.find(n => n.week === week));
  const saveWeekNote = useJournalStore(state => state.saveWeekNote);
  const deleteWeekNote = useJournalStore(state => state.deleteWeekNote);
  const isPrivacyMode = useJournalStore(state => state.isPrivacyMode);

  const summary = useMemo(() => summarizeWeek(trades, week), [trades, week]);
  const notesByDay = useMemo(() => new Map(dayNotes.map(n => [n.date, n])), [dayNotes]);
  const days = summary.days.filter((d, i) => (i > 0 && i < 6) || d.count > 0 || notesByDay.has(d.date));

  return (
    <NoteModal
      title={formatWeekRange(week)}
      kind="week"
      note={note}
      startEditing={startEditing}
      summary={summary}
      onSave={(n) => saveWeekNote(week, n)}
      onDelete={() => deleteWeekNote(week)}
      onClose={onClose}
    >
      <div className="flex flex-col gap-1.5 mb-5 shrink-0 max-h-[30vh] overflow-y-auto pr-1">
        {days.map(d => {
          const dayNote = notesByDay.get(d.date);
          return (
            <button
              key={d.date}
              type="button"
              title={dayNote ? "Open this day's note" : "Open this day"}
              onClick={() => onOpenDay(d.date)}
              className="w-full shrink-0 flex items-center gap-2 md:gap-3 bg-stone-50 hover:bg-stone-100 rounded-xl px-3 py-2 text-[11px] font-bold text-left transition"
            >
              <span className="text-stone-950 w-[92px] shrink-0">{weekdayOf(d.date)}</span>
              <span className="w-5 shrink-0">
                {dayNote && <MoodIcon mood={dayNote.mood} className={`w-4 h-4 ${moodTone(dayNote.mood).text}`} />}
              </span>
              <span className="text-stone-400 flex-1 min-w-0 truncate">
                {d.count === 0 ? 'No trades' : `${d.count} ${d.count > 1 ? 'trades' : 'trade'}`}
              </span>
              {d.count > 0 && !isPrivacyMode && (
                <span className={`${toneOf(d.pnl)} tabular-nums w-14 md:w-16 shrink-0 text-right`}>{d.pnl < 0 ? '-' : ''}${formatNumber(Math.abs(d.pnl))}</span>
              )}
              {d.count > 0 && (
                <span className={`${toneOf(d.rr)} tabular-nums w-12 md:w-16 shrink-0 text-right`}>{formatNumber(d.rr)} R</span>
              )}
            </button>
          );
        })}
      </div>
    </NoteModal>
  );
}
