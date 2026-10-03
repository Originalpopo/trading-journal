"use client";

import { useMemo, useState } from "react";
import { Trash2, Edit2, X, Laugh, Smile, Meh, Annoyed, Frown, Angry, type LucideIcon } from "lucide-react";
import { useEscapeToClose } from "@/lib/useEscapeToClose";
import { useJournalStore } from "@/store/useJournalStore";
import { summarizeDay, normalizeMood, MOOD_IDS, type MoodId } from "@/lib/dayNotes";
import { formatNumber } from "@/lib/utils";

// How the day felt, best to worst. The chosen face is also the note's marker on the Calendar.
const MOODS: Record<MoodId, { label: string; Icon: LucideIcon }> = {
  laugh: { label: "Great", Icon: Laugh },
  smile: { label: "Good", Icon: Smile },
  meh: { label: "Neutral", Icon: Meh },
  annoyed: { label: "Frustrated", Icon: Annoyed },
  frown: { label: "Sad", Icon: Frown },
  angry: { label: "Angry", Icon: Angry },
};

export function MoodIcon({ mood, className = "w-5 h-5" }: { mood?: string; className?: string }) {
  const { Icon } = MOODS[normalizeMood(mood)];
  return <Icon className={className} strokeWidth={1.75} />;
}

export const formatDayLabel = (date: string) => {
  const d = new Date(`${date}T00:00:00`);
  return isNaN(d.getTime()) ? date : d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
};

interface DayNoteModalProps {
  date: string; // "YYYY-MM-DD"
  startEditing: boolean; // open straight in the editor (a day without a note always does)
  onClose: () => void;
}

