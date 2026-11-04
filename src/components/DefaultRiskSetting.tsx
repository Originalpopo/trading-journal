"use client";

import { useMemo, useState } from "react";
import { Scale } from "lucide-react";
import SaveRow from "@/components/SaveRow";
import SettingsCard from "@/components/settings/SettingsCard";
import { useJournalStore } from "@/store/useJournalStore";
import { useDefaultRisk } from "@/lib/defaultRisk";
import { buildRiskContext, defaultRiskAt, USUAL_RISK_WINDOW } from "@/lib/risk";

// 1R for trades whose first stop is unknown (the stop was moved before it was hit): the usual 1R of
// the time, worked out from the trades before it. The value saved here is only the fallback.
export default function DefaultRiskSetting() {
  const updatePreferences = useJournalStore(state => state.updatePreferences);
  const savedDefault = useJournalStore(state => state.preferences.defaultRisk);
  const effectiveDefault = useDefaultRisk();
  const savedWindow = useJournalStore(state => state.preferences.usualRiskWindow);
  const riskWindow = savedWindow ?? USUAL_RISK_WINDOW;
  const trades = useJournalStore(state => state.trades);
  const usual = useMemo(() => {
    const ctx = buildRiskContext(trades, effectiveDefault);
    const count = Math.min(riskWindow, ctx.knownRisks?.length ?? 0);
    return { count, risk: count > 0 ? defaultRiskAt(ctx, {}) : 0 };
  }, [trades, effectiveDefault, riskWindow]);
  const [value, setValue] = useState<string | null>(null); // null = not edited yet
  const [windowValue, setWindowValue] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const shown = value ?? (effectiveDefault ? effectiveDefault.toString() : "");
  const parsed = parseFloat(shown);
  const shownWindow = windowValue ?? riskWindow.toString();
  const parsedWindow = Number(shownWindow);
  const riskChanged = value !== null && parsed !== savedDefault;
  const windowChanged = windowValue !== null && parsedWindow !== riskWindow;
  const isValid = parsed > 0 && Number.isInteger(parsedWindow) && parsedWindow >= 1 && parsedWindow <= 100;
  // A default that was never saved counts as a change, so it can be saved as it is.
  const isDirty = riskChanged || windowChanged || (!savedDefault && parsed > 0);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updatePreferences({ defaultRisk: parsed, usualRiskWindow: parsedWindow });
      setValue(null);
      setWindowValue(null);
    } catch {
      alert("Failed to save the 1R settings.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SettingsCard
        icon={Scale}
        title="Risk (1R)"
        description={<>เทรดที่ import จะวัด 1R จากจุดเข้าถึง SL แรกที่วางไว้ ถ้า SL ถูกเลื่อนก่อนโดน และไม่มี Notifications log ของเทรดนั้น
            ระบบจะใช้ 1R ปกติของช่วงนั้นแทน (แสดงด้วย ≈) คือค่ากลางของ {riskWindow} เทรดก่อนหน้าที่รู้ SL แรก จึงโตตามบัญชีเอง
            ถ้ายังไม่มีเทรดแบบนั้นก่อนหน้า จะใช้ Risk per Trade ที่ตั้งไว้ตอนเข้าเทรดนั้น
            ช่อง Fallback ใช้เฉพาะเทรดก่อนเริ่มตั้ง Risk per Trade จึงไม่ต้องปรับตาม balance</>}
      >

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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <label className="block text-sm font-bold text-stone-950">Trades in usual 1R <span className="font-medium text-stone-400">(default {USUAL_RISK_WINDOW})</span></label>
          <input
            type="number"
            step="1"
            min="1"
            max="100"
            value={shownWindow}
            onChange={(e) => setWindowValue(e.target.value)}
            className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 text-sm font-bold text-stone-950 focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20 transition"
          />
        </div>
        <div className="space-y-2">
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
      </div>

      <SaveRow isDirty={isDirty} canSave={isValid} isSaving={isSaving} onSave={handleSave} />
    </SettingsCard>
  );
}
