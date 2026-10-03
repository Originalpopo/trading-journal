"use client";

import { useState, useMemo } from "react";
import { useJournalStore, Trade } from "@/store/useJournalStore";
import { parseTradingViewData, groupOrdersIntoTrades, parseTradingViewCSVData, findImportWarnings, type ImportWarning, type ImportWarningKind } from "@/lib/tradingViewParser";
import { sumMoney } from "@/lib/money";
import { planImport, reviewImportWarnings, type ImportAction } from "@/lib/importPlan";
import { formatDurationDetailed, calculateDurationInSeconds } from "@/lib/utils";
import { X, CheckCircle2, AlertCircle, AlertTriangle, Pencil } from "lucide-react";
import ExitConfidenceBadge from "./ExitConfidenceBadge";
import { useEscapeToClose } from "@/lib/useEscapeToClose";
import { useDefaultRisk } from "@/lib/defaultRisk";
import { medianPointValue } from "@/lib/tradeZones";

interface BulkImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialRawText: string;
}

const formatSigned = (amount: number) => `${amount < 0 ? '-' : '+'}$${Math.abs(amount).toFixed(2)}`;

// What each kind of leftover order means for the journal's money, worst first.
const WARNING_TEXT: Record<ImportWarningKind, { title: string; advice: string; isMoneyMissing: boolean }> = {
  missingEntry: {
    title: 'closed, but the opening order is not in what you pasted',
    advice: 'Not imported. Copy the history from further back so the opening order is included, or the balance will be off by this amount.',
    isMoneyMissing: true,
  },
  noPositionId: {
    title: 'has P&L but no position ID',
    advice: 'Not imported. Add it by hand or the balance will be off by this amount.',
    isMoneyMissing: true,
  },
  splitClose: {
    title: 'was closed in more than one part',
    advice: 'Imported as one trade with the P&L of all parts added up. Check the amount against the broker.',
    isMoneyMissing: false,
  },
  open: {
    title: 'has no closing order yet',
    advice: 'Not imported: still open, or the history ends before it closed. Import again after it closes.',
    isMoneyMissing: false,
  },
};
const WARNING_ORDER: ImportWarningKind[] = ['missingEntry', 'noPositionId', 'splitClose', 'open'];

const splitTime = (time?: string) => {
  const [date, clock] = (time || '').split('T');
  return { date: date || '-', clock: clock || '' };
};

