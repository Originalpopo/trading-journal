// The monthly statement as a real PDF file (selectable text, A4 landscape), so it can be saved
// with one click instead of going through the browser's print window.
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Statement, StatementProfile } from './statement.ts';

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const money = (value: number) => value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const clock = (time?: string) => (time ? time.replace('T', ' ') : '');

// The built-in PDF fonts only cover Latin characters; anything else would print as garbage.
export const pdfSafe = (text: string) => text.replace(/[^\x20-\x7E\xA0-\xFF]/g, '?');
export const hasUnprintableText = (profile: StatementProfile) =>
  [profile.name, profile.broker, profile.accountNo].some(v => !!v && pdfSafe(v) !== v);

export const statementFileName = (statement: Statement, extension: string) =>
  `statement-${statement.year}-${String(statement.month).padStart(2, '0')}.${extension}`;

export interface StatementPdfOptions {
  profile: StatementProfile;
  confirmation: string; // the line saying how the balance was checked against the broker
}

export function buildStatementPdf(statement: Statement, { profile, confirmation }: StatementPdfOptions): jsPDF {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 12;
  const period = `${MONTH_NAMES[statement.month - 1]} ${statement.year}`;

  doc.setFont('helvetica', 'bold').setFontSize(15).setTextColor(12, 10, 9);
  doc.text('Monthly Account Statement', pageWidth / 2, margin + 4, { align: 'center' });
  doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(120, 113, 108);
  doc.text("Prepared by the account holder from the broker's order history. Not issued by the broker.", pageWidth / 2, margin + 9, { align: 'center' });

  autoTable(doc, {
    startY: margin + 14,
    margin: { left: margin, right: margin },
    theme: 'plain',
    styles: { fontSize: 9, cellPadding: 1 },
    headStyles: { fontSize: 7, textColor: [120, 113, 108], fontStyle: 'bold' },
    bodyStyles: { fontStyle: 'bold', textColor: [12, 10, 9] },
    head: [['NAME', 'BROKER', 'ACCOUNT', 'PERIOD', 'CURRENCY']],
    body: [[pdfSafe(profile.name || '-'), pdfSafe(profile.broker || '-'), pdfSafe(profile.accountNo || '-'), period, 'USD']],
  });

  const afterHeader = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;
  autoTable(doc, {
    startY: afterHeader,
    margin: { left: margin, right: pageWidth / 2 + 4 },
    theme: 'plain',
    styles: { fontSize: 9, cellPadding: 1 },
    columnStyles: { 0: { textColor: [120, 113, 108] }, 1: { halign: 'right', fontStyle: 'bold', textColor: [12, 10, 9] } },
    body: [
      ['Opening balance', money(statement.openingBalance)],
      ['Deposits', money(statement.deposits)],
      ['Withdrawals', money(-statement.withdrawals)],
      [`Closed trade P/L (${statement.tradeCount} trades)`, money(statement.closedPnl)],
      ['Closing balance', money(statement.closingBalance)],
    ],
    didParseCell: (data) => {
      if (data.row.index === 4) { data.cell.styles.fontStyle = 'bold'; data.cell.styles.textColor = [12, 10, 9]; }
    },
  });
  const afterSummary = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(120, 113, 108);
  const rightX = pageWidth / 2 + 8;
  const rightWidth = pageWidth - margin - rightX;
  doc.text('Commission reported by broker', rightX, afterHeader + 4);
  doc.setFont('helvetica', 'bold').setTextColor(12, 10, 9);
  doc.text(money(statement.commission), pageWidth - margin, afterHeader + 4, { align: 'right' });
  doc.setFont('helvetica', 'bold').setFontSize(8).setTextColor(87, 83, 78);
  const confirmationLines: string[] = doc.splitTextToSize(pdfSafe(confirmation), rightWidth);
  doc.text(confirmationLines, rightX, afterHeader + 10);
  doc.setFont('helvetica', 'normal').setTextColor(120, 113, 108);
  doc.text("Times are Bangkok time (UTC+7), as exported from the broker's platform.", rightX, afterHeader + 10 + confirmationLines.length * 4 + 1);

  autoTable(doc, {
    startY: afterSummary + 8,
    margin: { left: margin, right: margin, bottom: margin + 4 },
    theme: 'striped',
    styles: { fontSize: 8, cellPadding: 1.6, textColor: [68, 64, 60] },
    headStyles: { fillColor: [245, 245, 244], textColor: [120, 113, 108], fontSize: 7, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [255, 255, 255] },
    columnStyles: { 5: { halign: 'right' }, 6: { halign: 'right' }, 7: { halign: 'right' }, 8: { halign: 'right', fontStyle: 'bold', textColor: [12, 10, 9] }, 9: { halign: 'right', textColor: [12, 10, 9] } },
    head: [['CLOSE TIME', 'OPEN TIME', 'TYPE', 'POSITION ID', 'SYMBOL', 'SIZE', 'OPEN PRICE', 'CLOSE PRICE', 'AMOUNT', 'BALANCE']],
    body: statement.rows.length === 0
      ? [[{ content: 'No transactions in this period.', colSpan: 10 }]]
      : statement.rows.map(r => [
          clock(r.time) + (r.timeIsEstimate ? ' *' : ''),
          clock(r.openTime),
          r.kind === 'trade' ? (r.side || '').toLowerCase() : r.kind,
          r.reference?.split(':').pop() || '',
          r.symbol || '',
          r.size !== undefined ? String(r.size) : '',
          r.entryPrice !== undefined ? r.entryPrice.toFixed(2) : '',
          r.exitPrice !== undefined ? r.exitPrice.toFixed(2) : '',
          money(r.amount),
          money(r.balanceAfter),
        ]),
    didParseCell: (data) => {
      const row = statement.rows[data.row.index];
      if (data.section === 'body' && row && row.kind !== 'trade') {
        data.cell.styles.fillColor = [245, 245, 244];
        data.cell.styles.fontStyle = 'bold';
      }
      if (data.section === 'head' && data.column.index >= 5) data.cell.styles.halign = 'right';
    },
  });

  if (statement.rows.some(r => r.timeIsEstimate)) {
    const y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;
    doc.setFont('helvetica', 'normal').setFontSize(7).setTextColor(120, 113, 108);
    doc.text("* Close time estimated: the broker's export did not state it exactly for this trade.", margin, y);
  }

  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    doc.setFont('helvetica', 'normal').setFontSize(7).setTextColor(120, 113, 108);
    doc.text(`${pdfSafe(profile.accountNo || '')}  ${period}`, margin, doc.internal.pageSize.getHeight() - 7);
    doc.text(`Page ${page} of ${pages}`, pageWidth - margin, doc.internal.pageSize.getHeight() - 7, { align: 'right' });
  }

  return doc;
}
