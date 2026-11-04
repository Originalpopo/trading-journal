"use client";

import { useState } from "react";
import { Coins } from "lucide-react";
import { useJournalStore } from "@/store/useJournalStore";
import {
  DEFAULT_RISK_PCT, DEFAULT_RISK_STEP_UP_PCT, DEFAULT_RISK_STEP_DOWN_PCT, drawdownAfterLosses, riskHistoryOf, share,
} from "@/lib/riskStep";
import SaveRow from "@/components/SaveRow";
import SettingsCard, { SETTINGS_INPUT } from "./SettingsCard";

type Field = "pct" | "up" | "down";

// Risk per trade in steps: the %, and how far the balance moves before a step up or down. The risk itself is
// set from the Dashboard's Risk per Trade box. Under the fields, what a run of losses would do at that %.
export default function RiskStepSetting() {
  const updatePreferences = useJournalStore(state => state.updatePreferences);
  const prefs = useJournalStore(state => state.preferences);
  const saved: Record<Field, number> = {
    pct: prefs.riskPct ?? DEFAULT_RISK_PCT,
    up: prefs.riskStepUpPct ?? DEFAULT_RISK_STEP_UP_PCT,
    down: prefs.riskStepDownPct ?? DEFAULT_RISK_STEP_DOWN_PCT,
  };
  const [edits, setEdits] = useState<Partial<Record<Field, string>>>({});
  const [isSaving, setIsSaving] = useState(false);

  const shown = (f: Field) => edits[f] ?? saved[f].toString();
  const num = (f: Field) => Number(shown(f));
  const isDirty = (["pct", "up", "down"] as Field[]).some(f => edits[f] !== undefined && num(f) !== saved[f]);
  const inRange = (f: Field, max: number) => shown(f).trim() !== "" && num(f) >= 0 && num(f) <= max;
  const isValid = inRange("pct", 10) && inRange("up", 200) && inRange("down", 90);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // The risk set so far keeps its dollars: an anchor saved before they were kept is frozen at the old %.
      const anchor = prefs.riskAnchor;
      const freeze = anchor && anchor.risk === undefined
        ? { riskAnchor: { ...anchor, risk: share(anchor.balance, saved.pct) }, riskHistory: riskHistoryOf(prefs.riskHistory, anchor, saved.pct) }
        : {};
      await updatePreferences({ riskPct: num("pct"), riskStepUpPct: num("up"), riskStepDownPct: num("down"), ...freeze });
      setEdits({});
    } catch {
      alert("Failed to save the risk per trade.");
    } finally {
      setIsSaving(false);
    }
  };

  const field = (f: Field, label: string, def: number, max: number, step: string) => (
    <div className="space-y-2">
      <label className="block text-sm font-bold text-stone-950">{label} <span className="font-medium text-stone-400">(default {def})</span></label>
      <input type="number" step={step} min="0" max={max} value={shown(f)} onChange={(e) => setEdits(x => ({ ...x, [f]: e.target.value }))} className={SETTINGS_INPUT} />
    </div>
  );

  const pct = inRange("pct", 10) ? num("pct") : saved.pct;

  return (
    <SettingsCard
      icon={Coins}
      title="Risk per Trade"
      description="risk ต่อเทรดคิดเป็น % ของ balance แล้วใช้ค่าเดิมไปจนกว่า balance จะขึ้นหรือลงถึงขั้นที่ตั้งไว้ Dashboard จะบอก risk ตอนนี้และเตือนเมื่อถึงเวลาปรับ ลงเร็วกว่าขึ้น เพื่อให้ช่วงแพ้ติดกันกินทุนน้อยลง ใส่ 0 ที่ Risk เพื่อปิด"
    >
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {field("pct", "Risk (% of balance)", DEFAULT_RISK_PCT, 10, "0.1")}
        {field("up", "Step up when balance grows (%)", DEFAULT_RISK_STEP_UP_PCT, 200, "1")}
        {field("down", "Step down when balance falls (%)", DEFAULT_RISK_STEP_DOWN_PCT, 90, "1")}
      </div>

      {pct > 0 && (
        <p className="mt-4 text-xs font-medium text-stone-500">
          ที่ {+pct.toFixed(2)}% ต่อเทรด แพ้ติดกัน 13 ไม้ ทุนลดราว {Math.round(drawdownAfterLosses(pct, 13))}% และ 20 ไม้ ราว {Math.round(drawdownAfterLosses(pct, 20))}%
        </p>
      )}

      <SaveRow isDirty={isDirty} canSave={isValid} isSaving={isSaving} onSave={handleSave} />
    </SettingsCard>
  );
}
