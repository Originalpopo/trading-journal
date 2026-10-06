"use client";

import { useMemo } from "react";
import { AlertTriangle, CheckCircle2, Download } from "lucide-react";
import { useJournalStore } from "@/store/useJournalStore";
import { buildTaxReport, taxReportCsv, estimateIncomeTax, withdrawalSetAsides, type SplitMethod } from "@/lib/taxReport";
import { formatNumber } from "@/lib/utils";

const TH_BASE = "px-4 py-4 font-bold uppercase text-[10px] tracking-widest";
const TH = `${TH_BASE} text-right`;
const TH_LEFT = `${TH_BASE} text-left`;
const TH_GROUP = "px-4 pt-3 pb-1 font-bold uppercase text-[10px] tracking-widest text-center";
const TH_SUB = "px-4 pt-1 pb-3 font-bold uppercase text-[10px] tracking-widest text-right";
const TD = "px-4 py-4 text-right font-bold text-stone-500";

// Principal first is the method the account owner files with; pro rata is a greyed-out reference.
// Thai explanations shown when the pointer rests on a column name.
const TIP_PRINCIPAL_FIRST = "เงินต้นออกก่อน: ถือว่าเงินบาทที่ถอนกลับมาเป็นเงินต้นก่อน จนกว่าจะได้เงินต้นที่เคยส่งออกไปคืนครบ ส่วนที่เกินจากนั้นจึงนับเป็นกำไร";
const TIP_PRO_RATA = "ตามสัดส่วน: ถือว่าเงินที่ถอนมีเงินต้นและกำไรปนกันตามสัดส่วนของพอร์ต เช่น ถอน 40% ของพอร์ต ก็ถือว่าเอาเงินต้นออกมา 40% เงินบาทที่ได้รับเกินจากนั้นนับเป็นกำไร";
const TIP_TAX_ESTIMATE = "ยอดที่ควรกันไว้จ่ายภาษีของปีนั้น (โดยประมาณ ไม่ใช่ยอดที่ต้องจ่ายจริง): คิดจากคอลัมน์ Principal 1st ด้วยอัตราก้าวหน้า (150,000 บาทแรกยกเว้น แล้ว 5% 10% 15% 20% 25% 30% 35% ตามขั้น) นับเฉพาะกำไรจากการเทรด ไม่รวมรายได้อื่น ค่าใช้จ่าย หรือค่าลดหย่อน และไม่อยู่ในไฟล์ CSV";
const TIP_SET_ASIDE = "ควรกันจากการถอนครั้งนี้: ภาษีโดยประมาณของปีที่เพิ่มขึ้นเพราะการถอนครั้งนี้ รวมทุกครั้งในปีเดียวกันจะเท่ากับช่อง Est. tax ของปีนั้น ไม่อยู่ในไฟล์ CSV";
const TIP_PROFIT_IN = "กำไรที่นำเข้าไทย (บาท): ยอดที่ใช้ยื่นภาษีของปีนั้น นับตามวันที่เงินเข้าบัญชีธนาคารไทย เลือกใช้วิธีเดียวและใช้วิธีเดิมทุกปี";

// A column name that explains itself when the pointer rests on it.
function Hint({ text, children }: { text: string; children: React.ReactNode }) {
  return <span title={text} className="cursor-help">{children}</span>;
}

