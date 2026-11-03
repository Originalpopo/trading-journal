"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useJournalStore, Trade, Funding } from "@/store/useJournalStore";
import { doc, setDoc, deleteField } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { formatNumber } from "@/lib/utils";
import { initialStopOf, buildRiskContext, deriveTradeRisk, resolveDefaultRisk, defaultRiskAt } from "@/lib/risk";
import { useEscapeToClose } from "@/lib/useEscapeToClose";
import { hasFractionOfCent } from "@/lib/money";
import { DEFAULT_LOT_SIZE } from "@/lib/statement";
import { X, CheckCircle2, XCircle, ChartCandlestick, ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import PillTabs, { type PillTab } from "./PillTabs";
import SaveRow from "./SaveRow";
import { TradeSummaryLine, FoldBar } from "./TradeSummary";
import OffPlanReasonPicker from "./OffPlanReasonPicker";
import { useOffPlanReasons } from "./useOffPlanReasons";

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
  offPlanReasons: string[];
  entryPrice: string;
  exitPrice: string;
  tpPrice: string;
  slPrice: string;
  initialSl: string;
  orderEntryType: string;
  orderExitType: string;
  thb: string;
  bankDate: string;
  size: string;
}

// Stored time -> value for a datetime-local input (local wall clock, with seconds).
const toInputTime = (value?: string) => {
  if (!value) return "";
  const d = new Date(value.replace(" ", "T"));
  if (isNaN(d.getTime())) return "";
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 19);
};

// Form values are strings or lists of strings (checklists, reasons).
const sameValue = (a: string | string[], b: string | string[]) =>
  Array.isArray(a) && Array.isArray(b) ? a.join('|') === b.join('|') : a === b;

const firstTf = (tf: string) => (tf.includes(',') ? tf.split(',')[0].trim() : tf);

const BLANK_TRADE_FIELDS = {
  entryPrice: "", exitPrice: "", tpPrice: "", slPrice: "", initialSl: "",
  orderEntryType: "Limit", orderExitType: "Limit",
  thb: "", bankDate: "", size: DEFAULT_LOT_SIZE.toString(),
};

