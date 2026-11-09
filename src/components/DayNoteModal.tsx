"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Trash2, Edit2, X, Laugh, Smile, Meh, Annoyed, Frown, Angry, ChevronDown, XCircle, ClipboardX, Target, type LucideIcon } from "lucide-react";
import { useDailyTargets } from "./useDailyTargets";
import { useTradingDay } from "./useTradingDay";
import Link from "next/link";
import SaveRow from "./SaveRow";
import { useEscapeToClose } from "@/lib/useEscapeToClose";
import { useJournalStore, type Trade } from "@/store/useJournalStore";
import { dayKeyOfTime, summarizeDay, tradesOfDay, normalizeMood, MOOD_IDS, type MoodId, type DaySummary } from "@/lib/dayNotes";
import { classifyTrade, outcomeLabel, isOnPlan } from "@/lib/stats";
import type { DisciplineRule } from "@/lib/discipline";
import { formatNumber } from "@/lib/utils";
import { formatPnl } from "@/lib/bahtRate";
import TradeDetailModal from "./TradeDetailModal";
import { useOffPlanReasons } from "./useOffPlanReasons";
import { reasonsOfTrade } from "@/lib/offPlan";
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
const HAPPY_TONE = { text: 'text-accent', hoverText: 'hover:text-accent', badge: 'bg-accent-soft text-accent', selected: 'text-accent bg-accent-soft border-accent' };
const UNHAPPY_TONE = { text: 'text-loss', hoverText: 'hover:text-loss', badge: 'bg-loss-soft text-loss', selected: 'text-loss bg-loss-soft border-loss' };

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

interface NoteModalProps {
  title: string;
  kind: 'day' | 'week';
  note?: { content: string; mood: string; brokenRules?: string[]; updatedAt?: string };
  startEditing: boolean; // open straight in the editor (a period without a note always does)
  summary: DaySummary;
  onSave: (note: { content: string; mood: MoodId; brokenRules?: string[] }) => Promise<void>;
  onDelete: () => Promise<void>;
  onClose: () => void;
  children?: ReactNode; // what happened in the period, between the figures and the note
  bahtRate?: number | null; // show money in whole baht at this rate instead of dollars
  rules?: DisciplineRule[]; // a day note: the user's rules, to tick the ones broken that day
  offPlan?: { id: string; name: string; count: number }[]; // a day note: why the day's off-plan trades were off plan
}

// Why the day's trades were off plan, as set on the trades: shown, not ticked here.
function OffPlanChips({ items }: { items: { id: string; name: string; count: number }[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map(r => (
        <span key={r.id} className="h-7 px-2.5 rounded-full flex items-center gap-1.5 text-[11px] font-bold bg-surface text-ink-muted border border-line">
          <ClipboardX className="w-3.5 h-3.5 text-loss" />
          {r.name}
          {r.count > 1 && <span className="text-ink-faint">×{r.count}</span>}
        </span>
      ))}
    </div>
  );
}

