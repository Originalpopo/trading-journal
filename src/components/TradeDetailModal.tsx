"use client";

import { useState, useEffect } from "react";
import { Trade, Funding, useJournalStore } from "@/store/useJournalStore";
import { formatNumber } from "@/lib/utils";
import { X, Edit2, Trash2, ExternalLink, ChevronLeft, ChevronRight, CheckCircle2, XCircle, MinusCircle, Activity, Crosshair, Target, Focus, Crown, ClipboardCheck, Clock, Timer, LayoutGrid, ShieldAlert, Scale, TrendingUp, TrendingDown } from "lucide-react";
import InteractiveChart from "./InteractiveChart";

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

export function getDriveDirectUrl(url: string): string {
  if (!url) return '';
  const fileIdMatch = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || url.match(/id=([a-zA-Z0-9_-]+)/);
  if (fileIdMatch && fileIdMatch[1]) {
    return `https://drive.google.com/file/d/${fileIdMatch[1]}/preview`;
  }
  return url;
}

const format2Decimals = (val: number) => val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function TradeDetailModal({ isOpen, onClose, trade, onEdit, onDelete, onPrev, onNext, hasPrev, hasNext, currentIndex, totalItems }: TradeDetailModalProps) {
  const updateTrade = useJournalStore((state) => state.updateTrade);
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

  if (!isOpen || !trade) return null;

  const isFunding = trade.isFunding;
  const t = trade as Trade & { duration?: number };
  const f = trade as Funding;

  let shortTime = trade.time;
  try {
    const d = new Date(trade.time.replace(' ', 'T'));
    if (!isNaN(d.getTime())) {
      shortTime = d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' +
                  d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }
  } catch (e) { }

  const profit = isFunding ? (f.deposit > 0 ? f.deposit : -(f.withdraw || 0)) : t.profit;
  const symbol = isFunding ? (f.deposit > 0 ? 'DEPOSIT' : 'WITHDRAW') : t.symbol;
  const notes = isFunding ? f.notes : t.strategy;

  let isBE = false;
  let rawRisk = 0;
  let badgeText = '';
  let durationDisplay = "1s";



  if (isFunding) {
    badgeText = profit > 0 ? 'DEPOSIT' : 'WITHDRAW';
  } else {
    rawRisk = parseFloat((t.risk || 0).toString());
    if (rawRisk > 0) {
      const rr = t.profit / rawRisk;
      isBE = (rr >= -0.4 && rr <= 0.4);
    } else {
      isBE = (t.resultType === 'BE' || t.profit === 0);
    }
    badgeText = isBE ? 'BE' : (t.profit > 0 ? 'TP' : 'SL');

    let sec = t.duration || 0;
    if (!sec && t.exitTime && t.time) {
      try {
        const entryDate = new Date(t.time.replace(' ', 'T')).getTime();
        const exitDate = new Date(t.exitTime.replace(' ', 'T')).getTime();
        if (!isNaN(entryDate) && !isNaN(exitDate)) {
          sec = Math.max(0, Math.floor((exitDate - entryDate) / 1000));
        }
      } catch (e) {}
    }
    
    if (sec === 0 && !t.exitTime) {
      durationDisplay = "-";
    } else {
      if (sec === 0) sec = 1;
      let m = Math.floor(sec / 60);
      let s = sec % 60;
      let h = Math.floor(m / 60); m = m % 60;
      let d = Math.floor(h / 24); h = h % 24;
      if (d > 0) durationDisplay = `${d}d ${h}h`;
      else if (h > 0) durationDisplay = `${h}h ${m}m`;
      else if (m > 0) durationDisplay = `${m}m ${s}s`;
      else durationDisplay = `${s}s`;
    }
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
                {t.side && (
                  <>
                    <span className="w-[2px] h-3.5 bg-stone-300 rounded-full"></span>
                    <span className="text-xs font-black text-stone-400 uppercase tracking-widest">
                      {t.side}
                    </span>
                  </>
                )}
              </div>
            )}
          </div>
          <div className="mt-4 md:mt-0 text-left md:text-right">
            <div className={`text-3xl md:text-4xl font-black tracking-tighter leading-none ${isBE ? 'text-stone-400' : (profit > 0 ? 'text-orange-400' : 'text-red-900')}`}>
              {isPrivacyMode ? '***' : `${profit < 0 ? '-' : (profit > 0 ? '+' : '')}$${format2Decimals(Math.abs(profit))}`}
            </div>
          </div>
        </div>

        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto px-6 md:px-8 py-2 md:py-4 flex flex-col gap-6 border-0 border-transparent" style={{ outline: 'none' }}>
          {/* Chart Section */}
          {!isFunding && (
            <div className="border-b border-stone-200 pb-6">
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
            </div>
          ) : (
            <div className="flex flex-col md:flex-row gap-6 py-2">
              <div className="flex-1 bg-stone-50/50 border border-stone-100 rounded-2xl p-5 flex flex-col justify-start gap-4">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Time</span>
                  <span className="text-xs font-extrabold text-stone-950">{shortTime}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Duration</span>
                  <span className="text-xs font-extrabold text-stone-950">{durationDisplay}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Timeframe</span>
                  <span className="text-xs font-extrabold text-stone-950">{(t as any).tf && (t as any).tf !== 'none' ? ((t as any).tf.includes(',') ? (t as any).tf.split(',')[0].trim() : (t as any).tf) : '-'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Risk</span>
                  <span className="text-xs font-extrabold text-stone-950">{isPrivacyMode ? '***' : (rawRisk > 0 ? `$${format2Decimals(rawRisk)}` : '-')}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Risk/Reward</span>
                  <span className="text-xs font-extrabold text-stone-950">{t.rr ? `${format2Decimals(t.rr)}R` : '-'}</span>
                </div>
              </div>

              {/* Middle Column: Order Details */}
              {(t as any).positionId && (
                 <div className="flex-1 bg-stone-50/50 border border-stone-100 rounded-2xl p-5 flex flex-col justify-start gap-4 relative">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Entry</span>
                        {(t as any).entryType && (
                          <span className="text-[8px] font-bold text-stone-400 bg-stone-200/60 px-1.5 py-0.5 rounded-sm uppercase tracking-widest">{(t as any).entryType}</span>
                        )}
                      </div>
                      <span className="text-xs font-extrabold text-stone-950">{(t as any).entryPrice?.toFixed(2) || '-'}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Exit</span>
                        {(t as any).exitType && (
                          <span className="text-[8px] font-bold text-stone-400 bg-stone-200/60 px-1.5 py-0.5 rounded-sm uppercase tracking-widest">{(t as any).exitType}</span>
                        )}
                      </div>
                      <span className="text-xs font-extrabold text-stone-950">{(t as any).exitPrice?.toFixed(2) || '-'}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Take Profit</span>
                      <span className={`text-xs font-extrabold ${profit > 0 ? 'text-orange-400' : 'text-stone-950'}`}>{(t as any).tpPrice?.toFixed(2) || '-'}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Stop Loss</span>
                      <span className={`text-xs font-extrabold ${profit < 0 ? 'text-red-900' : 'text-stone-950'}`}>{(t as any).slPrice?.toFixed(2) || '-'}</span>
                    </div>
                    <div className="flex justify-end pt-1">
                      <span className="text-[8px] font-bold text-stone-300 opacity-60">#{(t as any).positionId}</span>
                    </div>
                 </div>
              )}

              {/* Right Column: Checklists */}
              <div className="flex-1 grid grid-cols-2 grid-rows-3 grid-flow-col bg-stone-50/50 rounded-2xl border border-stone-200/50 p-5 content-start gap-x-2 gap-y-4">
                  {['On Plan', 'Follow', 'Reversal', 'Enty 1st', 'Enty 2nd', 'Enty 3rd'].map((item, idx) => {
                    const isChecked = item === 'On Plan' ? (t.checklists?.includes(item) || t.isOnPlan !== false) : (t.checklists && t.checklists.includes(item));
                    const ItemIcon = item === 'On Plan' ? ClipboardCheck : item === 'Follow' ? TrendingUp : item === 'Reversal' ? TrendingDown : item === 'Enty 1st' ? Target : item === 'Enty 2nd' ? Focus : item === 'Enty 3rd' ? Crosshair : CheckCircle2;
                    return isChecked ? (
                      <div key={idx} className="flex items-center gap-1.5 text-orange-400">
                        <ItemIcon className="w-3.5 h-3.5 shrink-0" />
                        <span className="text-xs font-bold text-stone-900 truncate">{item}</span>
                      </div>
                    ) : (
                      <div key={idx} className="flex items-center gap-1.5 opacity-50 text-stone-400">
                        <ItemIcon className="w-3.5 h-3.5 shrink-0" />
                        <span className="text-xs font-bold truncate">{item}</span>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}



          {/* Notes / Strategy Section */}
          <div>
            <h4 className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-2 px-2">Notes</h4>
            <div className="bg-stone-50/70 border border-stone-100 rounded-2xl p-4 text-stone-950 text-xs leading-relaxed font-medium min-h-[80px] whitespace-pre-wrap">
              {notes || <span className="text-stone-400 italic">No notes provided for this entry.</span>}
            </div>
          </div>


        </div>

        {/* Footer Actions */}
        <div className="px-6 md:px-8 pb-6 bg-white shrink-0 border-0 border-transparent" style={{ outline: 'none' }}>
          <div className="flex items-center justify-between pt-4 border-t border-stone-100">
            <div className="flex items-center gap-3">
              <button 
                onClick={() => onDelete(trade.id, !!isFunding)}
                title="Delete Trade"
                className="p-2.5 bg-stone-100 hover:bg-red-50 text-stone-600 hover:text-red-900 rounded-xl transition">
                <Trash2 className="w-4 h-4" />
              </button>
              <button 
                onClick={() => onEdit({ ...trade })}
                className="flex items-center gap-1.5 text-xs font-bold text-stone-700 bg-stone-100 hover:bg-stone-200 px-5 py-2.5 rounded-xl transition">
                <Edit2 className="w-4 h-4" />
                Edit
              </button>
            </div>
            {(onPrev || onNext) && (
              <div className="flex items-center gap-4">
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
              className="text-xs font-bold text-white bg-stone-900 hover:bg-stone-800 px-6 py-2.5 rounded-xl transition shadow-md shadow-stone-900/20">
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
