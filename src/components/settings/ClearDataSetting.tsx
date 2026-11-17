"use client";

import { useState } from "react";
import { Trash2, NotebookPen, Eraser } from "lucide-react";
import { useJournalStore } from "@/store/useJournalStore";
import { clearDatabase, clearNotes } from "@/lib/dbActions";
import SettingsCard from "./SettingsCard";
import Button from "@/components/Button";

// Starting over, in two separate parts: the figures (trades and funding) and the notes (day and week notes).
// Clearing one never touches the other, and settings are never cleared. Each asks twice, the second time for
// the word DELETE typed in.
export default function ClearDataSetting() {
  const { trades, funding, dayNotes, weekNotes } = useJournalStore();
  const [busy, setBusy] = useState<"data" | "notes" | null>(null);

  const onClearData = async () => {
    setBusy("data");
    await clearDatabase(trades, funding, undefined, () => setBusy(null), () => setBusy(null));
    setBusy(null);
  };

  const onClearNotes = async () => {
    setBusy("notes");
    await clearNotes(dayNotes, weekNotes, () => setBusy(null), () => setBusy(null));
    setBusy(null);
  };

  const row = (title: string, detail: string, label: string, Icon: typeof Trash2, onClick: () => void, isBusy: boolean) => (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="font-bold text-ink">{title}</p>
        <p className="text-body font-semibold text-ink-muted">{detail}</p>
      </div>
      <Button variant="danger" icon={Icon} onClick={onClick} disabled={busy !== null} className="shrink-0">
        <span className="whitespace-nowrap">{isBusy ? "Deleting..." : label}</span>
      </Button>
    </div>
  );

  return (
    <SettingsCard
      icon={Eraser}
      title="Clear data"
      description="เริ่มใหม่แยกเป็นสองส่วน ล้างเทรดกับเงินเข้าออก หรือลบโน้ต ลบส่วนหนึ่งอีกส่วนยังอยู่ ค่าตั้งไม่ถูกลบ ดาวน์โหลด backup ก่อนเสมอ"
    >
      <div className="space-y-6">
        {row(
          "Trades & funding",
          `${trades.length} trades, ${funding.length} funding entries. Notes and settings are kept.`,
          "Clear database",
          Trash2,
          onClearData,
          busy === "data"
        )}
        <div className="border-t border-line-soft" />
        {row(
          "Notes",
          `${dayNotes.length} day notes, ${weekNotes.length} week notes. Trades, funding and settings are kept.`,
          "Delete notes",
          NotebookPen,
          onClearNotes,
          busy === "notes"
        )}
      </div>
    </SettingsCard>
  );
}
