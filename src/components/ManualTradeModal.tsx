"use client";

import { useState, useEffect } from "react";
import { useJournalStore, Trade, Funding } from "@/store/useJournalStore";
import { doc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

interface ManualTradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  tradeToEdit?: (Trade | Funding) & { isFunding?: boolean } | null;
}

export default function ManualTradeModal({ isOpen, onClose, tradeToEdit }: ManualTradeModalProps) {
  const { trades } = useJournalStore();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [entryType, setEntryType] = useState("TRADE");
  const [symbol, setSymbol] = useState("");
  const [side, setSide] = useState("BUY");
  const [amount, setAmount] = useState("");
  const [time, setTime] = useState("");
  const [risk, setRisk] = useState("");
  const [strategy, setStrategy] = useState("");
  const [isOnPlan, setIsOnPlan] = useState(true);

  useEffect(() => {
    if (isOpen) {
      if (tradeToEdit) {
        if (tradeToEdit.isFunding) {
          const f = tradeToEdit as Funding;
          setEntryType(f.deposit > 0 ? "DEPOSIT" : "WITHDRAW");
          setAmount((f.deposit > 0 ? f.deposit : (f.withdraw || 0)).toString());
          setStrategy(f.notes || "");
          setSymbol("");
          setSide("BUY");
          setRisk("");
          setIsOnPlan(true);

          try {
            const d = new Date(f.time.replace(" ", "T"));
            d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
            setTime(d.toISOString().slice(0, 16));
          } catch (e) {
            setTime("");
          }
        } else {
          const t = tradeToEdit as Trade;
          setEntryType("TRADE");
          setSymbol(t.symbol || "");
          setSide(t.side || "BUY");
          setAmount(t.profit?.toString() || "");
          setStrategy(t.strategy || "");
          setRisk(t.risk?.toString() || "");
          setIsOnPlan(t.isOnPlan !== false);

          try {
            const d = new Date(t.time.replace(" ", "T"));
            d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
            setTime(d.toISOString().slice(0, 16));
          } catch (e) {
            setTime("");
          }
        }
      } else {
        setEntryType("TRADE");
        setSymbol("");
        setSide("BUY");
        setAmount("");
        setStrategy("");
        
        let defaultRisk = "";
        if (trades.length > 0) {
          const sortedTrades = [...trades].sort((a, b) => new Date(b.time.replace(" ", "T")).getTime() - new Date(a.time.replace(" ", "T")).getTime());
          for (let t of sortedTrades) {
            if (t.risk && t.risk > 0) {
              defaultRisk = t.risk.toString();
              break;
            }
          }
        }
        setRisk(defaultRisk);
        setIsOnPlan(true);

        const now = new Date();
        now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
        setTime(now.toISOString().slice(0, 16));
      }
    }
  }, [isOpen, tradeToEdit, trades]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const timeVal = time.replace("T", " ");
      const parsedAmount = parseFloat(amount) || 0;
      const parsedRisk = parseFloat(risk) || 0;

      if (entryType === "DEPOSIT" || entryType === "WITHDRAW") {
        const isDeposit = entryType === "DEPOSIT";
        const fId = tradeToEdit?.id || "M_F_" + Date.now();
        const data = {
          time: timeVal,
          deposit: isDeposit ? Math.abs(parsedAmount) : 0,
          withdraw: isDeposit ? 0 : Math.abs(parsedAmount),
          notes: strategy
        };
        await setDoc(doc(db, "funding", fId), data, { merge: true });
      } else {
        const tId = tradeToEdit?.id || "M_T_" + Date.now();
        let rr = parsedRisk > 0 ? parsedAmount / parsedRisk : 0;
        
        let resType = "";
        if (parsedRisk > 0) {
            if (rr >= -0.4 && rr <= 0.4) resType = "BE";
            else if (rr > 0) resType = "TP";
            else resType = "SL";
        } else {
            if (parsedAmount === 0) resType = "BE";
            else if (parsedAmount > 0) resType = "TP";
            else resType = "SL";
        }

        const data = {
          time: timeVal,
          symbol: symbol.toUpperCase().trim(),
          side,
          profit: parsedAmount,
          risk: parsedRisk,
          rr: rr,
          resultType: resType,
          strategy,
          isOnPlan
        };
        await setDoc(doc(db, "trades", tId), data, { merge: true });
      }

      onClose();
    } catch (error) {
      console.error("Failed to save:", error);
      alert("Failed to save. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const parsedAmount = parseFloat(amount) || 0;
  const parsedRisk = parseFloat(risk) || 0;
  let liveRRStr = "0.00R";
  let liveRRClass = "text-slate-400 normal-case tracking-normal";
  if (parsedRisk > 0) {
    const rr = parsedAmount / parsedRisk;
    liveRRStr = `${rr.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}R`;
    liveRRClass = rr >= 0 ? "text-orange-500 normal-case tracking-normal" : "text-red-500 normal-case tracking-normal";
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-[100] p-4">
      <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl relative flex flex-col max-h-[90vh]">
        <h3 className="text-xl font-extrabold text-slate-800 mb-6 tracking-tight">
          {tradeToEdit ? (tradeToEdit.isFunding ? "Edit Funding" : "Edit Trade") : "Add Manual Entry"}
        </h3>
        
        <div className="space-y-4 overflow-y-auto pr-2">
          <div className="mb-4">
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Entry Type</label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="entryType" value="TRADE" checked={entryType === "TRADE"} onChange={() => setEntryType("TRADE")} className="text-orange-500 focus:ring-orange-500 w-4 h-4" />
                <span className="text-sm font-bold text-slate-700">Trade</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="entryType" value="DEPOSIT" checked={entryType === "DEPOSIT"} onChange={() => setEntryType("DEPOSIT")} className="text-orange-500 focus:ring-orange-500 w-4 h-4" />
                <span className="text-sm font-bold text-slate-700">Deposit</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="entryType" value="WITHDRAW" checked={entryType === "WITHDRAW"} onChange={() => setEntryType("WITHDRAW")} className="text-orange-500 focus:ring-orange-500 w-4 h-4" />
                <span className="text-sm font-bold text-slate-700">Withdraw</span>
              </label>
            </div>
          </div>

          <div className={entryType === "TRADE" ? "mb-4" : "hidden"}>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Symbol</label>
                <input type="text" value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="e.g. BTCUSDT"
                  className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-sm font-bold rounded-lg px-3 py-2 focus:outline-none focus:border-slate-500 transition uppercase" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Side</label>
                <select value={side} onChange={(e) => setSide(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-sm font-bold rounded-lg px-3 py-2 focus:outline-none focus:border-slate-500 transition">
                  <option value="BUY">BUY</option>
                  <option value="SELL">SELL</option>
                </select>
              </div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer mt-3 w-max">
              <input type="checkbox" checked={isOnPlan} onChange={(e) => setIsOnPlan(e.target.checked)} className="text-orange-500 focus:ring-orange-500 w-4 h-4 rounded border-slate-300" />
              <span className="text-xs font-bold text-slate-600">On Plan (ตามแผน)</span>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
                {entryType === "TRADE" ? "P&L / Amount ($)" : "Amount ($)"}
              </label>
              <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-sm font-bold rounded-lg px-3 py-2 focus:outline-none focus:border-slate-500 transition" />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Date & Time</label>
              <input type="datetime-local" value={time} onChange={(e) => setTime(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-sm font-bold rounded-lg px-3 py-2 focus:outline-none focus:border-slate-500 transition" />
            </div>
          </div>

          <div className={`grid grid-cols-2 gap-4 ${entryType === "TRADE" ? "" : "hidden"}`}>
            <div>
              <label className="flex justify-between items-end text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
                <span>Risk ($)</span>
                <span className={liveRRClass}>RR: {liveRRStr}</span>
              </label>
              <input type="number" step="0.01" value={risk} onChange={(e) => setRisk(e.target.value)} placeholder="Optional"
                className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-sm font-bold rounded-lg px-3 py-2 focus:outline-none focus:border-slate-500 transition" />
            </div>
          </div>
          
          <div className="mt-4">
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Notes</label>
            <textarea value={strategy} onChange={(e) => setStrategy(e.target.value)} placeholder="Add your notes here..." rows={4}
              className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-sm font-bold rounded-lg px-3 py-2 focus:outline-none focus:border-slate-500 transition resize-y"></textarea>
          </div>
        </div>

        <div className="flex gap-3 justify-end mt-8 shrink-0">
          <button onClick={onClose} disabled={isSubmitting}
            className="px-5 py-2 rounded-xl text-xs font-bold bg-slate-100 text-slate-500 hover:bg-slate-200 transition">Cancel</button>
          <button onClick={handleSubmit} disabled={isSubmitting}
            className="px-5 py-2 rounded-xl text-xs font-bold bg-orange-500 text-white hover:bg-orange-600 shadow-md shadow-orange-200 transition disabled:opacity-50">
            {isSubmitting ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
