"use client";

import { useState } from "react";
import { Sunrise } from "lucide-react";
import { useJournalStore } from "@/store/useJournalStore";
import { DEFAULT_DAY_START_HOUR, dayKey } from "@/lib/dayNotes";
import { withChange } from "@/lib/settingHistory";
import SaveRow from "@/components/SaveRow";
import SettingsCard, { SETTINGS_INPUT } from "./SettingsCard";

// Midnight to 8am: the broker's day rolls over at 4 or 5am Bangkok time.
const HOURS = Array.from({ length: 9 }, (_, h) => h);

// The hour a trading day starts, so a trade closed after midnight still counts for the evening before.
export default function TradingDaySetting() {
  const updatePreferences = useJournalStore(state => state.updatePreferences);
  const saved = useJournalStore(state => state.preferences.dayStartHour) ?? DEFAULT_DAY_START_HOUR;
  const history = useJournalStore(state => state.preferences.dayStartHistory);
  const [value, setValue] = useState<number | null>(null); // null = not edited yet
  const [isSaving, setIsSaving] = useState(false);

  const shown = value ?? saved;
  const isDirty = value !== null && value !== saved;

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // From tomorrow's date on: today and every day before it keep the hour they started at, so no trade
      // moves out of a day that has already begun.
      const now = new Date();
      const tomorrow = dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
      await updatePreferences({ dayStartHour: shown, dayStartHistory: withChange(history, saved, shown, tomorrow) });
      setValue(null);
    } catch {
      alert("Failed to save the start of the trading day.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SettingsCard
      icon={Sunrise}
      title="Trading Day"
      description="วันเทรดเริ่มกี่โมง (เวลาไทย) เทรดที่ปิดก่อนเวลานี้นับเป็นของวันก่อนหน้า เช่น ปิดตี 1 วันเสาร์ นับเป็นวันศุกร์ ใช้กับ Calendar, Notes, เป้ารายวัน และวินัย ส่วน Statement รายงานภาษี และตัวกรองวันที่ใน History ใช้วันที่จริงเสมอ เลือก 00:00 เพื่อตัดวันตอนเที่ยงคืน ค่าใหม่เริ่มใช้ตั้งแต่พรุ่งนี้ วันที่ผ่านมาแล้วยังใช้เวลาเดิม เทรดเก่าจึงไม่ย้ายวัน"
    >
      {/* Same grid as two-field cards, so a single field is one column wide */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <label className="block text-sm font-bold text-stone-950">Day starts at <span className="font-medium text-stone-400">(default {String(DEFAULT_DAY_START_HOUR).padStart(2, "0")}:00)</span></label>
          <select value={shown} onChange={(e) => setValue(Number(e.target.value))} className={SETTINGS_INPUT}>
            {HOURS.map(h => <option key={h} value={h}>{String(h).padStart(2, "0")}:00{h === 0 ? " (midnight)" : ""}</option>)}
          </select>
        </div>
      </div>

      <SaveRow isDirty={isDirty} canSave isSaving={isSaving} onSave={handleSave} />
    </SettingsCard>
  );
}
