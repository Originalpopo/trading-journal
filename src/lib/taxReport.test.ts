import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTaxReport, taxReportCsv } from './taxReport.ts';

// Deposit 1,000 USD for 35,000 baht, make 500 USD, withdraw 600 USD and receive 21,000 baht.
const deposit = { time: '2026-01-05T09:00:00', deposit: 1000, withdraw: 0, thb: 35000, bankDate: '2026-01-05' };
const profit = { time: '2026-03-01T10:00:00', profit: 500 };
const withdraw600 = { time: '2026-06-01T09:00:00', deposit: 0, withdraw: 600, thb: 21000, bankDate: '2026-06-02' };

test('principal first: a withdrawal within the baht sent out is all principal', () => {
  const r = buildTaxReport([profit], [deposit, withdraw600]);
  assert.deepEqual(r.withdrawals[0].principalFirst, { principal: 21000, profit: 0 });
  assert.equal(r.principalLeftThb.principalFirst, 14000);
  assert.equal(r.years[0].profitBroughtInThb.principalFirst, 0);
});

test('principal first: profit starts once all the baht principal is back', () => {
  const second = { time: '2026-07-01T09:00:00', deposit: 0, withdraw: 500, thb: 17500, bankDate: '2026-07-01' };
  const r = buildTaxReport([profit], [deposit, withdraw600, second]);
  assert.deepEqual(r.withdrawals[1].principalFirst, { principal: 14000, profit: 3500 });
  assert.equal(r.principalLeftThb.principalFirst, 0);
  assert.equal(r.years[0].profitBroughtInThb.principalFirst, 3500);
});

test('pro rata: withdrawing 600 of a 1,500 account takes 40% of the principal', () => {
  const r = buildTaxReport([profit], [deposit, withdraw600]);
  // 40% of 35,000 baht principal = 14,000; the other 7,000 received is profit.
  assert.deepEqual(r.withdrawals[0].proRata, { principal: 14000, profit: 7000 });
  assert.equal(r.principalLeftThb.proRata, 21000);
  assert.equal(r.years[0].profitBroughtInThb.proRata, 7000);
});

test('pro rata: receiving less than the principal share is not negative income', () => {
  const loss = { time: '2026-03-01T10:00:00', profit: -500 };
  const all = { time: '2026-06-01T09:00:00', deposit: 0, withdraw: 500, thb: 17000, bankDate: '2026-06-01' };
  const r = buildTaxReport([loss], [deposit, all]);
  assert.deepEqual(r.withdrawals[0].proRata, { principal: 35000, profit: 0 });
  assert.deepEqual(r.withdrawals[0].principalFirst, { principal: 17000, profit: 0 });
  assert.equal(r.principalLeftThb.proRata, 0);
});

test('the rate is what the transfer actually gave', () => {
  const w = { time: '2026-06-01T09:00:00', deposit: 0, withdraw: 1000, thb: 33520, bankDate: '2026-06-01' };
  const r = buildTaxReport([{ time: '2026-03-01T10:00:00', profit: 2000 }], [deposit, w]);
  assert.equal(r.withdrawals[0].rate, 33.52);
});

test('the bank date decides the tax year, the broker time decides the balance', () => {
  const lateDec = { time: '2026-12-31T20:00:00', deposit: 0, withdraw: 600, thb: 21000, bankDate: '2027-01-02' };
  const r = buildTaxReport([profit], [deposit, lateDec]);
  assert.equal(r.withdrawals[0].taxYear, 2027);
  const [y2026, y2027] = r.years;
  assert.equal(y2026.withdrawThb, 0);
  assert.equal(y2026.endBalanceUsd, 900); // the broker already paid it out in 2026
  assert.equal(y2027.withdrawThb, 21000);
  assert.equal(y2027.withdrawUsd, 600);
  assert.equal(y2027.startBalanceUsd, 900);
  assert.equal(y2027.profitBroughtInThb.proRata, 7000);
});

