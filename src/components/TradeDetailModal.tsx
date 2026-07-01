"use client";

import { useState } from "react";
import { Trade, Funding } from "@/store/useJournalStore";
import { formatNumber } from "@/lib/utils";
import { X, Edit2, Trash2, ExternalLink, ImageIcon, ChevronLeft, ChevronRight, CheckCircle2, XCircle, MinusCircle, Activity, Crosshair, Target, Focus, Crown, ClipboardCheck, Clock, Timer, LayoutGrid, ShieldAlert, Scale } from "lucide-react";

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
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  if (!isOpen || !trade) return null;

  const isFunding = trade.isFunding;
  const t = trade as Trade & { duration?: number };
  const f = trade as Funding;

  let shortTime = trade.time;
  try {
    const d = new Date(trade.time.replace(' ', 'T'));
    if (!isNaN(d.getTime())) {
      shortTime = d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' +
                  d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    }
  } catch (e) { }

  const profit = isFunding ? (f.deposit > 0 ? f.deposit : -(f.withdraw || 0)) : t.profit;
  const symbol = isFunding ? (f.deposit > 0 ? 'DEPOSIT' : 'WITHDRAW') : t.symbol;
  const notes = isFunding ? f.notes : t.strategy;
  const images = trade.images || [];

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

    let sec = (!t.duration || t.duration <= 0) ? 60 : t.duration;
    const d = Math.floor(sec / (24 * 3600)); sec %= (24 * 3600);
    const h = Math.floor(sec / 3600); sec %= 3600;
    const m = Math.floor(sec / 60); sec %= 60;
    const s = Math.floor(sec);
    if (d > 0) durationDisplay = `${d}d ${h}h`;
    else if (h > 0) durationDisplay = `${h}h ${m}m`;
    else if (m > 0) durationDisplay = `${m}m ${s}s`;
    else durationDisplay = `${s < 1 ? 1 : s}s`;
  }

  return (
    <div className="fixed inset-0 bg-stone-900/50 flex items-center justify-center z-[100] p-4 animate-fadeIn" style={{ outline: 'none', border: 'none' }} onClick={onClose}>
      {/* Image Lightbox Pop-up */}
      {selectedIndex !== null && trade.images && trade.images[selectedIndex] && (
        <div className="fixed inset-0 bg-black/95 z-[200] flex items-center justify-center p-4 backdrop-blur-md animate-fadeIn" onClick={() => setSelectedIndex(null)}>
          <div className="relative w-full max-w-[95vw] 2xl:max-w-[1600px] h-[85vh] flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
            <iframe src={getDriveDirectUrl(trade.images[selectedIndex])} title="Expanded preview" className="w-full h-full rounded-2xl border-0 shadow-2xl bg-white" />
            
            {/* Header info / close button */}
            <div className="absolute -top-12 inset-x-0 flex items-center justify-between px-2">
              <span className="text-white/80 text-sm font-bold tracking-wide">
                Image {selectedIndex + 1} of {trade.images.length}
              </span>
              <button 
                onClick={() => setSelectedIndex(null)} 
                className="text-white hover:text-stone-200 bg-white/10 hover:bg-white/20 p-2 rounded-full transition backdrop-blur-sm">
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Navigation Buttons (Next / Prev) */}
            {trade.images.length > 1 && (
              <>
                <button 
                  onClick={(e) => { e.stopPropagation(); setSelectedIndex((selectedIndex - 1 + trade.images!.length) % trade.images!.length); }}
                  className="absolute left-4 top-1/2 -translate-y-1/2 bg-black/15 hover:bg-black/40 text-white/70 hover:text-white p-3 rounded-full transition-all duration-200 shadow-md border border-white/20 hover:scale-105 z-50">
                  <ChevronLeft className="w-8 h-8" />
                </button>
                <button 
                  onClick={(e) => { e.stopPropagation(); setSelectedIndex((selectedIndex + 1) % trade.images!.length); }}
                  className="absolute right-4 top-1/2 -translate-y-1/2 bg-black/15 hover:bg-black/40 text-white/70 hover:text-white p-3 rounded-full transition-all duration-200 shadow-md border border-white/20 hover:scale-105 z-50">
                  <ChevronRight className="w-8 h-8" />
                </button>
              </>
            )}
          </div>
        </div>
      )}

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
              {profit < 0 ? '-' : (profit > 0 ? '+' : '')}${format2Decimals(Math.abs(profit))}
            </div>
          </div>
        </div>

        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto p-6 md:p-8 flex flex-col gap-6 border-0 border-transparent" style={{ outline: 'none' }}>
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
            <div className="flex flex-col md:flex-row gap-8 py-2">
              {/* Left Column: Stats */}
              <div className="flex-1 flex flex-col justify-center gap-4 py-2">
                <div className="flex justify-between items-center border-b border-stone-100 pb-2">
                  <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Time</span>
                  <span className="text-xs font-extrabold text-stone-950">{shortTime}</span>
                </div>
                <div className="flex justify-between items-center border-b border-stone-100 pb-2">
                  <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Duration</span>
                  <span className="text-xs font-extrabold text-stone-950">{durationDisplay}</span>
                </div>
                <div className="flex justify-between items-center border-b border-stone-100 pb-2">
                  <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Timeframe</span>
                  <span className="text-xs font-extrabold text-stone-950">{(t as any).tf && (t as any).tf !== 'none' ? (t as any).tf : '-'}</span>
                </div>
                <div className="flex justify-between items-center border-b border-stone-100 pb-2">
                  <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Risk</span>
                  <span className="text-xs font-extrabold text-stone-950">{rawRisk > 0 ? `$${format2Decimals(rawRisk)}` : '-'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Risk/Reward</span>
                  <span className="text-xs font-extrabold text-stone-950">{t.rr ? `${format2Decimals(t.rr)}R` : '-'}</span>
                </div>
              </div>

              {/* Right Column: Checklists */}
              <div className="flex flex-col w-full md:w-56 bg-stone-50/50 rounded-2xl border border-stone-200/50 p-5 shrink-0">
                <h4 className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-4">Checklists</h4>
                <div className="flex flex-col gap-3">
                  {['On Plan', 'POI QM', 'Head', 'POI 1st', 'POI 2nd'].map((item, idx) => {
                    const isChecked = item === 'On Plan' ? (t.checklists?.includes(item) || t.isOnPlan !== false) : (t.checklists && t.checklists.includes(item));
                    const ItemIcon = item === 'On Plan' ? ClipboardCheck : item === 'POI QM' ? Crosshair : item === 'POI 1st' ? Target : item === 'POI 2nd' ? Focus : item === 'Head' ? Crown : CheckCircle2;
                    return isChecked ? (
                      <div key={idx} className="flex items-center gap-2 text-orange-400">
                        <ItemIcon className="w-4 h-4" />
                        <span className="text-xs font-bold text-stone-900">{item}</span>
                      </div>
                    ) : (
                      <div key={idx} className="flex items-center gap-2 opacity-50 text-stone-400">
                        <ItemIcon className="w-4 h-4" />
                        <span className="text-xs font-bold">{item}</span>
                      </div>
                    );
                  })}
                </div>
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

          {/* Images Section */}
          <div>
            <h4 className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-3 px-2 flex items-center gap-1.5">
              <ImageIcon className="w-3.5 h-3.5 text-orange-400" />
              Attached Images ({images.length})
            </h4>
            {images.length === 0 ? (
              <div className="border border-dashed border-stone-200 rounded-2xl p-6 text-center text-xs text-stone-400 font-medium">
                No images attached to this trade. You can add Google Drive images by clicking Edit below.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {images.map((url, idx) => {
                  const previewUrl = getDriveDirectUrl(url);
                  return (
                    <div key={idx} className="group relative rounded-2xl overflow-hidden border border-stone-200 bg-stone-50 shadow-sm hover:shadow-md hover:border-stone-400 transition-all duration-200 cursor-pointer" onClick={() => setSelectedIndex(idx)}>
                      <div className="block w-full h-32 relative pointer-events-none bg-stone-100 overflow-hidden">
                        <iframe 
                          src={previewUrl} 
                          title={`Trade attachment ${idx + 1}`} 
                          className="absolute top-1/2 left-1/2 w-[800px] h-[600px] -translate-x-1/2 -translate-y-1/2 border-0 pointer-events-none scale-[0.6]" 
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
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
                onClick={() => onEdit(trade)}
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
