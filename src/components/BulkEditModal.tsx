"use client";

import { useState } from "react";
import { X, CheckCircle2, XCircle, ClipboardCheck, type LucideIcon } from "lucide-react";
import { useJournalStore, Trade } from "@/store/useJournalStore";
import { CHECKLIST_NAMES, applyChecklistChanges, type ChecklistChange } from "@/lib/checklists";
import { useEscapeToClose } from "@/lib/useEscapeToClose";

const CHECKLIST_ICONS: Record<string, LucideIcon> = {
  'On Plan': ClipboardCheck,
};

const TIMEFRAMES = ['1s', '5s', '15s', '1m', '5m', '15m', '1h'];

interface BulkEditModalProps {
  isOpen: boolean;
  trades: Trade[];
  onClose: (applied: boolean) => void;
}

// Edits "On Plan" and timeframe of several trades at once. Every item starts at "Keep", so only
// what the user explicitly changes is written.
export default function BulkEditModal({ isOpen, trades, onClose }: BulkEditModalProps) {
  const updateTrades = useJournalStore(state => state.updateTrades);
  const [changes, setChanges] = useState<Record<string, ChecklistChange>>({});
  const [tf, setTf] = useState<string>('keep');
  const [isSaving, setIsSaving] = useState(false);

  const close = (applied: boolean) => {
    setChanges({});
    setTf('keep');
    onClose(applied);
  };
  useEscapeToClose(isOpen, () => close(false));

  if (!isOpen) return null;

  const hasChanges = tf !== 'keep' || Object.values(changes).some(c => c !== 'keep');

  const handleApply = async () => {
    setIsSaving(true);
    try {
      await updateTrades(trades.map(t => {
        const data: Partial<Trade> = {};
        if (Object.values(changes).some(c => c !== 'keep')) {
          // Older trades mark "On Plan" only through isOnPlan; start from what the table shows.
          const current = [...(t.checklists || [])];
          if (t.isOnPlan !== false && !current.includes('On Plan')) current.unshift('On Plan');
          const checklists = applyChecklistChanges(current, changes);
          data.checklists = checklists;
          data.isOnPlan = checklists.includes('On Plan');
        }
        if (tf !== 'keep') data.tf = tf;
        return { id: t.id, data };
      }));
      close(true);
    } catch {
      alert("Failed to update the trades. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const options: { value: ChecklistChange; label: string }[] = [
    { value: 'keep', label: 'Keep' },
    { value: 'add', label: 'On' },
    { value: 'remove', label: 'Off' },
  ];

  return (
    <div className="fixed inset-0 bg-stone-900/50 flex items-center justify-center z-[100] p-4 animate-fadeIn" onClick={() => close(false)}>
      <div className="bg-white rounded-3xl w-full max-w-lg p-6 md:p-8 shadow-2xl flex flex-col max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between pb-4 mb-6 border-b border-stone-100">
          <h3 className="text-2xl font-black text-stone-950 tracking-tight">Edit {trades.length} Trades</h3>
          <button onClick={() => close(false)} className="text-stone-400 hover:text-stone-600 p-1 rounded-full hover:bg-stone-100 transition">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="space-y-6 overflow-y-auto">
          <div>
            <label className="block text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-3">Plan</label>
            <div className="space-y-2">
              {CHECKLIST_NAMES.map(name => {
                const Icon = CHECKLIST_ICONS[name];
                const change = changes[name] || 'keep';
                return (
                  <div key={name} className={`flex items-center justify-between px-3 py-2 rounded-xl border transition ${
                    change === 'add' ? 'bg-orange-50 border-orange-200' : change === 'remove' ? 'bg-stone-50 border-stone-200' : 'bg-white border-stone-100'
                  }`}>
                    <span className={`flex items-center gap-2 text-sm font-bold ${
                      change === 'add' ? 'text-orange-400' : change === 'remove' ? 'text-stone-400 opacity-70' : 'text-stone-700'
                    }`}>
                      <Icon className="w-4 h-4" />
                      {name}
                      {change === 'add' && <CheckCircle2 className="w-3.5 h-3.5" />}
                      {change === 'remove' && <XCircle className="w-3.5 h-3.5" />}
                    </span>
                    <div className="flex items-center bg-stone-100 p-0.5 rounded-lg">
                      {options.map(opt => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setChanges(prev => ({ ...prev, [name]: opt.value }))}
                          className={`text-[11px] font-bold px-3 py-1 rounded-md transition ${
                            change === opt.value ? 'bg-white text-stone-950 shadow-sm' : 'text-stone-400 hover:text-stone-600'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-2">Timeframe (TF)</label>
            <div className="flex gap-2 flex-wrap">
              {['keep', ...TIMEFRAMES].map(item => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setTf(item)}
                  className={`px-3 py-1 text-xs font-bold rounded-md transition ${
                    tf === item ? 'bg-orange-400 text-white shadow-sm' : 'bg-white border border-stone-200 text-stone-500 hover:bg-stone-100'
                  }`}
                >
                  {item === 'keep' ? 'Keep' : item}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex gap-3 justify-end pt-4 mt-6 border-t border-stone-100 shrink-0">
          <button onClick={() => close(false)} disabled={isSaving}
            className="px-6 py-2.5 rounded-xl text-xs font-bold bg-stone-100 text-stone-600 hover:bg-stone-200 transition">Cancel</button>
          <button onClick={handleApply} disabled={isSaving || !hasChanges}
            className="px-6 py-2.5 rounded-xl text-xs font-bold bg-orange-400 text-white hover:bg-orange-500 shadow-md shadow-orange-200 transition disabled:opacity-50">
            {isSaving ? "Saving..." : `Apply to ${trades.length} trades`}
          </button>
        </div>
      </div>
    </div>
  );
}
