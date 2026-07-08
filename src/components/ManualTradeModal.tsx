"use client";

import { useState, useEffect } from "react";
import { useJournalStore, Trade, Funding } from "@/store/useJournalStore";
import { doc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { formatNumber } from "@/lib/utils";
import { Trash2, X, HelpCircle } from "lucide-react";

interface ManualTradeModalProps {
  isOpen: boolean;
  onClose: (savedTrade?: any) => void;
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

  const [tf, setTf] = useState("none");
  const [checklists, setChecklists] = useState<string[]>([]);
  const [entryPrice, setEntryPrice] = useState("");
  const [exitPrice, setExitPrice] = useState("");
  const [tpPrice, setTpPrice] = useState("");
  const [slPrice, setSlPrice] = useState("");
  const [orderEntryType, setOrderEntryType] = useState("Limit");
  const [orderExitType, setOrderExitType] = useState("Limit");

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

          setTf("none");

          try {
            const d = new Date(f.time.replace(" ", "T"));
            d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
            setTime(d.toISOString().slice(0, 19));
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
          const initialChecklists = t.checklists ? [...t.checklists] : [];
          if (t.isOnPlan !== false && !initialChecklists.includes('On Plan')) {
            initialChecklists.push('On Plan');
          }
          setChecklists(initialChecklists);

          
          let initialTf = t.tf || "15m";
          if (initialTf.includes(',')) initialTf = initialTf.split(',')[0].trim();
          setTf(initialTf === 'none' ? '15m' : initialTf);
          
          setEntryPrice(t.entryPrice?.toString() || "");
          setExitPrice(t.exitPrice?.toString() || "");
          setTpPrice(t.tpPrice?.toString() || "");
          setSlPrice(t.slPrice?.toString() || "");
          setOrderEntryType(t.entryType || "Limit");
          setOrderExitType(t.exitType || "Limit");

          try {
            const d = new Date(t.time.replace(" ", "T"));
            d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
            setTime(d.toISOString().slice(0, 19));
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

        setEntryPrice("");
        setExitPrice("");
        setTpPrice("");
        setSlPrice("");
        setOrderEntryType("Limit");
        setOrderExitType("Limit");
        
        let defaultRisk = "";
        let defaultTf = "15m";
        if (trades.length > 0) {
          const sortedTrades = [...trades].sort((a, b) => new Date(b.time.replace(" ", "T")).getTime() - new Date(a.time.replace(" ", "T")).getTime());
          if (sortedTrades[0].tf) {
             let lastTf = sortedTrades[0].tf;
             if (lastTf.includes(',')) lastTf = lastTf.split(',')[0].trim();
             defaultTf = lastTf === 'none' ? '15m' : lastTf;
          }
          for (let t of sortedTrades) {
            if (t.risk && t.risk > 0) {
              defaultRisk = t.risk.toString();
              break;
            }
          }
        }
        setRisk(defaultRisk);
        setTf(defaultTf);
        setChecklists(['On Plan', 'Follow']);

        const now = new Date();
        now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
        setTime(now.toISOString().slice(0, 19));
      }
    }
  }, [isOpen, tradeToEdit, trades]);



  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const timeVal = time;
      const parsedAmount = parseFloat(amount) || 0;
      const parsedRisk = parseFloat(risk) || 0;


      let finalData: any;

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
        finalData = { 
          id: fId, 
          ...data, 
          isFunding: true, 
          symbol: isDeposit ? 'DEPOSIT' : 'WITHDRAW', 
          profit: isDeposit ? data.deposit : -(data.withdraw || 0) 
        };
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
          isOnPlan: checklists.includes('On Plan'),
          tf,
          checklists,
          ...(entryPrice && { entryPrice: parseFloat(entryPrice), entryType: orderEntryType }),
          ...(exitPrice && { exitPrice: parseFloat(exitPrice), exitType: orderExitType }),
          ...(tpPrice && { tpPrice: parseFloat(tpPrice) }),
          ...(slPrice && { slPrice: parseFloat(slPrice) })
        };
        await setDoc(doc(db, "trades", tId), data, { merge: true });
        finalData = { ...(tradeToEdit || {}), id: tId, ...data, isFunding: false };
      }

      onClose(finalData);
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
  let liveRRClass = "text-stone-400 normal-case tracking-normal";
  if (parsedRisk > 0) {
    const rr = parsedAmount / parsedRisk;
    liveRRStr = `${formatNumber(rr)}R`;
    liveRRClass = rr >= 0 ? "text-orange-400 normal-case tracking-normal" : "text-red-900 normal-case tracking-normal";
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-stone-900/50 flex items-center justify-center z-[100] p-4 animate-fadeIn" style={{ outline: 'none', border: 'none' }} onClick={() => onClose()}>
      <div className="bg-white border-0 bg-clip-padding rounded-3xl w-full max-w-4xl p-6 md:p-8 shadow-2xl relative flex flex-col max-h-[90vh]" style={{ outline: 'none', border: 'none', backgroundClip: 'padding-box', transform: 'translateZ(0)', backfaceVisibility: 'hidden' }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between pb-4 mb-6 border-b border-stone-100">
          <h3 className="text-2xl font-black text-stone-950 tracking-tight">
            {tradeToEdit ? (tradeToEdit.isFunding ? "Edit Funding" : "Edit Trade") : "Add Manual Entry"}
          </h3>
          <button onClick={() => onClose()} className="text-stone-400 hover:text-stone-600 p-1 rounded-full hover:bg-stone-100 transition">
            <X className="w-6 h-6" />
          </button>
        </div>
        
        <div className="space-y-6 overflow-y-auto pr-2 flex-1 border-0 border-transparent" style={{ outline: 'none' }}>
          <div className="mb-4">
            <label className="block text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-2">Entry Type</label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="entryType" value="TRADE" checked={entryType === "TRADE"} onChange={() => setEntryType("TRADE")} className="text-orange-400 focus:ring-orange-400 w-4 h-4" />
                <span className="text-sm font-bold text-stone-950">Trade</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="entryType" value="DEPOSIT" checked={entryType === "DEPOSIT"} onChange={() => setEntryType("DEPOSIT")} className="text-orange-400 focus:ring-orange-400 w-4 h-4" />
                <span className="text-sm font-bold text-stone-950">Deposit</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="entryType" value="WITHDRAW" checked={entryType === "WITHDRAW"} onChange={() => setEntryType("WITHDRAW")} className="text-orange-400 focus:ring-orange-400 w-4 h-4" />
                <span className="text-sm font-bold text-stone-950">Withdraw</span>
              </label>
            </div>
          </div>

          <div className={entryType === "TRADE" ? "mb-4" : "hidden"}>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1">Symbol</label>
                <input type="text" value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="e.g. BTCUSDT"
                  className="w-full bg-stone-50 border border-stone-200 text-stone-950 text-sm font-bold rounded-lg px-3 py-2 focus:outline-none focus:border-stone-500 transition uppercase" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1">Side</label>
                <select value={side} onChange={(e) => setSide(e.target.value)}
                  className="w-full bg-stone-50 border border-stone-200 text-stone-950 text-sm font-bold rounded-lg px-3 py-2 focus:outline-none focus:border-stone-500 transition">
                  <option value="BUY">BUY</option>
                  <option value="SELL">SELL</option>
                </select>
              </div>
            </div>
          </div>

          <div className={`grid grid-cols-2 gap-4 mb-4 ${entryType === "TRADE" ? "" : "hidden"}`}>
            <div>
              <label className="block text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1">Entry Price & Type</label>
              <div className="flex bg-stone-50 border border-stone-200 rounded-lg overflow-hidden focus-within:border-stone-500 transition">
                <input type="number" step="0.01" value={entryPrice} onChange={(e) => setEntryPrice(e.target.value)} placeholder="Optional"
                  className="w-full bg-transparent text-stone-950 text-sm font-bold px-3 py-2 focus:outline-none min-w-0" />
                <select value={orderEntryType} onChange={(e) => setOrderEntryType(e.target.value)} 
                  className="bg-stone-100/50 text-stone-500 text-xs font-bold border-l border-stone-200 px-2 py-2 focus:outline-none cursor-pointer">
                  <option value="Limit">Limit</option>
                  <option value="Market">Market</option>
                  <option value="Stop">Stop</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1">Exit Price & Type</label>
              <div className="flex bg-stone-50 border border-stone-200 rounded-lg overflow-hidden focus-within:border-stone-500 transition">
                <input type="number" step="0.01" value={exitPrice} onChange={(e) => setExitPrice(e.target.value)} placeholder="Optional"
                  className="w-full bg-transparent text-stone-950 text-sm font-bold px-3 py-2 focus:outline-none min-w-0" />
                <select value={orderExitType} onChange={(e) => setOrderExitType(e.target.value)} 
                  className="bg-stone-100/50 text-stone-500 text-xs font-bold border-l border-stone-200 px-2 py-2 focus:outline-none cursor-pointer">
                  <option value="Limit">Limit</option>
                  <option value="Take Profit">Take Profit</option>
                  <option value="Stop Loss">Stop Loss</option>
                  <option value="Market">Market</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1">Take Profit</label>
              <input type="number" step="0.01" value={tpPrice} onChange={(e) => setTpPrice(e.target.value)} placeholder="Optional"
                className="w-full bg-stone-50 border border-stone-200 text-stone-950 text-sm font-bold rounded-lg px-3 py-2 focus:outline-none focus:border-stone-500 transition" />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1">Stop Loss</label>
              <input type="number" step="0.01" value={slPrice} onChange={(e) => setSlPrice(e.target.value)} placeholder="Optional"
                className="w-full bg-stone-50 border border-stone-200 text-stone-950 text-sm font-bold rounded-lg px-3 py-2 focus:outline-none focus:border-stone-500 transition" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1">
                {entryType === "TRADE" ? "P&L / Amount ($)" : "Amount ($)"}
              </label>
              <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)}
                className="w-full bg-stone-50 border border-stone-200 text-stone-950 text-sm font-bold rounded-lg px-3 py-2 focus:outline-none focus:border-stone-500 transition" />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1">Date & Time</label>
              <input type="datetime-local" step="1" value={time} onChange={(e) => setTime(e.target.value)}
                className="w-full bg-stone-50 border border-stone-200 text-stone-950 text-sm font-bold rounded-lg px-3 py-2 focus:outline-none focus:border-stone-500 transition" />
            </div>
          </div>

          <div className={`grid grid-cols-2 gap-4 ${entryType === "TRADE" ? "" : "hidden"}`}>
            <div>
              <label className="flex justify-between items-end text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1">
                <span>Risk ($)</span>
                <span className={liveRRClass}>RR: {liveRRStr}</span>
              </label>
              <input type="number" step="0.01" value={risk} onChange={(e) => setRisk(e.target.value)} placeholder="Optional"
                className="w-full bg-stone-50 border border-stone-200 text-stone-950 text-sm font-bold rounded-lg px-3 py-2 focus:outline-none focus:border-stone-500 transition" />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-2">Timeframe (TF)</label>
              <div className="flex gap-2 flex-wrap h-full items-start">
                {['1s', '5s', '15s', '1m', '5m', '15m', '1h'].map((item) => (
                  <button
                    type="button"
                    key={item}
                    onClick={() => setTf(item)}
                    className={`px-3 py-1 text-xs font-bold rounded-md transition ${
                      tf === item 
                        ? 'bg-orange-400 text-white shadow-sm' 
                        : 'bg-white border border-stone-200 text-stone-500 hover:bg-stone-100'
                    }`}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>
          </div>
          
          <div className={`mt-4 ${entryType === "TRADE" ? "" : "hidden"}`}>
            <label className="block text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-2">Checklists</label>
            <div className="flex gap-4 bg-stone-50 border border-stone-200 rounded-lg px-3 py-2 flex-wrap">
              {['On Plan', 'Follow', 'Reversal', 'POI 1st', 'POI 2nd', 'POI 3rd'].map((item) => {
                const isChecked = checklists.includes(item);
                return (
                  <label key={item} className="flex items-center gap-2 cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={isChecked} 
                      onChange={(e) => {
                        if (e.target.checked) {
                          if (!checklists.includes(item)) setChecklists([...checklists, item]);
                        } else {
                          setChecklists(checklists.filter(t => t !== item));
                        }
                      }} 
                      className="text-orange-400 focus:ring-orange-400 w-4 h-4 rounded border-stone-300" 
                    />
                    <span className="text-xs font-bold text-stone-950">{item}</span>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="mt-4">
            <label className="block text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1">Notes</label>
            <textarea value={strategy} onChange={(e) => setStrategy(e.target.value)} placeholder="Add your notes here..." rows={3}
              className="w-full bg-stone-50 border border-stone-200 text-stone-950 text-sm font-bold rounded-lg px-3 py-2 focus:outline-none focus:border-stone-500 transition resize-y"></textarea>
          </div>
        </div>

        <div className="flex gap-3 justify-end pt-4 mt-6 border-t border-stone-100 shrink-0">
          <button onClick={() => onClose()} disabled={isSubmitting}
            className="px-6 py-2.5 rounded-xl text-xs font-bold bg-stone-100 text-stone-600 hover:bg-stone-200 transition">Cancel</button>
          <button onClick={handleSubmit} disabled={isSubmitting}
            className="px-6 py-2.5 rounded-xl text-xs font-bold bg-orange-400 text-white hover:bg-orange-500 shadow-md shadow-orange-200 transition disabled:opacity-50">
            {isSubmitting ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
