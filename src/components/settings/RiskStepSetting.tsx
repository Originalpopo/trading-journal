"use client";

import { useState } from "react";
import { Coins } from "lucide-react";
import { useJournalStore } from "@/store/useJournalStore";
import {
  DEFAULT_RISK_PCT, DEFAULT_RISK_STEP_UP_PCT, DEFAULT_RISK_STEP_DOWN_PCT, DEFAULT_RISK_OVER_PCT, drawdownAfterLosses, riskHistoryOf, share,
} from "@/lib/riskStep";
import { withChange } from "@/lib/settingHistory";
import { localTimestamp } from "@/lib/reconcile";
import SaveRow from "@/components/SaveRow";
import SettingsCard, { SETTINGS_INPUT } from "./SettingsCard";

type Field = "pct" | "up" | "down" | "over";

// Risk per trade in steps: the %, and how far the balance moves before a step up or down. The risk itself is
// set from the Dashboard's Risk per Trade box. Under the fields, what a run of losses would do at that %.
export default function RiskStepSetting() {
  const updatePreferences = useJournalStore(state => state.updatePreferences);
  const prefs = useJournalStore(state => state.preferences);
  const saved: Record<Field, number> = {
    pct: prefs.riskPct ?? DEFAULT_RISK_PCT,
    up: prefs.riskStepUpPct ?? DEFAULT_RISK_STEP_UP_PCT,
    down: prefs.riskStepDownPct ?? DEFAULT_RISK_STEP_DOWN_PCT,
    over: prefs.riskOverPct ?? DEFAULT_RISK_OVER_PCT,
  };
  const [edits, setEdits] = useState<Partial<Record<Field, string>>>({});
  const [isSaving, setIsSaving] = useState(false);

  const shown = (f: Field) => edits[f] ?? saved[f].toString();
  const num = (f: Field) => Number(shown(f));
  const isDirty = (["pct", "up", "down", "over"] as Field[]).some(f => edits[f] !== undefined && num(f) !== saved[f]);
  const inRange = (f: Field, max: number) => shown(f).trim() !== "" && num(f) >= 0 && num(f) <= max;
  const isValid = inRange("pct", 10) && inRange("up", 200) && inRange("down", 90) && inRange("over", 100);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // The risk set so far keeps its dollars: an anchor saved before they were kept is frozen at the old %.
      const anchor = prefs.riskAnchor;
      const freeze = anchor && anchor.risk === undefined
        ? { riskAnchor: { ...anchor, risk: share(anchor.balance, saved.pct) }, riskHistory: riskHistoryOf(prefs.riskHistory, anchor, saved.pct) }
        : {};
      await updatePreferences({ riskPct: num("pct"), riskStepUpPct: num("up"), riskStepDownPct: num("down"),
        // Trades already entered keep the % they were checked by; the new one applies from now on.
        riskOverPct: num("over"), riskOverHistory: withChange(prefs.riskOverHistory, saved.over, num("over"), localTimestamp()),
        ...freeze });
      setEdits({});
    } catch {
      alert("Failed to save the risk per trade.");
    } finally {
      setIsSaving(false);
    }
  };

  const field = (f: Field, label: string, def: number, max: number, step: string) => (
    <div className="space-y-2">
      <label className="block text-sm font-bold text-ink">{label} <span className="font-medium text-ink-faint">(default {def})</span></label>
      <input type="number" step={step} min="0" max={max} value={shown(f)} onChange={(e) => setEdits(x => ({ ...x, [f]: e.target.value }))} className={SETTINGS_INPUT} />
    </div>
  );

  const pct = inRange("pct", 10) ? num("pct") : saved.pct;

  return (
    <SettingsCard
      icon={Coins}
      title="Risk per Trade"
      description="risk ต่อเทรดคิดเป็น % ของ balance แล้วใช้ค่าเดิมไปจนกว่า balance จะขึ้นหรือลงถึงขั้นที่ตั้งไว้ Dashboard จะบอก risk ตอนนี้และเตือนเมื่อถึงเวลาปรับ ลงเร็วกว่าขึ้น เพื่อให้ช่วงแพ้ติดกันกินทุนน้อยลง ใส่ 0 ที่ Risk เพื่อปิด หน้า Performance เช็คว่าไม้ที่รู้ SL แรกใช้ risk เกินที่ตั้งไว้ตอนเข้าไม้หรือไม่ โดยให้เกินได้ไม่เกิน Over risk allowed ค่านี้ใช้กับไม้ที่เข้าหลังกด Save เท่านั้น"
    >
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {field("pct", "Risk (% of balance)", DEFAULT_RISK_PCT, 10, "0.1")}
        {field("up", "Step up when balance grows (%)", DEFAULT_RISK_STEP_UP_PCT, 200, "1")}
        {field("down", "Step down when balance falls (%)", DEFAULT_RISK_STEP_DOWN_PCT, 90, "1")}
        {field("over", "Over risk allowed (%)", DEFAULT_RISK_OVER_PCT, 100, "1")}
      </div>

      {pct > 0 && (
        <p className="mt-4 text-xs font-medium text-ink-muted">
          ที่ {+pct.toFixed(2)}% ต่อเทรด แพ้ติดกัน 13 ไม้ ทุนลดราว {Math.round(drawdownAfterLosses(pct, 13))}% และ 20 ไม้ ราว {Math.round(drawdownAfterLosses(pct, 20))}%
        </p>
      )}

      <SaveRow isDirty={isDirty} canSave={isValid} isSaving={isSaving} onSave={handleSave} />
    </SettingsCard>
  );
}
