"use client";

import { Scale } from "lucide-react";
import { useJournalStore } from "@/store/useJournalStore";
import { formatNumber } from "@/lib/utils";
import SettingsCard from "./SettingsCard";

// Every broker balance check ever saved, newest first. Read-only: it is the evidence that the journal agreed.
export default function BalanceCheckHistory() {
  const history = useJournalStore(state => state.preferences.balanceCheckHistory);
  const isPrivacyMode = useJournalStore(state => state.isPrivacyMode);
  const usd = (n: number) => (isPrivacyMode ? "***" : `$${formatNumber(n)}`);

  return (
    <SettingsCard
      icon={Scale}
      title="Balance Checks"
      description="ทุกครั้งที่บันทึกการเช็คยอดกับโบรกเกอร์ เป็นหลักฐานว่ายอดใน journal ตรงกับโบรกเกอร์ ดูได้อย่างเดียว"
    >
      {history && history.length > 0 ? (
        <div className="max-h-80 overflow-auto border border-stone-100 rounded-xl">
          <table className="w-full text-xs md:text-sm">
            <thead className="bg-surface text-ink-faint sticky top-0">
              <tr>
                <th className="px-3 md:px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest">Checked at</th>
                <th className="px-3 md:px-4 py-3 text-right text-[10px] font-bold uppercase tracking-widest">Broker</th>
                <th className="hidden md:table-cell px-4 py-3 text-right text-[10px] font-bold uppercase tracking-widest">Journal</th>
                <th className="px-3 md:px-4 py-3 text-right text-[10px] font-bold uppercase tracking-widest">Result</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-50">
              {[...history].reverse().map((h, i) => (
                <tr key={`${h.time}-${i}`}>
                  <td className="px-3 md:px-4 py-2.5 font-semibold text-ink-muted tabular-nums">{h.time.replace("T", " ")}</td>
                  <td className="px-3 md:px-4 py-2.5 text-right font-bold text-ink tabular-nums">{usd(h.balance)}</td>
                  <td className="hidden md:table-cell px-4 py-2.5 text-right font-semibold text-stone-600 tabular-nums">{usd(h.journalBalance)}</td>
                  <td className={`px-3 md:px-4 py-2.5 text-right font-bold tabular-nums ${h.difference === 0 ? "text-accent" : "text-loss"}`}>
                    {h.difference === 0 ? "matched" : `journal ${h.difference > 0 ? "+" : "-"}${usd(Math.abs(h.difference))}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm font-medium text-ink-faint">No balance checks saved yet.</p>
      )}
    </SettingsCard>
  );
}
