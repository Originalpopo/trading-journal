"use client";

import { DEFAULT_LOT_SIZE } from "@/lib/statement";
import { useEffect } from "react";
import { Trade, Funding, useJournalStore } from "@/store/useJournalStore";
import { formatDurationDetailed, calculateDurationInSeconds } from "@/lib/utils";
import { classifyTrade, outcomeLabel, parseRisk } from "@/lib/stats";
import { Edit2, Trash2, ChevronLeft, ChevronRight, CheckCircle2, XCircle, MinusCircle } from "lucide-react";
import InteractiveChart from "./InteractiveChart";
import ExitConfidenceBadge from "./ExitConfidenceBadge";
import { useEscapeToClose } from "@/lib/useEscapeToClose";

interface TradeDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  trade: (Trade | Funding) & { isFunding?: boolean; duration?: number } | null;
  onEdit: (trade: any) => void;
  onDelete: (id: string, isFunding: boolean) => void;
  onPrev?: () => void;
  onNext?: () => void;
  hasPrev?: boolean;
  hasNext?: boolean;
  currentIndex?: number;
  totalItems?: number;
}

const format2Decimals = (val: number) => val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function TradeDetailModal({ isOpen, onClose, trade, onEdit, onDelete, onPrev, onNext, hasPrev, hasNext, currentIndex, totalItems }: TradeDetailModalProps) {
  const isPrivacyMode = useJournalStore((state) => state.isPrivacyMode);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === 'ArrowLeft' && hasPrev && onPrev) {
        onPrev();
      } else if (e.key === 'ArrowRight' && hasNext && onNext) {
        onNext();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, hasPrev, hasNext, onPrev, onNext]);

  useEscapeToClose(isOpen, onClose);

  if (!isOpen || !trade) return null;

  const isFunding = trade.isFunding;
  const t = trade as Trade & { duration?: number };
  const f = trade as Funding;

  let shortTime = trade.time;
  let entryShortTime = '-';
  let exitShortTime = '-';
  try {
    const rawEntryTime = t.entryTime || trade.time;
    if (rawEntryTime) {
      const d = new Date(rawEntryTime.replace(' ', 'T'));
      if (!isNaN(d.getTime())) {
        entryShortTime = d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' +
                    d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        if (rawEntryTime === trade.time) shortTime = entryShortTime;
      } else {
        entryShortTime = rawEntryTime;
      }
    }

    const rawExitTime = t.exitTime || (t.entryTime ? trade.time : undefined);
    if (rawExitTime) {
      const d = new Date(rawExitTime.replace(' ', 'T'));
      if (!isNaN(d.getTime())) {
        exitShortTime = d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' +
                    d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      } else {
        exitShortTime = rawExitTime;
      }
    }
  } catch { }

  const profit = isFunding ? (f.deposit > 0 ? f.deposit : -(f.withdraw || 0)) : t.profit;
  const symbol = isFunding ? (f.deposit > 0 ? 'DEPOSIT' : 'WITHDRAW') : t.symbol;
  const notes = isFunding ? f.notes : t.strategy;
  // Older trades mark "On Plan" only through isOnPlan.
  const isOnPlan = !isFunding && (t.checklists?.includes('On Plan') || t.isOnPlan !== false);

  let isBE = false;
  let rawRisk = 0;
  let badgeText = '';
  let durationDisplay = "1s";



  if (isFunding) {
    badgeText = profit > 0 ? 'DEPOSIT' : 'WITHDRAW';
  } else {
    rawRisk = parseRisk(t.risk);
    const outcome = classifyTrade(t);
    isBE = outcome === 'be';
    badgeText = outcomeLabel(outcome);

    const sec = calculateDurationInSeconds(t);
    durationDisplay = formatDurationDetailed(sec);
  }

  return (
    <div className="fixed inset-0 bg-stone-900/50 flex items-center justify-center z-[100] p-4 animate-fadeIn" style={{ outline: 'none', border: 'none' }} onClick={onClose}>


      {/* Modal Container */}
      <div className="bg-white border-0 bg-clip-padding rounded-3xl w-full max-w-4xl shadow-[0_32px_64px_rgba(0,0,0,0.15)] relative flex flex-col max-h-[90vh] overflow-hidden" style={{ outline: 'none', border: 'none', backgroundClip: 'padding-box', transform: 'translateZ(0)', backfaceVisibility: 'hidden' }} onClick={(e) => e.stopPropagation()}>
        {/* Header - Hero Section */}
        <div className="flex flex-col md:flex-row md:items-end justify-between p-6 md:p-8 border-b border-stone-200/60 bg-gradient-to-r from-stone-50 to-stone-100/50 relative">
          <div className="flex flex-col gap-2">
            <h3 className="text-2xl font-black text-stone-950 tracking-tight leading-none">{symbol}</h3>
            {!isFunding && (
              <div className="flex items-center gap-2 font-bold text-xs leading-none mt-1">
                <div className="flex items-center gap-1.5">
                  {badgeText === 'TP' && (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5 text-orange-400" />
                      <span className="text-orange-400 text-xs font-bold uppercase tracking-wider">Result: TP</span>
                    </>
                  )}
                  {badgeText === 'SL' && (
                    <>
                      <XCircle className="w-3.5 h-3.5 text-red-900" />
                      <span className="text-red-900 text-xs font-bold uppercase tracking-wider">Result: SL</span>
                    </>
                  )}
                  {badgeText === 'BE' && (
                    <>
                      <MinusCircle className="w-3.5 h-3.5 text-stone-400" />
                      <span className="text-stone-400 text-xs font-bold uppercase tracking-wider">Result: BE</span>
                    </>
                  )}
                </div>
                {t.rr !== undefined && t.rr !== 0 && (
                  <>
                    <span className="w-[2px] h-3.5 bg-stone-300 rounded-full"></span>
                    <span className={`text-xs font-black tracking-widest ${isBE ? 'text-stone-400' : (profit > 0 ? 'text-orange-400' : 'text-red-900')}`}>
                      {format2Decimals(t.rr)} R
                    </span>
                  </>
                )}
                {t.side && (
                  <>
                    <span className="w-[2px] h-3.5 bg-stone-300 rounded-full"></span>
                    <span className="text-xs font-black text-stone-400 uppercase tracking-widest">
                      {t.side}
                    </span>
                  </>
                )}
                {isOnPlan ? (
                  <span className="ml-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-full border bg-orange-50 text-orange-400 border-orange-200 text-[10px] font-bold uppercase tracking-wider">
                    <CheckCircle2 className="w-3 h-3" /> On Plan
                  </span>
                ) : (
                  <span className="ml-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-full border bg-stone-50 text-stone-400 border-stone-200 opacity-70 text-[10px] font-bold uppercase tracking-wider">
                    <XCircle className="w-3 h-3" /> Off Plan
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="mt-4 md:mt-0 text-left md:text-right">
            <div className={`text-3xl md:text-4xl font-black tracking-tighter leading-none ${isBE ? 'text-stone-400' : (profit > 0 ? 'text-orange-400' : 'text-red-900')}`}>
              {isPrivacyMode ? (!isFunding && t.rr !== undefined && t.rr !== 0 ? `${format2Decimals(t.rr)} R` : '***') : `${profit < 0 ? '-' : ''}$${format2Decimals(Math.abs(profit))}`}
            </div>
          </div>
        </div>

        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto px-6 md:px-8 py-2 md:py-4 flex flex-col gap-6 border-0 border-transparent" style={{ outline: 'none' }}>
          {/* Chart Section */}
          {!isFunding && (
            <div className="border-b border-stone-200 pb-2">
              <InteractiveChart key={(t as Trade).id} trade={t as Trade} />
            </div>
          )}

          {/* Key Data - Borderless / Naked Layout */}
          {isFunding ? (
            <div className="grid grid-cols-2 gap-4 md:gap-6 py-2">
              <div className="flex flex-col items-center text-center gap-1">
                <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1">Time</p>
                <p className="text-xs font-bold text-stone-950">{shortTime}</p>
              </div>
              <div className="flex flex-col items-center text-center gap-1">
                <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1">Type</p>
                <p className={`text-xs font-bold ${profit > 0 ? 'text-orange-400' : 'text-red-900'}`}>
                  {badgeText}
                </p>
              </div>
              <div className="flex flex-col items-center text-center gap-1">
                <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1">{profit > 0 ? 'Baht paid' : 'Baht received'}</p>
                <p className={`text-xs font-bold ${f.thb ? 'text-stone-950' : 'text-red-900'}`}>
                  {f.thb ? (isPrivacyMode ? '***' : `฿${format2Decimals(f.thb)}`) : 'Not entered yet'}
                </p>
                {f.thb && f.bankDate && <p className="text-[10px] font-medium text-stone-400">Bank date {f.bankDate}</p>}
              </div>
              <div className="flex flex-col items-center text-center gap-1">
                <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1">Rate</p>
                <p className="text-xs font-bold text-stone-950">
                  {f.thb && profit !== 0 ? `1 USD = ${(f.thb / Math.abs(profit)).toFixed(4)} THB` : '-'}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col md:flex-row gap-6 pb-2">
              <div className="flex-1 bg-stone-50/50 border border-stone-100 rounded-2xl p-5 flex flex-col justify-start gap-4">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Time Entry</span>
                  <span className="text-xs font-extrabold text-stone-950">{entryShortTime}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Time Exit</span>
                  <span className="text-xs font-extrabold text-stone-950 inline-flex items-center gap-1.5">
                    <ExitConfidenceBadge confidence={t.exitTimeConfidence} />
                    {exitShortTime}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Duration</span>
                  <span className="text-xs font-extrabold text-stone-950">{durationDisplay}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Timeframe</span>
                  <span className="text-xs font-extrabold text-stone-950">{t.tf && t.tf !== 'none' ? (t.tf.includes(',') ? t.tf.split(',')[0].trim() : t.tf) : '-'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Risk</span>
                  <span className="text-xs font-extrabold text-stone-950">{isPrivacyMode ? '***' : (rawRisk > 0 ? `${t.riskIsEstimate ? "≈" : ""}$${format2Decimals(rawRisk)}${t.riskIsEstimate ? " (default 1R)" : ""}` : '-')}</span>
                </div>
              </div>

              {/* Middle Column: Order Details */}
              {t.positionId && (
                 <div className="flex-1 bg-stone-50/50 border border-stone-100 rounded-2xl p-5 flex flex-col justify-start gap-4 relative">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Size</span>
                      <span className="text-xs font-extrabold text-stone-950">{t.size ?? DEFAULT_LOT_SIZE} lot</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Entry</span>
                        {t.entryType && (
                          <span className="text-[8px] font-bold text-stone-400 bg-stone-200/60 px-1.5 py-0.5 rounded-sm uppercase tracking-widest">{t.entryType}</span>
                        )}
                      </div>
                      <span className="text-xs font-extrabold text-stone-950">{t.entryPrice?.toFixed(2) || '-'}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Exit</span>
                        {t.exitType && (
                          <span className="text-[8px] font-bold text-stone-400 bg-stone-200/60 px-1.5 py-0.5 rounded-sm uppercase tracking-widest">{t.exitType}</span>
                        )}
                      </div>
                      <span className="text-xs font-extrabold text-stone-950">{t.exitPrice?.toFixed(2) || '-'}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Take Profit</span>
                      <span className={`text-xs font-extrabold ${profit > 0 ? 'text-orange-400' : 'text-stone-950'}`}>{t.tpPrice?.toFixed(2) || '-'}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Stop Loss</span>
                      <span className={`text-xs font-extrabold ${profit < 0 ? 'text-red-900' : 'text-stone-950'}`}>{t.slPrice?.toFixed(2) || '-'}</span>
                    </div>
                 </div>
              )}
            </div>
          )}



          {/* Notes / Strategy Section */}
          <div>
            <div className={`bg-stone-50/70 border border-stone-100 rounded-2xl text-stone-950 text-xs leading-relaxed font-medium whitespace-pre-wrap ${notes ? 'p-5 min-h-[100px]' : 'px-5 py-4'}`}>
              {notes || <span className="text-stone-400 italic">No notes provided for this entry.</span>}
            </div>
          </div>


        </div>

        {/* Footer Actions */}
        <div className="px-6 md:px-8 pb-6 bg-white shrink-0 border-0 border-transparent" style={{ outline: 'none' }}>
          <div className="flex items-center justify-between pt-4 border-t border-stone-200">
            <div className="flex items-center gap-2 md:gap-3">
              <button
                onClick={() => onDelete(trade.id, !!isFunding)}
                title="Delete Trade"
                className="p-2.5 bg-stone-100 hover:bg-red-50 text-stone-600 hover:text-red-900 rounded-xl transition">
                <Trash2 className="w-4 h-4" />
              </button>
              <button 
                onClick={() => onEdit({ ...trade })}
                title="Edit"
                className="flex items-center gap-1.5 text-xs font-bold text-stone-700 bg-stone-100 hover:bg-stone-200 px-2.5 md:px-5 py-2.5 rounded-xl transition">
                <Edit2 className="w-4 h-4" />
                <span className="hidden md:inline">Edit</span>
              </button>
            </div>
            {(onPrev || onNext) && (
              <div className="flex items-center gap-2 md:gap-4">
                <button
                  onClick={onPrev}
                  disabled={!hasPrev}
                  className="p-2 bg-stone-100 text-stone-600 hover:bg-stone-200 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition shadow-sm">
                  <ChevronLeft className="w-5 h-5" />
                </button>
                {currentIndex !== undefined && totalItems !== undefined && (
                  <span className="text-xs font-black text-stone-400 font-mono tracking-widest">
                    {currentIndex} <span className="opacity-40 font-normal">|</span> {totalItems}
                  </span>
                )}
                <button 
                  onClick={onNext}
                  disabled={!hasNext}
                  className="p-2 bg-stone-100 text-stone-600 hover:bg-stone-200 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition shadow-sm">
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            )}
            <button 
              onClick={onClose}
              className="text-xs font-bold text-white bg-stone-900 hover:bg-stone-800 px-4 md:px-6 py-2.5 rounded-xl transition shadow-md shadow-stone-900/20">
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
