"use client";

import { useMemo, useState } from "react";
import { XCircle, Plus, Trash2, Undo2 } from "lucide-react";
import { useJournalStore } from "@/store/useJournalStore";
import { SUGGESTED_OFF_PLAN_REASONS, reasonUsage, withoutReason, type OffPlanReason } from "@/lib/offPlan";
import { useOffPlanReasons } from "@/components/useOffPlanReasons";
import SaveRow from "@/components/SaveRow";
import SettingsCard, { SETTINGS_INPUT } from "./SettingsCard";

const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`);

// Why a trade can be off plan, picked on the trade itself. Removing a reason some trade still names only
// stops offering it: those trades keep it until it is taken off in their own Edit, and it can be put back.
export default function OffPlanReasonsSetting() {
  const updatePreferences = useJournalStore(state => state.updatePreferences);
  const trades = useJournalStore(state => state.trades);
  const savedReasons = useOffPlanReasons();
  const usage = useMemo(() => reasonUsage(trades), [trades]);
  const [edits, setEdits] = useState<OffPlanReason[] | null>(null); // null = not edited yet
  const [draft, setDraft] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const reasons = edits ?? savedReasons;
  const inUse = reasons.filter(r => !r.removed);
  // Removed ones still named by a trade; the ones no trade names any more are dropped on save.
  const removed = reasons.filter(r => r.removed && (usage.get(r.id) ?? 0) > 0);
  const isDirty = edits !== null && JSON.stringify(edits) !== JSON.stringify(savedReasons);
  const isValid = inUse.every(r => r.name.trim() !== "");
  const suggestions = SUGGESTED_OFF_PLAN_REASONS.filter(name => ![...inUse, ...removed].some(r => r.name.trim() === name));

  // Adding the name of a removed reason puts that one back, so its trades and the new ones share it.
  const add = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed || inUse.some(r => r.name.trim() === trimmed)) return;
    const old = reasons.find(r => r.removed && r.name.trim() === trimmed);
    setEdits(old ? restored(old.id) : [...reasons, { id: newId(), name: trimmed }]);
    setDraft("");
  };
  const restored = (id: string) => reasons.map(r => (r.id === id ? { id: r.id, name: r.name } : r));
  const rename = (id: string, name: string) => setEdits(reasons.map(r => (r.id === id ? { ...r, name } : r)));
  const remove = (id: string) => setEdits(withoutReason(reasons, id, usage));

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updatePreferences({
        offPlanReasons: reasons
          .filter(r => !r.removed || (usage.get(r.id) ?? 0) > 0)
          .map(r => ({ ...r, name: r.name.trim() })),
      });
      setEdits(null);
    } catch {
      alert("Failed to save the reasons.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SettingsCard
      icon={XCircle}
      title="Off Plan Reasons"
      description="สาเหตุที่เทรดผิดแผน เลือกได้ตอนเพิ่ม แก้ไข หรือ Import เทรด ทุกเทรดที่ Off Plan ต้องมีอย่างน้อย 1 ข้อ ลบข้อที่มีเทรดใช้อยู่ เทรดเก่ายังเก็บข้อนั้นไว้ จนกว่าจะเอาออกเองใน Edit ของเทรดนั้น"
    >
      <div className="space-y-2">
        {inUse.length === 0 && <p className="text-sm font-medium text-ink-faint">No reasons yet. Add your own below, or pick a suggestion.</p>}
        {inUse.map(reason => {
          const used = usage.get(reason.id) ?? 0;
          return (
            <div key={reason.id} className="flex items-center gap-2">
              <div className="relative flex-1 min-w-0">
                <input type="text" value={reason.name} onChange={(e) => rename(reason.id, e.target.value)} aria-label="Reason" className={`${SETTINGS_INPUT} ${used > 0 ? "pr-24" : ""}`} />
                {used > 0 && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-bold text-ink-faint whitespace-nowrap pointer-events-none">
                    {used} {used === 1 ? "trade" : "trades"}
                  </span>
                )}
              </div>
              <button type="button" onClick={() => remove(reason.id)}
                title={used > 0 ? `Remove: no longer offered; the ${used} ${used === 1 ? "trade" : "trades"} naming it keep it` : "Remove this reason"}
                aria-label={`Remove ${reason.name}`}
                className="w-11 h-11 shrink-0 flex items-center justify-center rounded-xl bg-surface-2 hover:bg-loss-soft text-ink-muted hover:text-loss transition">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          );
        })}
        <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); add(draft); }}>
          <input type="text" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="e.g. ปิด TP ก่อนแผน" className={SETTINGS_INPUT} />
          <button type="submit" disabled={!draft.trim()} title="Add this reason" aria-label="Add this reason"
            className="w-11 h-11 shrink-0 flex items-center justify-center rounded-xl bg-card border border-accent text-accent hover:bg-accent-soft disabled:opacity-40 transition">
            <Plus className="w-4 h-4" />
          </button>
        </form>
      </div>

      {/* Removed, but still on old trades: shown so they can be put back. */}
      {removed.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-bold text-ink-faint uppercase tracking-widest mb-2">Removed, kept on old trades</p>
          <div className="flex flex-wrap gap-2">
            {removed.map(r => {
              const used = usage.get(r.id) ?? 0;
              return (
                <button key={r.id} type="button" onClick={() => setEdits(restored(r.id))} title="Put this reason back"
                  className="h-8 px-3 rounded-full flex items-center gap-1.5 text-xs font-bold bg-surface border border-line text-ink-faint hover:text-accent hover:border-accent-line transition">
                  <Undo2 className="w-3.5 h-3.5" />
                  <span className="line-through">{r.name}</span>
                  <span className="text-ink-disabled">{used} {used === 1 ? "trade" : "trades"}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {suggestions.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-bold text-ink-faint uppercase tracking-widest mb-2">Suggestions</p>
          <div className="flex flex-wrap gap-2">
            {suggestions.map(name => (
              <button key={name} type="button" onClick={() => add(name)}
                className="h-8 px-3 rounded-full flex items-center gap-1 text-xs font-bold bg-surface border border-line text-ink-muted hover:text-accent hover:border-accent-line transition">
                <Plus className="w-3.5 h-3.5" />
                {name}
              </button>
            ))}
          </div>
        </div>
      )}

      <SaveRow isDirty={isDirty} canSave={isValid} isSaving={isSaving} onSave={handleSave} onCancel={() => { setEdits(null); setDraft(""); }} />
    </SettingsCard>
  );
}