export default function ReportPage() {
  const { trades, funding, isLoading, isPrivacyMode } = useJournalStore();
  const report = useMemo(() => buildTaxReport(trades, funding), [trades, funding]);

  const usd = (value: number) => (isPrivacyMode ? '***' : `${value < 0 ? '-' : ''}$${formatNumber(Math.abs(value))}`);
  const thb = (value: number | null | undefined) =>
    value === null || value === undefined ? '-' : isPrivacyMode ? '***' : `฿${formatNumber(value)}`;

  // A rough baht value for money still at the broker, at the rate of the latest real transfer.
  const approx = (value: number, rate: { rate: number } | null) =>
    rate === null ? null : (
      <><br /><span className="text-[9px] font-medium text-stone-400 opacity-70">{isPrivacyMode ? '***' : `≈${value < 0 ? '-' : ''}฿${formatNumber(Math.abs(value) * rate.rate)}`}</span></>
    );
  const setAsides = useMemo(() => withdrawalSetAsides(report.withdrawals), [report]);
  const latestRate = report.years.length > 0 ? report.years[report.years.length - 1].approxRate : null;

  const handleExport = (method: SplitMethod) => {
    // The BOM makes Excel read the file as UTF-8.
    const blob = new Blob(['﻿' + taxReportCsv(report, method)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `trading-tax-report-${method === 'principalFirst' ? 'principal-first' : 'pro-rata'}-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-stone-500 font-semibold animate-pulse">Loading report...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-3xl font-extrabold text-stone-950 tracking-tight">Tax Report</h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => handleExport('principalFirst')}
            disabled={report.years.length === 0}
            title="ไฟล์ CSV ที่แบ่งเงินต้น/กำไรแบบเงินต้นออกก่อน (วิธีหลัก)"
            className="px-6 py-2.5 bg-orange-400 hover:bg-orange-500 disabled:bg-orange-200 text-white font-bold rounded-xl transition shadow-lg shadow-orange-200 flex items-center gap-2 text-xs"
          >
            <Download className="w-4 h-4" />
            CSV · Principal 1st
          </button>
          <button
            type="button"
            onClick={() => handleExport('proRata')}
            disabled={report.years.length === 0}
            title="ไฟล์ CSV ที่แบ่งเงินต้น/กำไรแบบตามสัดส่วน (ไว้เทียบ)"
            className="px-4 py-2.5 bg-stone-100 hover:bg-stone-200 disabled:opacity-50 text-stone-600 font-bold rounded-xl transition flex items-center gap-2 text-xs"
          >
            <Download className="w-4 h-4" />
            CSV · Pro rata
          </button>
        </div>
      </div>

      {report.isComplete ? (
        <p className="text-xs font-bold text-orange-400 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" /> Every deposit and withdrawal has its baht amount.
        </p>
      ) : (
        <div className="text-xs p-4 rounded-xl border bg-red-50 text-red-900 border-red-200">
          <p className="font-bold flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            Baht amounts are missing, so the principal and profit figures below are not final
          </p>
          <ul className="font-medium mt-2 ml-6 list-disc space-y-1">
            {report.depositsMissingThb > 0 && (
              <li>
                {`${report.depositsMissingThb} ${report.depositsMissingThb > 1 ? 'deposits have' : 'deposit has'} no "Baht paid": that`}{' '}
                principal is not counted, which overstates profit.
              </li>
            )}
            {report.withdrawalsMissingThb > 0 && (
              <li>
                {`${report.withdrawalsMissingThb} ${report.withdrawalsMissingThb > 1 ? 'withdrawals have' : 'withdrawal has'} no "Baht`}{' '}
                received&quot;: they cannot be split into principal and profit.
              </li>
            )}
            <li>Open the entry in History, click edit, and fill in the amount from the bank slip.</li>
          </ul>
        </div>
      )}

      <div className="glass-card p-6">
        <h3 className="text-xs font-black text-stone-950 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
          <span className="w-2 h-2 bg-orange-400 rounded-full"></span> By Year
        </h3>
        {report.years.length === 0 ? (
          <p className="text-sm text-stone-400 font-medium">No trades or funding yet.</p>
        ) : (
          <div className="overflow-x-auto border border-stone-100 rounded-xl">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-stone-50 text-stone-400 border-b border-stone-100">
                <tr>
                  <th rowSpan={2} className={TH_LEFT}>Year</th>
                  <th rowSpan={2} className={TH}>Start</th>
                  <th rowSpan={2} className={TH}>Deposits</th>
                  <th rowSpan={2} className={TH}>Withdrawals</th>
                  <th rowSpan={2} className={TH}>P&L</th>
                  <th rowSpan={2} className={TH}>Trades</th>
                  <th rowSpan={2} className={TH}>Comm.</th>
                  <th rowSpan={2} className={TH}>End</th>
                  <th colSpan={2} className={`${TH_GROUP} border-l border-stone-100`}><Hint text={TIP_PROFIT_IN}>Taxable profit (฿)</Hint></th>
                  <th rowSpan={2} className={`${TH} border-l border-stone-100`}><Hint text={TIP_TAX_ESTIMATE}>Est. tax (฿)</Hint></th>
                </tr>
                <tr>
                  <th className={`${TH_SUB} border-l border-stone-100`}><Hint text={TIP_PRINCIPAL_FIRST}>Principal 1st</Hint></th>
                  <th className={`${TH_SUB} text-stone-300`}><Hint text={TIP_PRO_RATA}>Pro rata</Hint></th>
                </tr>
              </thead>
              <tbody className="text-[11px] divide-y divide-stone-50">
                {report.years.map(y => (
                  <tr key={y.year} className="hover:bg-stone-50 transition">
                    <td className="px-4 py-4 font-extrabold text-stone-950">
                      {y.year}
                      {y.missingThb > 0 && (
                        <span className="ml-2 text-[9px] font-bold text-red-900" title="Entries of this year without a baht amount">
                          {y.missingThb} missing ฿
                        </span>
                      )}
                    </td>
                    <td className={TD}>{usd(y.startBalanceUsd)}</td>
                    <td className={TD}>{usd(y.depositUsd)}<br /><span className="text-[9px] opacity-70">{thb(y.depositThb)}</span></td>
                    <td className={TD}>{usd(y.withdrawUsd)}<br /><span className="text-[9px] opacity-70">{thb(y.withdrawThb)}</span></td>
                    <td className={`px-4 py-4 text-right font-extrabold ${y.tradingPnlUsd > 0 ? 'text-orange-400' : y.tradingPnlUsd < 0 ? 'text-red-900' : 'text-stone-400'}`}>
                      {usd(y.tradingPnlUsd)}{approx(y.tradingPnlUsd, y.approxRate)}
                    </td>
                    <td className={TD}>{y.tradeCount}</td>
                    <td className={TD}>{usd(y.commissionUsd)}{approx(y.commissionUsd, y.approxRate)}</td>
                    <td className={`${TD} text-stone-950`}>{usd(y.endBalanceUsd)}{approx(y.endBalanceUsd, y.approxRate)}</td>
                    <td className={`${TD} text-stone-950 font-extrabold border-l border-stone-100`}>{thb(y.profitBroughtInThb.principalFirst)}</td>
                    <td className={`${TD} text-stone-300`}>{thb(y.profitBroughtInThb.proRata)}</td>
                    <td className={`${TD} border-l border-stone-100 font-medium text-stone-400`}>
                      {isPrivacyMode ? '***' : `≈฿${formatNumber(estimateIncomeTax(y.profitBroughtInThb.principalFirst))}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-[11px] text-stone-400 font-medium mt-3">
          Baht principal still abroad: {thb(report.principalLeftThb.principalFirst)}. Principal 1st is the method this journal goes by;
          pro rata ({thb(report.principalLeftThb.proRata)} still abroad) is shown in grey for comparison only.
          {latestRate && (
            <>
              <br />
              ≈ amounts are rough estimates at {latestRate.rate.toFixed(4)} THB per USD, the rate of your {latestRate.kind} on {latestRate.date}
              {report.years.length > 1 && ' (earlier years use the last transfer of that year)'}. They are not real baht and not for filing.
            </>
          )}
        </p>
      </div>

      <div className="glass-card p-6">
        <h3 className="text-xs font-black text-stone-950 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
          <span className="w-2 h-2 bg-orange-400 rounded-full"></span> Withdrawals
        </h3>
        {report.withdrawals.length === 0 ? (
          <p className="text-sm text-stone-400 font-medium">No withdrawals yet, so no profit has been brought into Thailand.</p>
        ) : (
          <div className="overflow-x-auto border border-stone-100 rounded-xl">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-stone-50 text-stone-400 border-b border-stone-100">
                <tr>
                  <th className={TH_LEFT}>Bank date</th>
                  <th className={TH}>Tax year</th>
                  <th className={TH}>USD</th>
                  <th className={TH}>Baht received</th>
                  <th className={TH}>Rate</th>
                  <th className={TH}><Hint text={TIP_PRINCIPAL_FIRST + " (ตัวเลขแสดงเป็น เงินต้น / กำไร)"}>Principal 1st</Hint></th>
                  <th className={`${TH} text-stone-300`}><Hint text={TIP_PRO_RATA + " (ตัวเลขแสดงเป็น เงินต้น / กำไร)"}>Pro rata</Hint></th>
                  <th className={`${TH} border-l border-stone-100`}><Hint text={TIP_SET_ASIDE}>Set aside (฿)</Hint></th>
                </tr>
              </thead>
              <tbody className="text-[11px] divide-y divide-stone-50">
                {report.withdrawals.map((w, i) => (
                  <tr key={`${w.time}-${i}`} className="hover:bg-stone-50 transition">
                    <td className="px-4 py-4 font-semibold text-stone-500 leading-tight">
                      {w.bankDate}<br /><span className="text-[9px] opacity-70">broker {w.time.replace('T', ' ')}</span>
                    </td>
                    <td className={`${TD} text-stone-950`}>{w.taxYear}</td>
                    <td className={TD}>{usd(w.usd)}</td>
                    <td className={`${TD} ${w.thb === null ? 'text-red-900' : ''}`}>{w.thb === null ? 'Not entered yet' : thb(w.thb)}</td>
                    <td className={TD}>{w.rate === null ? '-' : w.rate.toFixed(4)}</td>
                    <td className={TD}>
                      {w.principalFirst ? <>{thb(w.principalFirst.principal)} / <span className="text-stone-950">{thb(w.principalFirst.profit)}</span></> : '-'}
                    </td>
                    <td className={TD}>
                      {w.proRata ? <span className="text-stone-300">{thb(w.proRata.principal)} / {thb(w.proRata.profit)}</span> : '-'}
                    </td>
                    <td className={`${TD} border-l border-stone-100 font-medium text-stone-400`}>
                      {setAsides[i] === null ? '-' : isPrivacyMode ? '***' : `≈฿${formatNumber(setAsides[i]!)}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