function buildInitialForm(tradeToEdit: ManualTradeModalProps['tradeToEdit']): FormState {
  if (tradeToEdit?.isFunding) {
    const f = tradeToEdit as Funding;
    return {
      ...BLANK_TRADE_FIELDS,
      entryType: f.deposit > 0 ? "DEPOSIT" : "WITHDRAW",
      amount: (f.deposit > 0 ? f.deposit : (f.withdraw || 0)).toString(),
      strategy: f.notes || "",
      symbol: "", side: "BUY", risk: "", tf: "none", checklists: [], offPlanReasons: [],
      time: toInputTime(f.time), entryTime: "",
      thb: f.thb?.toString() || "", bankDate: f.bankDate || "",
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
      offPlanReasons: checklists.includes('On Plan') ? [] : [...(t.offPlanReasons ?? [])],
      tf: tf === 'none' ? '15m' : tf,
      entryPrice: t.entryPrice?.toString() || "",
      exitPrice: t.exitPrice?.toString() || "",
      tpPrice: t.tpPrice?.toString() || "",
      slPrice: t.slPrice?.toString() || "",
      initialSl: initialStopOf(t)?.price.toString() || "",
      orderEntryType: t.entryType || "Limit",
      orderExitType: t.exitType || "Limit",
      entryTime: toInputTime(t.entryTime || t.time),
      time: toInputTime(t.time),
      thb: "", bankDate: "",
      size: (t.size ?? DEFAULT_LOT_SIZE).toString(),
    };
  }

  // New entry: defaults come from the latest trade. Trades are read once here; subscribing to them
  // would reset the form whenever a snapshot arrives.
  let risk = "";
  let tf = "15m";
  const checklists = ['On Plan'];
  const trades = useJournalStore.getState().trades;
  if (trades.length > 0) {
    const sortedTrades = [...trades].sort((a, b) => new Date(b.time.replace(" ", "T")).getTime() - new Date(a.time.replace(" ", "T")).getTime());

    if (sortedTrades[0].tf) {
      const lastTf = firstTf(sortedTrades[0].tf);
      tf = lastTf === 'none' ? '15m' : lastTf;
    }
  }
  const now = toInputTime(new Date().toISOString());
  // 1R varies per trade (it follows each trade's stop), so a new entry starts from the usual 1R now:
  // the median of the last 10 known ones, else the Settings value.
  const usualRisk = defaultRiskAt(
    buildRiskContext(trades, resolveDefaultRisk(useJournalStore.getState().preferences.defaultRisk, trades)),
    { entryTime: now.replace('T', ' ') },
  );
  if (usualRisk) risk = usualRisk.toString();
  return {
    ...BLANK_TRADE_FIELDS,
    entryType: "TRADE", symbol: "", side: "BUY", amount: "", strategy: "",
    risk, tf, checklists, offPlanReasons: [], time: now, entryTime: now,
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
  const [offPlanReasons, setOffPlanReasons] = useState<string[]>([]);
  const reasons = useOffPlanReasons();
  const isPrivacyMode = useJournalStore(state => state.isPrivacyMode);
  const [entryPrice, setEntryPrice] = useState("");
  const [exitPrice, setExitPrice] = useState("");
  const [tpPrice, setTpPrice] = useState("");
  const [slPrice, setSlPrice] = useState("");
  const [initialSl, setInitialSl] = useState("");
  const [orderEntryType, setOrderEntryType] = useState("Limit");
  const [orderExitType, setOrderExitType] = useState("Limit");
  const [thb, setThb] = useState("");
  const [bankDate, setBankDate] = useState("");
  const [size, setSize] = useState("");
  // The trade's own fields: folded while editing a trade, open on a new entry.
  const [detailsOpen, setDetailsOpen] = useState(false);
  // Set once the user touches the entry/exit time inputs; re-importing never overwrites hand-set times.
  const timesEditedRef = useRef(false);
  // Set once the user types the first stop or the risk, so 1R is no longer the default guess.
  const [initialSlEdited, setInitialSlEdited] = useState(false);
  const [riskEdited, setRiskEdited] = useState(false);
  // The form as it was opened, to tell whether closing would throw away changes.
  const [initialForm, setInitialForm] = useState<FormState | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    timesEditedRef.current = false;
    setInitialSlEdited(false);
    setRiskEdited(false);
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
    setOffPlanReasons(f.offPlanReasons);
    setEntryPrice(f.entryPrice);
    setExitPrice(f.exitPrice);
    setTpPrice(f.tpPrice);
    setSlPrice(f.slPrice);
    setInitialSl(f.initialSl);
    setOrderEntryType(f.orderEntryType);
    setOrderExitType(f.orderExitType);
    setThb(f.thb);
    setBankDate(f.bankDate);
    setSize(f.size);
    setDetailsOpen(!tradeToEdit);
  }, [isOpen, tradeToEdit]);

  const currentForm: FormState = {
    entryType, symbol, side, amount, time, risk, entryTime, strategy, tf, checklists, offPlanReasons,
    entryPrice, exitPrice, tpPrice, slPrice, initialSl, orderEntryType, orderExitType, thb, bankDate, size,
  };

  const prevTrade = tradeToEdit && !tradeToEdit.isFunding ? (tradeToEdit as Trade) : undefined;
  // The price the entry order was placed at is not in the form; it holds while the fill is untouched.
  const entryNum = parseFloat(entryPrice);
  const entryOrderPrice = prevTrade?.entryOrderPrice && prevTrade.entryPrice === entryNum ? prevTrade.entryOrderPrice : undefined;

  // The first stop must be on the losing side of the entry.
  const initialSlNum = parseFloat(initialSl);
  const entryRef = entryOrderPrice ?? entryNum;
  const sideDir = side === 'SELL' ? -1 : 1;
  const hasInitialSl = Number.isFinite(initialSlNum);
  const validInitialSl = hasInitialSl && Number.isFinite(entryRef) && sideDir * (entryRef - initialSlNum) > 0;

  const handleInitialSlChange = (value: string) => {
    setInitialSlEdited(true);
    setInitialSl(value);
  };

  // A first stop the user typed is theirs; one prefilled from the broker keeps its origin.
  const initialSlSource = validInitialSl
    ? (initialSlEdited ? 'manual' : (prevTrade?.initialSlSource || (prevTrade && initialStopOf(prevTrade)?.source) || 'manual'))
    : undefined;

  // Risk, R and TP/SL/BE of the trade as the form stands, worked out the way the journal does.
  // Trades are read once per opening; subscribing would recompute on every snapshot.
  const riskContext = useMemo(() => {
    const { trades, preferences } = useJournalStore.getState();
    return buildRiskContext(trades, resolveDefaultRisk(preferences.defaultRisk, trades));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);
  const optionalNumber = (value: string) => (value ? parseFloat(value) : undefined);
  const formRisk = deriveTradeRisk({
    symbol: symbol.toUpperCase().trim(),
    side,
    size: parseFloat(size) > 0 ? parseFloat(size) : undefined,
    profit: parseFloat(amount) || 0,
    risk: parseFloat(risk) || 0,
    entryPrice: optionalNumber(entryPrice),
    entryOrderPrice,
    exitPrice: optionalNumber(exitPrice),
    slPrice: optionalNumber(slPrice),
    exitType: exitPrice ? orderExitType : undefined,
    initialSlPrice: validInitialSl ? initialSlNum : undefined,
    initialSlSource,
    // 1R is only a guess while neither the first stop nor the risk was given.
    riskIsEstimate: validInitialSl || riskEdited ? false : prevTrade?.riskIsEstimate,
  }, riskContext);
  const isDirty = initialForm !== null && (Object.keys(currentForm) as (keyof FormState)[]).some(key =>
    !sameValue(currentForm[key], initialForm[key]));

  // Esc is easy to hit by accident, so it asks before discarding edits. A backdrop click closes straight away.
  const requestClose = () => {
    if (isDirty && !confirm("Discard your unsaved changes?")) return;
    onClose();
  };
  useEscapeToClose(isOpen, requestClose);



  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setIsSubmitting(true);

    try {
      const timeVal = time;
      const parsedAmount = parseFloat(amount) || 0;


      let finalData: any;

      if (entryType === "DEPOSIT" || entryType === "WITHDRAW") {
        const isDeposit = entryType === "DEPOSIT";
        const fId = tradeToEdit?.id || "M_F_" + Date.now();
        const data = {
          time: timeVal,
          deposit: isDeposit ? Math.abs(parsedAmount) : 0,
          withdraw: isDeposit ? 0 : Math.abs(parsedAmount),
          notes: strategy,
          thb: parsedThb > 0 ? parsedThb : undefined,
          bankDate: parsedThb > 0 ? (bankDate || timeVal.slice(0, 10)) : undefined,
        };
        // Emptied optional fields must be deleted, otherwise the merge keeps the old value.
        const dataForDb = Object.fromEntries(Object.entries(data).map(([key, val]) => [key, val === undefined ? deleteField() : val]));
        await setDoc(doc(db, "funding", fId), dataForDb, { merge: true });
        finalData = { 
          id: fId, 
          ...data, 
          isFunding: true, 
          symbol: isDeposit ? 'DEPOSIT' : 'WITHDRAW', 
          profit: isDeposit ? data.deposit : -(data.withdraw || 0) 
        };
      } else {
        const tId = tradeToEdit?.id || "M_T_" + Date.now();

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
          risk: formRisk.risk,
          rr: formRisk.rr,
          resultType: formRisk.resultType,
          strategy,
          isOnPlan: checklists.includes('On Plan'),
          tf,
          checklists,
          offPlanReasons: checklists.includes('On Plan') ? [] : offPlanReasons,
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
          size: parsedSize > 0 ? parsedSize : undefined,
          initialSlPrice: validInitialSl ? initialSlNum : undefined,
          initialSlSource,
          // 1R is only a guess while neither the first stop nor the risk was given.
          riskIsEstimate: validInitialSl || riskEdited ? false : prevTrade?.riskIsEstimate,
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
  // P&L, deposits and withdrawals are real money: never store a fraction of a cent.
  const invalidAmount = hasFractionOfCent(amount);
  const parsedSize = parseFloat(size) || 0;
  const invalidSize = size.trim() !== "" && !(parsedSize > 0);
  const parsedThb = parseFloat(thb) || 0;
  const invalidThb = hasFractionOfCent(thb) || parsedThb < 0;
  const isFundingEntry = entryType !== "TRADE";
  // What one dollar was actually worth in this transfer, fees and the bank's spread included.
  const impliedRate = isFundingEntry && parsedThb > 0 && Math.abs(parsedAmount) > 0 ? parsedThb / Math.abs(parsedAmount) : null;
  // RR shows once there is a P&L to measure.
  let liveRRStr = "";
  let liveRRClass = "";
  if (formRisk.risk > 0 && amount.trim() !== "") {
    const rr = formRisk.rr;
    liveRRStr = `${formatNumber(rr)} R`;
    liveRRClass = rr >= 0 ? "text-orange-400 normal-case tracking-normal" : "text-red-900 normal-case tracking-normal";
  }
  // An off-plan trade must say why.
  const missingReason = entryType === "TRADE" && !checklists.includes('On Plan') && !reasons.some(r => offPlanReasons.includes(r.id));
  const canSubmit = !missingReason && !invalidAmount && !(!isFundingEntry && invalidSize) && !(isFundingEntry && invalidThb) && !(entryType === "TRADE" && hasInitialSl && !validInitialSl);
  // Save shows once something was typed. On a new entry, only switching tabs is not something to save.
  const hasChangesToSave = initialForm !== null && (Object.keys(currentForm) as (keyof FormState)[]).some(key =>
    key === 'entryType'
      ? Boolean(tradeToEdit) && currentForm.entryType !== initialForm.entryType
      : !sameValue(currentForm[key], initialForm[key]));

  if (!isOpen) return null;

  // While editing, only the kinds the entry can turn into: a trade stays a trade, funding stays funding.
  const sections: PillTab<string>[] = [
    { id: "TRADE", label: "Trade", icon: ChartCandlestick },
    { id: "DEPOSIT", label: "Deposit", icon: ArrowDownToLine },
    { id: "WITHDRAW", label: "Withdraw", icon: ArrowUpFromLine },
  ].filter(s => !tradeToEdit || (tradeToEdit.isFunding ? s.id !== "TRADE" : s.id === "TRADE"));

  // The trade itself, from the broker on an imported trade: folded away while editing one, open on a new
  // entry, where it has to be filled in. Rows sized to what goes in them.
  const label = "block text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1";
  const field = "w-full min-w-0 bg-stone-50 border border-stone-200 text-stone-950 text-sm font-bold rounded-lg px-3 py-2 focus:outline-none focus:border-stone-500 transition";
  const detailsHaveError = invalidAmount || invalidSize || (hasInitialSl && !validInitialSl);
  const detailFields = (
    <div className="space-y-4">
      {/* On a phone the symbol and side take a little more of the row, so XAUUSD and SELL show whole. */}
      <div className="grid grid-cols-[1.2fr_1.1fr_1fr] sm:grid-cols-3 gap-2 sm:gap-3">
        <div>
          <label className={label}>Symbol</label>
          <input type="text" value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="XAUUSD" className={`${field} uppercase`} />
        </div>
        <div>
          <label className={label}>Side</label>
          <select value={side} onChange={(e) => setSide(e.target.value)} className={`${field} px-2`}>
            <option value="BUY">BUY</option>
            <option value="SELL">SELL</option>
          </select>
        </div>
        <div>
          <label className={label}>Size (lot)</label>
          <input type="number" step="0.01" min="0" value={size} onChange={(e) => setSize(e.target.value)}
            className={`${field} ${invalidSize ? 'border-red-900' : ''}`} />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={label}>Entry Time</label>
          <input type="datetime-local" step="1" value={entryTime} onChange={(e) => { timesEditedRef.current = true; setEntryTime(e.target.value); }} className={field} />
        </div>
        <div>
          <label className={label}>Exit Time</label>
          <input type="datetime-local" step="1" value={time} onChange={(e) => { timesEditedRef.current = true; setTime(e.target.value); }} className={field} />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className={label}>P&L ($)</label>
          <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)}
            className={`${field} ${invalidAmount ? 'border-red-900' : ''}`} />
          {invalidAmount && <p className="text-[10px] font-bold text-red-900 mt-1">Max 2 decimals</p>}
        </div>
        <div>
          <label className={label}>Risk ($)</label>
          {validInitialSl ? (
            <input type="number" value={formRisk.risk} readOnly title="Measured from the entry to the first stop"
              className={`${field} bg-stone-100 text-stone-500 focus:border-stone-200`} />
          ) : (
            <input type="number" step="0.01" value={risk} onChange={(e) => { setRiskEdited(true); setRisk(e.target.value); }} className={field} />
          )}
        </div>
        <div>
          <label className={label}>R</label>
          <p className={`h-[38px] flex items-center px-3 rounded-lg bg-stone-100 text-sm font-bold ${liveRRStr ? liveRRClass : 'text-stone-400'}`} title="P&L divided by Risk">
            {liveRRStr || '-'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={label}>Entry Price & Type</label>
          <div className="flex bg-stone-50 border border-stone-200 rounded-lg overflow-hidden focus-within:border-stone-500 transition">
            <input type="number" step="0.01" value={entryPrice} onChange={(e) => setEntryPrice(e.target.value)}
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
          <label className={label}>Exit Price & Type</label>
          <div className="flex bg-stone-50 border border-stone-200 rounded-lg overflow-hidden focus-within:border-stone-500 transition">
            <input type="number" step="0.01" value={exitPrice} onChange={(e) => setExitPrice(e.target.value)}
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
      </div>

      <div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className={label}>Take Profit</label>
            <input type="number" step="0.01" value={tpPrice} onChange={(e) => setTpPrice(e.target.value)} className={field} />
          </div>
          <div>
            <label className={label} title="Where the stop was first placed. 1R is measured to it; entering it sets Risk.">1st SL</label>
            <input type="number" step="0.01" value={initialSl} onChange={(e) => handleInitialSlChange(e.target.value)}
              title="Where the stop was first placed. 1R is measured to it; entering it sets Risk."
              className={`${field} ${hasInitialSl && !validInitialSl ? 'border-red-900' : ''}`} />
          </div>
          <div>
            <label className={label} title="Where the stop ended up (e.g. moved to break-even)">Final SL</label>
            <input type="number" step="0.01" value={slPrice} onChange={(e) => setSlPrice(e.target.value)}
              title="Where the stop ended up (e.g. moved to break-even)" className={field} />
          </div>
        </div>
        {hasInitialSl && !validInitialSl && (
          <p className="text-[10px] font-bold text-red-900 mt-1">1st SL must be {side === 'SELL' ? 'above' : 'below'} entry</p>
        )}
      </div>
    </div>
  );

  // The plan, the note and the timeframe: what is set by hand on an imported trade.
  const planField = (
    <div>
      <label className="block text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-2">Plan</label>
      <div className="inline-flex items-center bg-stone-100 p-0.5 rounded-lg border border-stone-200">
        {[{ onPlan: true, label: 'On Plan', Icon: CheckCircle2 }, { onPlan: false, label: 'Off Plan', Icon: XCircle }].map(({ onPlan, label, Icon }) => {
          const isActive = checklists.includes('On Plan') === onPlan;
          return (
            <button
              type="button"
              key={label}
              onClick={() => {
                // Only "On Plan" is edited here; tags from older checklists stay on the trade.
                const others = checklists.filter(c => c !== 'On Plan');
                setChecklists(onPlan ? ['On Plan', ...others] : others);
              }}
              className={`flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-md transition ${
                isActive
                  ? (onPlan ? 'bg-orange-50 text-orange-400 border border-orange-200 shadow-sm' : 'bg-white text-stone-500 border border-stone-200 shadow-sm')
                  : 'text-stone-400 border border-transparent hover:text-stone-600'
              }`}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              {label}
            </button>
          );
        })}
      </div>
      {/* Off plan: why, one reason or more. */}
      {!checklists.includes('On Plan') && (
        <div className="mt-2">
          <OffPlanReasonPicker reasons={reasons} value={offPlanReasons} saved={(tradeToEdit as Trade | undefined)?.offPlanReasons} onChange={setOffPlanReasons} />
        </div>
      )}
    </div>
  );

  const tfField = (
    <div>
      <label className="block text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-2">Timeframe (TF)</label>
      <div className="flex gap-2 flex-wrap">
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
  );

  const notesField = (rows: number) => (
    <div>
      <label className="block text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1">Notes</label>
      <textarea value={strategy} onChange={(e) => setStrategy(e.target.value)} placeholder="Add your notes here..." rows={rows}
        className="w-full bg-stone-50 border border-stone-200 text-stone-950 text-sm font-bold rounded-lg px-3 py-2 focus:outline-none focus:border-stone-500 transition resize-y"></textarea>
    </div>
  );

  const tradeFields = (
    <>
      {/* From the top: the trade (folded to one line while editing it; a new entry starts open, under a
          title), its timeframe, the note, then the plan. */}
      <FoldBar
        isOpen={detailsOpen}
        onToggle={() => setDetailsOpen(!detailsOpen)}
        hasError={detailsHaveError}
        header={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {tradeToEdit ? (
              <TradeSummaryLine symbol={symbol} side={side} size={size} entryTime={entryTime} exitTime={time}
                pnl={parsedAmount} rr={formRisk.risk > 0 && amount.trim() !== "" ? formRisk.rr : undefined} isPrivacyMode={isPrivacyMode} />
            ) : (
              <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Trade details</span>
            )}
            {detailsHaveError && !detailsOpen && <span className="text-[11px] font-bold text-red-900">Check the details</span>}
          </span>
        }
      >
        {detailFields}
      </FoldBar>
      {tfField}
      {notesField(5)}
      {planField}
    </>
  );

  const fundingFields = (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1">Amount ($)</label>
          <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)}
            className={`w-full bg-stone-50 border text-stone-950 text-sm font-bold rounded-lg px-3 py-2 focus:outline-none transition ${invalidAmount ? 'border-red-900' : 'border-stone-200 focus:border-stone-500'}`} />
          {invalidAmount && <p className="text-[10px] font-bold text-red-900 mt-1">Max 2 decimals</p>}
        </div>
        <div>
          <label className="block text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1">Date & Time</label>
          <input type="datetime-local" step="1" value={time} onChange={(e) => setTime(e.target.value)}
            className="w-full bg-stone-50 border border-stone-200 text-stone-950 text-sm font-bold rounded-lg px-3 py-2 focus:outline-none focus:border-stone-500 transition" />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="flex justify-between items-end text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1">
            <span>{entryType === "DEPOSIT" ? "Baht paid (THB)" : "Baht received (THB)"}</span>
            {impliedRate !== null && <span className="text-stone-950 normal-case tracking-normal">1 USD = {impliedRate.toFixed(4)} THB</span>}
          </label>
          <input type="number" step="0.01" min="0" value={thb} onChange={(e) => setThb(e.target.value)}
            className={`w-full bg-stone-50 border text-stone-950 text-sm font-bold rounded-lg px-3 py-2 focus:outline-none transition ${invalidThb ? 'border-red-900' : 'border-stone-200 focus:border-stone-500'}`} />
          {invalidThb && <p className="text-[10px] font-bold text-red-900 mt-1">Positive, max 2 decimals</p>}
        </div>
        <div>
          <label className="block text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1">
            {entryType === "DEPOSIT" ? "Date it left the bank" : "Date it reached the bank"}
          </label>
          <input type="date" value={bankDate || time.slice(0, 10)} onChange={(e) => setBankDate(e.target.value)}
            className="w-full bg-stone-50 border border-stone-200 text-stone-950 text-sm font-bold rounded-lg px-3 py-2 focus:outline-none focus:border-stone-500 transition" />
        </div>
        <p className="sm:col-span-2 text-[10px] font-medium text-stone-400 -mt-2">From the bank slip, needed for tax.</p>
      </div>
    </>
  );

  return (
    <div className="fixed inset-0 bg-stone-900/50 flex items-center justify-center z-[100] p-4 animate-fadeIn" style={{ outline: 'none', border: 'none' }} onClick={() => onClose()}>
      <div className="bg-white border-0 bg-clip-padding rounded-3xl w-full max-w-2xl p-6 md:p-8 shadow-2xl relative flex flex-col max-h-[90vh]" style={{ outline: 'none', border: 'none', backgroundClip: 'padding-box', transform: 'translateZ(0)', backfaceVisibility: 'hidden' }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-2xl font-black text-stone-950 tracking-tight">
            {tradeToEdit ? (tradeToEdit.isFunding ? "Edit Funding" : "Edit Trade") : "Add Entry"}
          </h3>
          <button onClick={() => onClose()} className="text-stone-400 hover:text-stone-600 p-1 rounded-full hover:bg-stone-100 transition">
            <X className="w-6 h-6" />
          </button>
        </div>

        {sections.length > 1 && (
          <PillTabs tabs={sections} value={entryType} onChange={setEntryType} onWhite className="mb-4 shrink-0" />
        )}

        <div className="space-y-4 overflow-y-auto pr-2 flex-1 border-0 border-transparent" style={{ outline: 'none' }}>
          {entryType === "TRADE" ? tradeFields : <>{fundingFields}{notesField(3)}</>}
        </div>

        <div className="shrink-0">
          <SaveRow isDirty={hasChangesToSave} canSave={canSubmit} isSaving={isSubmitting} onSave={handleSubmit} />
        </div>
      </div>
    </div>
  );
}
