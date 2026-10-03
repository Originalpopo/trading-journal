import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTaxReport, taxReportCsv, estimateIncomeTax, withdrawalSetAsides } from './taxReport.ts';

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

test('CSV carries one split method: principal first', () => {
  const lines = taxReportCsv(buildTaxReport([profit], [deposit, withdraw600]), 'principalFirst').split('\n');
  assert.ok(lines[0].endsWith('End balance USD,Profit brought in THB (principal first),Entries missing THB'));
  assert.equal(lines[1], '2026,0.00,1000.00,35000.00,600.00,21000.00,500.00,1,0.00,900.00,0.00,0');
  assert.equal(lines[2], '');
  assert.ok(lines[3].endsWith('Principal THB (principal first),Profit THB (principal first)'));
  assert.equal(lines[4], '2026-06-01T09:00:00,2026-06-02,2026,600.00,21000.00,35.0000,21000.00,0.00');
  assert.equal(lines[6], 'Baht principal still abroad (principal first),14000.00');
  assert.ok(!lines.join('\n').includes('pro rata'));
});

test('CSV carries one split method: pro rata', () => {
  const lines = taxReportCsv(buildTaxReport([profit], [deposit, withdraw600]), 'proRata').split('\n');
  assert.equal(lines[1], '2026,0.00,1000.00,35000.00,600.00,21000.00,500.00,1,0.00,900.00,7000.00,0');
  assert.equal(lines[4], '2026-06-01T09:00:00,2026-06-02,2026,600.00,21000.00,35.0000,14000.00,7000.00');
  assert.equal(lines[6], 'Baht principal still abroad (pro rata),21000.00');
  assert.ok(!lines.join('\n').includes('principal first'));
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
  for (const method of ['principalFirst', 'proRata'] as const) {
    assert.ok(!/approx/i.test(taxReportCsv(buildTaxReport([profit], [deposit, withdraw600]), method)));
  }
});

test('estimateIncomeTax: the worked example, 600,000 baht gives 42,500', () => {
  // 150,000 at 0% + 150,000 at 5% (7,500) + 200,000 at 10% (20,000) + 100,000 at 15% (15,000)
  assert.equal(estimateIncomeTax(600_000), 42_500);
});

test('estimateIncomeTax: nothing up to 150,000, and each step boundary adds up', () => {
  assert.equal(estimateIncomeTax(0), 0);
  assert.equal(estimateIncomeTax(-5_000), 0);
  assert.equal(estimateIncomeTax(150_000), 0);
  assert.equal(estimateIncomeTax(150_001), 0.05);
  assert.equal(estimateIncomeTax(300_000), 7_500);
  assert.equal(estimateIncomeTax(500_000), 27_500);
  assert.equal(estimateIncomeTax(750_000), 65_000);
  assert.equal(estimateIncomeTax(1_000_000), 115_000);
  assert.equal(estimateIncomeTax(2_000_000), 365_000);
  assert.equal(estimateIncomeTax(5_000_000), 1_265_000);
  assert.equal(estimateIncomeTax(6_000_000), 1_615_000); // the part above 5,000,000 at 35%
});

test('estimateIncomeTax keeps satang exact', () => {
  assert.equal(estimateIncomeTax(200_000.5), 2_500.03); // 50,000.50 at 5% = 2,500.025, rounded
  assert.equal(estimateIncomeTax(830.29), 0);
});

test('the tax estimate never appears in the CSV', () => {
  const report = buildTaxReport([{ time: '2026-03-01T10:00:00', profit: 50_000 }], [
    { time: '2026-01-05T09:00:00', deposit: 1000, withdraw: 0, thb: 35_000, bankDate: '2026-01-05' },
    { time: '2026-06-01T09:00:00', deposit: 0, withdraw: 40_000, thb: 1_400_000, bankDate: '2026-06-01' },
  ]);
  assert.equal(report.years[0].profitBroughtInThb.principalFirst, 1_365_000);
  assert.equal(estimateIncomeTax(1_365_000), 206_250);
  for (const method of ['principalFirst', 'proRata'] as const) {
    const csv = taxReportCsv(report, method);
    assert.ok(!/tax est|estimate|206250|206,250/i.test(csv), method);
  }
});

test('withdrawalSetAsides: each withdrawal carries the tax it adds, and a year sums to its estimate', () => {
  // 35,000 baht principal, then three withdrawals in 2026 and one in 2027.
  const report = buildTaxReport([{ time: '2026-02-01T10:00:00', profit: 60_000 }], [
    { time: '2026-01-05T09:00:00', deposit: 1000, withdraw: 0, thb: 35_000, bankDate: '2026-01-05' },
    { time: '2026-03-01T09:00:00', deposit: 0, withdraw: 5_000, thb: 175_000, bankDate: '2026-03-01' }, // 140,000 profit
    { time: '2026-06-01T09:00:00', deposit: 0, withdraw: 5_000, thb: 160_000, bankDate: '2026-06-01' }, // 300,000 so far
    { time: '2026-09-01T09:00:00', deposit: 0, withdraw: 9_000, thb: 300_000, bankDate: '2026-09-01' }, // 600,000 so far
    { time: '2026-12-30T09:00:00', deposit: 0, withdraw: 6_000, thb: 200_000, bankDate: '2027-01-02' }, // first of 2027
  ]);
  assert.deepEqual(report.withdrawals.map(w => w.principalFirst!.profit), [140_000, 160_000, 300_000, 200_000]);
  const setAsides = withdrawalSetAsides(report.withdrawals);
  // 140,000 is inside the exempt step; the next takes the year to 300,000 (7,500), then 600,000 (42,500).
  assert.deepEqual(setAsides, [0, 7_500, 35_000, 2_500]);
  assert.equal(setAsides[0]! + setAsides[1]! + setAsides[2]!, estimateIncomeTax(report.years[0].profitBroughtInThb.principalFirst));
  assert.equal(setAsides[3], estimateIncomeTax(report.years[1].profitBroughtInThb.principalFirst));
});

test('withdrawalSetAsides: a withdrawal without a baht amount has no figure and does not shift the others', () => {
  const report = buildTaxReport([{ time: '2026-02-01T10:00:00', profit: 60_000 }], [
    { time: '2026-01-05T09:00:00', deposit: 1000, withdraw: 0, thb: 35_000, bankDate: '2026-01-05' },
    { time: '2026-03-01T09:00:00', deposit: 0, withdraw: 5_000 },
    { time: '2026-06-01T09:00:00', deposit: 0, withdraw: 10_000, thb: 335_000, bankDate: '2026-06-01' },
  ]);
  assert.deepEqual(withdrawalSetAsides(report.withdrawals), [null, 7_500]);
});
