"use client";

import { useState } from "react";
import { Target } from "lucide-react";
import { useJournalStore } from "@/store/useJournalStore";
import { DEFAULT_TARGET_PCT, withPctChange } from "@/lib/dailyTarget";
import { useTradingDay } from "@/components/useTradingDay";
import SaveRow from "@/components/SaveRow";
import SettingsCard, { SETTINGS_INPUT } from "./SettingsCard";

type Mode = "history" | "current";

const MODES: { value: Mode; label: string; hint: string }[] = [
  { value: "history", label: "By history", hint: "วันที่ผ่านมาใช้ % ที่ตั้งไว้ในตอนนั้น ค่าใหม่มีผลตั้งแต่วันนี้" },
  { value: "current", label: "Current %", hint: "ทุกวัน รวมถึงวันที่ผ่านมา ใช้ % ที่ตั้งไว้ตอนนี้" },
];

const dateText = (day: string) =>
  new Date(`${day}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

// The daily profit target, as a share of the balance each day starts with, and whether past days keep the
// % they were held to then. Every change is recorded either way, so switching back loses nothing.
export default function DailyTargetSetting() {
  const updatePreferences = useJournalStore(state => state.updatePreferences);
  const saved = useJournalStore(state => state.preferences.dailyTargetPct) ?? DEFAULT_TARGET_PCT;
  const history = useJournalStore(state => state.preferences.dailyTargetHistory);
  const savedMode: Mode = useJournalStore(state => state.preferences.dailyTargetMode) ?? "history";
  const { today } = useTradingDay();
  const [value, setValue] = useState<string | null>(null); // null = not edited yet
  const [mode, setMode] = useState<Mode | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const shown = value ?? saved.toString();
  const parsed = Number(shown);
  const shownMode = mode ?? savedMode;
  const isPctDirty = value !== null && parsed !== saved;
  const isDirty = isPctDirty || shownMode !== savedMode;
  const isValid = shown.trim() !== "" && parsed >= 0 && parsed <= 100;

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updatePreferences({
        ...(isPctDirty && { dailyTargetPct: parsed, dailyTargetHistory: withPctChange(history, saved, parsed, today) }),
        ...(shownMode !== savedMode && { dailyTargetMode: shownMode }),
      });
      setValue(null);
      setMode(null);
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
      description="เป้ากำไรต่อวัน คิดเป็น % ของยอดเงินตอนเริ่มวันนั้น ถึงเป้าแล้วหยุดเทรด Dashboard แสดงความคืบหน้าของวันนี้ Calendar แสดงวันที่ถึงเป้า และเทรดที่เข้าหลังถึงเป้าจะนับเป็นวันผิดวินัย ใส่ 0 เพื่อปิด"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <label className="block text-sm font-bold text-stone-950">Target (% of the day&apos;s starting balance) <span className="font-medium text-stone-400">(default {DEFAULT_TARGET_PCT})</span></label>
          <input type="number" step="0.1" min="0" max="100" value={shown} onChange={(e) => setValue(e.target.value)} className={SETTINGS_INPUT} />
        </div>

        <div className="space-y-2">
          <span className="block text-sm font-bold text-stone-950">Past days</span>
          <div className="flex bg-stone-100 p-1 rounded-xl" role="group" aria-label="Past days">
            {MODES.map(m => (
              <button
                key={m.value}
                type="button"
                onClick={() => setMode(m.value)}
                aria-pressed={shownMode === m.value}
                className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition ${
                  shownMode === m.value ? "bg-white text-orange-400 shadow-sm" : "text-stone-400 hover:text-stone-600"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
          <p className="text-xs font-medium text-stone-500">{MODES.find(m => m.value === shownMode)!.hint}</p>
        </div>
      </div>

      {/* Every change of the %, newest first: kept in both modes, used only by "By history". */}
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
