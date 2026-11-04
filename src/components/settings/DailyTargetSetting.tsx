"use client";

import { useState } from "react";
import { Target } from "lucide-react";
import { useJournalStore } from "@/store/useJournalStore";
import { DEFAULT_TARGET_PCT, withPctChange } from "@/lib/dailyTarget";
import { useTradingDay } from "@/components/useTradingDay";
import SaveRow from "@/components/SaveRow";
import SettingsCard, { SETTINGS_INPUT } from "./SettingsCard";

const dateText = (day: string) =>
  new Date(`${day}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

// The daily profit target, as a share of the balance each day starts with. Past days keep the % they were
// held to then: a change counts from today on, and every change is listed.
export default function DailyTargetSetting() {
  const updatePreferences = useJournalStore(state => state.updatePreferences);
  const saved = useJournalStore(state => state.preferences.dailyTargetPct) ?? DEFAULT_TARGET_PCT;
  const history = useJournalStore(state => state.preferences.dailyTargetHistory);
  const { today } = useTradingDay();
  const [value, setValue] = useState<string | null>(null); // null = not edited yet
  const [isSaving, setIsSaving] = useState(false);

  const shown = value ?? saved.toString();
  const parsed = Number(shown);
  const isDirty = value !== null && parsed !== saved;
  const isValid = shown.trim() !== "" && parsed >= 0 && parsed <= 100;

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updatePreferences({ dailyTargetPct: parsed, dailyTargetHistory: withPctChange(history, saved, parsed, today) });
      setValue(null);
    } catch {
      alert("Failed to save the daily target.");
    } finally {
      setIsSaving(false);
    }
  };

  // Newest first; the entry from "" is the % used before the first change.
  const changes = (history ?? []).length > 1 ? [...history!].reverse() : [];

  return (
    <SettingsCard
      icon={Target}
      title="Daily Target"
      description="เป้ากำไรต่อวัน คิดเป็น % ของยอดเงินตอนเริ่มวันนั้น Dashboard และ Calendar แสดงความคืบหน้าของวันนี้และแต่ละสัปดาห์ ผลของเทรดที่เข้าหลังถึงเป้าดูได้ในหน้า Notes และ popup ของแต่ละวัน ไม่นับเป็นวันผิดวินัย ใส่ 0 เพื่อปิด"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <label className="block text-sm font-bold text-stone-950">Target (% of the day&apos;s starting balance) <span className="font-medium text-stone-400">(default {DEFAULT_TARGET_PCT})</span></label>
          <input type="number" step="0.1" min="0" max="100" value={shown} onChange={(e) => setValue(e.target.value)} className={SETTINGS_INPUT} />
          <p className="text-xs font-medium text-stone-500">วันที่ผ่านมาใช้ % ที่ตั้งไว้ในตอนนั้น ค่าใหม่มีผลตั้งแต่วันนี้</p>
        </div>

      </div>

      {/* Every change of the %, newest first. */}
      {changes.length > 0 && (
        <div className="mt-6 space-y-2">
          <span className="block text-sm font-bold text-stone-950">Changes</span>
          <ul className="bg-stone-50 rounded-xl divide-y divide-stone-100 text-sm">
            {changes.map(c => (
              <li key={c.from} className="flex items-center justify-between px-4 py-2.5">
                <span className="font-medium text-stone-500">{c.from ? `From ${dateText(c.from)}` : "Before that"}</span>
                <span className="font-bold text-stone-950 tabular-nums">{c.pct}%</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <SaveRow isDirty={isDirty} canSave={isValid} isSaving={isSaving} onSave={handleSave} />
    </SettingsCard>
  );
}
