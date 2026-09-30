"use client";

import { useState, useMemo } from "react";
import { useJournalStore, Trade } from "@/store/useJournalStore";
import { parseTradingViewData, groupOrdersIntoTrades, parseTradingViewCSVData } from "@/lib/tradingViewParser";
import { planImport, type ImportAction } from "@/lib/importPlan";
import { formatDurationDetailed, calculateDurationInSeconds } from "@/lib/utils";
import { X, CheckCircle2, AlertCircle, AlertTriangle, Pencil } from "lucide-react";
import ExitConfidenceBadge from "./ExitConfidenceBadge";
import { useEscapeToClose } from "@/lib/useEscapeToClose";

interface BulkImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialRawText: string;
}

const splitTime = (time?: string) => {
  const [date, clock] = (time || '').split('T');
  return { date: date || '-', clock: clock || '' };
};

export default function BulkImportModal({ isOpen, onClose, initialRawText }: BulkImportModalProps) {
  const { addTrade, updateTrade, trades } = useJournalStore();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  const { parsedTrades, parseError } = useMemo(() => {
    if (!initialRawText) return { parsedTrades: [] as Partial<Trade>[], parseError: null };
    try {
      const orders = initialRawText.trim().startsWith("Symbol,Side,Type,Qty")
        ? parseTradingViewCSVData(initialRawText)
        : parseTradingViewData(initialRawText);
      const grouped = groupOrdersIntoTrades(orders);
      return {
        parsedTrades: grouped,
        parseError: grouped.length === 0
          ? "No valid closed trades found. Please make sure to copy the full history including entry and exit orders."
          : null,
      };
    } catch (e) {
      console.error(e);
      return { parsedTrades: [] as Partial<Trade>[], parseError: "Failed to parse data. Please check the format." };
    }
  }, [initialRawText]);
  const error = importError || parseError;

  const [exitEdits, setExitEdits] = useState<Record<string, string>>({});
  const [editingKey, setEditingKey] = useState<string | null>(null);

  const plan = useMemo(() => planImport(parsedTrades, trades, exitEdits), [parsedTrades, trades, exitEdits]);
  const newCount = plan.filter(r => r.action === 'new').length;
  const updateCount = plan.filter(r => r.action === 'update').length;
  const uncertainCount = plan.filter(r => r.result.exitTimeConfidence === 'uncertain').length;
  const hasInvalidEdit = plan.some(r => r.invalidExit);

  useEscapeToClose(isOpen, onClose);

  if (!isOpen) return null;

  const handleImport = async () => {
    setIsSubmitting(true);

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

    let importCount = 0;
    let updatedCount = 0;
    let unchangedCount = 0;

    try {
      for (const row of plan) {
        if (row.action === 'same') {
          unchangedCount++;
          continue;
        }
        if (row.action === 'update' && row.existing && row.updates) {
          await updateTrade(row.existing.id, row.updates);
          updatedCount++;
          continue;
        }

        const t = row.parsed;
        let resultType = "";
        if (t.profit! > 0) resultType = "TP";
        else if (t.profit! < 0) resultType = "SL";
        else resultType = "BE";

        const newTrade: Omit<Trade, 'id'> = {
          time: t.time || new Date().toISOString(),
          profit: t.profit || 0,
          risk: defaultRisk,
          rr: defaultRisk > 0 ? (t.profit || 0) / defaultRisk : 0,
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
          entryTime: t.entryTime,
          exitTime: t.exitTime,
          exitTimeConfidence: t.exitTimeConfidence,
          duration: t.duration,
          positionId: t.positionId,
          entryType: t.entryType,
          exitType: t.exitType
        };

        // Firebase doesn't support undefined or NaN values, so we must remove them
        const cleanTrade = Object.fromEntries(
          Object.entries(newTrade).filter(([, v]) => {
            if (v === undefined) return false;
            if (typeof v === 'number' && Number.isNaN(v)) return false;
            return true;
          })
        ) as Omit<Trade, 'id'>;

        await addTrade(cleanTrade);
        importCount++;
      }

      alert(`Imported ${importCount} new trades, updated ${updatedCount}, ${unchangedCount} already up to date.`);
      onClose();
    } catch (error) {
      console.error("Failed to import trades:", error);
      setImportError("Failed to import some trades to the database.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const actionLabel: Record<ImportAction, { text: string; className: string }> = {
    new: { text: 'New', className: 'bg-orange-50 text-orange-400 border-orange-200' },
    update: { text: 'Update', className: 'bg-stone-100 text-stone-600 border-stone-200' },
    same: { text: 'Same', className: 'bg-stone-50 text-stone-300 border-stone-100' },
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
          {error && (
            <div className="bg-red-50 text-red-900 text-sm p-3 rounded-lg flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          )}

          {parsedTrades.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <h4 className="text-sm font-bold text-stone-950 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-orange-400" />
                  Found {parsedTrades.length} trades: {newCount} new, {updateCount} to update
                </h4>
                {uncertainCount > 0 && (
                  <p className="text-[11px] font-semibold text-red-900 flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    {`${uncertainCount} ${uncertainCount > 1 ? 'trades' : 'trade'} hit SL without a TP, so the exit time can't be read from the broker data. Click the exit time to set it.`}
                  </p>
                )}
              </div>
              <div className="overflow-x-auto border border-stone-100 rounded-xl">
                <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead className="bg-stone-50 text-stone-400 border-b border-stone-100">
                    <tr>
                      <th className="px-4 py-4 font-bold uppercase text-[10px] tracking-widest"></th>
                      <th className="px-4 py-4 font-bold uppercase text-[10px] tracking-widest">Entry</th>
                      <th className="px-4 py-4 font-bold uppercase text-[10px] tracking-widest">Exit</th>
                      <th className="px-4 py-4 font-bold uppercase text-[10px] tracking-widest">Hold</th>
                      <th className="px-4 py-4 font-bold uppercase text-[10px] tracking-widest">Symbol</th>
                      <th className="px-4 py-4 font-bold uppercase text-[10px] tracking-widest text-center">Side</th>
                      <th className="px-4 py-4 font-bold uppercase text-[10px] tracking-widest text-right">Entry Price</th>
                      <th className="px-4 py-4 font-bold uppercase text-[10px] tracking-widest text-right">TP</th>
                      <th className="px-4 py-4 font-bold uppercase text-[10px] tracking-widest text-right">SL</th>
                      <th className="px-4 py-4 font-bold uppercase text-[10px] tracking-widest text-right">Exit Price</th>
                      <th className="px-4 py-4 font-bold uppercase text-[10px] tracking-widest text-right">P&L</th>
                    </tr>
                  </thead>
                  <tbody className="text-[11px] divide-y divide-stone-50">
                    {plan.map(({ key, parsed: t, action, result, keptManualTimes, previousExitTime, invalidExit }) => {
                      const entry = splitTime(result.entryTime);
                      const exitTime = result.exitTime || result.time;
                      const exit = splitTime(exitTime);
                      const previous = splitTime(previousExitTime);
                      const isEditing = editingKey === key;
                      return (
                        <tr key={key} className="hover:bg-stone-50 transition duration-150 border-b border-stone-50">
                          <td className="px-4 py-4">
                            <span className={`px-2 py-0.5 border rounded-md text-[9px] font-black uppercase ${actionLabel[action].className}`}>{actionLabel[action].text}</span>
                          </td>
                          <td className="px-4 py-4 text-stone-500 font-semibold leading-tight">{entry.clock}<br/><span className="text-[9px] opacity-70">{entry.date}</span></td>
                          <td className="px-4 py-4 text-stone-500 font-semibold leading-tight">
                            {isEditing ? (
                              <input
                                type="datetime-local"
                                step="1"
                                autoFocus
                                value={(exitEdits[key] || exitTime || '').slice(0, 19)}
                                onChange={(e) => {
                                  const value = e.target.value;
                                  setExitEdits(prev => ({ ...prev, [key]: value }));
                                }}
                                onBlur={() => setEditingKey(null)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === 'Escape') {
                                    e.preventDefault(); // Esc closes the time editor, not the whole import
                                    setEditingKey(null);
                                  }
                                }}
                                className={`bg-white border rounded px-1.5 py-1 text-[11px] font-bold text-stone-950 outline-none ${invalidExit ? 'border-red-900' : 'border-orange-400'}`}
                              />
                            ) : (
                              <button
                                type="button"
                                onClick={() => setEditingKey(key)}
                                title="Click to set the exit time"
                                className="group text-left hover:text-orange-400 transition"
                              >
                                <span className="inline-flex items-center gap-1.5">
                                  {exit.clock}
                                  {keptManualTimes || result.exitTimeConfidence === 'manual'
                                    ? <span className="text-[9px] font-bold text-orange-400">{keptManualTimes ? 'yours, kept' : 'edited'}</span>
                                    : <ExitConfidenceBadge confidence={result.exitTimeConfidence} />}
                                  <Pencil className="w-3 h-3 text-stone-300 group-hover:text-orange-400" />
                                </span>
                                <br/><span className="text-[9px] opacity-70">{exit.date}</span>
                              </button>
                            )}
                            {invalidExit && <p className="text-[9px] font-bold text-red-900 mt-1">Before entry</p>}
                            {previousExitTime && !isEditing && (
                              <p className="text-[9px] text-stone-300 line-through mt-0.5" title="Exit time currently saved">
                                {previous.clock} {previous.date}
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-4 text-stone-500 font-semibold">{formatDurationDetailed(calculateDurationInSeconds(result))}</td>
                          <td className="px-4 py-4 font-extrabold text-stone-950">{t.symbol}</td>
                          <td className="px-4 py-4 text-center">
                            <span className="px-2.5 py-1 border rounded-md text-[10px] font-black uppercase bg-stone-100 text-stone-600 border-stone-200">
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
          <button onClick={handleImport} disabled={isSubmitting || hasInvalidEdit || newCount + updateCount === 0}
            className="px-6 py-2.5 rounded-xl text-xs font-bold bg-orange-400 text-white hover:bg-orange-500 shadow-md shadow-orange-200 transition disabled:opacity-50">
            {isSubmitting ? "Importing..." : `Import ${newCount} new, update ${updateCount}`}
          </button>
        </div>
      </div>
    </div>
  );
}