// The note of one day beside what was traded that day. Reads first; edits in place.
// Mount it with a `key` of the date so each day starts from its own saved note.
export default function DayNoteModal({ date, startEditing, onClose }: DayNoteModalProps) {
  const trades = useJournalStore(state => state.trades);
  const note = useJournalStore(state => state.dayNotes.find(n => n.date === date));
  const saveDayNote = useJournalStore(state => state.saveDayNote);
  const deleteDayNote = useJournalStore(state => state.deleteDayNote);
  const isPrivacyMode = useJournalStore(state => state.isPrivacyMode);

  const [isEditing, setIsEditing] = useState(startEditing || !note);
  const [content, setContent] = useState(note?.content ?? "");
  const savedMood = normalizeMood(note?.mood);
  const [mood, setMood] = useState<MoodId>(savedMood);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const day = useMemo(() => summarizeDay(trades, date), [trades, date]);
  const isDirty = isEditing && (content !== (note?.content ?? "") || mood !== savedMood);

  // Backdrop clicks and Esc are easy to hit by accident, so they ask before discarding edits.
  const requestClose = () => {
    if (isDirty && !confirm("Discard your unsaved changes?")) return;
    onClose();
  };
  useEscapeToClose(true, requestClose);

  const handleSave = async () => {
    if (!content.trim()) return;
    setIsSubmitting(true);
    try {
      await saveDayNote(date, { content: content.trim(), mood });
      onClose();
    } catch (e) {
      console.error(e);
      alert("Failed to save the note.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Delete the note of this day? This cannot be undone.")) return;
    try {
      await deleteDayNote(date);
      onClose();
    } catch (e) {
      console.error(e);
      alert("Failed to delete the note.");
    }
  };

  const pnlClass = day.pnl > 0 ? 'text-orange-400' : day.pnl < 0 ? 'text-red-900' : 'text-stone-400';

  return (
    <div className="fixed inset-0 bg-stone-900/50 flex items-center justify-center z-[100] p-4 animate-fadeIn" onClick={requestClose}>
      <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[90vh] flex flex-col p-6 md:p-8 shadow-2xl relative" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-start mb-5 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-full bg-orange-50 text-orange-400 flex items-center justify-center shrink-0">
              <MoodIcon mood={isEditing ? mood : note?.mood} />
            </div>
            <div className="min-w-0">
              <h3 className="text-xl font-black text-stone-950 tracking-tight leading-tight">{formatDayLabel(date)}</h3>
              <p className="text-[11px] font-semibold text-stone-400 mt-0.5">
                {!note ? 'No note yet' : note.updatedAt ? `Last edited ${new Date(note.updatedAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : 'Day note'}
              </p>
            </div>
          </div>
          <button onClick={requestClose} className="text-stone-400 hover:text-stone-600 p-1 rounded-full hover:bg-stone-100 transition shrink-0 ml-4">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="grid grid-cols-4 gap-3 mb-5 shrink-0">
          <div className="bg-stone-50 rounded-xl p-3 text-center">
            <p className="text-[9px] font-black text-stone-400 uppercase tracking-widest mb-0.5">Trades</p>
            <p className="text-sm font-black text-stone-950">{day.count}</p>
          </div>
          <div className="bg-stone-50 rounded-xl p-3 text-center">
            <p className="text-[9px] font-black text-stone-400 uppercase tracking-widest mb-0.5">P&L</p>
            <p className={`text-sm font-black ${pnlClass}`}>{day.count === 0 ? '-' : isPrivacyMode ? '***' : `${day.pnl < 0 ? '-' : ''}$${formatNumber(Math.abs(day.pnl))}`}</p>
          </div>
          <div className="bg-stone-50 rounded-xl p-3 text-center">
            <p className="text-[9px] font-black text-stone-400 uppercase tracking-widest mb-0.5">RR</p>
            <p className={`text-sm font-black ${day.rr > 0 ? 'text-orange-400' : day.rr < 0 ? 'text-red-900' : 'text-stone-400'}`}>{day.count === 0 ? '-' : `${formatNumber(day.rr)} R`}</p>
          </div>
          <div className="bg-stone-50 rounded-xl p-3 text-center" title="Wins / break-evens / losses">
            <p className="text-[9px] font-black text-stone-400 uppercase tracking-widest mb-0.5">TP / BE / SL</p>
            <p className="text-sm font-black text-stone-950">{day.count === 0 ? '-' : `${day.wins} / ${day.bes} / ${day.losses}`}</p>
          </div>
        </div>

        {isEditing ? (
          <div className="flex-1 min-h-0 flex flex-col gap-4">
            <div className="shrink-0">
              <label className="block text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1">How the day felt</label>
              <div className="flex flex-wrap gap-2">
                {MOOD_IDS.map(id => (
                  <button
                    key={id}
                    type="button"
                    title={MOODS[id].label}
                    onClick={() => setMood(id)}
                    className={`h-10 pl-2.5 pr-3.5 rounded-full flex items-center gap-1.5 text-[11px] font-bold transition border-2 ${mood === id ? 'text-orange-400 bg-orange-50 border-orange-400' : 'text-stone-400 bg-stone-50 hover:bg-stone-100 border-transparent'}`}
                  >
                    <MoodIcon mood={id} />
                    {MOODS[id].label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex-1 min-h-0 flex flex-col">
              <label className="block text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1">Note</label>
              <textarea
                autoFocus
                value={content}
                onChange={(e) => setContent(e.target.value)}
                // Start at the end so a later addition continues the day's note.
                onFocus={(e) => e.currentTarget.setSelectionRange(e.currentTarget.value.length, e.currentTarget.value.length)}
                rows={10}
                placeholder="What happened, how it felt, what to keep or change..."
                className="w-full flex-1 bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 text-sm font-medium text-stone-950 leading-relaxed focus:outline-none focus:border-orange-400 transition resize-y placeholder:text-stone-300"
              />
            </div>
            <div className="flex gap-3 justify-end pt-4 border-t border-stone-100 shrink-0">
              <button onClick={requestClose} disabled={isSubmitting} className="px-6 py-2.5 rounded-xl text-xs font-bold bg-stone-100 text-stone-600 hover:bg-stone-200 transition">Cancel</button>
              <button onClick={handleSave} disabled={isSubmitting || !content.trim()}
                className="px-6 py-2.5 rounded-xl text-xs font-bold bg-orange-400 text-white hover:bg-orange-500 shadow-md shadow-orange-200 transition disabled:opacity-50">
                {isSubmitting ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="text-stone-950 text-sm leading-relaxed whitespace-pre-wrap flex-1 overflow-y-auto min-h-[100px] pr-2">
              {note?.content}
            </div>
            <div className="flex items-center justify-between pt-4 mt-5 border-t border-stone-100 shrink-0">
              <div className="flex items-center gap-3">
                <button onClick={handleDelete} className="p-2.5 bg-stone-100 hover:bg-red-50 text-stone-600 hover:text-red-900 rounded-xl transition" title="Delete">
                  <Trash2 className="w-4 h-4" />
                </button>
                <button onClick={() => setIsEditing(true)} className="flex items-center gap-1.5 text-xs font-bold text-stone-700 bg-stone-100 hover:bg-stone-200 px-5 py-2.5 rounded-xl transition">
                  <Edit2 className="w-4 h-4" />
                  Edit
                </button>
              </div>
              <button onClick={onClose} className="px-6 py-2.5 rounded-xl text-xs font-bold bg-stone-100 text-stone-600 hover:bg-stone-200 transition">
                Close
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
