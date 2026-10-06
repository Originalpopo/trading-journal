"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Download, Printer, AlertTriangle, CheckCircle2, Eye, X, FileDown } from "lucide-react";
import { useJournalStore } from "@/store/useJournalStore";
import { buildStatement, statementMonths, statementCsv, type Statement, type StatementProfile } from "@/lib/statement";
import { reconcileBalance, type BalanceCheckRecord } from "@/lib/reconcile";
import { formatNumber } from "@/lib/utils";
import { useEscapeToClose } from "@/lib/useEscapeToClose";

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const TH = "px-3 py-3 font-bold uppercase text-[10px] tracking-widest text-right";
const TH_LEFT = "px-3 py-3 font-bold uppercase text-[10px] tracking-widest text-left";
const TD = "px-3 py-2.5 text-right font-semibold text-stone-600";
const TD_LEFT = "px-3 py-2.5 text-left font-semibold text-stone-600";

const signed = (value: number) => `${value < 0 ? '-' : ''}${formatNumber(Math.abs(value))}`;
const clock = (time?: string) => (time ? time.replace('T', ' ') : '');
const lastDayOf = (year: number, month: number) => `${year}-${String(month).padStart(2, '0')}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}T23:59:59`;

// The check that vouches for a month: one made within it, else a later one (see below).
interface Confirmation { check: BalanceCheckRecord; isLater: boolean }

const confirmationText = (confirmed: Confirmation | null) =>
  !confirmed
    ? "Not yet confirmed against the broker's balance for this period"
    : confirmed.isLater
      ? `Covered by a later check: the running balance equalled the broker's (${formatNumber(confirmed.check.balance)}) on ${clock(confirmed.check.time)}, which includes every transaction of this period`
      : `Balance confirmed equal to the broker's: ${formatNumber(confirmed.check.balance)} on ${clock(confirmed.check.time)}`;

