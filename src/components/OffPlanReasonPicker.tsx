"use client";

import { CheckCircle2, XCircle } from "lucide-react";
import { offeredReasons, type OffPlanReason } from "@/lib/offPlan";

// The Off Plan reasons as chips to tick, one or more, styled as the app's checklists. A reason removed in
// Settings shows only on a trade that names it (`saved`: what the trade has now), so it can be taken off
// there, and ticked again before saving. Ids in `value` that
// are no longer in the list at all are kept as they are. Says so when none is ticked: an off-plan trade needs one.
export default function OffPlanReasonPicker({ reasons, value, saved = [], onChange }: {
  reasons: OffPlanReason[];
  value: string[];
  saved?: string[];
  onChange: (ids: string[]) => void;
}) {
  const hasReason = reasons.some(r => value.includes(r.id));
  return (
    <div>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Off plan reasons">
        {offeredReasons(reasons, [...value, ...saved]).map(r => {
          const isOn = value.includes(r.id);
          const Icon = isOn ? CheckCircle2 : XCircle;
          return (
            <button
              key={r.id}
              type="button"
              aria-pressed={isOn}
              onClick={() => onChange(isOn ? value.filter(id => id !== r.id) : [...value, r.id])}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-bold rounded-lg border transition ${
                isOn ? "bg-accent-soft text-accent border-accent-line" : "bg-surface text-ink-faint border-line opacity-70 hover:opacity-100"
              }`}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              {r.name}
            </button>
          );
        })}
      </div>
      {!hasReason && (
        <p className="mt-1.5 text-[11px] font-bold text-loss">
          {!reasons.some(r => !r.removed) ? "Add Off Plan reasons in Settings first" : "Pick at least one reason"}
        </p>
      )}
    </div>
  );
}
