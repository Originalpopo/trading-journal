"use client";

import { useState } from "react";
import { ListChecks, Plus, Trash2 } from "lucide-react";
import { useJournalStore } from "@/store/useJournalStore";
import { SUGGESTED_RULES, type DisciplineRule } from "@/lib/discipline";
import SaveRow from "@/components/SaveRow";
import SettingsCard, { SETTINGS_INPUT } from "./SettingsCard";

const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`);

// The user's own trading rules for a whole day (one trade's mistakes are Off Plan reasons, on the trade).
// A day note ticks the ones broken that day; the Notes page counts them.
export default function DisciplineRulesSetting() {
  const updatePreferences = useJournalStore(state => state.updatePreferences);
  const saved = useJournalStore(state => state.preferences.disciplineRules);
  const [edits, setEdits] = useState<DisciplineRule[] | null>(null); // null = not edited yet
  const [draft, setDraft] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const savedRules = saved ?? [];
  const rules = edits ?? savedRules;
  const isDirty = edits !== null && JSON.stringify(edits) !== JSON.stringify(savedRules);
  const isValid = rules.every(r => r.name.trim() !== "");
  const suggestions = SUGGESTED_RULES.filter(name => !rules.some(r => r.name.trim() === name));

  const add = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed || rules.some(r => r.name.trim() === trimmed)) return;
    setEdits([...rules, { id: newId(), name: trimmed }]);
    setDraft("");
  };
  const rename = (id: string, name: string) => setEdits(rules.map(r => (r.id === id ? { ...r, name } : r)));
  const remove = (id: string) => setEdits(rules.filter(r => r.id !== id));

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updatePreferences({ disciplineRules: rules.map(r => ({ ...r, name: r.name.trim() })) });
      setEdits(null);
    } catch {
      alert("Failed to save the rules.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SettingsCard
      icon={ListChecks}
      title="Discipline Rules"
      description="กฎการเทรดระดับทั้งวันที่ผูกกับเทรดใดเทรดหนึ่งไม่ได้ เช่น เทรดแก้แค้น หรือเทรดเกินจำนวน (ความผิดในเทรดเดียวให้ใช้ Off Plan Reasons) ในโน้ตรายวันติ๊กได้ว่าวันนั้นทำผิดข้อไหน หน้า Notes จะนับว่าผิดข้อไหนบ่อยที่สุด และนับวันที่เทรดตามแผนติดกัน ลบกฎแล้วโน้ตเก่าที่เคยติ๊กข้อนั้นจะไม่นับข้อนั้นอีก"
    >
      <div className="space-y-2">
        {rules.length === 0 && <p className="text-sm font-medium text-ink-faint">No rules yet. Add your own below, or pick a suggestion.</p>}
        {rules.map(rule => (
          <div key={rule.id} className="flex items-center gap-2">
            <input type="text" value={rule.name} onChange={(e) => rename(rule.id, e.target.value)} aria-label="Rule" className={SETTINGS_INPUT} />
            <button type="button" onClick={() => remove(rule.id)} title="Remove this rule" aria-label={`Remove ${rule.name}`}
              className="w-11 h-11 shrink-0 flex items-center justify-center rounded-xl bg-surface-2 hover:bg-loss-soft text-ink-muted hover:text-loss transition">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
        <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); add(draft); }}>
          <input type="text" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="A rule you keep breaking, e.g. Revenge trade" className={SETTINGS_INPUT} />
          <button type="submit" disabled={!draft.trim()} title="Add this rule" aria-label="Add this rule"
            className="w-11 h-11 shrink-0 flex items-center justify-center rounded-xl bg-card border border-accent text-accent hover:bg-accent-soft disabled:opacity-40 transition">
            <Plus className="w-4 h-4" />
          </button>
        </form>
      </div>

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
