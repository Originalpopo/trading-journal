"use client";

import { useState, useEffect, useRef } from "react";
import { useJournalStore, Trade, Funding } from "@/store/useJournalStore";
import { doc, setDoc, deleteField } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { formatNumber } from "@/lib/utils";
import { deriveResultType } from "@/lib/stats";
import { useEscapeToClose } from "@/lib/useEscapeToClose";
import { X, ClipboardCheck, TrendingUp, TrendingDown, Target, Focus, CheckCircle2 } from "lucide-react";

interface ManualTradeModalProps {
  isOpen: boolean;
  onClose: (savedTrade?: any) => void;
  tradeToEdit?: (Trade | Funding) & { isFunding?: boolean } | null;
}

interface FormState {
  entryType: string;
  symbol: string;
  side: string;
  amount: string;
  time: string;
  risk: string;
  entryTime: string;
  strategy: string;
  tf: string;
  checklists: string[];
  entryPrice: string;
  exitPrice: string;
  tpPrice: string;
  slPrice: string;
  orderEntryType: string;
  orderExitType: string;
}

// Stored time -> value for a datetime-local input (local wall clock, with seconds).
const toInputTime = (value?: string) => {
  if (!value) return "";
  const d = new Date(value.replace(" ", "T"));
  if (isNaN(d.getTime())) return "";
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 19);
};

const firstTf = (tf: string) => (tf.includes(',') ? tf.split(',')[0].trim() : tf);

const BLANK_TRADE_FIELDS = {
  entryPrice: "", exitPrice: "", tpPrice: "", slPrice: "",
  orderEntryType: "Limit", orderExitType: "Limit",
};

function buildInitialForm(tradeToEdit: ManualTradeModalProps['tradeToEdit']): FormState {
  if (tradeToEdit?.isFunding) {
    const f = tradeToEdit as Funding;
    return {
      ...BLANK_TRADE_FIELDS,
      entryType: f.deposit > 0 ? "DEPOSIT" : "WITHDRAW",
      amount: (f.deposit > 0 ? f.deposit : (f.withdraw || 0)).toString(),
      strategy: f.notes || "",
      symbol: "", side: "BUY", risk: "", tf: "none", checklists: [],
      time: toInputTime(f.time), entryTime: "",
    };
  }

  if (tradeToEdit) {
    const t = tradeToEdit as Trade;
    const checklists = t.checklists ? [...t.checklists] : [];
    if (t.isOnPlan !== false && !checklists.includes('On Plan')) checklists.push('On Plan');
    const tf = firstTf(t.tf || "15m");
    return {
      entryType: "TRADE",
      symbol: t.symbol || "",
      side: t.side || "BUY",
      amount: t.profit?.toString() || "",
      strategy: t.strategy || "",
      risk: t.risk?.toString() || "",
      checklists,
      tf: tf === 'none' ? '15m' : tf,
      entryPrice: t.entryPrice?.toString() || "",
      exitPrice: t.exitPrice?.toString() || "",
      tpPrice: t.tpPrice?.toString() || "",
      slPrice: t.slPrice?.toString() || "",
      orderEntryType: t.entryType || "Limit",
      orderExitType: t.exitType || "Limit",
      entryTime: toInputTime(t.entryTime || t.time),
      time: toInputTime(t.time),
    };
  }

  // New entry: defaults come from the latest trade. Trades are read once here; subscribing to them
  // would reset the form whenever a snapshot arrives.
  let risk = "";
  let tf = "15m";
  let checklists = ['On Plan', 'Follow'];
  const trades = useJournalStore.getState().trades;
  if (trades.length > 0) {
    const sortedTrades = [...trades].sort((a, b) => new Date(b.time.replace(" ", "T")).getTime() - new Date(a.time.replace(" ", "T")).getTime());

    if (sortedTrades[0].tf) {
      const lastTf = firstTf(sortedTrades[0].tf);
      tf = lastTf === 'none' ? '15m' : lastTf;
    }

    const lastChecklists = sortedTrades[0].checklists || [];
    checklists = ['On Plan'];
    if (lastChecklists.includes('Follow')) checklists.push('Follow');
    if (lastChecklists.includes('Reversal')) checklists.push('Reversal');
    if (checklists.length === 1) checklists.push('Follow');

    const withRisk = sortedTrades.find(t => t.risk && t.risk > 0);
    if (withRisk) risk = withRisk.risk.toString();
  }

  const now = toInputTime(new Date().toISOString());
  return {
    ...BLANK_TRADE_FIELDS,
    entryType: "TRADE", symbol: "", side: "BUY", amount: "", strategy: "",
    risk, tf, checklists, time: now, entryTime: now,
  };
}

