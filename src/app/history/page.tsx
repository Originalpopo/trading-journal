"use client";

import { useJournalStore } from "@/store/useJournalStore";
import { useState, useMemo, useEffect, useRef } from "react";
import { Plus, Edit2, Trash2, Upload } from "lucide-react";
import { CHECKLIST_NAMES } from "@/lib/checklists";
import { CHECKLIST_ICONS } from "@/components/checklistIcons";
import ManualTradeModal from "@/components/ManualTradeModal";
import TradeDetailModal from "@/components/TradeDetailModal";
import { UploadModal } from "@/components/UploadModal";
import { BackupDueDot } from "@/components/BackupReminder";
import BulkImportModal from "@/components/BulkImportModal";
import ExitConfidenceBadge from "@/components/ExitConfidenceBadge";
import BulkEditModal from "@/components/BulkEditModal";
import HistoryFilterBar from "@/components/HistoryFilterBar";
import { filterHistoryRows, EMPTY_FILTERS, type HistoryFilters } from "@/lib/historyFilter";
import { Trade } from "@/store/useJournalStore";
import { formatDurationDetailed, calculateDurationInSeconds } from "@/lib/utils";
import { classifyTrade, outcomeLabel, parseRisk } from "@/lib/stats";

const format2Decimals = (val: number) => val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function HistoryPage() {
  const { trades, funding, dayNotes, preferences, isLoading, deleteTrade, isPrivacyMode } = useJournalStore();
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage] = useState(10);
  const containerRef = useRef<HTMLDivElement>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [tradeToEdit, setTradeToEdit] = useState<Trade | null>(null);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isBulkImportOpen, setIsBulkImportOpen] = useState(false);
  const [tvRawText, setTvRawText] = useState("");
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedDetailTrade, setSelectedDetailTrade] = useState<any | null>(null);
  const [cameFromDetail, setCameFromDetail] = useState(false);

  const [filters, setFiltersState] = useState<HistoryFilters>(EMPTY_FILTERS);
  const setFilters = (next: HistoryFilters) => {
    setFiltersState(next);
    setCurrentPage(1);
  };
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkEditOpen, setIsBulkEditOpen] = useState(false);

  useEffect(() => {
    if (selectedDetailTrade) {
      if (selectedDetailTrade.isFunding) {
        const updated = funding.find(f => f.id === selectedDetailTrade.id);
        if (updated) {
          const enrichedUpdated = {
            ...updated,
            symbol: updated.deposit > 0 ? 'DEPOSIT' : 'WITHDRAW',
            profit: updated.deposit > 0 ? updated.deposit : -(updated.withdraw || 0),
            isFunding: true
          };
          if (JSON.stringify(enrichedUpdated) !== JSON.stringify(selectedDetailTrade)) {
            setSelectedDetailTrade(enrichedUpdated);
          }
        }
      } else {
        const updated = trades.find(t => t.id === selectedDetailTrade.id);
        if (updated) {
          const enrichedUpdated = { ...updated, isFunding: false };
          if (JSON.stringify(enrichedUpdated) !== JSON.stringify(selectedDetailTrade)) {
            setSelectedDetailTrade(enrichedUpdated);
          }
        }
      }
    }
  }, [trades, funding, selectedDetailTrade]);

  const handleUploadStatus = (status: string) => {
    console.log("Upload status:", status);
  };

  const onFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (text) {
        setIsUploadModalOpen(false);
        setTvRawText(text);
        setIsBulkImportOpen(true);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const onPasteSubmit = async (text: string) => {
    setIsUploadModalOpen(false);
    setTvRawText(text);
    setIsBulkImportOpen(true);
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
            alert(`Successfully restored ${result.trades} trades, ${result.funding} funding entries, ${result.notes} day notes${result.preferences ? ', and your settings (balance checks, statement details)' : ''}.`);
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
      dayNotes,
      handleUploadStatus,
      () => alert("Database cleared"),
      () => alert("Error clearing database")
    );
  };

  const onDownloadDatabase = async () => {
    const { downloadDatabase } = await import("@/lib/dbActions");
    downloadDatabase(trades, funding, dayNotes, preferences);
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
        ...f,
        symbol: f.deposit > 0 ? 'DEPOSIT' : 'WITHDRAW',
        profit: f.deposit > 0 ? f.deposit : -(f.withdraw || 0),
        isFunding: true
      });
    });

    return data.sort((a, b) => new Date(b.time.replace(' ', 'T')).getTime() - new Date(a.time.replace(' ', 'T')).getTime());
  }, [trades, funding]);

  const filteredData = useMemo(() => filterHistoryRows(combinedData, filters), [combinedData, filters]);
  const filteredTradeIds = filteredData.filter(r => !r.isFunding).map(r => r.id as string);
  const selectedTrades = trades.filter(t => selectedIds.has(t.id));
  const allFilteredSelected = filteredTradeIds.length > 0 && filteredTradeIds.every(id => selectedIds.has(id));

  const toggleSelected = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleSelectAllFiltered = () => {
    setSelectedIds(allFilteredSelected ? new Set() : new Set(filteredTradeIds));
  };

  // Prev/next in the trade detail walks through what the filters show.
  const detailIndex = selectedDetailTrade ? filteredData.findIndex(t => t.id === selectedDetailTrade.id) : -1;

  const totalPages = Math.ceil(filteredData.length / rowsPerPage);
  const startIndex = (currentPage - 1) * rowsPerPage;
  const paginatedData = filteredData.slice(startIndex, startIndex + rowsPerPage);

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
            className="relative bg-white border border-stone-200 hover:border-orange-300 hover:text-orange-400 text-stone-500 px-4 py-2 rounded-lg text-xs font-bold transition shadow-sm flex items-center justify-center gap-2 h-9 w-32"
          >
            <Upload className="w-3.5 h-3.5" />
            Upload
            <BackupDueDot />
          </button>
        </div>
      </div>

      <div className="glass-card p-3 md:p-6 overflow-hidden flex flex-col h-fit">
        <HistoryFilterBar filters={filters} onChange={setFilters} shownCount={filteredData.length} totalCount={combinedData.length} />

        {selectedIds.size > 0 && (
          <div className="flex items-center justify-between gap-3 flex-wrap mb-4 px-4 py-2.5 bg-orange-50 border border-orange-200 rounded-xl">
            <span className="text-xs font-bold text-orange-400">{selectedIds.size} trade{selectedIds.size > 1 ? 's' : ''} selected</span>
            <div className="flex items-center gap-2">
              <button onClick={() => setSelectedIds(new Set())}
                className="px-3 py-1.5 rounded-lg text-[11px] font-bold text-stone-500 hover:bg-white transition">Clear</button>
              <button onClick={() => setIsBulkEditOpen(true)}
                className="px-4 py-1.5 rounded-lg text-[11px] font-bold bg-orange-400 text-white hover:bg-orange-500 shadow-sm transition flex items-center gap-1.5">
                <Edit2 className="w-3.5 h-3.5" /> Edit On Plan / TF
              </button>
            </div>
          </div>
        )}

        <div ref={containerRef} className="overflow-auto rounded-xl">
          <table className="w-full text-left text-sm whitespace-nowrap relative">
            <thead className="sticky top-0 z-10">
              <tr className="text-stone-400 border-b border-stone-100 bg-stone-50">
                <th className="py-4 pl-2 md:pl-4 pr-0 rounded-tl-xl w-8">
                  <input
                    type="checkbox"
                    checked={allFilteredSelected}
                    onChange={toggleSelectAllFiltered}
                    disabled={filteredTradeIds.length === 0}
                    title={allFilteredSelected ? "Unselect all" : `Select all ${filteredTradeIds.length} trades shown by the filters`}
                    className="w-3.5 h-3.5 accent-orange-400 cursor-pointer align-middle"
                  />
                </th>
                <th className="py-4 px-1 md:px-4 font-bold uppercase text-[10px] tracking-widest">Time</th>
                <th className="py-4 px-1 md:px-4 font-bold uppercase text-[10px] tracking-widest">Symbol</th>
                <th className="hidden md:table-cell py-4 px-1 md:px-4 font-bold uppercase text-[10px] tracking-widest text-center">TF</th>
                <th className="hidden md:table-cell py-4 px-1 md:px-4 font-bold uppercase text-[10px] tracking-widest text-center">On Plan</th>
                <th className="hidden md:table-cell py-4 px-1 md:px-4 font-bold uppercase text-[10px] tracking-widest text-center">Side</th>
                <th className="py-4 px-1 md:px-4 font-bold uppercase text-[10px] tracking-widest text-center">Result</th>
                <th className="hidden md:table-cell py-4 px-1 md:px-4 font-bold uppercase text-[10px] text-right">Risk ($)</th>
                <th className="py-4 px-1 md:px-4 font-bold uppercase text-[10px] text-right">RR</th>
                <th className="py-4 px-1 md:px-4 font-bold uppercase text-[10px] text-right"><span className="hidden md:inline">Net </span>PNL<span className="hidden md:inline"> ($)</span></th>
                <th className="hidden md:table-cell py-4 px-1 md:px-4 font-bold uppercase text-[10px] text-center rounded-tr-xl">Actions</th>
              </tr>
            </thead>
            <tbody className="text-[11px] divide-y divide-stone-50">
              {paginatedData.map((t, idx) => {
                let shortTime = t.time;
                let phoneTime = t.time;
                try {
                  const d = new Date(t.time.replace(' ', 'T'));
                  if (!isNaN(d.getTime())) {
                    shortTime = d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' }) + ' ' +
                                d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                    phoneTime = shortTime.slice(0, -3);
                  }
                } catch { }

                if (t.isFunding) {
                  const badge = t.profit > 0 ? 'bg-orange-50 text-orange-400 border-orange-200' : 'bg-red-50 text-red-900 border-red-200';
                  const badgeText = t.profit > 0 ? 'DEPOSIT' : 'WITHDRAW';
                  return (
                    <tr key={`${t.id}-${idx}`} onClick={() => { setSelectedDetailTrade(t); setIsDetailOpen(true); }} className="hover:bg-stone-50 transition duration-150 border-b border-stone-50 cursor-pointer">
                      <td className="py-4 pl-2 md:pl-4 pr-0"></td>
                      <td className="py-4 px-1 md:px-4 text-stone-500 text-[11px] font-semibold leading-tight"><span className="md:hidden">{phoneTime}</span><span className="hidden md:inline">{shortTime}</span></td>
                      <td className="py-4 px-1 md:px-4 font-extrabold text-stone-950 whitespace-nowrap flex items-center gap-1">
                        {badgeText}
                      </td>
                      <td className="hidden md:table-cell py-4 px-1 md:px-4 text-center text-stone-500">-</td>
                      <td className="hidden md:table-cell py-4 px-1 md:px-4 text-center">-</td>
                      <td className="hidden md:table-cell py-4 px-1 md:px-4 text-center text-stone-500">-</td>
                      <td className="py-4 px-1 md:px-4 text-center"><span className={`px-2.5 py-1 border rounded-md text-[10px] font-black uppercase ${badge}`}>{badgeText}</span></td>
                      <td className="hidden md:table-cell py-4 px-1 md:px-4 text-right font-bold text-stone-500">-</td>
                      <td className="py-4 px-1 md:px-4 text-right font-bold text-stone-500">-</td>
                      <td className={`py-4 px-1 md:px-4 text-right font-extrabold ${t.profit > 0 ? 'text-orange-400' : 'text-red-900'}`}>
                        {isPrivacyMode ? '***' : `${t.profit < 0 ? '-' : ''}$${format2Decimals(Math.abs(t.profit))}`}
                      </td>
                      <td className="hidden md:flex py-4 px-1 md:px-4 text-center justify-center gap-3">
                        <button onClick={(e) => { e.stopPropagation(); handleEdit(t); }} className="text-stone-400 hover:text-stone-950 transition"><Edit2 className="w-4 h-4" /></button>
                        <button onClick={(e) => { e.stopPropagation(); handleDelete(t.id, t.isFunding); }} className="text-stone-400 hover:text-red-900 transition"><Trash2 className="w-4 h-4" /></button>
                      </td>
                    </tr>
                  );
                }

                const outcome = classifyTrade(t);
                const isBE = outcome === 'be';
                const rawRisk = parseRisk(t.risk);

                const badge = isBE ? 'bg-stone-50 text-stone-400 border-stone-200' : (outcome === 'win' ? 'bg-orange-50 text-orange-400 border-orange-200' : 'bg-red-50 text-red-900 border-red-200');
                const badgeText = outcomeLabel(outcome);
                const riskText = rawRisk && rawRisk !== 0 ? '$' + format2Decimals(Math.abs(rawRisk)) : '-';

                const sec = calculateDurationInSeconds(t);
                const durationStr = <><br/><span className="text-[9px] text-stone-400 font-normal mt-0.5 inline-flex items-center gap-1.5">Hold: {formatDurationDetailed(sec)} <ExitConfidenceBadge confidence={t.exitTimeConfidence} /></span></>;


                const isSelected = selectedIds.has(t.id);

                return (
                  <tr key={`${t.id}-${idx}`} onClick={() => { setSelectedDetailTrade(t); setIsDetailOpen(true); }} className={`transition duration-150 border-b border-stone-50 cursor-pointer ${isSelected ? 'bg-orange-50/60 hover:bg-orange-50' : 'hover:bg-stone-50'}`}>
                    <td className="py-4 pl-2 md:pl-4 pr-0" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelected(t.id)}
                        className="w-3.5 h-3.5 accent-orange-400 cursor-pointer align-middle"
                      />
                    </td>
                    <td className="py-4 px-1 md:px-4 text-stone-500 text-[11px] font-semibold leading-tight">
                      <span className="md:hidden">{phoneTime}</span><span className="hidden md:inline">{shortTime}</span>{durationStr}
                    </td>
                    <td className="py-4 px-1 md:px-4 font-extrabold text-stone-950 whitespace-nowrap flex items-center gap-1">
                      {t.symbol}
                    </td>
                    <td className="hidden md:table-cell py-4 px-1 md:px-4 text-center font-bold text-stone-500">
                      {t.tf && t.tf !== 'none' ? (t.tf.includes(',') ? t.tf.split(',')[0].trim() : t.tf) : '-'}
                    </td>
                    <td className="hidden md:table-cell py-4 px-1 md:px-4">
                      <div className="flex items-center justify-center gap-2">
                        {CHECKLIST_NAMES.map(name => {
                          const Icon = CHECKLIST_ICONS[name];
                          // Trades saved before checklists existed count as on plan unless marked otherwise.
                          const isSelected = t.checklists?.includes(name) || (name === 'On Plan' && t.isOnPlan !== false);
                          return (
                            <span key={name} title={isSelected ? name : `${name} (Not Selected)`} className={isSelected ? 'text-orange-400' : 'text-stone-300'}>
                              <Icon className="w-4 h-4" />
                            </span>
                          );
                        })}
                      </div>
                    </td>
                    <td className="hidden md:table-cell py-4 px-1 md:px-4 text-center font-extrabold text-stone-500 uppercase text-[11px]">
                      {t.side}
                    </td>
                    <td className="py-4 px-1 md:px-4 text-center">
                      <span className={`px-2.5 py-1 border rounded-md text-[10px] font-black uppercase ${badge}`}>{badgeText}</span>
                    </td>
                    <td className="hidden md:table-cell py-4 px-1 md:px-4 text-right font-bold text-stone-500">
                      {isPrivacyMode ? '***' : riskText}
                    </td>
                    <td className="py-4 px-1 md:px-4 text-right font-bold text-stone-500">
                      {t.rr ? (t.riskIsEstimate ? '≈' : '') + format2Decimals(t.rr) + ' R' : '-'}
                    </td>
                    <td className={`py-4 px-1 md:px-4 text-right font-extrabold ${isBE ? 'text-stone-400' : (outcome === 'win' ? 'text-orange-400' : 'text-red-900')}`}>
                      {isPrivacyMode ? '***' : `${t.profit < 0 ? '-' : ''}$${format2Decimals(Math.abs(t.profit))}`}
                    </td>
                    <td className="hidden md:flex py-4 px-1 md:px-4 text-center justify-center gap-3">
                      <button onClick={(e) => { e.stopPropagation(); handleEdit(t); }} className="text-stone-400 hover:text-stone-950 transition"><Edit2 className="w-4 h-4" /></button>
                      <button onClick={(e) => { e.stopPropagation(); handleDelete(t.id, t.isFunding); }} className="text-stone-400 hover:text-red-900 transition"><Trash2 className="w-4 h-4" /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filteredData.length === 0 && (
            <p className="py-10 text-center text-xs font-semibold text-stone-400">
              {combinedData.length === 0 ? "No trades yet." : "No entries match these filters."}
            </p>
          )}
        </div>
        <div className="pt-4 flex justify-center shrink-0">
          {renderPagination()}
        </div>
      </div>
      <ManualTradeModal 
        isOpen={isModalOpen} 
        onClose={(savedTrade?: any) => { 
          setIsModalOpen(false); 
          setTradeToEdit(null); 
          if (savedTrade) {
            setSelectedDetailTrade(savedTrade);
            setIsDetailOpen(true);
          } else if (cameFromDetail) {
            setIsDetailOpen(true);
          }
          setCameFromDetail(false);
        }} 
        tradeToEdit={tradeToEdit} 
      />
      <TradeDetailModal
        isOpen={isDetailOpen}
        onClose={() => setIsDetailOpen(false)}
        trade={selectedDetailTrade}
        onEdit={(trade) => { 
          setIsDetailOpen(false); 
          setCameFromDetail(true);
          handleEdit(trade); 
        }}
        onDelete={(id, isFunding) => { setIsDetailOpen(false); handleDelete(id, isFunding); }}
        hasPrev={detailIndex > 0}
        hasNext={detailIndex >= 0 && detailIndex < filteredData.length - 1}
        currentIndex={detailIndex + 1}
        totalItems={filteredData.length}
        onPrev={() => {
          if (detailIndex > 0) setSelectedDetailTrade(filteredData[detailIndex - 1]);
        }}
        onNext={() => {
          if (detailIndex >= 0 && detailIndex < filteredData.length - 1) setSelectedDetailTrade(filteredData[detailIndex + 1]);
        }}
      />
      <BulkEditModal
        isOpen={isBulkEditOpen}
        trades={selectedTrades}
        onClose={(applied) => {
          setIsBulkEditOpen(false);
          if (applied) setSelectedIds(new Set());
        }}
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

      {isBulkImportOpen && (
        <BulkImportModal 
          isOpen={isBulkImportOpen}
          onClose={() => setIsBulkImportOpen(false)}
          initialRawText={tvRawText}
        />
      )}
    </div>
  );
}