test('yearly summary: balances chain and P&L is exact', () => {
  const trades = [
    { time: '2026-02-01T10:00:00', profit: 0.1, commission: 0.03 },
    { time: '2026-02-02T10:00:00', profit: 0.2, commission: 0.04 },
    { time: '2027-02-02T10:00:00', profit: -50 },
  ];
  const r = buildTaxReport(trades, [deposit]);
  const [y2026, y2027] = r.years;
  assert.equal(y2026.startBalanceUsd, 0);
  assert.equal(y2026.depositUsd, 1000);
  assert.equal(y2026.depositThb, 35000);
  assert.equal(y2026.tradingPnlUsd, 0.3);
  assert.equal(y2026.commissionUsd, 0.07);
  assert.equal(y2026.tradeCount, 2);
  assert.equal(y2026.endBalanceUsd, 1000.3);
  assert.equal(y2027.startBalanceUsd, 1000.3);
  assert.equal(y2027.endBalanceUsd, 950.3);
});

test('a year with no activity between two active years still gets a row', () => {
  const r = buildTaxReport([{ time: '2028-02-02T10:00:00', profit: 5 }], [deposit]);
  assert.deepEqual(r.years.map(y => y.year), [2026, 2027, 2028]);
  assert.equal(r.years[1].startBalanceUsd, 1000);
  assert.equal(r.years[1].endBalanceUsd, 1000);
});

test('missing baht amounts are counted and leave the split empty instead of guessing', () => {
  const noThbDeposit = { time: '2026-01-05T09:00:00', deposit: 1000, withdraw: 0 };
  const noThbWithdraw = { time: '2026-06-01T09:00:00', deposit: 0, withdraw: 600 };
  const r = buildTaxReport([profit], [noThbDeposit, noThbWithdraw]);
  assert.equal(r.isComplete, false);
  assert.equal(r.depositsMissingThb, 1);
  assert.equal(r.withdrawalsMissingThb, 1);
  assert.equal(r.withdrawals[0].thb, null);
  assert.equal(r.withdrawals[0].principalFirst, null);
  assert.equal(r.withdrawals[0].proRata, null);
  assert.equal(r.years[0].missingThb, 2);
  assert.equal(r.years[0].endBalanceUsd, 900);
});

test('a complete record is marked complete', () => {
  assert.equal(buildTaxReport([profit], [deposit, withdraw600]).isComplete, true);
});

test('no data gives an empty report', () => {
  const r = buildTaxReport([], []);
  assert.deepEqual(r.years, []);
  assert.deepEqual(r.withdrawals, []);
  assert.equal(r.isComplete, true);
});

test('CSV has the yearly table and the withdrawal table', () => {
  const csv = taxReportCsv(buildTaxReport([profit], [deposit, withdraw600]));
  const lines = csv.split('\n');
  assert.ok(lines[0].startsWith('Year,Start balance USD'));
  assert.equal(lines[1], '2026,0.00,1000.00,35000.00,600.00,21000.00,500.00,1,0.00,900.00,0.00,7000.00,0');
  assert.equal(lines[2], '');
  assert.equal(lines[4], '2026-06-01T09:00:00,2026-06-02,2026,600.00,21000.00,35.0000,21000.00,0.00,14000.00,7000.00');
});

test('approximate rate: the latest real transfer up to the end of each year', () => {
  const later = { time: '2027-06-01T09:00:00', deposit: 0, withdraw: 100, thb: 3300, bankDate: '2027-06-01' };
  const r = buildTaxReport([profit, { time: '2028-01-05T10:00:00', profit: 1 }], [deposit, withdraw600, later]);
  const [y2026, y2027, y2028] = r.years;
  assert.deepEqual(y2026.approxRate, { rate: 35, date: '2026-06-02', kind: 'withdrawal' });
  assert.deepEqual(y2027.approxRate, { rate: 33, date: '2027-06-01', kind: 'withdrawal' });
  assert.deepEqual(y2028.approxRate, { rate: 33, date: '2027-06-01', kind: 'withdrawal' }); // nothing newer
});

test('approximate rate: none until a transfer has a baht amount, and never in the CSV', () => {
  const r = buildTaxReport([profit], [{ time: '2026-01-05T09:00:00', deposit: 1000, withdraw: 0 }]);
  assert.equal(r.years[0].approxRate, null);
  assert.ok(!/approx/i.test(taxReportCsv(buildTaxReport([profit], [deposit, withdraw600]))));
});
