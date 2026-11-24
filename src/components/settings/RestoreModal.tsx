"use client";

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Upload, X, CheckCircle2, AlertTriangle, Download } from "lucide-react";
import Button, { IconButton } from "@/components/Button";
import ProgressBar from "./ProgressBar";
import { useJournalStore } from "@/store/useJournalStore";
import { downloadDatabase, restoreDatabase } from "@/lib/dbActions";
import { countIds, idsToRemove, summariseBackup, type Backup } from "@/lib/restorePlan";

export type RestoreFile = { fileName: string; size: number; backup: Backup | null; skipped: number };

const fmtTime = (iso: string | null) => (iso ? iso.replace("T", " ").slice(0, 16) : "-");
const fmtSize = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

// Restoring puts the journal back exactly as the file had it: trades, funding, notes and settings. Whatever is in the
// journal now and not in the file is deleted. When the journal is not empty the popup says what will go and offers
// to download what is there now first. Asked inside the app: a browser may block confirm()/alert() silently.
export default function RestoreModal({ file, onClose }: { file: RestoreFile; onClose: () => void }) {
  const { trades, funding, dayNotes, weekNotes, preferences } = useJournalStore();
  const [phase, setPhase] = useState<"confirm" | "running" | "done" | "failed">("confirm");
  const [error, setError] = useState("");
  const [downloaded, setDownloaded] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  const backup = file.backup;
  const s = backup ? summariseBackup(backup, file.skipped) : null;
  const now = { trades: trades.length, funding: funding.length, dayNotes: dayNotes.length, weekNotes: weekNotes.length };
  const hasData = now.trades + now.funding + now.dayNotes + now.weekNotes > 0;
  // Frozen when the popup opens, so the figures don't change under the person once the restore writes.
  const remove = useMemo(() => backup ? idsToRemove({
    trades: trades.map(t => t.id),
    funding: funding.map(f => f.id),
    dayNotes: dayNotes.map(n => n.date),
    weekNotes: weekNotes.map(n => n.week),
  }, backup) : null, [backup]); // eslint-disable-line react-hooks/exhaustive-deps
  const running = phase === "running";

  const downloadNow = () => {
    downloadDatabase(trades, funding, dayNotes, weekNotes, preferences);
    setDownloaded(true);
  };

  const run = async () => {
    if (!backup) return;
    setPhase("running");
    try {
      await restoreDatabase(backup, (done, total) => setProgress({ done, total }));
      setPhase("done");
    } catch (e) {
      console.error("Error restoring DB:", e);
      setError(e instanceof Error ? e.message : String(e));
      setPhase("failed");
    }
  };

  const close = () => { if (!running) onClose(); };

  const row = (label: string, inFile: number | string, current?: number) => (
    <div className="grid grid-cols-[1fr_auto_auto] gap-x-6 py-2 border-b border-line-soft last:border-0 text-small font-bold">
      <span className="text-ink-muted">{label}</span>
      <span className="text-ink text-right tabular-nums">{inFile}</span>
      <span className="text-ink-faint text-right tabular-nums w-14">{current ?? ""}</span>
    </div>
  );

  // Drawn on <body>: the Backup card folds shut, and a popup inside a folded card would be hidden with it.
  return createPortal(
    <div className="fixed inset-0 bg-stone-900/50 flex items-center justify-center z-[100] p-4 animate-fadeIn" onClick={close}>
      <div className="bg-card border-0 rounded-popup w-full max-w-md max-h-full overflow-y-auto p-6 md:p-8 shadow-raised relative" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between pb-4 mb-5 border-b border-line-soft">
          <h3 className="text-figure font-black text-ink tracking-tight">Restore backup</h3>
          {!running && <IconButton icon={X} label="Close" size="lg" onClick={close} />}
        </div>

        <p className="text-small font-bold text-ink break-all mb-1">{file.fileName}</p>
        <p className="text-caption font-semibold text-ink-faint mb-5">
          {fmtSize(file.size)}{s?.madeAt ? ` · backup made ${new Date(s.madeAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}` : ""}
        </p>

        {!backup && (
          <div className="rounded-box border bg-loss-soft border-loss-line p-4 mb-5 flex gap-3">
            <AlertTriangle className="w-5 h-5 text-loss shrink-0" />
            <p className="text-small font-bold text-loss">ไฟล์นี้ไม่ใช่ไฟล์ backup ของ journal หรือไฟล์เสีย ไม่มีอะไรถูกเขียนหรือลบ</p>
          </div>
        )}

        {s && (
          <div className="rounded-box bg-surface px-4 py-2 mb-5">
            <div className="grid grid-cols-[1fr_auto_auto] gap-x-6 pt-1 pb-2 text-label font-bold uppercase tracking-widest text-ink-faint">
              <span />
              <span className="text-right">In file</span>
              <span className="text-right w-14">Now</span>
            </div>
            {row("Trades", s.trades, now.trades)}
            {row("Funding entries", s.funding, now.funding)}
            {row("Day notes", s.dayNotes, now.dayNotes)}
            {row("Week notes", s.weekNotes, now.weekNotes)}
            {row("Trading settings", s.hasPreferences ? "Yes" : "None")}
            {s.trades > 0 && row("Trades from", fmtTime(s.firstTrade))}
            {s.trades > 0 && row("Trades to", fmtTime(s.lastTrade))}
          </div>
        )}

        {running && <ProgressBar label="Restoring..." done={progress.done} total={progress.total} />}

        {s && remove && phase === "confirm" && (
          <div className="space-y-4 mb-5">
            <p className="text-small font-semibold text-ink-muted">
              Journal จะกลับเป็นแบบในไฟล์ทุกอย่าง ทั้งเทรด เงินเข้าออก โน้ต{s.hasPreferences ? " และค่าตั้งเรื่องเทรด" : ""}
              {!s.hasPreferences && " (ไฟล์นี้ไม่มีค่าตั้ง ค่าตั้งตอนนี้จะคงไว้)"}
              {" PIN และการเตือน backup ไม่ถูกแตะ"}
            </p>
            {s.trades === 0 && (
              <p className="text-small font-bold text-loss">ไฟล์นี้ไม่มีเทรดเลย ตรวจดูว่าเลือกไฟล์ถูกไหม</p>
            )}
            {s.skipped > 0 && (
              <p className="text-small font-bold text-loss">มี {s.skipped} รายการในไฟล์ที่ไม่มี ID จะไม่ถูกนำกลับมา</p>
            )}
            {hasData && (
              <div className="rounded-box border bg-loss-soft border-loss-line p-4">
                <div className="flex gap-3">
                  <AlertTriangle className="w-5 h-5 text-loss shrink-0" />
                  <div className="min-w-0 text-small font-bold text-loss">
                    <p>ตอนนี้ journal มีข้อมูลอยู่ ข้อมูลทั้งหมดจะถูกแทนที่ด้วยของในไฟล์</p>
                    {countIds(remove) > 0 && (
                      <p className="mt-1">
                        จะถูกลบเพราะไม่มีในไฟล์: {remove.trades.length} trades, {remove.funding.length} funding, {remove.dayNotes.length} day notes, {remove.weekNotes.length} week notes
                      </p>
                    )}
                    <p className="mt-1 font-semibold text-ink-muted">ถ้าอยากเก็บข้อมูลตอนนี้ไว้ ดาวน์โหลดก่อน Restore</p>
                  </div>
                </div>
                <div className="mt-3 flex justify-end">
                  <Button variant="plain" size="sm" icon={downloaded ? CheckCircle2 : Download} onClick={downloadNow} disabled={running}>
                    {downloaded ? "Downloaded" : "Download current data"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {phase === "done" && s && (
          <div className="rounded-box border bg-accent-soft border-accent-line p-4 mb-5 flex gap-3">
            <CheckCircle2 className="w-5 h-5 text-accent shrink-0" />
            <p className="text-small font-bold text-ink">
              Restore เสร็จแล้ว: {s.trades} trades, {s.funding} funding entries, {s.dayNotes} day notes, {s.weekNotes} week notes{s.hasPreferences ? " และค่าตั้งเรื่องเทรด" : ""}
            </p>
          </div>
        )}

        {phase === "failed" && (
          <div className="rounded-box border bg-loss-soft border-loss-line p-4 mb-5 flex gap-3">
            <AlertTriangle className="w-5 h-5 text-loss shrink-0" />
            <div className="min-w-0">
              <p className="text-small font-bold text-loss">Restore ไม่สำเร็จ ข้อมูลในไฟล์อาจถูกเขียนไปแล้วบางส่วน แต่ยังไม่มีอะไรถูกลบถ้าการเขียนยังไม่ครบ ลองใหม่ได้ด้วยไฟล์เดิม</p>
              {error && <p className="text-caption font-semibold text-ink-muted mt-1 break-all">{error}</p>}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-3">
          {(phase === "confirm" || running) && s ? (
            <>
              <Button variant="secondary" onClick={close} disabled={running}>Cancel</Button>
              <Button variant={hasData ? "danger" : "primary"} icon={Upload} onClick={run} disabled={running}>
                {running ? "Restoring..." : "Restore"}
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
