"use client";

import { useMemo, useState } from "react";
import { Trash2, Edit2, X, Laugh, Smile, Meh, Annoyed, Frown, Angry, type LucideIcon } from "lucide-react";
import { useEscapeToClose } from "@/lib/useEscapeToClose";
import { useJournalStore, type Trade } from "@/store/useJournalStore";
import { summarizeDay, tradesOfDay, normalizeMood, MOOD_IDS, type MoodId } from "@/lib/dayNotes";
import { classifyTrade, outcomeLabel } from "@/lib/stats";
import { formatNumber } from "@/lib/utils";
import TradeDetailModal from "./TradeDetailModal";
import ManualTradeModal from "./ManualTradeModal";

// How the day felt, best to worst. The chosen face is also the note's marker on the Calendar.
const MOODS: Record<MoodId, { label: string; Icon: LucideIcon; happy: boolean }> = {
  laugh: { label: "Great", Icon: Laugh, happy: true },
  smile: { label: "Good", Icon: Smile, happy: true },
  meh: { label: "Neutral", Icon: Meh, happy: true },
  annoyed: { label: "Frustrated", Icon: Annoyed, happy: false },
  frown: { label: "Sad", Icon: Frown, happy: false },
  angry: { label: "Angry", Icon: Angry, happy: false },
};

// The happy half reads in the main orange, the unhappy half in the red of a losing P&L.
const HAPPY_TONE = { text: 'text-orange-400', hoverText: 'hover:text-orange-400', badge: 'bg-orange-50 text-orange-400', selected: 'text-orange-400 bg-orange-50 border-orange-400' };
const UNHAPPY_TONE = { text: 'text-red-900', hoverText: 'hover:text-red-900', badge: 'bg-red-50 text-red-900', selected: 'text-red-900 bg-red-50 border-red-900' };

export const moodTone = (mood?: string) => (MOODS[normalizeMood(mood)].happy ? HAPPY_TONE : UNHAPPY_TONE);

export function MoodIcon({ mood, className = "w-5 h-5" }: { mood?: string; className?: string }) {
  const { Icon } = MOODS[normalizeMood(mood)];
  return <Icon className={className} strokeWidth={1.75} />;
}

export const formatDayLabel = (date: string) => {
  const d = new Date(`${date}T00:00:00`);
  return isNaN(d.getTime()) ? date : d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
};

// "14:15" of a stored time; empty when it cannot be read.
const clockOf = (time?: string) => {
  const d = time ? new Date(time.replace(' ', 'T')) : null;
  return d && !isNaN(d.getTime()) ? d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '';
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
  const deleteTrade = useJournalStore(state => state.deleteTrade);
  const isPrivacyMode = useJournalStore(state => state.isPrivacyMode);

  const [isEditing, setIsEditing] = useState(startEditing || !note);
  const [content, setContent] = useState(note?.content ?? "");
  const savedMood = normalizeMood(note?.mood);
  const [mood, setMood] = useState<MoodId>(savedMood);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const day = useMemo(() => summarizeDay(trades, date), [trades, date]);
  const dayTrades = useMemo(() => tradesOfDay(trades, date), [trades, date]);

  // A trade of the day opened on top of the note, looked up by id so edits show at once.
  const [detailId, setDetailId] = useState<string | null>(null);
  const [tradeToEdit, setTradeToEdit] = useState<Trade | null>(null);
  const detailIndex = dayTrades.findIndex(t => t.id === detailId);
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

  const handleDeleteTrade = async (id: string) => {
    if (!confirm("Are you sure you want to delete this trade?")) return;
    setDetailId(null);
    try {
      await deleteTrade(id);
    } catch {
      alert("Failed to delete the trade.");
    }
  };

  const pnlClass = day.pnl > 0 ? 'text-orange-400' : day.pnl < 0 ? 'text-red-900' : 'text-stone-400';

  return (
    <>
    {/* m-0: a page's space-y gap would otherwise shorten this backdrop while a trade is open on top. */}
    <div className="fixed inset-0 m-0 bg-stone-900/50 flex items-center justify-center z-[100] p-4 animate-fadeIn" onClick={requestClose}>
      <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[90vh] flex flex-col p-6 md:p-8 shadow-2xl relative" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-start mb-5 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`w-10 h-10 rounded-full ${moodTone(isEditing ? mood : note?.mood).badge} flex items-center justify-center shrink-0`}>
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

        {dayTrades.length > 0 && (
          <div className="flex flex-col gap-1.5 mb-5 shrink-0 max-h-[30vh] overflow-y-auto pr-1">
            {dayTrades.map(t => {
              const outcome = classifyTrade(t);
              const tone = outcome === 'win' ? 'text-orange-400' : outcome === 'loss' ? 'text-red-900' : 'text-stone-400';
              const entryClock = clockOf(t.entryTime);
              return (
                <button
                  key={t.id}
                  type="button"
                  title="Open this trade"
                  onClick={() => setDetailId(t.id)}
                  className="w-full shrink-0 flex items-center gap-3 bg-stone-50 hover:bg-stone-100 rounded-xl px-3 py-2 text-[11px] font-bold text-left transition"
                >
                  <span className="text-stone-400 tabular-nums w-[84px] shrink-0">{entryClock && `${entryClock} – `}{clockOf(t.time)}</span>
                  <span className="text-stone-950 w-8 shrink-0">{t.side}</span>
                  <span className="text-stone-500 flex-1 min-w-0 truncate">{t.symbol}{t.tf && t.tf !== 'none' ? ` · ${t.tf}` : ''}</span>
                  <span className={`${tone} w-6 shrink-0`}>{outcomeLabel(outcome)}</span>
                  {!isPrivacyMode && (
                    <span className={`${tone} tabular-nums w-16 shrink-0 text-right`}>{t.profit < 0 ? '-' : ''}${formatNumber(Math.abs(t.profit))}</span>
                  )}
                  <span className={`${tone} tabular-nums w-16 shrink-0 text-right`}>{formatNumber(t.rr)} R</span>
                </button>
              );
            })}
          </div>
        )}

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
                    className={`h-10 pl-2.5 pr-3.5 rounded-full flex items-center gap-1.5 text-[11px] font-bold transition border-2 ${mood === id ? moodTone(id).selected :'text-stone-400 bg-stone-50 hover:bg-stone-100 border-transparent'}`}
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
    <TradeDetailModal
      isOpen={detailIndex >= 0 && !tradeToEdit}
      onClose={() => setDetailId(null)}
      trade={dayTrades[detailIndex] ?? null}
      onEdit={(trade) => setTradeToEdit(trade)}
      onDelete={(id) => handleDeleteTrade(id)}
      hasPrev={detailIndex > 0}
      hasNext={detailIndex >= 0 && detailIndex < dayTrades.length - 1}
      currentIndex={detailIndex + 1}
      totalItems={dayTrades.length}
      onPrev={() => setDetailId(dayTrades[detailIndex - 1]?.id ?? detailId)}
      onNext={() => setDetailId(dayTrades[detailIndex + 1]?.id ?? detailId)}
    />
    <ManualTradeModal isOpen={!!tradeToEdit} onClose={() => setTradeToEdit(null)} tradeToEdit={tradeToEdit} />
    </>
  );
}
