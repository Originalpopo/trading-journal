"use client";

import { useState } from "react";
import { Scale, Save } from "lucide-react";
import { useJournalStore } from "@/store/useJournalStore";
import { useDefaultRisk } from "@/lib/defaultRisk";

// 1R used for imported trades whose first stop is unknown (the stop was moved before it was hit).
export default function DefaultRiskSetting() {
  const updatePreferences = useJournalStore(state => state.updatePreferences);
  const savedDefault = useJournalStore(state => state.preferences.defaultRisk);
  const effectiveDefault = useDefaultRisk();
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
    <div className="bg-white rounded-2xl p-8 shadow-sm">
      <div className="flex items-center gap-3 mb-6 pb-6 border-b border-stone-100">
        <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center">
          <Scale className="w-5 h-5 text-orange-400" />
        </div>
        <div>
          <h3 className="text-lg font-bold text-stone-950">Risk (1R)</h3>
          <p className="text-sm text-stone-500 font-medium">
            Imported trades measure 1R to the stop you first placed. When the stop was moved before it was hit, that first stop is
            no longer in the broker history, so this amount is used instead (shown with ≈) until you enter the first stop.
          </p>
        </div>
      </div>

      <div className="flex flex-col md:flex-row md:items-end gap-4">
        <div className="space-y-2 flex-1 max-w-xs">
          <label className="block text-sm font-bold text-stone-950">Default 1R ($)</label>
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
