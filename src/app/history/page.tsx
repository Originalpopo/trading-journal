"use client";

import { useJournalStore } from "@/store/useJournalStore";
import { useState, useMemo, useEffect, useRef } from "react";
import { Plus, Edit2, Trash2, Upload, SquareCheck } from "lucide-react";
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
import { useHistoryColumns, HistoryColumnsButton, HistoryColumnsPanel } from "@/components/HistoryColumns";
import { filterHistoryRows, EMPTY_FILTERS, type HistoryFilters } from "@/lib/historyFilter";
import { Trade } from "@/store/useJournalStore";
import { formatDurationDetailed, calculateDurationInSeconds } from "@/lib/utils";
import { classifyTrade, outcomeLabel, parseRisk } from "@/lib/stats";

import PageHeader, { HeaderButton } from "@/components/PageHeader";
const format2Decimals = (val: number) => val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// P&L in the table: exact, but on a phone whole dollars without "$" from 1,000 up so the column still fits. The detail popup has the exact figure.
function PnlText({ profit }: { profit: number }) {
  const sign = profit < 0 ? '-' : '';
  const abs = Math.abs(profit);
  const exact = `${sign}$${format2Decimals(abs)}`;
  if (abs < 1000) return <>{exact}</>;
  return (
    <>
      <span className="md:hidden">{sign}{Math.round(abs).toLocaleString('en-US')}</span>
      <span className="hidden md:inline">{exact}</span>
    </>
  );
}

