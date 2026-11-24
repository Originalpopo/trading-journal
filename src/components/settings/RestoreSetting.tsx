"use client";

import { useState } from "react";
import { ArchiveRestore, Upload } from "lucide-react";
import { parseBackup } from "@/lib/restorePlan";
import RestoreModal, { type RestoreFile } from "./RestoreModal";
import SettingsCard from "./SettingsCard";

// Putting the journal back from a backup file. The file is read first, then RestoreModal shows what it holds and
// asks inside the app. No browser confirm(): a browser can block it silently, and the button then seemed dead.
export default function RestoreSetting() {
  const [restoreFile, setRestoreFile] = useState<RestoreFile | null>(null);

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const bad = () => setRestoreFile({ fileName: file.name, size: file.size, backup: null, skipped: 0 });
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const { backup, skipped } = parseBackup((event.target?.result as string) ?? "");
        setRestoreFile({ fileName: file.name, size: file.size, backup, skipped });
      } catch {
        bad();
      }
    };
    reader.onerror = bad;
    reader.readAsText(file);
  };

  return (
    <SettingsCard
      icon={ArchiveRestore}
      title="Restore"
      description="เอาข้อมูลกลับจากไฟล์ backup journal จะกลับเป็นแบบในไฟล์ทุกอย่าง ข้อมูลที่ไม่มีในไฟล์จะถูกลบ PIN ไม่ถูกแตะ"
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-bold text-ink">Restore from a backup file</p>
          <p className="text-body font-semibold text-ink-muted">เลือกไฟล์แล้วจะเห็นสิ่งที่อยู่ในไฟล์ก่อน ยังไม่มีอะไรเปลี่ยนจนกว่าจะกด Restore</p>
        </div>
        <label className="shrink-0 cursor-pointer px-5 py-2.5 bg-surface-2 hover:bg-line text-ink-muted font-bold rounded-box transition flex items-center justify-center gap-2">
          <Upload className="w-4 h-4" />
          <span className="whitespace-nowrap">Choose file</span>
          <input type="file" accept=".json" className="hidden" onChange={onPick} />
        </label>
      </div>
      {restoreFile && <RestoreModal file={restoreFile} onClose={() => setRestoreFile(null)} />}
    </SettingsCard>
  );
}
