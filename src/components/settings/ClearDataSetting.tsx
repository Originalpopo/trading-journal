"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { Trash2, Eraser, X, Download, CheckCircle2, AlertTriangle } from "lucide-react";
import { useJournalStore } from "@/store/useJournalStore";
import { clearAllData, downloadDatabase } from "@/lib/dbActions";
import SettingsCard from "./SettingsCard";
import Button, { IconButton } from "@/components/Button";
import { fieldClass } from "@/components/Field";
import ProgressBar from "./ProgressBar";

// Starting over: one button deletes every trade, funding entry, day note and week note. Settings and the PIN are kept.
// It asks in a popup inside the app (a browser may block confirm()/prompt() silently), offers to download a backup
// first, and needs the word DELETE typed in.
export default function ClearDataSetting() {
  const { trades, funding, dayNotes, weekNotes } = useJournalStore();
  const [open, setOpen] = useState(false);
  const total = trades.length + funding.length + dayNotes.length + weekNotes.length;

  return (
    <SettingsCard
      icon={Eraser}
      title="Clear data"
      description="เริ่มใหม่ทั้งหมด ลบเทรด เงินเข้าออก และโน้ตทั้งหมด ค่าตั้งยังอยู่ ดาวน์โหลด backup ก่อนเสมอ"
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-bold text-ink">Trades, funding & notes</p>
          <p className="text-body font-semibold text-ink-muted">
            {trades.length} trades, {funding.length} funding entries, {dayNotes.length} day notes, {weekNotes.length} week notes. Settings are kept.
          </p>
        </div>
        <Button variant="danger" icon={Trash2} onClick={() => setOpen(true)} disabled={total === 0} className="shrink-0">
          <span className="whitespace-nowrap">Clear all data</span>
        </Button>
      </div>
      {open && <ClearDataModal onClose={() => setOpen(false)} />}
    </SettingsCard>
  );
}

function ClearDataModal({ onClose }: { onClose: () => void }) {
  const { trades, funding, dayNotes, weekNotes, preferences } = useJournalStore();
  const [phase, setPhase] = useState<"confirm" | "running" | "done" | "failed">("confirm");
  const [typed, setTyped] = useState("");
  const [downloaded, setDownloaded] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const running = phase === "running";
  // Counts as the popup opened, so the "done" line still says what was deleted.
  const [counts] = useState({ trades: trades.length, funding: funding.length, dayNotes: dayNotes.length, weekNotes: weekNotes.length });

  const run = async () => {
    setPhase("running");
    try {
      await clearAllData((done, total) => setProgress({ done, total }));
      setPhase("done");
    } catch (e) {
      console.error("Error clearing data:", e);
      setError(e instanceof Error ? e.message : String(e));
      setPhase("failed");
    }
  };

  const close = () => { if (!running) onClose(); };
  const what = `${counts.trades} trades, ${counts.funding} funding entries, ${counts.dayNotes} day notes, ${counts.weekNotes} week notes`;

  // Drawn on <body>: the card folds shut, and a popup inside a folded card would be hidden with it.
  return createPortal(
    <div className="fixed inset-0 bg-stone-900/50 flex items-center justify-center z-[100] p-4 animate-fadeIn" onClick={close}>
      <div className="bg-card border-0 rounded-popup w-full max-w-md max-h-full overflow-y-auto p-6 md:p-8 shadow-raised relative" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between pb-4 mb-5 border-b border-line-soft">
          <h3 className="text-figure font-black text-ink tracking-tight">Clear all data</h3>
          {!running && <IconButton icon={X} label="Close" size="lg" onClick={close} />}
        </div>

        {running && <ProgressBar label="Deleting..." done={progress.done} total={progress.total} tone="loss" />}

        {phase === "confirm" && (
          <div className="space-y-4 mb-5">
            <div className="rounded-box border bg-loss-soft border-loss-line p-4">
              <div className="flex gap-3">
                <AlertTriangle className="w-5 h-5 text-loss shrink-0" />
                <div className="min-w-0 text-small font-bold text-loss">
                  <p>จะลบ {what}</p>
                  <p className="mt-1 font-semibold text-ink-muted">ค่าตั้งยังอยู่ ลบแล้วเอาคืนได้จากไฟล์ backup เท่านั้น</p>
                </div>
              </div>
              <div className="mt-3 flex justify-end">
                <Button variant="plain" size="sm" icon={downloaded ? CheckCircle2 : Download} disabled={running}
                  onClick={() => { downloadDatabase(trades, funding, dayNotes, weekNotes, preferences); setDownloaded(true); }}>
                  {downloaded ? "Downloaded" : "Download backup first"}
                </Button>
              </div>
            </div>
            <div>
              <label className="block text-small font-bold text-ink-muted mb-2">พิมพ์ DELETE เพื่อยืนยัน</label>
              <input value={typed} onChange={(e) => setTyped(e.target.value)} disabled={running} autoComplete="off"
                autoCapitalize="characters" spellCheck={false} className={fieldClass("md")} />
            </div>
          </div>
        )}

        {phase === "done" && (
          <div className="rounded-box border bg-accent-soft border-accent-line p-4 mb-5 flex gap-3">
            <CheckCircle2 className="w-5 h-5 text-accent shrink-0" />
            <p className="text-small font-bold text-ink">ลบแล้ว: {what} ค่าตั้งยังอยู่</p>
          </div>
        )}

        {phase === "failed" && (
          <div className="rounded-box border bg-loss-soft border-loss-line p-4 mb-5 flex gap-3">
            <AlertTriangle className="w-5 h-5 text-loss shrink-0" />
            <div className="min-w-0">
              <p className="text-small font-bold text-loss">ลบไม่สำเร็จ บางส่วนอาจถูกลบไปแล้ว</p>
              {error && <p className="text-caption font-semibold text-ink-muted mt-1 break-all">{error}</p>}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-3">
          {phase === "confirm" || running ? (
            <>
              <Button variant="secondary" onClick={close} disabled={running}>Cancel</Button>
              <Button variant="danger" icon={Trash2} onClick={run} disabled={running || typed.trim() !== "DELETE"}>
                {running ? "Deleting..." : "Delete"}
              </Button>
            </>
          ) : (
            <Button variant="secondary" onClick={close}>Close</Button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
