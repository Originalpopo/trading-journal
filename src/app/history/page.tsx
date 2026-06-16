"use client";

import { useJournalStore } from "@/store/useJournalStore";
import { useState, useMemo } from "react";
import { Plus, HelpCircle, Edit2, Trash2, Upload } from "lucide-react";
import ManualTradeModal from "@/components/ManualTradeModal";
import { UploadModal } from "@/components/UploadModal";
import { Trade } from "@/store/useJournalStore";
import { formatNumber } from "@/lib/utils";

const format2Decimals = (val: number) => val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function HistoryPage() {
  const { trades, funding, isLoading, deleteTrade } = useJournalStore();
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 10;

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [tradeToEdit, setTradeToEdit] = useState<Trade | null>(null);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);

  const handleUploadStatus = (status: string) => {
    console.log("Upload status:", status);
  };

  const onFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const { handleCSVUpload } = await import("@/lib/csvParser");
    handleCSVUpload(
      file,
      handleUploadStatus,
      (result) => {
        alert(`Successfully imported ${result.importCount} new trades; Skipped ${result.skipCount} duplicate entries.`);
        setIsUploadModalOpen(false);
        e.target.value = '';
      },
      (error) => {
        console.error(error);
        alert("Error parsing CSV");
        e.target.value = '';
      }
    );
  };

  const onPasteSubmit = async (text: string) => {
    const { handlePasteText } = await import("@/lib/csvParser");
    handlePasteText(
      text,
      handleUploadStatus,
      (result) => {
        alert(`Successfully imported ${result.importCount} new trades; Skipped ${result.skipCount} duplicate entries.`);
        setIsUploadModalOpen(false);
      },
      (error) => {
        console.error(error);
        alert("Error parsing pasted data.");
      }
    );
  };

  const onDBRestoreUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      if (text) {
        const { restoreDatabase } = await import("@/lib/dbActions");
        restoreDatabase(
          text,
          handleUploadStatus,
          (result) => {
            alert(`Successfully restored ${result.trades} trades, ${result.funding} funding entries, and ${result.notes} notes.`);
            setIsUploadModalOpen(false);
          },
          () => {
            alert("Error restoring database");
          }
        );
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleEdit = (t: any) => {
    setTradeToEdit(t);
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string, isFunding: boolean) => {
    if (confirm(`Are you sure you want to delete this ${isFunding ? 'funding entry' : 'trade'}?`)) {
      if (isFunding) {
        const { deleteDoc, doc } = await import('firebase/firestore');
        const { db } = await import('@/lib/firebase');
        await deleteDoc(doc(db, 'funding', id));
      } else {
        await deleteTrade(id);
      }
    }
  };

  const combinedData = useMemo(() => {
    const data: any[] = [];
    trades.forEach(t => data.push({ ...t, isFunding: false }));
    funding.forEach(f => {
      data.push({
        id: f.id,
        time: f.time,
        symbol: f.deposit > 0 ? 'DEPOSIT' : 'WITHDRAW',
        profit: f.deposit > 0 ? f.deposit : -(f.withdraw || 0),
        notes: f.notes,
        isFunding: true
      });
    });

    return data.sort((a, b) => new Date(b.time.replace(' ', 'T')).getTime() - new Date(a.time.replace(' ', 'T')).getTime());
  }, [trades, funding]);

  const totalPages = Math.ceil(combinedData.length / rowsPerPage);
  const startIndex = (currentPage - 1) * rowsPerPage;
  const paginatedData = combinedData.slice(startIndex, startIndex + rowsPerPage);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-slate-500 font-semibold animate-pulse">Loading history...</p>
      </div>
    );
  }

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const renderPagination = () => {
    if (totalPages <= 1) return null;
    const pages = [];
    pages.push(
      <button key="prev" onClick={() => handlePageChange(currentPage - 1)} disabled={currentPage === 1}
        className="px-3 py-1.5 border border-slate-200 rounded-lg text-[11px] font-bold text-slate-600 disabled:opacity-50">
        Prev
      </button>
    );

    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || (i >= currentPage - 1 && i <= currentPage + 1)) {
        pages.push(
          <button key={i} onClick={() => handlePageChange(i)}
            className={`px-3 py-1.5 border border-slate-200 rounded-lg text-[11px] font-bold ${i === currentPage ? 'bg-orange-500 text-white border-orange-500' : 'text-slate-600 hover:bg-slate-50'}`}>
            {i}
          </button>
        );
      } else if (i === currentPage - 2 || i === currentPage + 2) {
        pages.push(<span key={`dots-${i}`} className="px-2 text-slate-300">...</span>);
      }
    }

    pages.push(
      <button key="next" onClick={() => handlePageChange(currentPage + 1)} disabled={currentPage === totalPages}
        className="px-3 py-1.5 border border-slate-200 rounded-lg text-[11px] font-bold text-slate-600 disabled:opacity-50">
        Next
      </button>
    );

    return <div className="flex flex-wrap gap-1">{pages}</div>;
  };

  return (
    <div className="space-y-6">
      <div className="glass-card p-6 overflow-hidden flex flex-col min-h-[750px]">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
          <div className="flex items-center gap-4">
            <h3 className="text-lg font-extrabold text-slate-800 tracking-tight">Trade History</h3>
            <button 
              onClick={() => { setTradeToEdit(null); setIsModalOpen(true); }}
              className="bg-orange-500 hover:bg-orange-600 text-white border border-transparent px-4 py-2 rounded-lg text-xs font-bold transition shadow-sm flex items-center justify-center gap-2 h-9 w-32">
              <Plus className="w-3.5 h-3.5" />
              Add Manual
            </button>
            <button
              onClick={() => setIsUploadModalOpen(true)}
              className="bg-white border border-slate-200 hover:border-orange-300 hover:text-orange-500 text-slate-500 px-4 py-2 rounded-lg text-xs font-bold transition shadow-sm flex items-center justify-center gap-2 h-9 w-32"
            >
              <Upload className="w-3.5 h-3.5" />
              Upload
            </button>
          </div>
          <div>{renderPagination()}</div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead>
              <tr className="text-slate-400 border-b border-slate-100 bg-slate-50/50">
                <th className="py-4 px-4 font-bold uppercase text-[10px] tracking-widest rounded-tl-xl">Time</th>
                <th className="py-4 px-4 font-bold uppercase text-[10px] tracking-widest">Symbol</th>
                <th className="py-4 px-4 font-bold uppercase text-[10px] tracking-widest text-center">On Plan</th>
                <th className="py-4 px-4 font-bold uppercase text-[10px] tracking-widest text-center">Side</th>
                <th className="py-4 px-4 font-bold uppercase text-[10px] tracking-widest text-center">Result</th>
                <th className="py-4 px-4 font-bold uppercase text-[10px] text-right">Risk ($)</th>
                <th className="py-4 px-4 font-bold uppercase text-[10px] text-right">RR</th>
                <th className="py-4 px-4 font-bold uppercase text-[10px] text-right">Net P&L ($)</th>
                <th className="py-4 px-4 font-bold uppercase text-[10px] text-center rounded-tr-xl">Actions</th>
              </tr>
            </thead>
            <tbody className="text-[11px] divide-y divide-slate-50">
              {paginatedData.map((t, idx) => {
                let shortTime = t.time;
                try {
                  const d = new Date(t.time.replace(' ', 'T'));
                  if (!isNaN(d.getTime())) {
                    shortTime = d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' }) + ' ' +
                                d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
                  }
                } catch (e) { }

                if (t.isFunding) {
                  const badge = t.profit > 0 ? 'bg-green-50 text-green-600 border-green-200' : 'bg-red-50 text-red-600 border-red-200';
                  const badgeText = t.profit > 0 ? 'DEPOSIT' : 'WITHDRAW';
                  return (
                    <tr key={`${t.id}-${idx}`} className="hover:bg-slate-50 transition duration-150 border-b border-slate-50">
                      <td className="py-4 px-4 text-slate-500 text-[11px] font-semibold leading-tight">{shortTime}</td>
                      <td className="py-4 px-4 font-extrabold text-slate-800 whitespace-nowrap flex items-center">
                        {badgeText}
                        {t.notes && <span title={t.notes} className="text-slate-400 hover:text-orange-500 transition-colors ml-1 cursor-help"><HelpCircle className="w-3.5 h-3.5 inline" /></span>}
                      </td>
                      <td className="py-4 px-4 text-center">-</td>
                      <td className="py-4 px-4 text-center">-</td>
                      <td className="py-4 px-4 text-center"><span className={`px-2.5 py-1 border rounded-md text-[10px] font-black uppercase ${badge}`}>{badgeText}</span></td>
                      <td className="py-4 px-4 text-right font-bold text-slate-600">-</td>
                      <td className="py-4 px-4 text-right font-bold text-slate-600">-</td>
                      <td className={`py-4 px-4 text-right font-extrabold ${t.profit > 0 ? 'text-slate-900' : 'text-red-500'}`}>
                        {t.profit < 0 ? '-' : ''}${format2Decimals(Math.abs(t.profit))}
                      </td>
                      <td className="py-4 px-4 text-center flex justify-center gap-3">
                        <button onClick={() => handleEdit(t)} className="text-slate-400 hover:text-slate-800 transition"><Edit2 className="w-4 h-4" /></button>
                        <button onClick={() => handleDelete(t.id, t.isFunding)} className="text-slate-400 hover:text-red-500 transition"><Trash2 className="w-4 h-4" /></button>
                      </td>
                    </tr>
                  );
                }

                let isBE = false;
                const rawRisk = parseFloat(t.risk || 0);
                if (rawRisk > 0) {
                  const rr = t.profit / rawRisk;
                  isBE = (rr >= -0.4 && rr <= 0.4);
                } else {
                  isBE = (t.resultType === 'BE' || t.profit === 0);
                }

                const badge = isBE ? 'bg-orange-50 text-orange-500 border-orange-200' : (t.profit > 0 ? 'bg-slate-100 text-slate-900 border-slate-300' : 'bg-red-50 text-red-600 border-red-200');
                const badgeText = isBE ? 'BE' : (t.profit > 0 ? 'TP' : 'SL');
                const riskText = rawRisk && rawRisk !== 0 ? '$' + format2Decimals(Math.abs(rawRisk)) : '-';

                let durationStr = null;
                let sec = (t.duration && t.duration > 0) ? t.duration : 1;
                const d = Math.floor(sec / (24 * 3600)); sec %= (24 * 3600);
                const h = Math.floor(sec / 3600); sec %= 3600;
                const m = Math.floor(sec / 60); sec %= 60;
                const s = Math.floor(sec);
                if (d > 0) durationStr = <><br/><span className="text-[9px] text-slate-400 font-normal mt-0.5 inline-block">Hold: {d}d {h}h</span></>;
                else if (h > 0) durationStr = <><br/><span className="text-[9px] text-slate-400 font-normal mt-0.5 inline-block">Hold: {h}h {m}m</span></>;
                else if (m > 0) durationStr = <><br/><span className="text-[9px] text-slate-400 font-normal mt-0.5 inline-block">Hold: {m}m {s}s</span></>;
                else durationStr = <><br/><span className="text-[9px] text-slate-400 font-normal mt-0.5 inline-block">Hold: {s < 1 ? 1 : s}s</span></>;

                const noteContent = t.strategy || t.notes || '';

                return (
                  <tr key={`${t.id}-${idx}`} className="hover:bg-slate-50 transition duration-150 border-b border-slate-50">
                    <td className="py-4 px-4 text-slate-500 text-[11px] font-semibold leading-tight">
                      {shortTime}{durationStr}
                    </td>
                    <td className="py-4 px-4 font-extrabold text-slate-800 whitespace-nowrap flex items-center">
                      {t.symbol}
                      {noteContent && <span title={noteContent} className="text-slate-400 hover:text-orange-500 transition-colors ml-1 cursor-help"><HelpCircle className="w-3.5 h-3.5 inline" /></span>}
                    </td>
                    <td className="py-4 px-4 text-center">
                      {t.isOnPlan === false 
                        ? <span title="Off Plan" className="text-red-400"><svg className="w-4 h-4 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg></span> 
                        : <span title="On Plan" className="text-slate-400"><svg className="w-4 h-4 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg></span>}
                    </td>
                    <td className="py-4 px-4 text-center">
                      <span className={`px-2.5 py-1 border rounded-md text-[10px] font-black uppercase text-slate-800 ${t.side === 'BUY' ? 'bg-slate-100 border-slate-200' : 'bg-red-50 border-red-100'}`}>{t.side}</span>
                    </td>
                    <td className="py-4 px-4 text-center">
                      <span className={`px-2.5 py-1 border rounded-md text-[10px] font-black uppercase ${badge}`}>{badgeText}</span>
                    </td>
                    <td className="py-4 px-4 text-right font-bold text-slate-600">{riskText}</td>
                    <td className="py-4 px-4 text-right font-bold text-slate-600">
                      {t.rr ? format2Decimals(t.rr) + ' R' : '-'}
                    </td>
                    <td className={`py-4 px-4 text-right font-extrabold ${t.profit >= 0 && !isBE ? 'text-slate-900' : 'text-red-500'}`}>
                      {t.profit < 0 ? '-' : ''}${format2Decimals(Math.abs(t.profit))}
                    </td>
                    <td className="py-4 px-4 text-center flex justify-center gap-3">
                      <button onClick={() => handleEdit(t)} className="text-slate-400 hover:text-slate-800 transition"><Edit2 className="w-4 h-4" /></button>
                      <button onClick={() => handleDelete(t.id, t.isFunding)} className="text-slate-400 hover:text-red-500 transition"><Trash2 className="w-4 h-4" /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <ManualTradeModal 
        isOpen={isModalOpen} 
        onClose={() => { setIsModalOpen(false); setTradeToEdit(null); }} 
        tradeToEdit={tradeToEdit} 
      />
      <UploadModal 
        isOpen={isUploadModalOpen} 
        onClose={() => setIsUploadModalOpen(false)} 
        onPasteSubmit={onPasteSubmit} 
        onFileUpload={onFileUpload}
        onDBRestoreUpload={onDBRestoreUpload}
      />
    </div>
  );
}
