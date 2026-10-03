import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildStatement } from './statement.ts';
import { buildStatementPdf, pdfSafe, hasUnprintableText, statementFileName } from './statementPdf.ts';

const funding = [{ time: '2026-09-22T10:00:00', deposit: 25.23, withdraw: 0 }];
const trades = Array.from({ length: 60 }, (_, i) => ({
  time: `2026-09-${String(23 + (i % 7)).padStart(2, '0')}T10:${String(i).padStart(2, '0')}:00`,
  entryTime: `2026-09-${String(23 + (i % 7)).padStart(2, '0')}T09:${String(i).padStart(2, '0')}:00`,
  positionId: `XAUUSD:${1000 + i}`, symbol: 'XAUUSD', side: i % 2 ? 'BUY' : 'SELL',
  entryPrice: 4000 + i, exitPrice: 4001 + i, profit: i % 3 ? -0.5 : 1.25,
  exitTimeConfidence: i === 5 ? 'estimated' : 'exact',
}));

const options = { profile: { name: 'Test Name', broker: 'Broker', accountNo: '123' }, confirmation: 'Balance confirmed equal to the broker\'s: 10.00 on 2026-10-03 10:53:16' };

test('builds a PDF file with every transaction, spilling onto more pages when needed', () => {
  const statement = buildStatement(trades, funding, 2026, 9);
  const doc = buildStatementPdf(statement, options);
  const bytes = Buffer.from(doc.output('arraybuffer'));
  assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
  assert.ok(doc.getNumberOfPages() >= 2, `pages ${doc.getNumberOfPages()}`);
  const text = bytes.toString('latin1');
  assert.ok(text.includes('Monthly Account Statement'));
  assert.ok(text.includes('Test Name'));
  assert.ok(text.includes('1000') && text.includes('1059'), 'first and last position IDs are present');
  assert.ok(text.includes('Page 1 of'));
});

test('an empty month still produces a one-page PDF', () => {
  const doc = buildStatementPdf(buildStatement(trades, funding, 2026, 11), options);
  assert.equal(doc.getNumberOfPages(), 1);
  assert.ok(Buffer.from(doc.output('arraybuffer')).toString('latin1').includes('No transactions in this period.'));
});

test('text the PDF font cannot draw is detected and replaced, never printed as garbage', () => {
  assert.equal(pdfSafe('Thana Pechmak'), 'Thana Pechmak');
  assert.equal(pdfSafe('ธนา P'), '??? P');
  assert.equal(hasUnprintableText({ name: 'Thana', broker: 'Eightcap', accountNo: '70518689' }), false);
  assert.equal(hasUnprintableText({ name: 'ธนา' }), true);
});

test('file names carry the period', () => {
  assert.equal(statementFileName(buildStatement(trades, funding, 2026, 9), 'pdf'), 'statement-2026-09.pdf');
});
