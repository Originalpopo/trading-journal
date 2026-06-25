"use client";

import { useState } from "react";
import { Trade, Funding } from "@/store/useJournalStore";
import { formatNumber } from "@/lib/utils";
import { X, Edit2, Trash2, ExternalLink, Calendar, HelpCircle, ImageIcon } from "lucide-react";

interface TradeDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  trade: (Trade | Funding) & { isFunding?: boolean; duration?: number } | null;
  onEdit: (trade: any) => void;
  onDelete: (id: string, isFunding: boolean) => void;
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

export default function TradeDetailModal({ isOpen, onClose, trade, onEdit, onDelete }: TradeDetailModalProps) {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  if (!isOpen || !trade) return null;

  const isFunding = trade.isFunding;
  const t = trade as Trade;
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
  let badge = 'bg-slate-100 text-slate-900 border-slate-300';
  let badgeText = '';
  let durationDisplay = "1s";

  if (isFunding) {
    badge = profit > 0 ? 'bg-green-50 text-green-600 border-green-200' : 'bg-red-50 text-red-600 border-red-200';
    badgeText = profit > 0 ? 'DEPOSIT' : 'WITHDRAW';
  } else {
    rawRisk = parseFloat((t.risk || 0).toString());
    if (rawRisk > 0) {
      const rr = t.profit / rawRisk;
      isBE = (rr >= -0.4 && rr <= 0.4);
    } else {
      isBE = (t.resultType === 'BE' || t.profit === 0);
    }
    badge = isBE ? 'bg-orange-50 text-orange-500 border-orange-200' : (t.profit > 0 ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-600 border-red-200');
    badgeText = isBE ? 'BE' : (t.profit > 0 ? 'TP' : 'SL');

    let sec = (t.duration && t.duration > 0) ? t.duration : 1;
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
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4 animate-fadeIn">
      {/* Image Lightbox Pop-up */}
      {selectedImage && (
        <div className="fixed inset-0 bg-black/95 z-[200] flex items-center justify-center p-4 backdrop-blur-md animate-fadeIn" onClick={() => setSelectedImage(null)}>
          <div className="relative max-w-5xl h-[85vh] w-full flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
            <iframe src={selectedImage} title="Expanded preview" className="w-full h-full rounded-2xl border-0 shadow-2xl bg-white" />
            <button 
              onClick={() => setSelectedImage(null)} 
              className="absolute -top-12 right-0 text-white hover:text-slate-200 bg-white/10 hover:bg-white/20 p-2 rounded-full transition backdrop-blur-sm">
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-3xl w-full max-w-4xl p-6 md:p-8 shadow-2xl relative flex flex-col max-h-[90vh] overflow-hidden">
        {/* Top Header */}
        <div className="flex items-center justify-between pb-4 mb-6">
          <div className="flex items-center gap-3">
            <h3 className="text-2xl font-black text-slate-900 tracking-tight">{symbol}</h3>
            {!isFunding && t.side && (
              <span className={`px-3 py-1 rounded-lg text-xs font-black uppercase tracking-wider ${t.side === 'BUY' ? 'bg-slate-100 text-slate-800' : 'bg-red-50 text-red-700'}`}>
                {t.side}
              </span>
            )}
            <span className={`px-3 py-1 border rounded-lg text-xs font-black uppercase tracking-wider ${badge}`}>
              {badgeText}
            </span>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100 transition">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content Area */}
        <div className="space-y-6 overflow-y-auto pr-2 flex-1">
          {/* Main Metrics Grid (2 rows, 3 columns) */}
          {isFunding ? (
            <div className="grid grid-cols-2 gap-4 bg-slate-50 p-5 rounded-2xl text-center">
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Time</p>
                <p className="text-xs font-bold text-slate-700">{shortTime}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Net P&L</p>
                <p className={`text-xs font-bold ${profit > 0 ? 'text-green-600' : profit < 0 ? 'text-red-500' : 'text-slate-700'}`}>
                  {profit < 0 ? '-' : ''}${format2Decimals(Math.abs(profit))}
                </p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-6 bg-slate-50 p-6 rounded-2xl text-center">
              {/* Row 1: Time, Plan, Duration */}
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Time</p>
                <p className="text-xs font-bold text-slate-700">{shortTime}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Plan</p>
                {t.isOnPlan === false ? (
                  <p className="text-xs font-extrabold text-red-600 tracking-tight">Off Plan</p>
                ) : (
                  <p className="text-xs font-extrabold text-slate-900 tracking-tight">On Plan</p>
                )}
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Duration</p>
                <p className="text-xs font-bold text-slate-700">{durationDisplay}</p>
              </div>

              {/* Row 2: Net P&L, Risk, RR */}
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Net P&L</p>
                <p className={`text-xs font-bold ${profit > 0 ? 'text-green-600' : profit < 0 ? 'text-red-500' : 'text-slate-700'}`}>
                  {profit < 0 ? '-' : ''}${format2Decimals(Math.abs(profit))}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Risk</p>
                <p className="text-xs font-bold text-slate-700">{rawRisk > 0 ? `$${format2Decimals(rawRisk)}` : '-'}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">RR</p>
                <p className="text-xs font-bold text-slate-700">{t.rr ? `${format2Decimals(t.rr)}R` : '-'}</p>
              </div>
            </div>
          )}

          {/* Notes / Strategy */}
          <div>
            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 px-2">Notes / Strategy</h4>
            <div className="bg-slate-50/70 border border-slate-100 rounded-2xl p-4 text-slate-700 text-xs leading-relaxed font-medium min-h-[80px] whitespace-pre-wrap">
              {notes || <span className="text-slate-400 italic">No notes provided for this entry.</span>}
            </div>
          </div>

          {/* Images Section */}
          <div>
            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 px-2 flex items-center gap-1.5">
              <ImageIcon className="w-3.5 h-3.5 text-orange-500" />
              Attached Images ({images.length})
            </h4>
            {images.length === 0 ? (
              <div className="border border-dashed border-slate-200 rounded-2xl p-6 text-center text-xs text-slate-400 font-medium">
                No images attached to this trade. You can add Google Drive images by clicking Edit below.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {images.map((url, idx) => {
                  const previewUrl = getDriveDirectUrl(url);
                  return (
                    <div key={idx} className="group relative rounded-2xl overflow-hidden border border-slate-200 bg-slate-50 shadow-sm hover:shadow-md transition cursor-pointer" onClick={() => setSelectedImage(previewUrl)}>
                      <div className="block w-full h-48 relative pointer-events-none bg-slate-100">
                        <iframe 
                          src={previewUrl} 
                          title={`Trade attachment ${idx + 1}`} 
                          className="w-full h-full border-0 object-cover pointer-events-none" 
                        />
                      </div>
                      <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-slate-900/80 via-slate-900/40 to-transparent p-3 pt-6 pointer-events-none flex items-center justify-between">
                        <span className="text-[10px] font-extrabold text-white">Image #{idx + 1} (Click to expand)</span>
                        <ExternalLink className="w-3.5 h-3.5 text-white/80" />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Bottom Actions */}
        <div className="flex items-center justify-between pt-4 mt-6 shrink-0">
          <div className="flex gap-2">
            <button 
              onClick={() => onEdit(trade)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 transition">
              <Edit2 className="w-3.5 h-3.5" />
              Edit
            </button>
            <button 
              onClick={() => onDelete(trade.id, !!isFunding)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-red-50 text-red-600 hover:bg-red-100 transition">
              <Trash2 className="w-3.5 h-3.5" />
              Delete
            </button>
          </div>
          <button 
            onClick={onClose}
            className="px-6 py-2 rounded-xl text-xs font-bold bg-slate-900 text-white hover:bg-slate-800 transition shadow-md">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

