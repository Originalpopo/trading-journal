// The bar shown while a restore or a clear runs: steps done out of all, as a filling bar and a percentage.
// `loss` makes it red, for deleting (Clear data); a restore stays orange.
export default function ProgressBar({ label, done, total, tone = "accent" }: { label: string; done: number; total: number; tone?: "accent" | "loss" }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div className="mb-5" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={label}>
      <div className="flex justify-between text-small font-bold mb-2">
        <span className="text-ink">{label}</span>
        <span className="text-ink-muted tabular-nums">{total > 0 ? `${done} / ${total} · ${pct}%` : "..."}</span>
      </div>
      <div className="h-2 rounded-full bg-surface-2 overflow-hidden">
        <div className={`h-full rounded-full ${tone === "loss" ? "bg-loss" : "bg-accent"} transition-all duration-300`} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-caption font-semibold text-ink-faint mt-2">อย่าปิดหน้านี้จนกว่าจะเสร็จ</p>
    </div>
  );
}
