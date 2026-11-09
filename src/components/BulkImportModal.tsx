"use client";

import { useState, useMemo, Fragment } from "react";
import { useJournalStore, Trade } from "@/store/useJournalStore";
import { parseTradingViewData, groupOrdersIntoTrades, findImportWarnings, type ImportWarning, type ImportWarningKind, type LinkedTrade } from "@/lib/tradingViewParser";
import { parseNotificationsLog, applyNotificationsLog, looksLikeNotificationsLog, linkSavedTrades } from "@/lib/notificationsLog";
import { buildRiskContext } from "@/lib/risk";
import { sumMoney } from "@/lib/money";
import { planImport, reviewImportWarnings, type ImportAction, type ImportPlanRow } from "@/lib/importPlan";
import { X, AlertCircle, AlertTriangle, Pencil, ClipboardCheck, Info, UserRound, ScrollText, Calculator, type LucideIcon } from "lucide-react";
import { useEscapeToClose } from "@/lib/useEscapeToClose";
import { useDefaultRisk } from "@/lib/defaultRisk";
import { isOnPlan } from "@/lib/stats";
import { applyChecklistChanges } from "@/lib/checklists";
import OffPlanReasonPicker from "./OffPlanReasonPicker";
import { useOffPlanReasons } from "./useOffPlanReasons";

interface BulkImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialRawText: string;
  initialLogText?: string;
}

const formatSigned = (amount: number) => `${amount < 0 ? '-' : '+'}$${Math.abs(amount).toFixed(2)}`;

// What each kind of leftover order means for the journal's money, worst first.
const WARNING_TEXT: Record<ImportWarningKind, { label: string; advice: string; isMoneyMissing: boolean }> = {
  missingEntry: { label: 'Opening order missing', advice: 'Not imported: copy the history from further back.', isMoneyMissing: true },
  noPositionId: { label: 'No position ID', advice: 'Not imported: add it by hand.', isMoneyMissing: true },
  splitClose: { label: 'Closed in parts', advice: 'Imported as one trade; check the total against the broker.', isMoneyMissing: false },
  open: { label: 'Still open', advice: 'Not imported: import again after it closes.', isMoneyMissing: false },
};

// Where a time or stop came from, or that it needs a look, shown as an icon and explained in the
// legend by the close button.
type SourceKind = 'yours' | 'log' | 'risk' | 'check' | 'est';
const Approx = ({ className }: { className?: string }) => (
  <span className={`${className} inline-flex items-center justify-center text-[12px] font-bold leading-none`}>≈</span>
);
const SOURCE_MARKS: Record<SourceKind, { Icon: LucideIcon | typeof Approx; label: string; hint: string; color: string }> = {
  yours: { Icon: UserRound, label: 'Yours', hint: 'Set by you', color: 'text-accent' },
  log: { Icon: ScrollText, label: 'Log', hint: 'From the Notifications log', color: 'text-accent' },
  risk: { Icon: Calculator, label: 'From risk', hint: 'Worked out from the risk you typed', color: 'text-accent' },
  check: { Icon: AlertTriangle, label: 'Check exit', hint: 'Hit SL with no TP: the broker data has no reliable exit time. Click the time to set it.', color: 'text-loss' },
  est: { Icon: Approx, label: 'Est. exit', hint: 'Exit time estimated from a TP/SL placed after entry', color: 'text-ink-faint' },
};

function SourceMark({ kind, kept }: { kind: SourceKind; kept?: boolean }) {
  const { Icon, hint, color } = SOURCE_MARKS[kind];
  return (
    <span title={kept ? `${hint}, kept from the saved trade` : hint} className="inline-flex">
      <Icon className={`w-3 h-3 ${color}`} />
    </span>
  );
}

// One line per notice: red only when money in the journal is or may be wrong.
interface Notice { serious: boolean; label: string; text: string; items?: string[] }

const countOf = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const TIMEFRAMES = ['1s', '5s', '15s', '1m', '5m', '15m', '1h'];