export default function BulkImportModal({ isOpen, onClose, initialRawText }: BulkImportModalProps) {
  const { addTrade, updateTrade, trades } = useJournalStore();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  const { parsedTrades, importWarnings, parseError } = useMemo(() => {
    const noWarnings: ImportWarning[] = [];
    if (!initialRawText) return { parsedTrades: [] as Partial<Trade>[], importWarnings: noWarnings, parseError: null };
    try {
      const orders = initialRawText.trim().startsWith("Symbol,Side,Type,Qty")
        ? parseTradingViewCSVData(initialRawText)
        : parseTradingViewData(initialRawText);
      const grouped = groupOrdersIntoTrades(orders);
      const warnings = findImportWarnings(orders);
      return {
        parsedTrades: grouped,
        importWarnings: warnings,
        // Leftover orders explain an empty result better than the generic message.
        parseError: grouped.length === 0 && warnings.length === 0
          ? "No valid closed trades found. Please make sure to copy the full history including entry and exit orders."
          : null,
      };
    } catch (e) {
      console.error(e);
      return { parsedTrades: [] as Partial<Trade>[], importWarnings: noWarnings, parseError: "Failed to parse data. Please check the format." };
    }
  }, [initialRawText]);
  const error = importError || parseError;

  const [exitEdits, setExitEdits] = useState<Record<string, string>>({});
  const [initialStopEdits, setInitialStopEdits] = useState<Record<string, string>>({});
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editingStopKey, setEditingStopKey] = useState<string | null>(null);

  const defaultRisk = useDefaultRisk();
  const fallbackPointValue = useMemo(() => medianPointValue([...trades, ...parsedTrades]), [trades, parsedTrades]);
  const plan = useMemo(
    () => planImport(parsedTrades, trades, { exitTimes: exitEdits, initialStops: initialStopEdits }, { defaultRisk, fallbackPointValue }),
    [parsedTrades, trades, exitEdits, initialStopEdits, defaultRisk, fallbackPointValue],
  );
  const newCount = plan.filter(r => r.action === 'new').length;
  const updateCount = plan.filter(r => r.action === 'update').length;
  const uncertainCount = plan.filter(r => r.result.exitTimeConfidence === 'uncertain').length;
  const unknownStopCount = plan.filter(r => r.result.riskIsEstimate).length;
  const reviewed = useMemo(() => reviewImportWarnings(importWarnings, trades), [importWarnings, trades]);
  const changedProfitCount =plan.filter(r => r.previousProfit !== undefined).length;
  const commissionRows = plan.filter(r => r.result.commission);
  const totalCommission = sumMoney(commissionRows.map(r => r.result.commission));
  const hasInvalidEdit = plan.some(r => r.invalidExit || r.invalidInitialSl);

  useEscapeToClose(isOpen, onClose);

  if (!isOpen) return null;

  const handleImport = async () => {
    setIsSubmitting(true);

    let defaultTf = "none";
    const defaultChecklists = ["On Plan"];
    if (trades.length > 0) {
      const sortedTrades = [...trades].sort((a, b) => new Date(b.time.replace(" ", "T")).getTime() - new Date(a.time.replace(" ", "T")).getTime());
      const withTf = sortedTrades.find(t => t.tf && t.tf !== "none");
      if (withTf) defaultTf = withTf.tf!;
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

        // For new rows `result` already carries 1R (from the stop, the user, or the default).
        const t = row.result;

        const newTrade: Omit<Trade, 'id'> = {
          time: t.time || new Date().toISOString(),
          profit: t.profit || 0,
          risk: t.risk || 0,
          rr: t.rr || 0,
          resultType: t.resultType || "BE",
          riskIsEstimate: t.riskIsEstimate,
          initialSlPrice: t.initialSlPrice,
          initialSlSource: t.initialSlSource,
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
          exitType: t.exitType,
          commission: t.commission,
          size: t.size
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
      <div className="bg-white border-0 rounded-3xl w-fit min-w-[min(100%,64rem)] max-w-full p-6 md:p-8 shadow-2xl relative flex flex-col max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between pb-4 mb-6 border-b border-stone-100 flex-wrap gap-4">
          <h3 className="text-2xl font-black text-stone-950 tracking-tight">
            Import from TradingView
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

          {importWarnings.length > 0 && (
            <div className="space-y-2">
              {reviewed.savedDiffers.length > 0 && (
                <div className="text-xs p-3 rounded-lg border bg-red-50 text-red-900 border-red-200">
                  <p className="font-bold flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    {`${reviewed.savedDiffers.length} ${reviewed.savedDiffers.length > 1 ? 'positions are' : 'position is'} already in the journal with a different P&L than the broker's`}
                  </p>
                  <p className="font-medium mt-1 ml-6">Not changed, because the opening order is not in what you pasted. Copy the whole position to correct it.</p>
                  <ul className="mt-1 ml-6 font-semibold opacity-80">
                    {reviewed.savedDiffers.map(w => (
                      <li key={w.positionId}>{w.symbol} · {w.time} · saved {formatSigned(w.savedProfit)}, broker {formatSigned(w.pnl || 0)}</li>
                    ))}
                  </ul>
                </div>
              )}
              {reviewed.alreadySaved.length > 0 && (
                <p className="text-[11px] font-semibold text-stone-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-orange-400" />
                  {`${reviewed.alreadySaved.length} partly copied ${reviewed.alreadySaved.length > 1 ? 'positions are' : 'position is'} already in the journal with the same P&L. Nothing to do.`}
                </p>
              )}
              {WARNING_ORDER.map(kind => {
                const items = reviewed.warnings.filter(w => w.kind === kind);
                if (items.length === 0) return null;
                const { title, advice, isMoneyMissing } = WARNING_TEXT[kind];
                const amounts = items.filter(w => w.pnl !== undefined);
                return (
                  <div key={kind} className={`text-xs p-3 rounded-lg border ${isMoneyMissing ? 'bg-red-50 text-red-900 border-red-200' : 'bg-stone-50 text-stone-600 border-stone-200'}`}>
                    <p className="font-bold flex items-center gap-2">
                      <AlertTriangle className={`w-4 h-4 shrink-0 ${isMoneyMissing ? 'text-red-900' : 'text-orange-400'}`} />
                      {`${items.length} ${items.length > 1 ? 'positions' : 'position'} ${title}`}
                      {amounts.length > 0 && ` (${formatSigned(sumMoney(amounts.map(w => w.pnl)))} in total)`}
                    </p>
                    <p className="font-medium mt-1 ml-6">{advice}</p>
                    <ul className="mt-1 ml-6 font-semibold opacity-80">
                      {items.map((w, i) => (
                        <li key={`${w.positionId || 'order'}-${i}`}>
                          {w.symbol} · {w.time}{w.pnl !== undefined && ` · ${formatSigned(w.pnl)}`}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
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
                {changedProfitCount > 0 && (
                  <p className="text-[11px] font-semibold text-red-900 flex items-center gap-1 w-full">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    {`${changedProfitCount} saved ${changedProfitCount > 1 ? 'trades have' : 'trade has'} a P&L that differs from the broker's. Importing replaces it with the broker's amount (old amount shown struck through).`}
                  </p>
                )}
                {commissionRows.length > 0 && (
                  <p className="text-[11px] font-semibold text-red-900 flex items-center gap-1 w-full">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    {`The broker reports $${Math.abs(totalCommission).toFixed(2)} commission on ${commissionRows.length} ${commissionRows.length > 1 ? 'trades' : 'trade'}. It is saved with each trade but not subtracted from P&L, because the export does not say whether P&L already includes it. Check the balance against the broker after importing.`}
                  </p>
                )}
                {unknownStopCount > 0 && (
                  <p className="text-[11px] font-semibold text-stone-500 flex items-center gap-1 w-full">
                    <AlertTriangle className="w-3.5 h-3.5 text-orange-400" />
                    {`${unknownStopCount} ${unknownStopCount > 1 ? 'trades' : 'trade'} had the stop moved, so the first stop is gone from the broker data and 1R uses the default $${defaultRisk.toFixed(2)}. Click "1st SL" to enter where it was.`}
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
                      <th className="px-4 py-4 font-bold uppercase text-[10px] tracking-widest text-right" title="Where the stop ended up">Last SL</th>
                      <th className="px-4 py-4 font-bold uppercase text-[10px] tracking-widest text-right" title="Where the stop was first placed; 1R is measured to it">1st SL</th>
                      <th className="px-4 py-4 font-bold uppercase text-[10px] tracking-widest text-right">Exit Price</th>
                      <th className="px-4 py-4 font-bold uppercase text-[10px] tracking-widest text-right">P&L</th>
                      <th className="px-4 py-4 font-bold uppercase text-[10px] tracking-widest text-right">1R</th>
                      <th className="px-4 py-4 font-bold uppercase text-[10px] tracking-widest text-right">R</th>
                    </tr>
                  </thead>
                  <tbody className="text-[11px] divide-y divide-stone-50">
                    {plan.map(({ key, parsed: t, action, result, keptManualTimes, previousExitTime, previousRisk, previousProfit, invalidExit, invalidInitialSl }) => {
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
                          <td className="px-4 py-4 text-right font-bold text-stone-500">
                            {editingStopKey === key ? (
                              <input
                                type="number"
                                step="0.01"
                                autoFocus
                                placeholder="price"
                                value={initialStopEdits[key] ?? ''}
                                onChange={(e) => {
                                  const value = e.target.value;
                                  setInitialStopEdits(prev => ({ ...prev, [key]: value }));
                                }}
                                onBlur={() => setEditingStopKey(null)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === 'Escape') {
                                    e.preventDefault(); // Esc closes the price editor, not the whole import
                                    setEditingStopKey(null);
                                  }
                                }}
                                className={`w-24 bg-white border rounded px-1.5 py-1 text-[11px] font-bold text-stone-950 outline-none text-right ${invalidInitialSl ? 'border-red-900' : 'border-orange-400'}`}
                              />
                            ) : (
                              <button
                                type="button"
                                onClick={() => setEditingStopKey(key)}
                                title="Where the stop was first placed. Click to enter it."
                                className="group inline-flex items-center gap-1.5 hover:text-orange-400 transition"
                              >
                                {result.initialSlPrice
                                  ? <>
                                      {result.initialSlPrice.toFixed(2)}
                                      {result.initialSlSource === 'manual' && <span className="text-[9px] font-bold text-orange-400">yours</span>}
                                    </>
                                  : <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-orange-400"><AlertTriangle className="w-3 h-3" /> moved</span>}
                                <Pencil className="w-3 h-3 text-stone-300 group-hover:text-orange-400" />
                              </button>
                            )}
                            {invalidInitialSl && <p className="text-[9px] font-bold text-red-900 mt-1">Wrong side of entry</p>}
                          </td>
                          <td className="px-4 py-4 text-right font-bold text-stone-500">{t.exitPrice?.toFixed(2) || '-'}</td>
                          <td className={`px-4 py-4 text-right font-extrabold ${t.profit! > 0 ? 'text-orange-400' : (t.profit! < 0 ? 'text-red-900' : 'text-stone-400')}`}>
                            {t.profit! < 0 ? '-' : (t.profit! > 0 ? '+' : '')}${Math.abs(t.profit || 0).toFixed(2)}
                            {previousProfit !== undefined && (
                              <p className="text-[9px] text-stone-300 line-through" title="P&L currently saved">{formatSigned(previousProfit)}</p>
                            )}
                          </td>
                          <td className="px-4 py-4 text-right font-bold text-stone-500 leading-tight">
                            <span title={result.riskIsEstimate ? "Default 1R: the first stop is unknown" : "Distance to the first stop"}>
                              {result.riskIsEstimate ? '≈' : ''}${(result.risk || 0).toFixed(2)}
                            </span>
                            {previousRisk !== undefined && (
                              <p className="text-[9px] text-stone-300 line-through" title="1R currently saved">${Number(previousRisk).toFixed(2)}</p>
                            )}
                          </td>
                          <td className="px-4 py-4 text-right font-bold text-stone-500">
                            {result.riskIsEstimate ? '≈' : ''}{(result.rr || 0).toFixed(2)}R
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
