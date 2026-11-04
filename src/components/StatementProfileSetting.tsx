"use client";

import { useState } from "react";
import { FileText } from "lucide-react";
import SaveRow from "@/components/SaveRow";
import SettingsCard from "@/components/settings/SettingsCard";
import { useJournalStore } from "@/store/useJournalStore";

const INPUT = "w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 text-sm font-bold text-stone-950 focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20 transition placeholder:font-medium";

// Who the account belongs to, printed at the top of the monthly statement.
export default function StatementProfileSetting() {
  const updatePreferences = useJournalStore(state => state.updatePreferences);
  const saved = useJournalStore(state => state.preferences.statementProfile);
  const [edits, setEdits] = useState<{ name?: string; broker?: string; accountNo?: string }>({}); // only what was typed
  const [isSaving, setIsSaving] = useState(false);

  const name = edits.name ?? saved?.name ?? "";
  const broker = edits.broker ?? saved?.broker ?? "";
  const accountNo = edits.accountNo ?? saved?.accountNo ?? "";
  const isDirty = name !== (saved?.name ?? "") || broker !== (saved?.broker ?? "") || accountNo !== (saved?.accountNo ?? "");

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updatePreferences({ statementProfile: { name: name.trim(), broker: broker.trim(), accountNo: accountNo.trim() } });
      setEdits({});
    } catch {
      alert("Failed to save the statement details.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SettingsCard
        icon={FileText}
        title="Statement Details"
        description={<>แสดงที่ส่วนหัวของ Monthly Statement และบันทึกไว้ในฐานข้อมูลส่วนตัวของคุณเท่านั้น</>}
      >

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="space-y-2">
          <label className="block text-sm font-bold text-stone-950">Account holder</label>
          <input type="text" value={name} onChange={(e) => setEdits(prev => ({ ...prev, name: e.target.value }))} placeholder="Name as on the broker account" className={INPUT} />
        </div>
        <div className="space-y-2">
          <label className="block text-sm font-bold text-stone-950">Broker</label>
          <input type="text" value={broker} onChange={(e) => setEdits(prev => ({ ...prev, broker: e.target.value }))} placeholder="Broker name" className={INPUT} />
        </div>
        <div className="space-y-2">
          <label className="block text-sm font-bold text-stone-950">Account number</label>
          <input type="text" value={accountNo} onChange={(e) => setEdits(prev => ({ ...prev, accountNo: e.target.value }))} placeholder="Trading account number" className={INPUT} />
        </div>
      </div>

      <SaveRow isDirty={isDirty} isSaving={isSaving} onSave={handleSave} />
    </SettingsCard>
  );
}
