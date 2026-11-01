"use client";

import { useMemo, useState } from "react";
import { Scale, Save } from "lucide-react";
import { useJournalStore } from "@/store/useJournalStore";
import { useDefaultRisk } from "@/lib/defaultRisk";
import { buildRiskContext, defaultRiskAt } from "@/lib/risk";

// 1R for trades whose first stop is unknown (the stop was moved before it was hit): the usual 1R of
// the time, worked out from the trades before it. The value saved here is only the fallback.
export default function DefaultRiskSetting() {
  const updatePreferences = useJournalStore(state => state.updatePreferences);
  const savedDefault = useJournalStore(state => state.preferences.defaultRisk);
  const effectiveDefault = useDefaultRisk();
  const trades = useJournalStore(state => state.trades);
  const usual = useMemo(() => {
    const ctx = buildRiskContext(trades, effectiveDefault);
    const count = Math.min(10, ctx.knownRisks?.length ?? 0);
    return { count, risk: count > 0 ? defaultRiskAt(ctx, {}) : 0 };
  }, [trades, effectiveDefault]);
  const [value, setValue] = useState<string | null>(null); // null = not edited yet
  const [isSaving, setIsSaving] = useState(false);

  const shown = value ?? (effectiveDefault ? effectiveDefault.toString() : "");
  const parsed = parseFloat(shown);
  const canSave = parsed > 0 && parsed !== savedDefault;

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updatePreferences({ defaultRisk: parsed });
      setValue(null);
    } catch {
      alert("Failed to save the default 1R.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl p-5 md:p-8 shadow-sm">
      <div className="flex items-center gap-3 mb-6 pb-6 border-b border-stone-100">
        <div className="w-10 h-10 shrink-0 rounded-xl bg-orange-50 flex items-center justify-center">
          <Scale className="w-5 h-5 text-orange-400" />
        </div>
        <div>
          <h3 className="text-lg font-bold text-stone-950">Risk (1R)</h3>
          <p className="text-sm text-stone-500 font-medium">
            เทรดที่ import จะวัด 1R จากจุดเข้าถึง SL แรกที่วางไว้ ถ้า SL ถูกเลื่อนก่อนโดน และไม่มี Notifications log ของเทรดนั้น
            ระบบจะใช้ 1R ปกติของช่วงนั้นแทน (แสดงด้วย ≈) คือค่ากลางของ 10 เทรดก่อนหน้าที่รู้ SL แรก จึงโตตามบัญชีเอง
            ค่าในช่องนี้ใช้เฉพาะตอนที่ยังไม่มีเทรดแบบนั้นก่อนหน้า
          </p>
        </div>
      </div>

      <div className="mb-6 text-sm">
        <p className="text-xs font-bold text-stone-400 uppercase tracking-widest mb-1">Usual 1R now</p>
        {usual.count > 0 ? (
          <p className="font-bold text-stone-950">
            ${usual.risk.toFixed(2)}
            <span className="font-medium text-stone-400 ml-2">median of your last {usual.count} {usual.count > 1 ? 'trades' : 'trade'} with a known first stop</span>
          </p>
        ) : (
          <p className="font-medium text-stone-400">No trades with a known first stop yet, so the fallback below is used.</p>
        )}
      </div>

      <div className="flex flex-col md:flex-row md:items-end gap-4">
        <div className="space-y-2 flex-1 max-w-xs">
          <label className="block text-sm font-bold text-stone-950">Fallback 1R ($)</label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={shown}
            onChange={(e) => setValue(e.target.value)}
            className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 text-sm font-bold text-stone-950 focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20 transition"
          />
          {!savedDefault && effectiveDefault > 0 && (
            <p className="text-xs text-stone-400 font-medium">Not saved yet: using ${effectiveDefault.toFixed(2)}, the risk most of your trades had.</p>
          )}
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving || !canSave}
          className="px-6 py-2.5 bg-orange-400 hover:bg-orange-500 disabled:bg-orange-200 text-white font-bold rounded-xl transition shadow-lg shadow-orange-200 flex items-center justify-center gap-2 md:mb-0.5"
        >
          <Save className="w-4 h-4" />
          {isSaving ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  );
}