export default function HistoryPage() {
  const { trades, funding, dayNotes, weekNotes, preferences, isLoading, deleteTrade, isPrivacyMode } = useJournalStore();
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage] = useState(10);
  const containerRef = useRef<HTMLDivElement>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [tradeToEdit, setTradeToEdit] = useState<Trade | null>(null);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isBulkImportOpen, setIsBulkImportOpen] = useState(false);
  const [tvRawText, setTvRawText] = useState("");
  const [tvLogText, setTvLogText] = useState("");
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedDetailTrade, setSelectedDetailTrade] = useState<any | null>(null);
  const [cameFromDetail, setCameFromDetail] = useState(false);

  const [filters, setFiltersState] = useState<HistoryFilters>(EMPTY_FILTERS);
  const setFilters = (next: HistoryFilters) => {
    setFiltersState(next);
    setCurrentPage(1);
  };
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // The tick boxes for editing several trades at once stay hidden until "Select" is pressed.
  const [isSelecting, setIsSelecting] = useState(false);
  const stopSelecting = () => { setIsSelecting(false); setSelectedIds(new Set()); };
  const columns = useHistoryColumns();
  const col = columns.colClass;
  const [isColumnsOpen, setIsColumnsOpen] = useState(false);
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

  const onPasteSubmit = async (text: string, logText: string) => {
    setIsUploadModalOpen(false);
    setTvRawText(text);
    setTvLogText(logText);
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
            alert(`Successfully restored ${result.trades} trades, ${result.funding} funding entries, ${result.notes} day notes, ${result.weekNotes} week notes${result.preferences ? ', and your settings (balance checks, statement details)' : ''}.`);
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
      weekNotes,
      handleUploadStatus,
      () => alert("Database cleared"),
      () => alert("Error clearing database")
    );
  };

  const onDownloadDatabase = async () => {
    const { downloadDatabase } = await import("@/lib/dbActions");
    downloadDatabase(trades, funding, dayNotes, weekNotes, preferences);
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

  // With the tick boxes hidden, Time is the first column and takes the table's left edge and corner.
  const firstColClass = isSelecting ? '' : 'pl-2 md:pl-4';

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
        <p className="text-ink-muted font-semibold animate-pulse">Loading history...</p>
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
        className="px-3 py-1.5 border border-line rounded-lg text-[11px] font-bold text-ink-muted disabled:opacity-50">
        Prev
      </button>
    );

    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || (i >= currentPage - 1 && i <= currentPage + 1)) {
        pages.push(
          <button key={i} onClick={() => handlePageChange(i)}
            className={`px-3 py-1.5 border border-line rounded-lg text-[11px] font-bold ${i === currentPage ? 'bg-accent text-white border-accent' : 'text-ink-muted hover:bg-surface'}`}>
            {i}
          </button>
        );
      } else if (i === currentPage - 2 || i === currentPage + 2) {
        pages.push(<span key={`dots-${i}`} className="px-2 text-ink-disabled">...</span>);
      }
    }

    pages.push(
      <button key="next" onClick={() => handlePageChange(currentPage + 1)} disabled={currentPage === totalPages}
        className="px-3 py-1.5 border border-line rounded-lg text-[11px] font-bold text-ink-muted disabled:opacity-50">
        Next
      </button>
    );

    return <div className="flex flex-wrap gap-1">{pages}</div>;
  };

  return (
    <div className="space-y-6">
      <PageHeader title="History">
        <HeaderButton icon={Upload} label="Import" variant="primary" onClick={() => setIsUploadModalOpen(true)}>
          <BackupDueDot />
        </HeaderButton>
        <HeaderButton icon={Plus} label="Add entry" variant="plain" iconOnly onClick={() => { setTradeToEdit(null); setIsModalOpen(true); }} />
      </PageHeader>

      <div className="glass-card p-3 md:p-6 overflow-hidden flex flex-col h-fit">
        <HistoryFilterBar
          filters={filters}
          onChange={setFilters}
          shownCount={filteredData.length}
          totalCount={combinedData.length}
          leading={
            <>
            <button
              type="button"
              onClick={() => (isSelecting ? stopSelecting() : setIsSelecting(true))}
              aria-pressed={isSelecting}
              aria-label="Select trades"
              title={isSelecting ? "Stop selecting" : "Select trades to edit together"}
              className={`flex items-center justify-center h-8 w-8 border rounded-lg text-[11px] font-bold transition ${
                isSelecting ? 'bg-accent-soft text-accent border-accent-line' : 'bg-white text-ink-muted border-line hover:text-ink'
              }`}
            >
              <SquareCheck className="w-3.5 h-3.5" />
            </button>
            <HistoryColumnsButton isOpen={isColumnsOpen} onToggle={() => setIsColumnsOpen(open => !open)} />
            </>
          }
        />
        {isColumnsOpen && <HistoryColumnsPanel columns={columns} />}

        {selectedIds.size > 0 && (
          <div className="flex items-center justify-between gap-3 flex-wrap mb-4 px-4 py-2.5 bg-accent-soft border border-accent-line rounded-xl">
            <span className="text-xs font-bold text-accent">{selectedIds.size} trade{selectedIds.size > 1 ? 's' : ''} selected</span>
            <div className="flex items-center gap-2">
              <button onClick={() => setSelectedIds(new Set())}
                className="px-3 py-1.5 rounded-lg text-[11px] font-bold text-ink-muted hover:bg-white transition">Clear</button>
              <button onClick={() => setIsBulkEditOpen(true)}
                className="px-4 py-1.5 rounded-lg text-[11px] font-bold bg-accent text-white hover:bg-accent-strong shadow-sm transition flex items-center gap-1.5">
                <Edit2 className="w-3.5 h-3.5" /> Edit On Plan / TF
              </button>
            </div>
          </div>
        )}

        <div ref={containerRef} className="overflow-auto rounded-xl">
          <table className="w-full text-left text-sm whitespace-nowrap relative">
            <thead className="sticky top-0 z-10">
              <tr className="text-ink-faint border-b border-line-soft bg-surface">
                {/* The whole cell toggles, so the box is easy to hit with a finger. */}
                {isSelecting && (
                <th className="py-4 pl-2 md:pl-4 pr-0 w-8 cursor-pointer" onClick={(e) => { if (e.target === e.currentTarget && filteredTradeIds.length > 0) toggleSelectAllFiltered(); }}>
                  <input
                    type="checkbox"
                    checked={allFilteredSelected}
                    onChange={toggleSelectAllFiltered}
                    disabled={filteredTradeIds.length === 0}
                    title={allFilteredSelected ? "Unselect all" : `Select all ${filteredTradeIds.length} trades shown by the filters`}
                    className="w-4 h-4 md:w-3.5 md:h-3.5 accent-accent cursor-pointer align-middle"
                  />
                </th>
                )}
                <th className={`py-4 px-1 md:px-4 font-bold uppercase text-[10px] tracking-widest ${firstColClass}`}>Time</th>
                <th className={`${col("symbol")} py-4 px-1 md:px-4 font-bold uppercase text-[10px] tracking-widest`}>Symbol</th>
                <th className={`${col("tf")} py-4 px-1 md:px-4 font-bold uppercase text-[10px] tracking-widest text-center`}>TF</th>
                <th className={`${col("onPlan")} py-4 px-1 md:px-4 font-bold uppercase text-[10px] tracking-widest text-center`}>On Plan</th>
                <th className={`${col("side")} py-4 px-1 md:px-4 font-bold uppercase text-[10px] tracking-widest text-center`}>Side</th>
                <th className={`${col("result")} py-4 px-1 md:px-4 font-bold uppercase text-[10px] tracking-widest text-center`}>Result</th>
                <th className={`${col("risk")} py-4 px-1 md:px-4 font-bold uppercase text-[10px] text-right`}>Risk ($)</th>
                <th className={`${col("rr")} py-4 px-1 md:px-4 font-bold uppercase text-[10px] text-right`}>RR</th>
                <th className={`${col("pnl")} py-4 px-1 md:px-4 font-bold uppercase text-[10px] text-right`}><span className="hidden md:inline">Net </span>PNL<span className="hidden md:inline"> ($)</span></th>
                <th className={`${col("actions")} py-4 px-1 md:px-4 font-bold uppercase text-[10px] text-center`}>Actions</th>
              </tr>
            </thead>
            <tbody className="text-[11px] divide-y divide-line-soft">
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
                  const badge = t.profit > 0 ? 'bg-accent-soft text-accent border-accent-line' : 'bg-loss-soft text-loss border-loss-line';
                  const badgeText = t.profit > 0 ? 'DEPOSIT' : 'WITHDRAW';
                  return (
                    <tr key={`${t.id}-${idx}`} onClick={() => { setSelectedDetailTrade(t); setIsDetailOpen(true); }} className="hover:bg-surface transition duration-150 border-b border-line-soft cursor-pointer">
                      {isSelecting && <td className="py-4 pl-2 md:pl-4 pr-0"></td>}
                      <td className={`py-4 px-1 md:px-4 text-ink-muted text-[11px] font-semibold leading-tight ${firstColClass}`}><span className="md:hidden">{phoneTime}</span><span className="hidden md:inline">{shortTime}</span></td>
                      <td className={`${col("symbol")} py-4 px-1 md:px-4 font-extrabold text-ink whitespace-nowrap`}>
                        {badgeText}
                      </td>
                      <td className={`${col("tf")} py-4 px-1 md:px-4 text-center text-ink-muted`}>-</td>
                      <td className={`${col("onPlan")} py-4 px-1 md:px-4 text-center`}>-</td>
                      <td className={`${col("side")} py-4 px-1 md:px-4 text-center text-ink-muted`}>-</td>
                      <td className={`${col("result")} py-4 px-1 md:px-4 text-center`}><span className={`px-2.5 py-1 border rounded-md text-[10px] font-black uppercase ${badge}`}>{badgeText}</span></td>
                      <td className={`${col("risk")} py-4 px-1 md:px-4 text-right font-bold text-ink-muted`}>-</td>
                      <td className={`${col("rr")} py-4 px-1 md:px-4 text-right font-bold text-ink-muted`}>-</td>
                      <td className={`${col("pnl")} py-4 px-1 md:px-4 text-right font-extrabold ${t.profit > 0 ? 'text-accent' : 'text-loss'}`}>
                        {isPrivacyMode ? '***' : <PnlText profit={t.profit} />}
                      </td>
                      <td className={`${col("actions")} py-4 px-1 md:px-4`}><div className="flex justify-center gap-3">
                        <button onClick={(e) => { e.stopPropagation(); handleEdit(t); }} className="text-ink-faint hover:text-ink transition"><Edit2 className="w-4 h-4" /></button>
                        <button onClick={(e) => { e.stopPropagation(); handleDelete(t.id, t.isFunding); }} className="text-ink-faint hover:text-loss transition"><Trash2 className="w-4 h-4" /></button>
                      </div></td>
                    </tr>
                  );
                }

                const outcome = classifyTrade(t);
                const isBE = outcome === 'be';
                const rawRisk = parseRisk(t.risk);

                const badge = isBE ? 'bg-surface text-ink-faint border-line' : (outcome === 'win' ? 'bg-accent-soft text-accent border-accent-line' : 'bg-loss-soft text-loss border-loss-line');
                const badgeText = outcomeLabel(outcome);
                const riskText = rawRisk && rawRisk !== 0 ? '$' + format2Decimals(Math.abs(rawRisk)) : '-';

                const sec = calculateDurationInSeconds(t);
                const durationStr = <><br/><span className="text-[9px] text-ink-faint font-normal mt-0.5 inline-flex items-center gap-1.5">Hold: {formatDurationDetailed(sec)} <ExitConfidenceBadge confidence={t.exitTimeConfidence} /></span></>;


                const isSelected = selectedIds.has(t.id);

                return (
                  <tr key={`${t.id}-${idx}`} onClick={() => { setSelectedDetailTrade(t); setIsDetailOpen(true); }} className={`transition duration-150 border-b border-line-soft cursor-pointer ${isSelected ? 'bg-accent-soft' : 'hover:bg-surface'}`}>
                    {isSelecting && (
                    <td className="py-4 pl-2 md:pl-4 pr-0 cursor-pointer" onClick={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) toggleSelected(t.id); }}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelected(t.id)}
                        className="w-4 h-4 md:w-3.5 md:h-3.5 accent-accent cursor-pointer align-middle"
                      />
                    </td>
                    )}
                    <td className={`py-4 px-1 md:px-4 text-ink-muted text-[11px] font-semibold leading-tight ${firstColClass}`}>
                      <span className="md:hidden">{phoneTime}</span><span className="hidden md:inline">{shortTime}</span>{durationStr}
                    </td>
                    <td className={`${col("symbol")} py-4 px-1 md:px-4 font-extrabold text-ink whitespace-nowrap`}>
                      {t.symbol}
                    </td>
                    <td className={`${col("tf")} py-4 px-1 md:px-4 text-center font-bold text-ink-muted`}>
                      {t.tf && t.tf !== 'none' ? (t.tf.includes(',') ? t.tf.split(',')[0].trim() : t.tf) : '-'}
                    </td>
                    <td className={`${col("onPlan")} py-4 px-1 md:px-4`}>
                      <div className="flex items-center justify-center gap-2">
                        {CHECKLIST_NAMES.map(name => {
                          const Icon = CHECKLIST_ICONS[name];
                          // Trades saved before checklists existed count as on plan unless marked otherwise.
                          const isSelected = t.checklists?.includes(name) || (name === 'On Plan' && t.isOnPlan !== false);
                          return (
                            <span key={name} title={isSelected ? name : `${name} (Not Selected)`} className={isSelected ? 'text-accent' : 'text-ink-disabled'}>
                              <Icon className="w-4 h-4" />
                            </span>
                          );
                        })}
                      </div>
                    </td>
                    <td className={`${col("side")} py-4 px-1 md:px-4 text-center font-extrabold text-ink-muted uppercase text-[11px]`}>
                      {t.side}
                    </td>
                    <td className={`${col("result")} py-4 px-1 md:px-4 text-center`}>
                      <span className={`px-2.5 py-1 border rounded-md text-[10px] font-black uppercase ${badge}`}>{badgeText}</span>
                    </td>
                    <td className={`${col("risk")} py-4 px-1 md:px-4 text-right font-bold text-ink-muted`}>
                      {isPrivacyMode ? '***' : riskText}
                    </td>
                    <td className={`${col("rr")} py-4 px-1 md:px-4 text-right font-bold text-ink-muted`}>
                      {t.rr ? (t.riskIsEstimate ? '≈' : '') + format2Decimals(t.rr) + ' R' : '-'}
                    </td>
                    <td className={`${col("pnl")} py-4 px-1 md:px-4 text-right font-extrabold ${isBE ? 'text-ink-faint' : (outcome === 'win' ? 'text-accent' : 'text-loss')}`}>
                      {isPrivacyMode ? '***' : <PnlText profit={t.profit} />}
                    </td>
                    <td className={`${col("actions")} py-4 px-1 md:px-4`}><div className="flex justify-center gap-3">
                      <button onClick={(e) => { e.stopPropagation(); handleEdit(t); }} className="text-ink-faint hover:text-ink transition"><Edit2 className="w-4 h-4" /></button>
                      <button onClick={(e) => { e.stopPropagation(); handleDelete(t.id, t.isFunding); }} className="text-ink-faint hover:text-loss transition"><Trash2 className="w-4 h-4" /></button>
                    </div></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filteredData.length === 0 && (
            <p className="py-10 text-center text-xs font-semibold text-ink-faint">
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
          if (applied) stopSelecting();
        }}
      />
      <UploadModal 
        isOpen={isUploadModalOpen} 
        onClose={() => setIsUploadModalOpen(false)} 
        onPasteSubmit={onPasteSubmit} 
        onDBRestoreUpload={onDBRestoreUpload}
        onClearDatabase={onClearDatabase}
        onDownloadDatabase={onDownloadDatabase}
      />

      {isBulkImportOpen && (
        <BulkImportModal 
          isOpen={isBulkImportOpen}
          onClose={() => setIsBulkImportOpen(false)}
          initialRawText={tvRawText}
          initialLogText={tvLogText}
        />
      )}
    </div>
  );
}
