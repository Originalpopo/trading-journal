"use client";

import { useState } from "react";
import { Equal } from "lucide-react";
import { useJournalStore } from "@/store/useJournalStore";
import { BE_RR_THRESHOLD } from "@/lib/stats";
import SettingsCard, { SETTINGS_INPUT } from "./SettingsCard";
import SaveRow from "@/components/SaveRow";

// How close to zero a result must be to count as break-even, for trades the broker data can't label.
export default function BreakEvenSetting() {
  const updatePreferences = useJournalStore(state => state.updatePreferences);
  const saved = useJournalStore(state => state.preferences.beThreshold) ?? BE_RR_THRESHOLD;
  const [value, setValue] = useState<string | null>(null); // null = not edited yet
  const [isSaving, setIsSaving] = useState(false);

  const shown = value ?? saved.toString();
  const parsed = Number(shown);
  const isDirty = value !== null && parsed !== saved;
  const isValid = shown !== "" && parsed >= 0 && parsed <= 1;

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updatePreferences({ beThreshold: parsed });
      setValue(null);
    } catch {
      alert("Failed to save the break-even range.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SettingsCard
      icon={Equal}
      title="Break-even (BE)"
      description={<>
        เทรดที่ปิดเองหรือไม่รู้ว่าปิดด้วยอะไร ถ้าได้หรือเสียไม่เกิน ±{saved}R นับเป็น BE
        และเทรดที่ SL ถูกเลื่อนตามกำไรแล้วโดน ถ้าได้เกิน {saved}R นับเป็น TP
        ถ้าเปลี่ยนค่านี้ ป้าย TP/SL/BE และ Win rate ของเทรดเก่าทุกตัวจะเปลี่ยนตาม (ตัวเงินไม่เปลี่ยน)
      </>}
    >
      {/* Same grid as two-field cards, so a single field is one column wide */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <label className="block text-sm font-bold text-stone-950">BE range ±R <span className="font-medium text-stone-400">(default {BE_RR_THRESHOLD})</span></label>
          <input type="number" step="0.05" min="0" max="1" value={shown} onChange={(e) => setValue(e.target.value)} className={SETTINGS_INPUT} />
        </div>
      </div>

      <SaveRow isDirty={isDirty} canSave={isValid} isSaving={isSaving} onSave={handleSave} />
    </SettingsCard>
  );
}
