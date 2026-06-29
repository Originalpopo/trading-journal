"use client";

import { useJournalStore } from "@/store/useJournalStore";
import { useState, useMemo, useEffect, useRef } from "react";
import { Plus, HelpCircle, Edit2, Trash2, Upload, Image as ImageIcon } from "lucide-react";
import ManualTradeModal from "@/components/ManualTradeModal";
import TradeDetailModal from "@/components/TradeDetailModal";
import { UploadModal } from "@/components/UploadModal";
import { Trade } from "@/store/useJournalStore";
import { formatNumber } from "@/lib/utils";

const format2Decimals = (val: number) => val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function HistoryPage() {
  const { trades, funding, notes, isLoading, deleteTrade } = useJournalStore();
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateRows = (height: number) => {
      const headerHeight = 46; // Approximate height of the table header
      const availableHeight = height - headerHeight;
      const rowHeight = 62; // Approximate height of a row
      let calculatedRows = Math.floor(availableHeight / rowHeight);
      if (calculatedRows < 5) calculatedRows = 5;
      if (calculatedRows > 50) calculatedRows = 50;
      setRowsPerPage(calculatedRows);
    };

    const observer = new ResizeObserver((entries) => {
      for (let entry of entries) {
        if (entry.target === container) {
          updateRows(entry.contentRect.height);
        }
      }
    });

    observer.observe(container);
    // Initial call to set rows if height is already available
    if (container.clientHeight > 0) {
      updateRows(container.clientHeight);
    }

    return () => observer.disconnect();
  }, []);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [tradeToEdit, setTradeToEdit] = useState<Trade | null>(null);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedDetailTrade, setSelectedDetailTrade] = useState<any | null>(null);

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

  const onClearDatabase = async () => {
    const { clearDatabase } = await import("@/lib/dbActions");
    clearDatabase(
      trades,
      funding,
      notes,
      handleUploadStatus,
      () => alert("Database cleared"),
      () => alert("Error clearing database")
    );
  };

  const onDownloadDatabase = async () => {
    const { downloadDatabase } = await import("@/lib/dbActions");
    downloadDatabase(trades, funding, notes);
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
        <p className="text-stone-500 font-semibold animate-pulse">Loading history...</p>
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
        className="px-3 py-1.5 border border-stone-200 rounded-lg text-[11px] font-bold text-stone-600 disabled:opacity-50">
        Prev
      </button>
    );

    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || (i >= currentPage - 1 && i <= currentPage + 1)) {
        pages.push(
          <button key={i} onClick={() => handlePageChange(i)}
            className={`px-3 py-1.5 border border-stone-200 rounded-lg text-[11px] font-bold ${i === currentPage ? 'bg-orange-400 text-white border-orange-400' : 'text-stone-600 hover:bg-stone-50'}`}>
            {i}
          </button>
        );
      } else if (i === currentPage - 2 || i === currentPage + 2) {
        pages.push(<span key={`dots-${i}`} className="px-2 text-stone-300">...</span>);
      }
    }

    pages.push(
      <button key="next" onClick={() => handlePageChange(currentPage + 1)} disabled={currentPage === totalPages}
        className="px-3 py-1.5 border border-stone-200 rounded-lg text-[11px] font-bold text-stone-600 disabled:opacity-50">
        Next
      </button>
    );

    return <div className="flex flex-wrap gap-1">{pages}</div>;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-extrabold text-stone-950 tracking-tight">History</h2>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <button 
            onClick={() => { setTradeToEdit(null); setIsModalOpen(true); }}
            className="bg-orange-400 hover:bg-orange-500 text-white border border-transparent px-4 py-2 rounded-lg text-xs font-bold transition shadow-sm flex items-center justify-center gap-2 h-9 w-32">
            <Plus className="w-3.5 h-3.5" />
            Add Manual
          </button>
          <button
            onClick={() => setIsUploadModalOpen(true)}
            className="bg-white border border-stone-200 hover:border-orange-300 hover:text-orange-400 text-stone-500 px-4 py-2 rounded-lg text-xs font-bold transition shadow-sm flex items-center justify-center gap-2 h-9 w-32"
          >
            <Upload className="w-3.5 h-3.5" />
            Upload
          </button>
          <div>{renderPagination()}</div>
        </div>
      </div>

      <div className="glass-card p-6 overflow-hidden flex flex-col min-h-[500px] h-[calc(100vh-6rem)] md:h-[calc(100vh-8rem)]">
        <div ref={containerRef} className="overflow-auto flex-1 rounded-xl">
          <table className="w-full text-left text-sm whitespace-nowrap relative">
            <thead className="sticky top-0 z-10">
              <tr className="text-stone-400 border-b border-stone-100 bg-stone-50">
                <th className="py-4 px-4 font-bold uppercase text-[10px] tracking-widest rounded-tl-xl">Time</th>
                <th className="py-4 px-4 font-bold uppercase text-[10px] tracking-widest">Symbol</th>
                <th className="py-4 px-4 font-bold uppercase text-[10px] tracking-widest text-center">TF</th>
                <th className="py-4 px-4 font-bold uppercase text-[10px] tracking-widest text-center">On Plan</th>
                <th className="py-4 px-4 font-bold uppercase text-[10px] tracking-widest text-center">Side</th>
                <th className="py-4 px-4 font-bold uppercase text-[10px] tracking-widest text-center">Result</th>
                <th className="py-4 px-4 font-bold uppercase text-[10px] text-right">Risk ($)</th>
                <th className="py-4 px-4 font-bold uppercase text-[10px] text-right">RR</th>
                <th className="py-4 px-4 font-bold uppercase text-[10px] text-right">Net P&L ($)</th>
                <th className="py-4 px-4 font-bold uppercase text-[10px] text-center rounded-tr-xl">Actions</th>
              </tr>
            </thead>
            <tbody className="text-[11px] divide-y divide-stone-50">
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
                  const badge = t.profit > 0 ? 'bg-orange-50 text-orange-400 border-orange-200' : 'bg-red-50 text-red-900 border-red-200';
                  const badgeText = t.profit > 0 ? 'DEPOSIT' : 'WITHDRAW';
                  return (
                    <tr key={`${t.id}-${idx}`} onClick={() => { setSelectedDetailTrade(t); setIsDetailOpen(true); }} className="hover:bg-stone-50 transition duration-150 border-b border-stone-50 cursor-pointer">
                      <td className="py-4 px-4 text-stone-500 text-[11px] font-semibold leading-tight">{shortTime}</td>
                      <td className="py-4 px-4 font-extrabold text-stone-950 whitespace-nowrap flex items-center gap-1">
                        {badgeText}
                        {t.images && t.images.length > 0 && <span title={`${t.images.length} Attached Images`} className="text-stone-400"><ImageIcon className="w-3.5 h-3.5 inline" /></span>}
                      </td>
                      <td className="py-4 px-4 text-center text-stone-500">-</td>
                      <td className="py-4 px-4 text-center">-</td>
                      <td className="py-4 px-4 text-center text-stone-500">-</td>
                      <td className="py-4 px-4 text-center"><span className={`px-2.5 py-1 border rounded-md text-[10px] font-black uppercase ${badge}`}>{badgeText}</span></td>
                      <td className="py-4 px-4 text-right font-bold text-stone-500">-</td>
                      <td className="py-4 px-4 text-right font-bold text-stone-500">-</td>
                      <td className={`py-4 px-4 text-right font-extrabold ${t.profit > 0 ? 'text-orange-400' : 'text-red-900'}`}>
                        {t.profit < 0 ? '-' : ''}${format2Decimals(Math.abs(t.profit))}
                      </td>
                      <td className="py-4 px-4 text-center flex justify-center gap-3">
                        <button onClick={(e) => { e.stopPropagation(); handleEdit(t); }} className="text-stone-400 hover:text-stone-950 transition"><Edit2 className="w-4 h-4" /></button>
                        <button onClick={(e) => { e.stopPropagation(); handleDelete(t.id, t.isFunding); }} className="text-stone-400 hover:text-red-900 transition"><Trash2 className="w-4 h-4" /></button>
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

                const badge = isBE ? 'bg-stone-50 text-stone-400 border-stone-200' : (t.profit > 0 ? 'bg-orange-50 text-orange-400 border-orange-200' : 'bg-red-50 text-red-900 border-red-200');
                const badgeText = isBE ? 'BE' : (t.profit > 0 ? 'TP' : 'SL');
                const riskText = rawRisk && rawRisk !== 0 ? '$' + format2Decimals(Math.abs(rawRisk)) : '-';

                let durationStr = null;
                let sec = (!t.duration || t.duration <= 0) ? 60 : t.duration;
                let m = Math.floor(sec / 60);
                let s = sec % 60;
                let h = Math.floor(m / 60); m = m % 60;
                let d = Math.floor(h / 24); h = h % 24;
                if (d > 0) durationStr = <><br/><span className="text-[9px] text-stone-400 font-normal mt-0.5 inline-block">Hold: {d}d {h}h</span></>;
                else if (h > 0) durationStr = <><br/><span className="text-[9px] text-stone-400 font-normal mt-0.5 inline-block">Hold: {h}h {m}m</span></>;
                else if (m > 0) durationStr = <><br/><span className="text-[9px] text-stone-400 font-normal mt-0.5 inline-block">Hold: {m}m {s}s</span></>;
                else durationStr = <><br/><span className="text-[9px] text-stone-400 font-normal mt-0.5 inline-block">Hold: {s}s</span></>;

                return (
                  <tr key={`${t.id}-${idx}`} onClick={() => { setSelectedDetailTrade(t); setIsDetailOpen(true); }} className="hover:bg-stone-50 transition duration-150 border-b border-stone-50 cursor-pointer">
                    <td className="py-4 px-4 text-stone-500 text-[11px] font-semibold leading-tight">
                      {shortTime}{durationStr}
                    </td>
                    <td className="py-4 px-4 font-extrabold text-stone-950 whitespace-nowrap flex items-center gap-1">
                      {t.symbol}
                      {t.images && t.images.length > 0 && <span title={`${t.images.length} Attached Images`} className="text-stone-400"><ImageIcon className="w-3.5 h-3.5 inline" /></span>}
                    </td>
                    <td className="py-4 px-4 text-center font-bold text-stone-500">
                      {t.tf && t.tf !== 'none' ? t.tf : '-'}
                    </td>
                    <td className="py-4 px-4 text-center">
                      {t.isOnPlan === false 
                        ? <span title="Off Plan" className="text-red-800"><svg className="w-4 h-4 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg></span> 
                        : <span title="On Plan" className="text-stone-400"><svg className="w-4 h-4 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg></span>}
                    </td>
                    <td className="py-4 px-4 text-center font-extrabold text-stone-500 uppercase text-[11px]">
                      {t.side}
                    </td>
                    <td className="py-4 px-4 text-center">
                      <span className={`px-2.5 py-1 border rounded-md text-[10px] font-black uppercase ${badge}`}>{badgeText}</span>
                    </td>
                    <td className="py-4 px-4 text-right font-bold text-stone-500">{riskText}</td>
                    <td className="py-4 px-4 text-right font-bold text-stone-500">
                      {t.rr ? format2Decimals(t.rr) + ' R' : '-'}
                    </td>
                    <td className={`py-4 px-4 text-right font-extrabold ${isBE ? 'text-stone-400' : (t.profit > 0 ? 'text-orange-400' : 'text-red-900')}`}>
                      {t.profit < 0 ? '-' : ''}${format2Decimals(Math.abs(t.profit))}
                    </td>
                    <td className="py-4 px-4 text-center flex justify-center gap-3">
                      <button onClick={(e) => { e.stopPropagation(); handleEdit(t); }} className="text-stone-400 hover:text-stone-950 transition"><Edit2 className="w-4 h-4" /></button>
                      <button onClick={(e) => { e.stopPropagation(); handleDelete(t.id, t.isFunding); }} className="text-stone-400 hover:text-red-900 transition"><Trash2 className="w-4 h-4" /></button>
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
      <TradeDetailModal
        isOpen={isDetailOpen}
        onClose={() => setIsDetailOpen(false)}
        trade={selectedDetailTrade}
        onEdit={(trade) => { setIsDetailOpen(false); handleEdit(trade); }}
        onDelete={(id, isFunding) => { setIsDetailOpen(false); handleDelete(id, isFunding); }}
      />
      <UploadModal 
        isOpen={isUploadModalOpen} 
        onClose={() => setIsUploadModalOpen(false)} 
        onPasteSubmit={onPasteSubmit} 
        onFileUpload={onFileUpload}
        onDBRestoreUpload={onDBRestoreUpload}
        onClearDatabase={onClearDatabase}
        onDownloadDatabase={onDownloadDatabase}
      />
    </div>
  );
}
