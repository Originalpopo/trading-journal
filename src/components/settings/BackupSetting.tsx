"use client";

import { useState } from "react";
import { DatabaseBackup, Download, Upload } from "lucide-react";
import { useJournalStore } from "@/store/useJournalStore";
import { downloadDatabase, restoreDatabase } from "@/lib/dbActions";
import { BACKUP_DUE_DAYS } from "@/lib/backupReminder";
import { useBackupAge } from "@/components/BackupReminder";
import SettingsCard, { SETTINGS_INPUT } from "./SettingsCard";
import SaveRow from "@/components/SaveRow";

// Download and restore the whole database, and how long before the backup reminder turns red.
// Clearing the database stays in the Import & Backup popup only, away from everyday settings.
export default function BackupSetting() {
  const { trades, funding, dayNotes, weekNotes, preferences, updatePreferences } = useJournalStore();
  const age = useBackupAge();
  const savedDays = preferences.backupDueDays ?? BACKUP_DUE_DAYS;
  const [days, setDays] = useState<string | null>(null); // null = not edited yet
  const [isSaving, setIsSaving] = useState(false);
  const [restoreStatus, setRestoreStatus] = useState<string | null>(null);

  const shownDays = days ?? savedDays.toString();
  const parsedDays = Number(shownDays);
  const isDaysDirty = days !== null && parsedDays !== savedDays;
  const isDaysValid = Number.isInteger(parsedDays) && parsedDays >= 1 && parsedDays <= 365;

  const lastBackup = preferences.lastBackupAt ? new Date(preferences.lastBackupAt) : null;

  const handleSaveDays = async () => {
    setIsSaving(true);
    try {
      await updatePreferences({ backupDueDays: parsedDays });
      setDays(null);
    } catch {
      alert("Failed to save the reminder.");
    } finally {
      setIsSaving(false);
    }
  };

  const onRestore = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!window.confirm(`Restore from "${file.name}"? Entries in the file replace the ones with the same ID in the journal.`)) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (!text) return;
      restoreDatabase(
        text,
        (status) => setRestoreStatus(status),
        (result) => {
          setRestoreStatus(null);
          alert(`Successfully restored ${result.trades} trades, ${result.funding} funding entries, ${result.notes} day notes, ${result.weekNotes} week notes${result.preferences ? ', and your settings (balance checks, statement details)' : ''}.`);
        },
        () => {
          setRestoreStatus(null);
          alert("Failed to restore the backup.");
        }
      );
    };
    reader.readAsText(file);
  };

  return (
    <SettingsCard
      icon={DatabaseBackup}
      title="Backup"
      description="Journal นี้เป็นที่เก็บประวัติเทรดเพียงที่เดียว ดาวน์โหลดไฟล์ backup เก็บไว้เป็นระยะ ไฟล์รวมเทรด เงินเข้าออก โน้ต และค่าตั้งทั้งหมด"
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 pb-6 border-b border-stone-100">
        <div className="min-w-0">
          <p className="text-xs font-bold text-ink-faint uppercase tracking-widest mb-1">Last backup</p>
          <p className={`font-bold ${age?.isDue ? "text-loss" : "text-ink"}`}>
            {lastBackup ? lastBackup.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "Never"}
            {age && <span className="font-medium text-ink-faint ml-2">{age.label}</span>}
          </p>
        </div>
        <div className="flex gap-3 shrink-0">
          <label className={`flex-1 md:flex-none cursor-pointer px-5 py-2.5 bg-surface-2 hover:bg-stone-200 text-stone-600 font-bold rounded-xl transition flex items-center justify-center gap-2 ${restoreStatus ? "opacity-50 pointer-events-none" : ""}`}>
            <Upload className="w-4 h-4" />
            {restoreStatus ?? "Restore"}
            <input type="file" accept=".json" className="hidden" onChange={onRestore} />
          </label>
          <button
            type="button"
            onClick={() => downloadDatabase(trades, funding, dayNotes, weekNotes, preferences)}
            className="flex-1 md:flex-none px-5 py-2.5 bg-white hover:bg-accent-soft text-accent font-bold rounded-xl transition border border-accent flex items-center justify-center gap-2"
          >
            <Download className="w-4 h-4" />
            <span className="whitespace-nowrap">Download<span className="hidden md:inline"> Backup</span></span>
          </button>
        </div>
      </div>

      {/* Same grid as two-field cards, so a single field is one column wide */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <label className="block text-sm font-bold text-ink">Remind after (days) <span className="font-medium text-ink-faint">(default {BACKUP_DUE_DAYS})</span></label>
          <input type="number" step="1" min="1" max="365" value={shownDays} onChange={(e) => setDays(e.target.value)} className={SETTINGS_INPUT} />
        </div>
      </div>

      <SaveRow isDirty={isDaysDirty} canSave={isDaysValid} isSaving={isSaving} onSave={handleSaveDays} />
    </SettingsCard>
  );
}