export default function ManualTradeModal({ isOpen, onClose, tradeToEdit }: ManualTradeModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [entryType, setEntryType] = useState("TRADE");
  const [symbol, setSymbol] = useState("");
  const [side, setSide] = useState("BUY");
  const [amount, setAmount] = useState("");
  const [time, setTime] = useState("");
  const [risk, setRisk] = useState("");
  const [entryTime, setEntryTime] = useState("");
  const [strategy, setStrategy] = useState("");

  const [tf, setTf] = useState("none");
  const [checklists, setChecklists] = useState<string[]>([]);
  const [entryPrice, setEntryPrice] = useState("");
  const [exitPrice, setExitPrice] = useState("");
  const [tpPrice, setTpPrice] = useState("");
  const [slPrice, setSlPrice] = useState("");
  const [orderEntryType, setOrderEntryType] = useState("Limit");
  const [orderExitType, setOrderExitType] = useState("Limit");
  // Set once the user touches the entry/exit time inputs; re-importing never overwrites hand-set times.
  const timesEditedRef = useRef(false);
  // The form as it was opened, to tell whether closing would throw away changes.
  const [initialForm, setInitialForm] = useState<FormState | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    timesEditedRef.current = false;
    const f = buildInitialForm(tradeToEdit);
    setInitialForm(f);
    setEntryType(f.entryType);
    setSymbol(f.symbol);
    setSide(f.side);
    setAmount(f.amount);
    setTime(f.time);
    setRisk(f.risk);
    setEntryTime(f.entryTime);
    setStrategy(f.strategy);
    setTf(f.tf);
    setChecklists(f.checklists);
    setEntryPrice(f.entryPrice);
    setExitPrice(f.exitPrice);
    setTpPrice(f.tpPrice);
    setSlPrice(f.slPrice);
    setOrderEntryType(f.orderEntryType);
    setOrderExitType(f.orderExitType);
  }, [isOpen, tradeToEdit]);

  const currentForm: FormState = {
    entryType, symbol, side, amount, time, risk, entryTime, strategy, tf, checklists,
    entryPrice, exitPrice, tpPrice, slPrice, orderEntryType, orderExitType,
  };
  const isDirty = initialForm !== null && (Object.keys(currentForm) as (keyof FormState)[]).some(key =>
    key === 'checklists'
      ? currentForm.checklists.join('|') !== initialForm.checklists.join('|')
      : currentForm[key] !== initialForm[key]);

  // Backdrop clicks and Esc are easy to hit by accident, so they ask before discarding edits.
  const requestClose = () => {
    if (isDirty && !confirm("Discard your unsaved changes?")) return;
    onClose();
  };
  useEscapeToClose(isOpen, requestClose);



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
        const rr = parsedRisk > 0 ? parsedAmount / parsedRisk : 0;
        const resType = deriveResultType(parsedAmount, parsedRisk);

        let calculatedDuration = 0;
        if (entryTime && timeVal) {
          const tEntry = new Date(entryTime.replace(" ", "T"));
          const tExit = new Date(timeVal.replace(" ", "T"));
          if (!isNaN(tEntry.getTime()) && !isNaN(tExit.getTime())) {
            calculatedDuration = Math.max(0, Math.floor((tExit.getTime() - tEntry.getTime()) / 1000));
          }
        }

        const data = {
          time: timeVal,
          entryTime: entryTime,
          exitTime: timeVal,
          duration: calculatedDuration,
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
          ...((!tradeToEdit || timesEditedRef.current) && { exitTimeConfidence: 'manual' as const }),
        };

        // Optional fields left empty must be deleted, otherwise the merge keeps the old value.
        const optionalFields = {
          entryPrice: entryPrice ? parseFloat(entryPrice) : undefined,
          entryType: entryPrice ? orderEntryType : undefined,
          exitPrice: exitPrice ? parseFloat(exitPrice) : undefined,
          exitType: exitPrice ? orderExitType : undefined,
          tpPrice: tpPrice ? parseFloat(tpPrice) : undefined,
          slPrice: slPrice ? parseFloat(slPrice) : undefined,
        };
        const optionalForDb = Object.fromEntries(
          Object.entries(optionalFields).map(([key, val]) => [key, val === undefined ? deleteField() : val])
        );

        await setDoc(doc(db, "trades", tId), { ...data, ...optionalForDb }, { merge: true });
        finalData = Object.fromEntries(
          Object.entries({ ...(tradeToEdit || {}), id: tId, ...data, ...optionalFields, isFunding: false })
            .filter(([, val]) => val !== undefined)
        );
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
  let liveRRStr = "0.00 R";
  let liveRRClass = "text-stone-400 normal-case tracking-normal";
  if (parsedRisk > 0) {
    const rr = parsedAmount / parsedRisk;
    liveRRStr = `${formatNumber(rr)} R`;
    liveRRClass = rr >= 0 ? "text-orange-400 normal-case tracking-normal" : "text-red-900 normal-case tracking-normal";
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-stone-900/50 flex items-center justify-center z-[100] p-4 animate-fadeIn" style={{ outline: 'none', border: 'none' }} onClick={requestClose}>
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

          <div className="grid grid-cols-2 gap-4 mb-4">
            {entryType === "TRADE" ? (
              <>
                <div>
                  <label className="block text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1">Entry Time</label>
                  <input type="datetime-local" step="1" value={entryTime} onChange={(e) => { timesEditedRef.current = true; setEntryTime(e.target.value); }}
                    className="w-full bg-stone-50 border border-stone-200 text-stone-950 text-sm font-bold rounded-lg px-3 py-2 focus:outline-none focus:border-stone-500 transition" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1">Exit Time</label>
                  <input type="datetime-local" step="1" value={time} onChange={(e) => { timesEditedRef.current = true; setTime(e.target.value); }}
                    className="w-full bg-stone-50 border border-stone-200 text-stone-950 text-sm font-bold rounded-lg px-3 py-2 focus:outline-none focus:border-stone-500 transition" />
                </div>
              </>
            ) : (
              <div>
                <label className="block text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1">Date & Time</label>
                <input type="datetime-local" step="1" value={time} onChange={(e) => setTime(e.target.value)}
                  className="w-full bg-stone-50 border border-stone-200 text-stone-950 text-sm font-bold rounded-lg px-3 py-2 focus:outline-none focus:border-stone-500 transition" />
              </div>
            )}
          </div>

          <div className={`grid grid-cols-2 gap-4 ${entryType === "TRADE" ? "mb-4" : ""}`}>
            <div>
              <label className="block text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1">
                {entryType === "TRADE" ? "P&L / Amount ($)" : "Amount ($)"}
              </label>
              <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)}
                className="w-full bg-stone-50 border border-stone-200 text-stone-950 text-sm font-bold rounded-lg px-3 py-2 focus:outline-none focus:border-stone-500 transition" />
            </div>
            
            {entryType === "TRADE" && (
              <div>
                <label className="flex justify-between items-end text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1">
                  <span>Risk ($)</span>
                  <span className={liveRRClass}>RR: {liveRRStr}</span>
                </label>
                <input type="number" step="0.01" value={risk} onChange={(e) => setRisk(e.target.value)} placeholder="Optional"
                  className="w-full bg-stone-50 border border-stone-200 text-stone-950 text-sm font-bold rounded-lg px-3 py-2 focus:outline-none focus:border-stone-500 transition" />
              </div>
            )}
          </div>

          {entryType === "TRADE" && (
            <div className="mb-4">
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
          )}
          
          <div className={`mt-4 ${entryType === "TRADE" ? "" : "hidden"}`}>
            <label className="block text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-2">Checklists</label>
            <div className="flex gap-2 flex-wrap h-full items-start">
              {['On Plan', 'Follow', 'Reversal', 'Entry 1st', 'Entry 2nd'].map((item) => {
                const isChecked = checklists.includes(item);
                const ItemIcon = item === 'On Plan' ? ClipboardCheck : item === 'Follow' ? TrendingUp : item === 'Reversal' ? TrendingDown : item === 'Entry 1st' ? Target : item === 'Entry 2nd' ? Focus : CheckCircle2;
                return (
                  <button
                    type="button"
                    key={item}
                    onClick={() => {
                      if (isChecked) {
                        setChecklists(checklists.filter(t => t !== item));
                      } else {
                        let updated = [...checklists];
                        if (item === 'Follow') {
                          updated = updated.filter(t => t !== 'Reversal');
                        } else if (item === 'Reversal') {
                          updated = updated.filter(t => t !== 'Follow');
                        }
                        updated.push(item);
                        setChecklists(updated);
                      }
                    }}
                    className={`px-3 py-1 text-xs font-bold rounded-md transition cursor-pointer flex items-center gap-1.5 ${
                      isChecked 
                        ? 'bg-orange-400 text-white shadow-sm' 
                        : 'bg-white border border-stone-200 text-stone-500 hover:bg-stone-100'
                    }`}
                  >
                    <ItemIcon className="w-3.5 h-3.5 shrink-0" />
                    <span>{item}</span>
                  </button>
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
