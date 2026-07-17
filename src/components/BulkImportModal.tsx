"use client";

import { useState, useEffect } from "react";
import { useJournalStore, Trade } from "@/store/useJournalStore";
import { parseTradingViewData, groupOrdersIntoTrades, parseTradingViewCSVData } from "@/lib/tradingViewParser";
import { X, CheckCircle2, AlertCircle } from "lucide-react";

interface BulkImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialRawText: string;
}

export default function BulkImportModal({ isOpen, onClose, initialRawText }: BulkImportModalProps) {
  const { addTrade, updateTrade, trades } = useJournalStore();
  const [parsedTrades, setParsedTrades] = useState<Partial<Trade>[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [offsetSign, setOffsetSign] = useState<1 | -1>(1);
  const [offsetHours, setOffsetHours] = useState(1);
  const [offsetMinutes, setOffsetMinutes] = useState(20);
  const [offsetSeconds, setOffsetSeconds] = useState(0);

  useEffect(() => {
    const saved = localStorage.getItem('importTimeOffset');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.sign !== undefined) setOffsetSign(parsed.sign);
        if (parsed.hours !== undefined) setOffsetHours(parsed.hours);
        if (parsed.minutes !== undefined) setOffsetMinutes(parsed.minutes);
        if (parsed.seconds !== undefined) setOffsetSeconds(parsed.seconds);
      } catch (e) {}
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('importTimeOffset', JSON.stringify({
      sign: offsetSign,
      hours: offsetHours,
      minutes: offsetMinutes,
      seconds: offsetSeconds
    }));
  }, [offsetSign, offsetHours, offsetMinutes, offsetSeconds]);

  const applyTimeOffset = (dateStr: string | undefined, totalSeconds: number) => {
    if (!dateStr) return dateStr;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    d.setTime(d.getTime() + totalSeconds * 1000);
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  };

  if (!isOpen) return null;

  const handleParse = () => {
    if (!initialRawText) return;
    try {
      setError(null);
      let orders;
      if (initialRawText.trim().startsWith("Symbol,Side,Type,Qty")) {
        orders = parseTradingViewCSVData(initialRawText);
      } else {
        orders = parseTradingViewData(initialRawText);
      }
      const trades = groupOrdersIntoTrades(orders);
      if (trades.length === 0) {
        setError("No valid closed trades found. Please make sure to copy the full history including entry and exit orders.");
      }
      setParsedTrades(trades);
    } catch (e) {
      console.error(e);
      setError("Failed to parse data. Please check the format.");
    }
  };

  useEffect(() => {
    if (isOpen && initialRawText) {
      handleParse();
    }
  }, [isOpen, initialRawText]);

  const handleImport = async () => {
    setIsSubmitting(true);
    let importCount = 0;
    let skipCount = 0;

    let defaultRisk = 0;
    let defaultTf = "none";
    let defaultChecklists = ["On Plan", "Follow"];
    if (trades.length > 0) {
      const sortedTrades = [...trades].sort((a, b) => new Date(b.time.replace(" ", "T")).getTime() - new Date(a.time.replace(" ", "T")).getTime());
      
      const lastChecklists = sortedTrades[0].checklists || [];
      const newChecklists = ['On Plan'];
      if (lastChecklists.includes('Follow')) newChecklists.push('Follow');
      if (lastChecklists.includes('Reversal')) newChecklists.push('Reversal');
      if (newChecklists.length === 1) newChecklists.push('Follow');
      defaultChecklists = newChecklists;

      for (const t of sortedTrades) {
        if (defaultTf === "none" && t.tf && t.tf !== "none") {
          defaultTf = t.tf;
        }
        if (defaultRisk === 0 && t.risk && t.risk > 0) {
          defaultRisk = t.risk;
        }
        if (defaultTf !== "none" && defaultRisk > 0) break;
      }
    }

    const totalOffsetSeconds = offsetSign * ((offsetHours * 3600) + (offsetMinutes * 60) + offsetSeconds);

    try {
      for (const t of parsedTrades) {
        const adjustedTTime = applyTimeOffset(t.time, totalOffsetSeconds);
        
        // Check for duplicates
        const existingTrade = trades.find(existingTrade => {
          if (t.positionId && existingTrade.positionId) {
             return existingTrade.positionId === t.positionId;
          }
          // Fallback check
          return existingTrade.time === (adjustedTTime || "") && 
                 existingTrade.symbol === t.symbol &&
                 existingTrade.profit === (t.profit || 0);
        });

        if (existingTrade) {
          // Smart Merge
          let updated = false;
          const updates: Partial<Trade> = {};

          if (!existingTrade.tpPrice && t.tpPrice) { updates.tpPrice = t.tpPrice; updated = true; }
          if (!existingTrade.slPrice && t.slPrice) { updates.slPrice = t.slPrice; updated = true; }
          if (!existingTrade.entryType && t.entryType) { updates.entryType = t.entryType; updated = true; }
          if (!existingTrade.exitType && t.exitType) { updates.exitType = t.exitType; updated = true; }

          if (updated && existingTrade.id) {
            await updateTrade(existingTrade.id, updates);
            importCount++; // Count as imported since we successfully merged data
          } else {
            skipCount++;
          }
          continue;
        }

        let resultType = "";
        
        if (t.profit! > 0) resultType = "TP";
        else if (t.profit! < 0) resultType = "SL";
        else resultType = "BE";

        let rr = 0;
        if (defaultRisk > 0) {
          rr = (t.profit || 0) / defaultRisk;
        }

        const newTrade: Omit<Trade, 'id'> = {
          time: applyTimeOffset(t.time, totalOffsetSeconds) || new Date().toISOString(),
          profit: t.profit || 0,
          risk: defaultRisk,
          rr: rr,
          resultType,
          strategy: "",
          isOnPlan: true,
          symbol: t.symbol || "UNKNOWN",
          side: t.side || "BUY",
          images: [],
          tf: defaultTf,
          checklists: defaultChecklists,
          entryPrice: t.entryPrice,
          exitPrice: t.exitPrice,
          slPrice: t.slPrice,
          tpPrice: t.tpPrice,
          entryTime: applyTimeOffset(t.entryTime, totalOffsetSeconds),
          exitTime: applyTimeOffset(t.exitTime, totalOffsetSeconds),
          positionId: t.positionId,
          entryType: t.entryType,
          exitType: t.exitType
        };

        // Firebase doesn't support undefined or NaN values, so we must remove them
        const cleanTrade = Object.fromEntries(
          Object.entries(newTrade).filter(([_, v]) => {
            if (v === undefined) return false;
            if (typeof v === 'number' && Number.isNaN(v)) return false;
            return true;
          })
        ) as Omit<Trade, 'id'>;

        await addTrade(cleanTrade);
        importCount++;
      }
      
      alert(`Successfully imported ${importCount} new trades. Skipped ${skipCount} duplicate entries.`);
      setParsedTrades([]);
      onClose();
    } catch (error) {
      console.error("Failed to import trades:", error);
      setError("Failed to import some trades to the database.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-stone-900/50 flex items-center justify-center z-[100] p-4 animate-fadeIn" onClick={() => onClose()}>
      <div className="bg-white border-0 rounded-3xl w-full max-w-5xl p-6 md:p-8 shadow-2xl relative flex flex-col max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between pb-4 mb-6 border-b border-stone-100 flex-wrap gap-4">
          <h3 className="text-2xl font-black text-stone-950 tracking-tight">
            Bulk Import from TradingView
          </h3>

          <button onClick={() => onClose()} className="text-stone-400 hover:text-stone-600 p-1 rounded-full hover:bg-stone-100 transition ml-auto">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="space-y-6 overflow-y-auto pr-2 flex-1">
          <h3 className="text-xl font-extrabold text-stone-950 mb-4 tracking-tight">TradingView Import Preview</h3>

          {error && (
            <div className="bg-red-50 text-red-900 text-sm p-3 rounded-lg flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          )}

          {parsedTrades.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-bold text-stone-950 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-orange-400" />
                  Found {parsedTrades.length} Trades to Import
                </h4>
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-bold text-stone-600 text-[10px] uppercase tracking-wider mr-1">Time Offset:</span>
                  <select className="bg-white border border-stone-200 rounded px-1 py-0.5 text-stone-950 font-bold outline-none cursor-pointer text-xs" 
                          value={offsetSign} onChange={e => setOffsetSign(Number(e.target.value) as 1 | -1)}>
                    <option value={1}>+</option>
                    <option value={-1}>-</option>
                  </select>
                  <input type="number" min="0" className="w-12 bg-white border border-stone-200 rounded px-1 py-0.5 text-stone-950 font-bold outline-none text-center text-xs" 
                         value={String(offsetHours).padStart(2, '0')} onChange={e => setOffsetHours(Number(e.target.value))} placeholder="HH" title="Hours" />
                  <span className="text-stone-400 font-bold">:</span>
                  <input type="number" min="0" max="59" className="w-12 bg-white border border-stone-200 rounded px-1 py-0.5 text-stone-950 font-bold outline-none text-center text-xs" 
                         value={String(offsetMinutes).padStart(2, '0')} onChange={e => setOffsetMinutes(Number(e.target.value))} placeholder="MM" title="Minutes" />
                  <span className="text-stone-400 font-bold">:</span>
                  <input type="number" min="0" max="59" className="w-12 bg-white border border-stone-200 rounded px-1 py-0.5 text-stone-950 font-bold outline-none text-center text-xs" 
                         value={String(offsetSeconds).padStart(2, '0')} onChange={e => setOffsetSeconds(Number(e.target.value))} placeholder="SS" title="Seconds" />
                </div>
              </div>
              <div className="overflow-x-auto border border-stone-100 rounded-xl">
                <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead className="bg-stone-50 text-stone-400 border-b border-stone-100">
                    <tr>
                      <th className="px-4 py-4 font-bold uppercase text-[10px] tracking-widest">Time</th>
                      <th className="px-4 py-4 font-bold uppercase text-[10px] tracking-widest text-orange-500">Preview</th>
                      <th className="px-4 py-4 font-bold uppercase text-[10px] tracking-widest">Symbol</th>
                      <th className="px-4 py-4 font-bold uppercase text-[10px] tracking-widest text-center">Side</th>
                      <th className="px-4 py-4 font-bold uppercase text-[10px] tracking-widest text-right">Entry</th>
                      <th className="px-4 py-4 font-bold uppercase text-[10px] tracking-widest text-right">TP</th>
                      <th className="px-4 py-4 font-bold uppercase text-[10px] tracking-widest text-right">SL</th>
                      <th className="px-4 py-4 font-bold uppercase text-[10px] tracking-widest text-right">Exit</th>
                      <th className="px-4 py-4 font-bold uppercase text-[10px] tracking-widest text-right">P&L</th>
                    </tr>
                  </thead>
                  <tbody className="text-[11px] divide-y divide-stone-50">
                    {parsedTrades.map((t, idx) => {
                        const totalOffsetSeconds = offsetSign * ((offsetHours * 3600) + (offsetMinutes * 60) + offsetSeconds);
                        const adjustedTime = applyTimeOffset(t.time, totalOffsetSeconds);
                        return (
                          <tr key={idx} className="hover:bg-stone-50 transition duration-150 border-b border-stone-50">
                            <td className="px-4 py-4 text-stone-500 font-semibold leading-tight">{t.time?.split('T')[1]}<br/><span className="text-[9px] opacity-70">{t.time?.split('T')[0]}</span></td>
                            <td className="px-4 py-4 text-orange-500 font-bold leading-tight">{adjustedTime?.split('T')[1]}<br/><span className="text-[9px] opacity-70">{adjustedTime?.split('T')[0]}</span></td>
                            <td className="px-4 py-4 font-extrabold text-stone-950">{t.symbol}</td>
                        <td className="px-4 py-4 text-center">
                          <span className={`px-2.5 py-1 border rounded-md text-[10px] font-black uppercase ${t.side === 'BUY' ? 'bg-stone-100 text-stone-600 border-stone-200' : 'bg-stone-100 text-stone-600 border-stone-200'}`}>
                            {t.side}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-right font-bold text-stone-500">{t.entryPrice?.toFixed(2) || '-'}</td>
                        <td className="px-4 py-4 text-right font-bold text-stone-500">{t.tpPrice?.toFixed(2) || '-'}</td>
                        <td className="px-4 py-4 text-right font-bold text-stone-500">{t.slPrice?.toFixed(2) || '-'}</td>
                        <td className="px-4 py-4 text-right font-bold text-stone-500">{t.exitPrice?.toFixed(2) || '-'}</td>
                        <td className={`px-4 py-4 text-right font-extrabold ${t.profit! > 0 ? 'text-orange-400' : (t.profit! < 0 ? 'text-red-900' : 'text-stone-400')}`}>
                          {t.profit! < 0 ? '-' : (t.profit! > 0 ? '+' : '')}${Math.abs(t.profit || 0).toFixed(2)}
                        </td>
                          </tr>
                        );
                      })}
                    </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-3 justify-end pt-4 mt-6 border-t border-stone-100 shrink-0">
          <button onClick={() => onClose()} disabled={isSubmitting}
            className="px-6 py-2.5 rounded-xl text-xs font-bold bg-stone-100 text-stone-600 hover:bg-stone-200 transition">Cancel</button>
          <button onClick={handleImport} disabled={isSubmitting || parsedTrades.length === 0}
            className="px-6 py-2.5 rounded-xl text-xs font-bold bg-orange-400 text-white hover:bg-orange-500 shadow-md shadow-orange-200 transition disabled:opacity-50">
            {isSubmitting ? "Importing..." : `Import ${parsedTrades.length} Trades`}
          </button>
        </div>
      </div>
    </div>
  );
}
