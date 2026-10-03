"use client";

import { useState } from "react";
import { X, CheckCircle2, AlertTriangle, Save } from "lucide-react";
import { useJournalStore } from "@/store/useJournalStore";
import { reconcileBalance } from "@/lib/reconcile";
import { hasFractionOfCent } from "@/lib/money";
import { formatNumber } from "@/lib/utils";
import { useEscapeToClose } from "@/lib/useEscapeToClose";

interface BalanceCheckModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// Now as a datetime-local value (local wall clock, with seconds), the way trade times are stored.
const nowInputTime = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 19);
};

// The user types the balance the broker shows; the journal's own balance at that moment must equal it.
export default function BalanceCheckModal({ isOpen, onClose }: BalanceCheckModalProps) {
  const trades = useJournalStore(state => state.trades);
  const funding = useJournalStore(state => state.funding);
  const savedCheck = useJournalStore(state => state.preferences.balanceCheck);
  const updatePreferences = useJournalStore(state => state.updatePreferences);

  const [balance, setBalance] = useState("");
  const [time, setTime] = useState(nowInputTime);
  const [isSaving, setIsSaving] = useState(false);

  useEscapeToClose(isOpen, onClose);

  if (!isOpen) return null;

  const parsedBalance = parseFloat(balance);
  const hasMoreThanCents = hasFractionOfCent(balance);
  const isValid = Number.isFinite(parsedBalance) && !hasMoreThanCents && !!time;
  const checkTime = time.length === 16 ? `${time}:00` : time;
  const result = isValid ? reconcileBalance({ time: checkTime, balance: parsedBalance }, trades, funding) : null;
  const savedResult = savedCheck ? reconcileBalance(savedCheck, trades, funding) : null;

  const handleSave = async () => {
    if (!isValid) return;
    setIsSaving(true);
    try {
      await updatePreferences({ balanceCheck: { time: checkTime, balance: parsedBalance } });
      setBalance("");
      onClose();
    } catch {
      alert("Failed to save the balance check.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-stone-900/50 flex items-center justify-center z-[100] p-4 animate-fadeIn" onClick={onClose}>
      <div className="bg-white border-0 rounded-3xl w-full max-w-md p-6 md:p-8 shadow-2xl relative" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between pb-4 mb-6 border-b border-stone-100">
          <h3 className="text-2xl font-black text-stone-950 tracking-tight">Check against broker</h3>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-600 p-1 rounded-full hover:bg-stone-100 transition">
            <X className="w-6 h-6" />
          </button>
        </div>

        <p className="text-xs text-stone-500 font-medium mb-5">
          Enter the <span className="font-bold text-stone-950">Balance</span> your broker shows right now (not Equity, which includes open
          trades). The journal adds up deposits, withdrawals and every trade&apos;s P&L up to that moment; the two must be equal to the cent.
        </p>

        <div className="grid grid-cols-2 gap-4 mb-5">
          <div>
            <label className="block text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1">Broker balance ($)</label>
            <input type="number" step="0.01" autoFocus value={balance} onChange={(e) => setBalance(e.target.value)}
              className="w-full bg-stone-50 border border-stone-200 text-stone-950 text-sm font-bold rounded-lg px-3 py-2 focus:outline-none focus:border-stone-500 transition" />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1">As of</label>
            <input type="datetime-local" step="1" value={time} onChange={(e) => setTime(e.target.value)}
              className="w-full bg-stone-50 border border-stone-200 text-stone-950 text-sm font-bold rounded-lg px-3 py-2 focus:outline-none focus:border-stone-500 transition" />
          </div>
        </div>

        {hasMoreThanCents && (
          <p className="text-xs font-bold text-red-900 mb-5">Enter the balance with at most two decimals.</p>
        )}

        {result && (
          <div className={`rounded-xl border p-4 mb-5 ${result.matches ? 'bg-orange-50 border-orange-200' : 'bg-red-50 border-red-200'}`}>
            <div className="flex justify-between text-xs font-bold text-stone-500">
              <span>Journal balance ({result.tradeCount} trades)</span>
              <span className="text-stone-950">${formatNumber(result.journalBalance)}</span>
            </div>
            <div className="flex justify-between text-xs font-bold text-stone-500 mt-1">
              <span>Broker balance</span>
              <span className="text-stone-950">${formatNumber(result.brokerBalance)}</span>
            </div>
            <div className={`flex items-center gap-2 mt-3 pt-3 border-t text-sm font-black ${result.matches ? 'text-orange-400 border-orange-200' : 'text-red-900 border-red-200'}`}>
              {result.matches ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
              {result.matches
                ? 'Matches to the cent'
                : `Journal is $${formatNumber(Math.abs(result.difference))} ${result.difference > 0 ? 'higher' : 'lower'} than the broker`}
            </div>
            {!result.matches && (
              <p className="text-[11px] font-medium text-red-900 mt-2">
                {result.difference > 0
                  ? 'Look for: a losing trade or a withdrawal that is not in the journal, a trade entered twice, or a fee/swap the broker charged.'
                  : 'Look for: a winning trade or a deposit that is not in the journal, or a withdrawal entered twice.'}
              </p>
            )}
          </div>
        )}

        {savedCheck && savedResult && (
          <p className="text-[11px] font-medium text-stone-400 mb-5">
            Last saved check: ${formatNumber(savedCheck.balance)} as of {savedCheck.time.replace('T', ' ')} ·{' '}
            {savedResult.matches ? 'matches' : `off by $${formatNumber(Math.abs(savedResult.difference))}`}
          </p>
        )}

        <div className="flex gap-3 justify-end pt-4 border-t border-stone-100">
          <button onClick={onClose} disabled={isSaving}
            className="px-6 py-2.5 rounded-xl text-xs font-bold bg-stone-100 text-stone-600 hover:bg-stone-200 transition">Cancel</button>
          <button onClick={handleSave} disabled={isSaving || !isValid}
            className="px-6 py-2.5 rounded-xl text-xs font-bold bg-orange-400 text-white hover:bg-orange-500 shadow-md shadow-orange-200 transition disabled:opacity-50 flex items-center gap-2">
            <Save className="w-4 h-4" />
            {isSaving ? "Saving..." : "Save check"}
          </button>
        </div>
      </div>
    </div>
  );
}