const WARNING_ORDER: ImportWarningKind[] = ['missingEntry', 'noPositionId', 'splitClose', 'open'];

const splitTime = (time?: string) => {
  const [date, clock] = (time || '').split('T');
  return { date: date || '-', clock: clock || '' };
};

export default function BulkImportModal({ isOpen, onClose, initialRawText, initialLogText = "" }: BulkImportModalProps) {
  const { addTrade, updateTrade, trades } = useJournalStore();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  const { parsedTrades, importWarnings, parseError, logEventCount, logOnly } = useMemo(() => {
    const nothing = { parsedTrades: [] as LinkedTrade[], importWarnings: [] as ImportWarning[], logEventCount: 0, logOnly: false };
    // Either box may hold either paste: the log is told apart by its wording.
    const pastes = [initialRawText, initialLogText].filter(text => text.trim());
    const historyText = pastes.find(text => !looksLikeNotificationsLog(text)) || "";
    const logText = pastes.find(looksLikeNotificationsLog) || "";
    if (!historyText && logText) {
      // The log has no P&L, so on its own it can only correct trades already in the journal.
      const logEvents = parseNotificationsLog(logText);
      const matched = applyNotificationsLog(linkSavedTrades(trades, logEvents), logEvents);
      return {
        ...nothing,
        parsedTrades: matched,
        logEventCount: logEvents.length,
        logOnly: true,
        parseError: matched.length === 0
          ? "None of the trades in this Notifications log are in the journal yet. The log has no P&L, so paste the History tab as well to add them."
          : null,
      };
    }
    if (!historyText) return { ...nothing, parseError: null };
    try {
      const orders = parseTradingViewData(historyText);
      const logEvents = parseNotificationsLog(logText);
      const grouped = applyNotificationsLog(groupOrdersIntoTrades(orders), logEvents);
      const warnings = findImportWarnings(orders);
      return {
        ...nothing,
        parsedTrades: grouped,
        importWarnings: warnings,
        logEventCount: logEvents.length,
        // Leftover orders explain an empty result better than the generic message.
        parseError: grouped.length === 0 && warnings.length === 0
          ? "No valid closed trades found. Please make sure to copy the full history including entry and exit orders."
          : null,
      };
    } catch (e) {
      console.error(e);
      return { ...nothing, parseError: "Failed to parse data. Please check the format." };
    }
  }, [initialRawText, initialLogText, trades]);
  const error = importError || parseError;

  const [exitEdits, setExitEdits] = useState<Record<string, string>>({});
  const [initialStopEdits, setInitialStopEdits] = useState<Record<string, string>>({});
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editingStopKey, setEditingStopKey] = useState<string | null>(null);
  // A remembered 1R, for when the first stop's price is not known: the stop is worked out from it.
  const [riskEdits, setRiskEdits] = useState<Record<string, string>>({});
  const [editingRiskKey, setEditingRiskKey] = useState<string | null>(null);
  // TF and On Plan typed here; the broker data never carries them.
  const [tfEdits, setTfEdits] = useState<Record<string, string>>({});
  const [onPlanEdits, setOnPlanEdits] = useState<Record<string, boolean>>({});
  // Why a row marked off plan here is off plan: it must name one reason or more before importing.
  const [reasonEdits, setReasonEdits] = useState<Record<string, string[]>>({});
  const offPlanReasons = useOffPlanReasons();

  // New trades start with the TF of the latest trade that has one.
  const defaultTf = useMemo(() => {
    const sortedTrades = [...trades].sort((a, b) => new Date(b.time.replace(" ", "T")).getTime() - new Date(a.time.replace(" ", "T")).getTime());
    return sortedTrades.find(t => t.tf && t.tf !== "none")?.tf || "none";
  }, [trades]);

  const defaultRisk = useDefaultRisk();
  const riskContext = useMemo(() => buildRiskContext([...trades, ...parsedTrades], defaultRisk), [trades, parsedTrades, defaultRisk]);
  const plan = useMemo(
    () => planImport(parsedTrades, trades, { exitTimes: exitEdits, initialStops: initialStopEdits, risks: riskEdits }, riskContext),
    [parsedTrades, trades, exitEdits, initialStopEdits, riskEdits, riskContext],
  );
  const tfOf = (r: ImportPlanRow) => tfEdits[r.key] ?? (r.existing ? r.existing.tf || 'none' : defaultTf);
  const onPlanOf = (r: ImportPlanRow) => onPlanEdits[r.key] ?? (r.existing ? isOnPlan(r.existing) : true);
  const reasonsOfRow = (r: ImportPlanRow) => reasonEdits[r.key] ?? r.existing?.offPlanReasons ?? [];
  const isMarkedOffHere = (r: ImportPlanRow) => onPlanEdits[r.key] === false;
  const isMissingReason = (r: ImportPlanRow) => isMarkedOffHere(r) && !offPlanReasons.some(x => reasonsOfRow(r).includes(x.id));
  // A saved trade whose TF, On Plan or reasons were changed here; hidden legacy checklist tags are kept.
  const tagUpdatesOf = (r: ImportPlanRow): Partial<Trade> | null => {
    if (!r.existing) return null;
    const updates: Partial<Trade> = {};
    if (tfOf(r) !== (r.existing.tf || 'none')) updates.tf = tfOf(r);
    if (onPlanOf(r) !== isOnPlan(r.existing)) {
      updates.isOnPlan = onPlanOf(r);
      updates.checklists = applyChecklistChanges(r.existing.checklists || [], { 'On Plan': onPlanOf(r) ? 'add' : 'remove' });
      updates.offPlanReasons = onPlanOf(r) ? [] : reasonsOfRow(r);
    } else if (!onPlanOf(r) && reasonsOfRow(r).join('|') !== (r.existing.offPlanReasons ?? []).join('|')) {
      updates.offPlanReasons = reasonsOfRow(r);
    }
    return Object.keys(updates).length > 0 ? updates : null;
  };
  const actionOf = (r: ImportPlanRow): ImportAction => (r.action === 'same' && tagUpdatesOf(r) ? 'update' : r.action);
  const newCount = plan.filter(r => r.action === 'new').length;
  const updateCount = plan.filter(r => actionOf(r) === 'update').length;
  // Trades imported before were dealt with then, so notices about them would only repeat.
  const changing = plan.filter(r => actionOf(r) !== 'same');
  const uncertainCount = changing.filter(r => r.result.exitTimeConfidence === 'uncertain').length;
  // A stop moved to break-even and then hit is about 0R whatever 1R was; only a trade that went on
  // to make money needs its first stop.
  const unknownStopCount = changing.filter(r => r.result.riskIsEstimate && r.result.resultType !== 'BE').length;
  const loggedCount = plan.filter(r => r.parsed.timesFromLog && !r.keptLogTimes).length;
  // Only new trades: older ones in the same paste were dealt with when they were imported.
  const noLogCount = plan.filter(r => r.action === 'new' && !r.result.timesFromLog).length;
  const reviewed = useMemo(() => reviewImportWarnings(importWarnings, trades), [importWarnings, trades]);
  const changedProfitCount = plan.filter(r => r.previousProfit !== undefined).length;
  const commissionRows = changing.filter(r => r.result.commission);
  const totalCommission = sumMoney(commissionRows.map(r => r.result.commission));
  const hasInvalidEdit = plan.some(r => r.invalidExit || r.invalidInitialSl || r.invalidRisk);
  const usedMarks = (Object.keys(SOURCE_MARKS) as SourceKind[]).filter(kind => plan.some(r => {
    if (kind === 'log') return r.result.timesFromLog || r.result.initialSlSource === 'log';
    if (kind === 'risk') return r.stopFromRisk;
    if (kind === 'check') return !r.keptManualTimes && r.result.exitTimeConfidence === 'uncertain';
    if (kind === 'est') return !r.keptManualTimes && r.result.exitTimeConfidence === 'estimated';
    return r.keptManualTimes || r.result.exitTimeConfidence === 'manual' || (r.result.initialSlSource === 'manual' && !r.stopFromRisk);
  }));

  const notices: Notice[] = [];
  if (reviewed.savedDiffers.length > 0) {
    notices.push({
      serious: true, label: 'P&L differs from saved', text: `${countOf(reviewed.savedDiffers.length, 'position')}. Not changed: paste the whole position to fix it.`,
      items: reviewed.savedDiffers.map(w => `${w.symbol} · ${w.time} · saved ${formatSigned(w.savedProfit)}, broker ${formatSigned(w.pnl || 0)}`),
    });
  }
  for (const kind of WARNING_ORDER) {
    const items = reviewed.warnings.filter(w => w.kind === kind);
    if (items.length === 0) continue;
    const { label, advice, isMoneyMissing } = WARNING_TEXT[kind];
    const amounts = items.filter(w => w.pnl !== undefined);
    notices.push({
      serious: isMoneyMissing, label,
      text: `${countOf(items.length, 'position')}${amounts.length > 0 ? ` (${formatSigned(sumMoney(amounts.map(w => w.pnl)))})` : ''}. ${advice}`,
      items: items.map(w => `${w.symbol} · ${w.time}${w.pnl !== undefined ? ` · ${formatSigned(w.pnl)}` : ''}`),
    });
  }
  if (changedProfitCount > 0) {
    notices.push({ serious: true, label: 'Broker P&L differs', text: `${countOf(changedProfitCount, 'saved trade')}. Import replaces it (old amount struck through).` });
  }
  if (reviewed.alreadySaved.length > 0) {
    notices.push({ serious: false, label: 'Already saved', text: `${countOf(reviewed.alreadySaved.length, 'partly copied position')}. Nothing to do.` });
  }
  if (uncertainCount > 0) {
    notices.push({ serious: false, label: 'Exit time unknown', text: `${countOf(uncertainCount, 'trade')} hit SL with no TP. Click the time to set it.` });
  }
  if (unknownStopCount > 0) {
    notices.push({ serious: false, label: 'Usual risk', text: `${countOf(unknownStopCount, 'trade')} with a moved stop ${unknownStopCount === 1 ? 'uses' : 'use'} the usual 1R of its time. Enter the 1st SL or Risk ($).` });
  }
  if (noLogCount > 0) {
    notices.push({ serious: false, label: 'No Notifications log', text: `${countOf(noLogCount, 'new trade')}: entry time is when the order was placed.` });
  }
  if (logEventCount > 0 && !logOnly) {
    notices.push({ serious: false, label: 'Notifications log', text: `fill times and 1st SL for ${loggedCount} of ${countOf(parsedTrades.length, 'trade')}.` });
  }
  if (logOnly) {
    notices.push({ serious: false, label: 'Log only', text: 'matched to saved trades by position ID. P&L stays as saved.' });
  }
  if (commissionRows.length > 0) {
    notices.push({ serious: false, label: 'Commission', text: `${Math.abs(totalCommission).toFixed(2)} on ${countOf(commissionRows.length, 'trade')}. Saved, not subtracted from P&L.` });
  }
  notices.sort((a, b) => Number(b.serious) - Number(a.serious));

  useEscapeToClose(isOpen, onClose);

  if (!isOpen) return null;

  const handleImport = async () => {
    setIsSubmitting(true);

    let importCount = 0;
    let updatedCount = 0;
    let unchangedCount = 0;

    try {
      for (const row of plan) {
        if (row.existing) {
          const updates = { ...(row.action === 'update' ? row.updates : {}), ...tagUpdatesOf(row) };
          if (Object.keys(updates).length === 0) {
            unchangedCount++;
          } else {
            await updateTrade(row.existing.id, updates);
            updatedCount++;
          }
          continue;
        }

        // For new rows `result` already carries 1R (from the stop, the user, or the default).
        const t = row.result;
        const onPlan = onPlanOf(row);

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
          isOnPlan: onPlan,
          symbol: t.symbol || "UNKNOWN",
          side: t.side || "BUY",
          images: [],
          tf: tfOf(row),
          checklists: onPlan ? ["On Plan"] : [],
          offPlanReasons: onPlan ? [] : reasonsOfRow(row),
          entryPrice: t.entryPrice,
          entryOrderPrice: t.entryOrderPrice,
          timesFromLog: t.timesFromLog,
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
    new: { text: 'New', className: 'bg-accent-soft text-accent border-accent-line' },
    update: { text: 'Update', className: 'bg-surface-2 text-ink-muted border-line' },
    same: { text: 'Same', className: 'bg-surface text-ink-disabled border-line-soft' },
  };

  return (
    <div className="fixed inset-0 bg-stone-900/50 flex items-center justify-center z-[100] p-4 animate-fadeIn" onClick={() => onClose()}>
      <div className="bg-white border-0 rounded-3xl w-fit min-w-[min(100%,64rem)] max-w-full p-6 md:p-8 shadow-2xl relative flex flex-col max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between pb-4 mb-6 border-b border-line-soft flex-wrap gap-4">
          <h3 className="text-2xl font-black text-ink tracking-tight">
            Import from TradingView
          </h3>

          <div className="ml-auto flex items-center gap-4">
            {usedMarks.length > 0 && (
              <div className="flex items-center gap-3 text-[10px] font-semibold text-ink-faint">
                {usedMarks.map(kind => {
                  const { Icon, label, hint, color } = SOURCE_MARKS[kind];
                  return (
                    <span key={kind} title={hint} className="inline-flex items-center gap-1">
                      <Icon className={`w-3 h-3 ${color}`} />{label}
                    </span>
                  );
                })}
              </div>
            )}
            <button onClick={() => onClose()} className="text-ink-faint hover:text-ink p-1 rounded-full hover:bg-surface-2 transition">
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        <div className="space-y-6 overflow-y-auto pr-2 flex-1">
          {error && (
            <div className="bg-loss-soft text-loss text-sm p-3 rounded-lg flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          )}

          {notices.length > 0 && (
            <div className="space-y-1.5">
              {notices.map(n => n.serious ? (
                <div key={n.label} className="text-[11px] px-3 py-2 rounded-lg border bg-loss-soft text-loss border-loss-line">
                  <p className="flex items-start gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
                    <span><span className="font-bold">{n.label}:</span> <span className="font-medium">{n.text}</span></span>
                  </p>
                  {n.items && <p className="ml-5 mt-0.5 font-semibold opacity-80">{n.items.join('; ')}</p>}
                </div>
              ) : (
                <div key={n.label} className="text-[11px] text-ink-muted px-1">
                  <p className="flex items-start gap-1.5">
                    <Info className="w-3.5 h-3.5 shrink-0 mt-px text-ink-faint" />
                    <span><span className="font-bold">{n.label}:</span> <span className="font-medium">{n.text}</span></span>
                  </p>
                  {n.items && <p className="ml-5 mt-0.5 text-ink-faint">{n.items.join('; ')}</p>}
                </div>
              ))}
            </div>
          )}

          {parsedTrades.length > 0 && (
            <div>
              <h4 className="text-sm font-bold text-ink mb-3">
                {logOnly
                  ? `Found ${countOf(parsedTrades.length, 'saved trade')} in the Notifications log: ${updateCount} to update`
                  : `Found ${parsedTrades.length} trades: ${newCount} new, ${updateCount} to update`}
              </h4>
              {/* No scroll box of its own: the dialog body scrolls, so the header can stick to its top. */}
              <div className="w-max min-w-full border border-line-soft rounded-xl">
                <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead className="sticky top-0 z-10 bg-surface text-ink-faint shadow-[inset_0_-1px_0_var(--color-stone-100)] [&_th:first-child]:rounded-tl-xl [&_th:last-child]:rounded-tr-xl">
                    <tr>
                      <th className="px-2 py-4 font-bold uppercase text-[10px] tracking-widest text-center"></th>
                      <th className="px-2 py-4 font-bold uppercase text-[10px] tracking-widest text-center">Entry</th>
                      <th className="px-2 py-4 font-bold uppercase text-[10px] tracking-widest text-center">Exit</th>
                      <th className="px-2 py-4 font-bold uppercase text-[10px] tracking-widest text-center">Symbol</th>
                      <th className="px-2 py-4 font-bold uppercase text-[10px] tracking-widest text-center">TF</th>
                      <th className="px-2 py-4 font-bold uppercase text-[10px] tracking-widest text-center">On Plan</th>
                      <th className="px-2 py-4 font-bold uppercase text-[10px] tracking-widest text-center">Side</th>
                      <th className="px-2 py-4 font-bold uppercase text-[10px] tracking-widest text-center">Entry Price</th>
                      <th className="px-2 py-4 font-bold uppercase text-[10px] tracking-widest text-center">TP</th>
                      <th className="px-2 py-4 font-bold uppercase text-[10px] tracking-widest text-center" title="Where the stop was first placed; 1R is measured to it">1st SL</th>
                      <th className="px-2 py-4 font-bold uppercase text-[10px] tracking-widest text-center" title="What you lose in $ if the 1st SL is hit">Risk ($)</th>
                      <th className="px-2 py-4 font-bold uppercase text-[10px] tracking-widest text-center">P&L</th>
                      <th className="px-2 py-4 font-bold uppercase text-[10px] tracking-widest text-center">R</th>
                    </tr>
                  </thead>
                  <tbody className="text-[11px] divide-y divide-line-soft">
                    {plan.map((row) => {
                      const { key, parsed: t, result, keptManualTimes, keptLogTimes, previousExitTime, previousRisk, previousProfit, invalidExit, invalidInitialSl, stopFromRisk, invalidRisk } = row;
                      const action = actionOf(row);
                      const entry = splitTime(result.entryTime);
                      const exitTime = result.exitTime || result.time;
                      const exit = splitTime(exitTime);
                      const previous = splitTime(previousExitTime);
                      const isEditing = editingKey === key;
                      const tf = tfOf(row);
                      const onPlan = onPlanOf(row);
                      return (
                        <Fragment key={key}>
                        <tr className="hover:bg-surface transition duration-150 border-b border-line-soft">
                          <td className="px-2 py-4">
                            <span className={`px-2 py-0.5 border rounded-md text-[9px] font-black uppercase ${actionLabel[action].className}`}>{actionLabel[action].text}</span>
                          </td>
                          <td className="px-2 py-4 text-ink-muted font-semibold leading-tight">
                            <span className="inline-flex items-center gap-1.5">
                              {entry.clock}
                              {result.timesFromLog && <SourceMark kind="log" kept={keptLogTimes} />}
                            </span>
                            <br/><span className="text-[9px] opacity-70">{entry.date}</span>
                          </td>
                          <td className="px-2 py-4 text-ink-muted font-semibold leading-tight">
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
                                className={`bg-white border rounded px-1.5 py-1 text-[11px] font-bold text-ink outline-none ${invalidExit ? 'border-loss' : 'border-accent'}`}
                              />
                            ) : (
                              <button
                                type="button"
                                onClick={() => setEditingKey(key)}
                                title="Click to set the exit time"
                                className="group text-left hover:text-accent transition"
                              >
                                <span className="inline-flex items-center gap-1.5">
                                  {exit.clock}
                                  {keptManualTimes || result.exitTimeConfidence === 'manual'
                                    ? <SourceMark kind="yours" kept={keptManualTimes} />
                                    : result.exitTimeConfidence === 'uncertain'
                                      ? <SourceMark kind="check" />
                                      : result.exitTimeConfidence === 'estimated' && <SourceMark kind="est" />}
                                  <Pencil className="w-3 h-3 text-ink-disabled group-hover:text-accent" />
                                </span>
                                <br/><span className="text-[9px] opacity-70">{exit.date}</span>
                              </button>
                            )}
                            {invalidExit && <p className="text-[9px] font-bold text-loss mt-1">Before entry</p>}
                            {previousExitTime && !isEditing && (
                              <p className="text-[9px] text-ink-disabled line-through mt-0.5" title="Exit time currently saved">
                                {previous.clock} {previous.date}
                              </p>
                            )}
                          </td>
                          <td className="px-2 py-4 font-extrabold text-ink">{t.symbol}</td>
                          <td className="px-2 py-4">
                            <select
                              value={tf}
                              onChange={(e) => {
                                const value = e.target.value;
                                setTfEdits(prev => ({ ...prev, [key]: value }));
                              }}
                              className="bg-white border border-line hover:border-accent focus:border-accent rounded px-1.5 py-1 text-[11px] font-bold text-ink outline-none cursor-pointer"
                            >
                              {!TIMEFRAMES.includes(tf) && <option value={tf}>{tf === 'none' ? '-' : tf}</option>}
                              {TIMEFRAMES.map(item => <option key={item} value={item}>{item}</option>)}
                            </select>
                          </td>
                          <td className="px-2 py-4 text-center">
                            <button
                              type="button"
                              onClick={() => setOnPlanEdits(prev => ({ ...prev, [key]: !onPlan }))}
                              title={onPlan ? "On Plan. Click to mark off plan." : "Off plan. Click to mark On Plan."}
                              className="p-1 rounded hover:bg-surface-2 transition"
                            >
                              <ClipboardCheck className={`w-4 h-4 ${onPlan ? 'text-accent' : 'text-ink-disabled'}`} />
                            </button>
                          </td>
                          <td className="px-2 py-4 text-center">
                            <span className="px-2.5 py-1 border rounded-md text-[10px] font-black uppercase bg-surface-2 text-ink-muted border-line">
                              {t.side}
                            </span>
                          </td>
                          <td className={`px-2 py-4 font-bold text-ink-muted ${t.entryPrice ? "text-right" : "text-center"}`}>{t.entryPrice?.toFixed(2) || '-'}</td>
                          <td className={`px-2 py-4 font-bold text-ink-muted ${t.tpPrice ? "text-right" : "text-center"}`}>{t.tpPrice?.toFixed(2) || '-'}</td>
                          <td className="px-2 py-4 text-right font-bold text-ink-muted">
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
                                  setRiskEdits(prev => ({ ...prev, [key]: '' })); // one or the other sets the stop
                                }}
                                onBlur={() => setEditingStopKey(null)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === 'Escape') {
                                    e.preventDefault(); // Esc closes the price editor, not the whole import
                                    setEditingStopKey(null);
                                  }
                                }}
                                className={`w-24 bg-white border rounded px-1.5 py-1 text-[11px] font-bold text-ink outline-none text-right ${invalidInitialSl ? 'border-loss' : 'border-accent'}`}
                              />
                            ) : (
                              <button
                                type="button"
                                onClick={() => setEditingStopKey(key)}
                                title="Where the stop was first placed. Click to enter it."
                                className="group inline-flex items-center gap-1.5 hover:text-accent transition"
                              >
                                {result.initialSlPrice
                                  ? <>
                                      {result.initialSlPrice.toFixed(2)}
                                      {result.initialSlSource === 'manual' && <SourceMark kind={stopFromRisk ? 'risk' : 'yours'} />}
                                      {result.initialSlSource === 'log' && <SourceMark kind="log" />}
                                    </>
                                  : <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-accent"><AlertTriangle className="w-3 h-3" /> moved</span>}
                                <Pencil className="w-3 h-3 text-ink-disabled group-hover:text-accent" />
                              </button>
                            )}
                            {invalidInitialSl && <p className="text-[9px] font-bold text-loss mt-1">Wrong side of entry</p>}
                          </td>
                          <td className="px-2 py-4 text-right font-bold text-ink-muted leading-tight">
                            {editingRiskKey === key ? (
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                autoFocus
                                placeholder="$"
                                value={riskEdits[key] ?? ''}
                                onChange={(e) => {
                                  const value = e.target.value;
                                  setRiskEdits(prev => ({ ...prev, [key]: value }));
                                  setInitialStopEdits(prev => ({ ...prev, [key]: '' })); // one or the other sets the stop
                                }}
                                onBlur={() => setEditingRiskKey(null)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === 'Escape') {
                                    e.preventDefault(); // Esc closes the risk editor, not the whole import
                                    setEditingRiskKey(null);
                                  }
                                }}
                                className={`w-20 bg-white border rounded px-1.5 py-1 text-[11px] font-bold text-ink outline-none text-right ${invalidRisk ? 'border-loss' : 'border-accent'}`}
                              />
                            ) : (
                              <button
                                type="button"
                                onClick={() => setEditingRiskKey(key)}
                                title={result.riskIsEstimate ? "Default 1R: the first stop is unknown. Click to enter the risk you used; the 1st SL is worked out from it." : "Distance to the first stop. Click to enter the risk you used instead."}
                                className="group inline-flex items-center gap-1.5 hover:text-accent transition"
                              >
                                {result.riskIsEstimate ? '≈' : ''}${(result.risk || 0).toFixed(2)}
                                <Pencil className="w-3 h-3 text-ink-disabled group-hover:text-accent" />
                              </button>
                            )}
                            {invalidRisk && <p className="text-[9px] font-bold text-loss mt-1">Can&apos;t place the stop</p>}
                            {previousRisk !== undefined && (
                              <p className="text-[9px] text-ink-disabled line-through" title="1R currently saved">${Number(previousRisk).toFixed(2)}</p>
                            )}
                          </td>
                          <td className={`px-2 py-4 text-right font-extrabold ${t.profit! > 0 ? 'text-accent' : (t.profit! < 0 ? 'text-loss' : 'text-ink-faint')}`}>
                            {t.profit! < 0 ? '-' : (t.profit! > 0 ? '+' : '')}${Math.abs(t.profit || 0).toFixed(2)}
                            {previousProfit !== undefined && (
                              <p className="text-[9px] text-ink-disabled line-through" title="P&L currently saved">{formatSigned(previousProfit)}</p>
                            )}
                          </td>
                          <td className="px-2 py-4 text-right font-bold text-ink-muted">
                            {result.riskIsEstimate ? '≈' : ''}{(result.rr || 0).toFixed(2)}R
                          </td>
                        </tr>
                        {/* Marked off plan here: why, under the trade. */}
                        {isMarkedOffHere(row) && (
                          <tr className="border-b border-line-soft">
                            <td colSpan={13} className="px-2 pb-4">
                              <OffPlanReasonPicker reasons={offPlanReasons} value={reasonsOfRow(row)} saved={row.existing?.offPlanReasons} onChange={ids => setReasonEdits(prev => ({ ...prev, [key]: ids }))} />
                            </td>
                          </tr>
                        )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-3 justify-end pt-4 mt-6 border-t border-line-soft shrink-0">
          <button onClick={() => onClose()} disabled={isSubmitting}
            className="px-6 py-2.5 rounded-xl text-xs font-bold bg-surface-2 text-ink-muted hover:bg-line transition">Cancel</button>
          <button onClick={handleImport} disabled={isSubmitting || hasInvalidEdit || plan.some(isMissingReason) || newCount + updateCount === 0}
            className="px-6 py-2.5 rounded-xl text-xs font-bold bg-accent text-white hover:bg-accent-strong shadow-md shadow-accent-line transition disabled:opacity-50">
            {isSubmitting ? "Importing..." : logOnly ? `Update ${updateCount}` : `Import ${newCount} new, update ${updateCount}`}
          </button>
        </div>
      </div>
    </div>
  );
}
