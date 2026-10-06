"use client";

import { useState } from "react";
import { FileText, Save } from "lucide-react";
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
    <div className="bg-white rounded-2xl p-5 md:p-8 shadow-sm">
      <div className="flex items-center gap-3 mb-6 pb-6 border-b border-stone-100">
        <div className="w-10 h-10 shrink-0 rounded-xl bg-orange-50 flex items-center justify-center">
          <FileText className="w-5 h-5 text-orange-400" />
        </div>
        <div>
          <h3 className="text-lg font-bold text-stone-950">Statement Details</h3>
          <p className="text-sm text-stone-500 font-medium">
            Shown at the top of the monthly statement. Saved in your private database only.
          </p>
        </div>
      </div>

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

      <div className="flex justify-end pt-6">
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving || !isDirty}
          className="px-6 py-2.5 bg-orange-400 hover:bg-orange-500 disabled:bg-orange-200 text-white font-bold rounded-xl transition shadow-lg shadow-orange-200 flex items-center gap-2"
        >
          <Save className="w-4 h-4" />
          {isSaving ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  );
}
