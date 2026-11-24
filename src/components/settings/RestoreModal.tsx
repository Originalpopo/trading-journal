"use client";

import { createPortal } from "react-dom";
import { Upload, X, CheckCircle2, AlertTriangle } from "lucide-react";
import Button, { IconButton } from "@/components/Button";
import type { BackupSummary } from "@/lib/dbActions";

export type RestoreState = {
  fileName: string;
  size: number;
  text: string;
  summary: BackupSummary | null;
  phase: "confirm" | "running" | "done" | "failed" | "badFile";
  error?: string;
};

type Counts = { trades: number; funding: number; dayNotes: number; weekNotes: number };

const fmtTime = (iso: string | null) => (iso ? iso.replace("T", " ").slice(0, 16) : "-");
const fmtSize = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

// Asks inside the app before a backup is written back, showing what the file holds next to what the journal holds now,
// then shows the result in the same popup. Browser confirm()/alert() are not used: a browser may block them silently.
export default function RestoreModal({ state, now, onConfirm, onClose }: {
  state: RestoreState;
  now: Counts;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const s = state.summary;
  const running = state.phase === "running";

  const row = (label: string, file: number | string, journal?: number) => (
    <div className="grid grid-cols-[1fr_auto_auto] gap-x-6 py-2 border-b border-line-soft last:border-0 text-small font-bold">
      <span className="text-ink-muted">{label}</span>
      <span className="text-ink text-right tabular-nums">{file}</span>
      <span className="text-ink-faint text-right tabular-nums w-14">{journal ?? ""}</span>
    </div>
  );

  // Drawn on <body>: the Backup card folds shut, and a popup inside a folded card would be hidden with it.
  return createPortal(
    <div className="fixed inset-0 bg-stone-900/50 flex items-center justify-center z-[100] p-4 animate-fadeIn" onClick={onClose}>
      <div className="bg-card border-0 rounded-popup w-full max-w-md p-6 md:p-8 shadow-raised relative" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between pb-4 mb-5 border-b border-line-soft">
          <h3 className="text-figure font-black text-ink tracking-tight">Restore backup</h3>
          {!running && <IconButton icon={X} label="Close" size="lg" onClick={onClose} />}
        </div>

        <p className="text-small font-bold text-ink break-all mb-1">{state.fileName}</p>
        <p className="text-caption font-semibold text-ink-faint mb-5">
          {fmtSize(state.size)}{s?.madeAt ? ` · backup made ${new Date(s.madeAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}` : ""}
        </p>

        {state.phase === "badFile" && (
          <div className="rounded-box border bg-loss-soft border-loss-line p-4 mb-5 flex gap-3">
            <AlertTriangle className="w-5 h-5 text-loss shrink-0" />
            <p className="text-small font-bold text-loss">ไฟล์นี้ไม่ใช่ไฟล์ backup ของ journal หรือไฟล์เสีย ไม่มีอะไรถูกเขียนลงไป</p>
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
            {s.trades > 0 && row("Trades from", fmtTime(s.firstTrade))}
            {s.trades > 0 && row("Trades to", fmtTime(s.lastTrade))}
          </div>
        )}

        {state.phase === "confirm" && s && (
          <>
            <p className="text-small font-semibold text-ink-muted mb-5">
              รายการในไฟล์จะถูกเขียนกลับเข้า journal รายการที่มี ID เดียวกันจะถูกแทนที่ด้วยของในไฟล์ รายการที่มีอยู่แล้วแต่ไม่อยู่ในไฟล์จะยังอยู่
              {s.hasPreferences && " ค่าตั้งจะกลับเป็นค่าในไฟล์ด้วย"}
            </p>
            {s.trades === 0 && (
              <p className="text-small font-bold text-loss mb-5">ไฟล์นี้ไม่มีเทรดเลย ตรวจดูว่าเลือกไฟล์ถูกไหม</p>
            )}
          </>
        )}

        {state.phase === "done" && s && (
          <div className="rounded-box border bg-accent-soft border-accent-line p-4 mb-5 flex gap-3">
            <CheckCircle2 className="w-5 h-5 text-accent shrink-0" />
            <p className="text-small font-bold text-ink">
              Restore เสร็จแล้ว: {s.trades} trades, {s.funding} funding entries, {s.dayNotes} day notes, {s.weekNotes} week notes{s.hasPreferences ? " และค่าตั้ง" : ""}
            </p>
          </div>
        )}

        {state.phase === "failed" && (
          <div className="rounded-box border bg-loss-soft border-loss-line p-4 mb-5 flex gap-3">
            <AlertTriangle className="w-5 h-5 text-loss shrink-0" />
            <div className="min-w-0">
              <p className="text-small font-bold text-loss">Restore ไม่สำเร็จ บางส่วนอาจถูกเขียนไปแล้ว ลองใหม่ได้ด้วยไฟล์เดิม</p>
              {state.error && <p className="text-caption font-semibold text-ink-muted mt-1 break-all">{state.error}</p>}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-3">
          {(state.phase === "confirm" || state.phase === "running") && s ? (
            <>
              <Button variant="secondary" onClick={onClose} disabled={running}>Cancel</Button>
              <Button variant="primary" icon={Upload} onClick={onConfirm} disabled={running}>
                {running ? "Restoring..." : "Restore"}
              </Button>
            </>
          ) : (
            <Button variant="secondary" onClick={onClose}>Close</Button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
