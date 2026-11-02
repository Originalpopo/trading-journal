"use client";

import { useState } from "react";
import { Target } from "lucide-react";
import { useJournalStore } from "@/store/useJournalStore";
import { DEFAULT_TARGET_PCT } from "@/lib/dailyTarget";
import SaveRow from "@/components/SaveRow";
import SettingsCard, { SETTINGS_INPUT } from "./SettingsCard";

// The daily profit target, as a share of the balance each day starts with.
export default function DailyTargetSetting() {
  const updatePreferences = useJournalStore(state => state.updatePreferences);
  const saved = useJournalStore(state => state.preferences.dailyTargetPct) ?? DEFAULT_TARGET_PCT;
  const [value, setValue] = useState<string | null>(null); // null = not edited yet
  const [isSaving, setIsSaving] = useState(false);

  const shown = value ?? saved.toString();
  const parsed = Number(shown);
  const isDirty = value !== null && parsed !== saved;
  const isValid = shown.trim() !== "" && parsed >= 0 && parsed <= 100;

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updatePreferences({ dailyTargetPct: parsed });
      setValue(null);
    } catch {
      alert("Failed to save the daily target.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SettingsCard
      icon={Target}
      title="Daily Target"
      description="เป้ากำไรต่อวัน คิดเป็น % ของยอดเงินตอนเริ่มวันนั้น ถึงเป้าแล้วหยุดเทรด Dashboard แสดงความคืบหน้าของวันนี้ Calendar แสดงวันที่ถึงเป้า และเทรดที่เข้าหลังถึงเป้าจะนับเป็นวันผิดวินัย ใส่ 0 เพื่อปิด"
    >
      {/* Same grid as two-field cards, so a single field is one column wide */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <label className="block text-sm font-bold text-stone-950">Target (% of the day&apos;s starting balance) <span className="font-medium text-stone-400">(default {DEFAULT_TARGET_PCT})</span></label>
          <input type="number" step="0.1" min="0" max="100" value={shown} onChange={(e) => setValue(e.target.value)} className={SETTINGS_INPUT} />
        </div>
      </div>

      <SaveRow isDirty={isDirty} canSave={isValid} isSaving={isSaving} onSave={handleSave} />
    </SettingsCard>
  );
}