// The statement itself, the same on screen, in the preview and on paper.
function StatementDocument({ statement, profile, confirmed }: { statement: Statement; profile: StatementProfile; confirmed: Confirmation | null }) {
  return (
    // Laid out by its own width, not the screen's: the A4 preview keeps its columns on a phone.
    <div className="@container">
      <div className="text-center mb-6">
        <h3 className="text-xl font-black text-stone-950 tracking-tight">Monthly Account Statement</h3>
        <p className="text-[11px] font-medium text-stone-400 mt-1">
          Prepared by the account holder from the broker&apos;s order history. Not issued by the broker.
        </p>
      </div>

      <div className="grid grid-cols-2 @2xl:grid-cols-5 gap-4 text-xs pb-5 mb-5 border-b border-stone-200">
        <div><p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Name</p><p className="font-bold text-stone-950">{profile.name || '-'}</p></div>
        <div><p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Broker</p><p className="font-bold text-stone-950">{profile.broker || '-'}</p></div>
        <div><p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Account</p><p className="font-bold text-stone-950">{profile.accountNo || '-'}</p></div>
        <div><p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Period</p><p className="font-bold text-stone-950">{MONTH_NAMES[statement.month - 1]} {statement.year}</p></div>
        <div><p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Currency</p><p className="font-bold text-stone-950">USD</p></div>
      </div>

      <h4 className="text-xs font-black text-stone-950 uppercase tracking-[0.2em] mb-3">Summary</h4>
      <div className="grid grid-cols-1 @2xl:grid-cols-2 gap-x-12 gap-y-4 text-xs mb-6">
        <div className="space-y-1.5">
          <div className="flex justify-between"><span className="font-bold text-stone-400">Opening balance</span><span className="font-bold text-stone-950">{formatNumber(statement.openingBalance)}</span></div>
          <div className="flex justify-between"><span className="font-bold text-stone-400">Deposits</span><span className="font-bold text-stone-950">{formatNumber(statement.deposits)}</span></div>
          <div className="flex justify-between"><span className="font-bold text-stone-400">Withdrawals</span><span className="font-bold text-stone-950">{signed(-statement.withdrawals)}</span></div>
          <div className="flex justify-between"><span className="font-bold text-stone-400">Closed trade P/L ({statement.tradeCount} trades)</span><span className="font-bold text-stone-950">{signed(statement.closedPnl)}</span></div>
          <div className="flex justify-between pt-1.5 border-t border-stone-200"><span className="font-black text-stone-950">Closing balance</span><span className="font-black text-stone-950">{formatNumber(statement.closingBalance)}</span></div>
        </div>
        <div className="space-y-1.5">
          <div className="flex justify-between"><span className="font-bold text-stone-400">Commission reported by broker</span><span className="font-bold text-stone-950">{formatNumber(statement.commission)}</span></div>
          <p className={`flex items-start gap-1.5 font-bold ${confirmed ? 'text-stone-500' : 'text-red-900'}`}>
            {confirmed ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5 text-orange-400" /> : <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />}
            {confirmationText(confirmed)}
          </p>
          <p className="font-medium text-stone-400">Times are Bangkok time (UTC+7), as exported from the broker&apos;s platform.</p>
        </div>
      </div>

      <h4 className="text-xs font-black text-stone-950 uppercase tracking-[0.2em] mb-3">Transactions</h4>
      {statement.rows.length === 0 ? (
        <p className="text-xs text-stone-400 font-medium">No transactions in this period.</p>
      ) : (
        <div className="overflow-x-auto print:overflow-visible border border-stone-100 rounded-xl print:rounded-none">
          <table className="w-full text-left whitespace-nowrap">
            <thead className="bg-stone-50 text-stone-400 border-b border-stone-100">
              <tr>
                <th className={TH_LEFT}>Close time</th>
                <th className={TH_LEFT}>Open time</th>
                <th className={TH_LEFT}>Type</th>
                <th className={TH_LEFT}>Position ID</th>
                <th className={TH_LEFT}>Symbol</th>
                <th className={TH}>Size</th>
                <th className={TH}>Open price</th>
                <th className={TH}>Close price</th>
                <th className={TH}>Amount</th>
                <th className={TH}>Balance</th>
              </tr>
            </thead>
            <tbody className="text-[11px] divide-y divide-stone-50">
              {statement.rows.map((r, i) => (
                <tr key={`${r.time}-${i}`} className={`break-inside-avoid ${r.kind === 'trade' ? '' : 'bg-stone-50 print:bg-transparent'}`}>
                  <td className={TD_LEFT}>{clock(r.time)}{r.timeIsEstimate && <span title="Close time estimated: the broker data did not state it exactly"> *</span>}</td>
                  <td className={TD_LEFT}>{clock(r.openTime)}</td>
                  <td className={`${TD_LEFT} ${r.kind === 'trade' ? '' : 'font-extrabold text-stone-950'}`}>{r.kind === 'trade' ? (r.side || '').toLowerCase() : r.kind}</td>
                  <td className={TD_LEFT}>{r.reference?.split(':').pop() || ''}</td>
                  <td className={TD_LEFT}>{r.symbol || ''}</td>
                  <td className={TD}>{r.size ?? ''}</td>
                  <td className={TD}>{r.entryPrice !== undefined ? r.entryPrice.toFixed(2) : ''}</td>
                  <td className={TD}>{r.exitPrice !== undefined ? r.exitPrice.toFixed(2) : ''}</td>
                  <td className={`${TD} font-extrabold text-stone-950`}>{signed(r.amount)}</td>
                  <td className={`${TD} text-stone-950`}>{formatNumber(r.balanceAfter)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {statement.rows.some(r => r.timeIsEstimate) && (
        <p className="text-[10px] font-medium text-stone-400 mt-2">* Close time estimated: the broker&apos;s export did not state it exactly for this trade.</p>
      )}
    </div>
  );
}

// A self-prepared monthly account statement in USD: what the broker no longer sends for accounts
// traded through TradingView. Meant to be saved as a PDF at each month end.
export default function StatementPage() {
  const { trades, funding, preferences, isLoading } = useJournalStore();
  const months = useMemo(() => statementMonths(trades, funding), [trades, funding]);
  const [selected, setSelected] = useState<string | null>(null); // "YYYY-M"; null = latest month
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isSavingPdf, setIsSavingPdf] = useState(false);
  useEscapeToClose(isPreviewOpen, () => setIsPreviewOpen(false));

  const current = useMemo(() => {
    const [year, month] = (selected ?? '').split('-').map(Number);
    return months.find(m => m.year === year && m.month === month) ?? months[0] ?? null;
  }, [selected, months]);

  const statement = useMemo(
    () => (current ? buildStatement(trades, funding, current.year, current.month) : null),
    [trades, funding, current],
  );

  const confirmed = useMemo((): Confirmation | null => {
    if (!current) return null;
    const monthEnd = lastDayOf(current.year, current.month);
    const checks = [...(preferences.balanceCheckHistory ?? [])];
    // The single check saved before the history existed still counts if it holds today.
    if (preferences.balanceCheck && !checks.some(c => c.time === preferences.balanceCheck!.time)) {
      const r = reconcileBalance(preferences.balanceCheck, trades, funding);
      checks.push({ ...preferences.balanceCheck, journalBalance: r.journalBalance, difference: r.difference });
    }
    const matched = checks.filter(c => c.difference === 0).sort((a, b) => a.time.localeCompare(b.time));
    const within = matched.filter(c => c.time <= monthEnd).pop();
    if (within) return { check: within, isLater: false };
    // The balance is cumulative: a later check that equals the broker's to the cent also covers
    // every transaction before it, this month included.
    const later = matched.find(c => c.time > monthEnd);
    return later ? { check: later, isLater: true } : null;
  }, [current, preferences, trades, funding]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-stone-500 font-semibold animate-pulse">Loading statement...</p>
      </div>
    );
  }

  const profile = preferences.statementProfile ?? {};
  const hasProfile = !!(profile.name && profile.accountNo);

  const handleCsv = () => {
    if (!statement) return;
    const blob = new Blob(['﻿' + statementCsv(statement, profile)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `statement-${statement.year}-${String(statement.month).padStart(2, '0')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Builds the PDF in the browser and saves it straight to a file, with no print window.
  const handleSavePdf = async () => {
    if (!statement) return;
    setIsSavingPdf(true);
    try {
      // Loaded on demand: the PDF library is large and only needed here.
      const { buildStatementPdf, statementFileName, hasUnprintableText } = await import("@/lib/statementPdf");
      if (hasUnprintableText(profile) && !confirm("The name, broker or account number contains characters the PDF file cannot show (for example Thai letters); they would appear as \"?\". Use Print instead to keep them.\n\nSave the PDF anyway?")) return;
      buildStatementPdf(statement, { profile, confirmation: confirmationText(confirmed) }).save(statementFileName(statement, 'pdf'));
    } catch (error) {
      console.error("Failed to build the PDF:", error);
      alert("Failed to create the PDF. Use Print instead.");
    } finally {
      setIsSavingPdf(false);
    }
  };

  return (
    <>
      {/* Only the preview is ever printed, so the page itself stays off the paper. */}
      <div className="space-y-6 print:hidden">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h2 className="text-3xl font-extrabold text-stone-950 tracking-tight">Monthly Statement</h2>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={current ? `${current.year}-${current.month}` : ''}
              onChange={(e) => setSelected(e.target.value)}
              disabled={months.length === 0}
              className="bg-white border border-stone-200 text-stone-950 text-xs font-bold rounded-xl px-4 py-2.5 focus:outline-none focus:border-stone-500"
            >
              {months.length === 0 && <option value="">No activity yet</option>}
              {months.map(m => (
                <option key={`${m.year}-${m.month}`} value={`${m.year}-${m.month}`}>{MONTH_NAMES[m.month - 1]} {m.year}</option>
              ))}
            </select>
            <button type="button" onClick={() => setIsPreviewOpen(true)} disabled={!statement}
              title="ดูตัวอย่างหน้ากระดาษก่อนพิมพ์หรือบันทึกเป็น PDF"
              className="px-5 py-2.5 bg-orange-400 hover:bg-orange-500 disabled:bg-orange-200 text-white font-bold rounded-xl transition shadow-lg shadow-orange-200 flex items-center gap-2 text-xs">
              <Eye className="w-4 h-4" /> Preview
            </button>
            <button type="button" onClick={handleCsv} disabled={!statement}
              className="px-4 py-2.5 bg-stone-100 hover:bg-stone-200 disabled:opacity-50 text-stone-600 font-bold rounded-xl transition flex items-center gap-2 text-xs">
              <Download className="w-4 h-4" /> CSV
            </button>
          </div>
        </div>

        {!hasProfile && (
          <p className="text-xs font-bold text-red-900 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            The account holder and account number are not set yet.
            <Link href="/settings" className="underline">Add them in Settings</Link>
          </p>
        )}

        <div className="glass-card p-4 md:p-8">
          {statement
            ? <StatementDocument statement={statement} profile={profile} confirmed={confirmed} />
            : <p className="text-sm text-stone-400 font-medium">No trades or funding yet.</p>}
        </div>
      </div>

      {isPreviewOpen && statement && (
        <div className="fixed inset-0 z-[100] bg-stone-300 overflow-auto print:static print:bg-white print:overflow-visible">
          {/* A4 landscape: the transactions table is too wide for a portrait page. */}
          <style>{`@page { size: A4 landscape; margin: 12mm; }`}</style>
          <div className="sticky top-0 left-0 z-10 bg-white border-b border-stone-200 px-3 md:px-6 py-3 flex items-center justify-end md:justify-between gap-4 print:hidden">
            <p className="hidden md:block text-xs font-bold text-stone-950">
              Preview · {MONTH_NAMES[statement.month - 1]} {statement.year}
              <span className="font-medium text-stone-400 ml-2">A4 landscape</span>
            </p>
            <div className="flex items-center gap-2 shrink-0">
              <button type="button" onClick={handleSavePdf} disabled={isSavingPdf}
                title="บันทึกเป็นไฟล์ PDF ลงเครื่องทันที ไม่ผ่านหน้าต่างพิมพ์"
                className="px-3 md:px-5 py-2.5 bg-orange-400 hover:bg-orange-500 disabled:bg-orange-200 text-white font-bold rounded-xl transition shadow-lg shadow-orange-200 flex items-center gap-2 text-xs">
                <FileDown className="w-4 h-4" /> {isSavingPdf ? "Saving..." : "Save as PDF"}
              </button>
              <button type="button" onClick={() => window.print()}
                title="เปิดหน้าต่างพิมพ์ของเบราว์เซอร์เพื่อพิมพ์ลงกระดาษ"
                className="px-4 py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-600 font-bold rounded-xl transition flex items-center gap-2 text-xs">
                <Printer className="w-4 h-4" /> Print
              </button>
              <button type="button" onClick={() => setIsPreviewOpen(false)}
                className="px-4 py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-600 font-bold rounded-xl transition flex items-center gap-2 text-xs">
                <X className="w-4 h-4" /> Close
              </button>
            </div>
          </div>
          <div className="bg-white w-[297mm] min-h-[210mm] p-[12mm] mx-auto my-8 shadow-xl print:w-auto print:min-h-0 print:p-0 print:m-0 print:shadow-none">
            <StatementDocument statement={statement} profile={profile} confirmed={confirmed} />
          </div>
        </div>
      )}
    </>
  );
}