// A collapsible list inside a note popup (the day's trades, the week's days), folded when it opens.
export function NoteAccordion({ title, extra, children }: { title: string; extra?: ReactNode; children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div className="mb-5 shrink-0 border border-line rounded-xl">
      <button type="button" onClick={() => setIsOpen(!isOpen)} aria-expanded={isOpen}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-[11px] font-bold text-left">
        <span className="uppercase tracking-widest text-[10px] text-ink-faint">{title}</span>
        <span className="ml-auto">{extra}</span>
        <ChevronDown className={`w-4 h-4 shrink-0 text-ink-faint transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>
      {isOpen && <div className="flex flex-col gap-1.5 px-2 pb-2 max-h-[30vh] overflow-y-auto">{children}</div>}
    </div>
  );
}

// A note beside the result of its day or week. Reads first; edits in place.
// Mount it with a `key` of the period so each one starts from its own saved note.
export function NoteModal({ title, kind, note, startEditing, summary, onSave, onDelete, onClose, children, bahtRate, rules, offPlan }: NoteModalProps) {
  const isPrivacyMode = useJournalStore(state => state.isPrivacyMode);
  const [isEditing, setIsEditing] = useState(startEditing || !note);
  const [content, setContent] = useState(note?.content ?? "");
  const savedMood = normalizeMood(note?.mood);
  const [mood, setMood] = useState<MoodId>(savedMood);
  const savedBroken = note?.brokenRules ?? [];
  const [broken, setBroken] = useState<string[]>(savedBroken);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const day = summary;
  const sameRules = broken.length === savedBroken.length && broken.every(id => savedBroken.includes(id));
  const isDirty = isEditing && (content !== (note?.content ?? "") || mood !== savedMood || !sameRules);
  // A day can be saved with only its broken rules ticked; otherwise a note needs words.
  const canSave = !!content.trim() || broken.length > 0;
  const toggleRule = (id: string) => setBroken(prev => (prev.includes(id) ? prev.filter(r => r !== id) : [...prev, id]));
  // The rules ticked on this note that still exist, in the order of the user's list.
  const brokenNames = (rules ?? []).filter(r => savedBroken.includes(r.id));

  // Backdrop clicks and Esc are easy to hit by accident, so they ask before discarding edits.
  // The X is pressed on purpose, so it closes straight away, like Cancel.
  const requestClose = () => {
    if (isDirty && !confirm("Discard your unsaved changes?")) return;
    onClose();
  };
  useEscapeToClose(true, requestClose);

  // Cancel throws away what was typed: back to reading the saved note, or closed when there is none.
  const cancelEdit = () => {
    if (!note) return onClose();
    setContent(note.content);
    setMood(savedMood);
    setBroken(savedBroken);
    setIsEditing(false);
  };

  const handleSave = async () => {
    if (!canSave) return;
    setIsSubmitting(true);
    try {
      await onSave({ content: content.trim(), mood, ...(rules && { brokenRules: broken }) });
      onClose();
    } catch (e) {
      console.error(e);
      alert("Failed to save the note.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Delete the note of this ${kind}? This cannot be undone.`)) return;
    try {
      await onDelete();
      onClose();
    } catch (e) {
      console.error(e);
      alert("Failed to delete the note.");
    }
  };

  const pnlClass = day.pnl > 0 ? 'text-accent' : day.pnl < 0 ? 'text-loss' : 'text-ink-faint';

  return (
    // m-0: a page's space-y gap would otherwise shorten this backdrop while a trade is open on top.
    <div className="fixed inset-0 m-0 bg-stone-900/50 flex items-center justify-center z-[100] p-4 animate-fadeIn" onClick={requestClose}>
      <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[90vh] flex flex-col p-6 md:p-8 shadow-2xl relative" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-start mb-5 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`w-10 h-10 rounded-full ${moodTone(isEditing ? mood : note?.mood).badge} flex items-center justify-center shrink-0`}>
              <MoodIcon mood={isEditing ? mood : note?.mood} />
            </div>
            <div className="min-w-0">
              {kind === 'week' && <p className="text-[10px] font-black text-accent uppercase tracking-widest">Week</p>}
              <h3 className="text-xl font-black text-ink tracking-tight leading-tight">{title}</h3>
              <p className="text-[11px] font-semibold text-ink-faint mt-0.5">
                {!note ? 'No note yet' : note.updatedAt ? `Last edited ${new Date(note.updatedAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : kind === 'week' ? 'Week note' : 'Day note'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-ink-faint hover:text-ink p-1 rounded-full hover:bg-surface-2 transition shrink-0 ml-4">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="grid grid-cols-4 gap-2 md:gap-3 mb-5 shrink-0">
          <div className="bg-surface rounded-xl px-1 py-3 md:p-3 text-center">
            <p className="text-[9px] font-black text-ink-faint uppercase tracking-widest mb-0.5">Trades</p>
            <p className="text-sm font-black text-ink">{day.count}</p>
          </div>
          <div className="bg-surface rounded-xl px-1 py-3 md:p-3 text-center">
            <p className="text-[9px] font-black text-ink-faint uppercase tracking-widest mb-0.5">P&L</p>
            <p className={`text-sm font-black ${pnlClass}`}>{day.count === 0 ? '-' : isPrivacyMode ? '***' : formatPnl(day.pnl, bahtRate)}</p>
          </div>
          <div className="bg-surface rounded-xl px-1 py-3 md:p-3 text-center">
            <p className="text-[9px] font-black text-ink-faint uppercase tracking-widest mb-0.5">RR</p>
            <p className={`text-sm font-black ${day.rr > 0 ? 'text-accent' : day.rr < 0 ? 'text-loss' : 'text-ink-faint'}`}>{day.count === 0 ? '-' : `${formatNumber(day.rr)} R`}</p>
          </div>
          <div className="bg-surface rounded-xl px-1 py-3 md:p-3 text-center" title="Wins / break-evens / losses">
            <p className="text-[9px] font-black text-ink-faint uppercase md:tracking-widest mb-0.5">TP / BE / SL</p>
            <p className="text-sm font-black text-ink">{day.count === 0 ? '-' : `${day.wins} / ${day.bes} / ${day.losses}`}</p>
          </div>
        </div>

        {children}

        {isEditing ? (
          // Scrolls when the trades list above is open and the form no longer fits the popup.
          <div className="flex-1 min-h-0 flex flex-col gap-4 overflow-y-auto -mx-1 px-1">
            <div className="shrink-0">
              <label className="block text-[10px] font-bold text-ink-faint uppercase tracking-widest mb-1">{kind === 'week' ? 'How the week felt' : 'How the day felt'}</label>
              <div className="flex flex-wrap gap-2">
                {MOOD_IDS.map(id => (
                  <button
                    key={id}
                    type="button"
                    title={MOODS[id].label}
                    onClick={() => setMood(id)}
                    className={`h-10 pl-2.5 pr-3.5 rounded-full flex items-center gap-1.5 text-[11px] font-bold transition border-2 ${mood === id ? moodTone(id).selected :'text-ink-faint bg-surface hover:bg-surface-2 border-transparent'}`}
                  >
                    <MoodIcon mood={id} />
                    {MOODS[id].label}
                  </button>
                ))}
              </div>
            </div>
            {offPlan && offPlan.length > 0 && (
              <div className="shrink-0">
                <label className="block text-[10px] font-bold text-ink-faint uppercase tracking-widest mb-1">Off plan today (from the trades)</label>
                <OffPlanChips items={offPlan} />
              </div>
            )}
            {rules && (
              <div className="shrink-0">
                <label className="block text-[10px] font-bold text-ink-faint uppercase tracking-widest mb-1">Rules broken today</label>
                {rules.length === 0 ? (
                  <p className="text-[11px] font-medium text-ink-faint">
                    No rules yet. <Link href="/settings" className="font-bold text-accent hover:underline">Set your trading rules in Settings</Link>, then tick here the ones you broke.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {rules.map(rule => {
                      const isBroken = broken.includes(rule.id);
                      return (
                        <button key={rule.id} type="button" onClick={() => toggleRule(rule.id)} aria-pressed={isBroken}
                          className={`h-9 px-3 rounded-full flex items-center gap-1.5 text-[11px] font-bold border transition ${
                            isBroken ? 'bg-loss-soft text-loss border-loss-line' : 'bg-surface text-ink-faint border-line hover:text-ink'
                          }`}>
                          {isBroken && <XCircle className="w-3.5 h-3.5" />}
                          {rule.name}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
            {/* Never squeezed below a few lines: with the trades list open the form scrolls instead. */}
            <div className="flex-1 min-h-48 flex flex-col">
              <label className="block text-[10px] font-bold text-ink-faint uppercase tracking-widest mb-1">Note</label>
              <textarea
                // Not on a phone: the keyboard would cover what happened as soon as a day or week is tapped.
                autoFocus={!window.matchMedia('(max-width: 767px)').matches}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                // Start at the end so a later addition continues the note.
                onFocus={(e) => e.currentTarget.setSelectionRange(e.currentTarget.value.length, e.currentTarget.value.length)}
                rows={10}
                placeholder="What happened, how it felt, what to keep or change..."
                className="w-full flex-1 bg-surface border border-line rounded-xl px-4 py-3 text-sm font-medium text-ink leading-relaxed focus:outline-none focus:border-accent transition resize-y placeholder:text-ink-disabled"
              />
            </div>
            {/* -mt-4 takes back the column gap, so nothing is left below the note while Save is hidden. */}
            <div className="shrink-0 -mt-4">
              <SaveRow isDirty={isDirty} canSave={canSave} isSaving={isSubmitting} onSave={handleSave} onCancel={cancelEdit} />
            </div>
          </div>
        ) : (
          <>
            {offPlan && offPlan.length > 0 && (
              <div className="mb-2 shrink-0">
                <OffPlanChips items={offPlan} />
              </div>
            )}
            {brokenNames.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-4 shrink-0">
                {brokenNames.map(rule => (
                  <span key={rule.id} className="h-7 px-2.5 rounded-full flex items-center gap-1.5 text-[11px] font-bold bg-loss-soft text-loss border border-loss-line">
                    <XCircle className="w-3.5 h-3.5" />
                    {rule.name}
                  </span>
                ))}
              </div>
            )}
            <div className="text-ink text-sm leading-relaxed whitespace-pre-wrap flex-1 overflow-y-auto min-h-[100px] pr-2">
              {note?.content}
            </div>
            <div className="flex items-center justify-between pt-4 mt-5 border-t border-line-soft shrink-0">
              <div className="flex items-center gap-3">
                <button onClick={handleDelete} className="p-2.5 bg-surface-2 hover:bg-loss-soft text-ink-muted hover:text-loss rounded-xl transition" title="Delete">
                  <Trash2 className="w-4 h-4" />
                </button>
                <button onClick={() => setIsEditing(true)} className="flex items-center gap-1.5 text-xs font-bold text-ink bg-surface-2 hover:bg-line px-5 py-2.5 rounded-xl transition">
                  <Edit2 className="w-4 h-4" />
                  Edit
                </button>
              </div>
              <button onClick={onClose} className="px-6 py-2.5 rounded-xl text-xs font-bold bg-surface-2 text-ink-muted hover:bg-line transition">
                Close
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

interface DayNoteModalProps {
  date: string; // "YYYY-MM-DD"
  startEditing: boolean; // open straight in the editor (a day without a note always does)
  bahtRate?: number | null; // show money in whole baht at this rate instead of dollars
  onClose: () => void;
}

// The note of one day beside what was traded that day.
// Mount it with a `key` of the date so each day starts from its own saved note.
export default function DayNoteModal({ date, startEditing, bahtRate, onClose }: DayNoteModalProps) {
  const trades = useJournalStore(state => state.trades);
  const note = useJournalStore(state => state.dayNotes.find(n => n.date === date));
  const saveDayNote = useJournalStore(state => state.saveDayNote);
  const deleteDayNote = useJournalStore(state => state.deleteDayNote);
  const deleteTrade = useJournalStore(state => state.deleteTrade);
  const isPrivacyMode = useJournalStore(state => state.isPrivacyMode);

  const { startHour } = useTradingDay();
  const day = useMemo(() => summarizeDay(trades, date, startHour), [trades, date, startHour]);
  const dayTrades = useMemo(() => tradesOfDay(trades, date, startHour), [trades, date, startHour]);
  const offPlanCount = dayTrades.filter(t => !isOnPlan(t)).length;
  const rules = useJournalStore(state => state.preferences.disciplineRules);
  const reasons = useOffPlanReasons();
  // Each reason named by the day's off-plan trades, with how many trades named it.
  const offPlan = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of dayTrades) for (const r of reasonsOfTrade(t, reasons)) counts.set(r.id, (counts.get(r.id) ?? 0) + 1);
    return reasons.filter(r => counts.has(r.id)).map(r => ({ ...r, count: counts.get(r.id)! }));
  }, [dayTrades, reasons]);
  const target = useDailyTargets().days.get(date);

  // A trade of the day opened on top of the note, looked up by id so edits show at once.
  const [detailId, setDetailId] = useState<string | null>(null);
  const [tradeToEdit, setTradeToEdit] = useState<Trade | null>(null);
  const detailIndex = dayTrades.findIndex(t => t.id === detailId);

  const handleDeleteTrade = async (id: string) => {
    if (!confirm("Are you sure you want to delete this trade?")) return;
    setDetailId(null);
    try {
      await deleteTrade(id);
    } catch {
      alert("Failed to delete the trade.");
    }
  };

  return (
    <>
    <NoteModal
      title={formatDayLabel(date)}
      kind="day"
      note={note}
      startEditing={startEditing}
      summary={day}
      onSave={(n) => saveDayNote(date, n)}
      rules={rules ?? []}
      offPlan={offPlan}
      onDelete={() => deleteDayNote(date)}
      onClose={onClose}
      bahtRate={bahtRate}
    >
        {/* The daily target of a day that was traded: reached or not, and what came after it. */}
        {target && target.target > 0 && dayTrades.length > 0 && (
          <p className={`mb-3 shrink-0 text-[11px] font-bold flex flex-wrap items-center gap-x-1.5 gap-y-0.5 ${
            target.hitAt ? 'text-accent' : 'text-ink-faint'
          }`}>
            <Target className="w-3.5 h-3.5 shrink-0" />
            {isPrivacyMode ? 'Daily target' : `Target ${formatPnl(target.target, bahtRate)}`}
            {' · '}
            {!target.hitAt
              ? 'not reached'
              : `reached at ${clockOf(target.hitAt)}`}
            {/* What came after the target, as plain figures in grey. */}
            {target.afterCount > 0 && (
              <span className="text-ink-faint">
                · {target.afterCount} {target.afterCount === 1 ? 'trade' : 'trades'} after
                {!isPrivacyMode && `: ${formatPnl(target.afterPnl, bahtRate)}`} · {formatNumber(target.afterRr)} R
              </span>
            )}
          </p>
        )}
        {dayTrades.length > 0 && (
          <NoteAccordion
            title={`Trades · ${dayTrades.length}`}
            extra={offPlanCount > 0 && <span className="text-loss">{offPlanCount} off plan</span>}
          >
            {dayTrades.map(t => {
              const outcome = classifyTrade(t);
              const tone = outcome === 'win' ? 'text-accent' : outcome === 'loss' ? 'text-loss' : 'text-ink-faint';
              const entryClock = clockOf(t.entryTime);
              // Closed after midnight, before the trading day rolled over: its real date is the next day.
              const closedNextDay = dayKeyOfTime(t.time, 0) !== date;
              return (
                <button
                  key={t.id}
                  type="button"
                  title="Open this trade"
                  onClick={() => setDetailId(t.id)}
                  className="w-full shrink-0 flex items-center gap-2 md:gap-3 bg-surface hover:bg-surface-2 rounded-xl px-3 py-2 text-[11px] font-bold text-left transition"
                >
                  <span className="text-ink-faint tabular-nums w-[88px] md:w-[96px] shrink-0">
                    {entryClock && `${entryClock} – `}{clockOf(t.time)}
                    {closedNextDay && <sup className="ml-0.5 text-[8px]" title="Closed after midnight, the next day by the clock">+1</sup>}
                  </span>
                  <span className="text-ink w-8 shrink-0">{t.side}</span>
                  <span className="w-3.5 shrink-0" title={isOnPlan(t) ? undefined : "Off plan"}>
                    {!isOnPlan(t) && <XCircle className="w-3.5 h-3.5 text-loss" />}
                  </span>
                  <span className="text-ink-muted flex-1 min-w-0 truncate"><span className="hidden md:inline">{t.symbol}{t.tf && t.tf !== 'none' ? ` · ${t.tf}` : ''}</span></span>
                  <span className={`${tone} w-6 shrink-0`}>{outcomeLabel(outcome)}</span>
                  {!isPrivacyMode && (
                    <span className={`${tone} tabular-nums w-14 md:w-16 shrink-0 text-right`}>{formatPnl(t.profit, bahtRate)}</span>
                  )}
                  <span className={`${tone} tabular-nums w-12 md:w-16 shrink-0 text-right`}>{formatNumber(t.rr)} R</span>
                </button>
              );
            })}
          </NoteAccordion>
        )}
    </NoteModal>
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
