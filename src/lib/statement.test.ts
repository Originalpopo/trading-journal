import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildStatement, statementMonths, statementCsv, DEFAULT_LOT_SIZE } from './statement.ts';

const funding = [
  { time: '2026-09-22T10:00:00', deposit: 25.23, withdraw: 0 },
  { time: '2026-10-20T09:00:00', deposit: 0, withdraw: 30 },
];
const trades = [
  { time: '2026-09-23T11:00:00', entryTime: '2026-09-23T10:30:00', positionId: 'XAUUSD:1', symbol: 'XAUUSD', side: 'BUY', entryPrice: 4000, exitPrice: 4010, profit: 10, exitTimeConfidence: 'exact' },
  { time: '2026-09-30T23:59:59', positionId: 'XAUUSD:2', symbol: 'XAUUSD', side: 'SELL', entryPrice: 4000, exitPrice: 4001.5, profit: -1.5, commission: 0.07 },
  { time: '2026-10-01T00:00:00', positionId: 'XAUUSD:3', symbol: 'XAUUSD', side: 'BUY', size: 0.02, entryPrice: 4000, exitPrice: 4020, profit: 40, exitTimeConfidence: 'estimated' },
  { time: '2026-10-25T10:00:00', positionId: 'XAUUSD:4', symbol: 'XAUUSD', side: 'BUY', entryPrice: 4000, exitPrice: 3999.3, profit: -0.7 },
];

test('first month: opens at zero and closes at deposits + P/L', () => {
  const s = buildStatement(trades, funding, 2026, 9);
  assert.equal(s.openingBalance, 0);
  assert.equal(s.deposits, 25.23);
  assert.equal(s.withdrawals, 0);
  assert.equal(s.closedPnl, 8.5);
  assert.equal(s.commission, 0.07);
  assert.equal(s.closingBalance, 33.73);
  assert.equal(s.tradeCount, 2);
  assert.deepEqual(s.rows.map(r => r.kind), ['deposit', 'trade', 'trade']);
  assert.deepEqual(s.rows.map(r => r.balanceAfter), [25.23, 35.23, 33.73]);
});

test('next month opens where the last one closed, and the equation holds', () => {
  const sep = buildStatement(trades, funding, 2026, 9);
  const oct = buildStatement(trades, funding, 2026, 10);
  assert.equal(oct.openingBalance, sep.closingBalance);
  assert.equal(oct.deposits, 0);
  assert.equal(oct.withdrawals, 30);
  assert.equal(oct.closedPnl, 39.3);
  assert.equal(oct.closingBalance, 43.03); // 33.73 + 39.3 - 30
  assert.deepEqual(oct.rows.map(r => r.kind), ['trade', 'withdrawal', 'trade']);
  assert.deepEqual(oct.rows.map(r => r.amount), [40, -30, -0.7]);
  assert.equal(oct.rows[oct.rows.length - 1].balanceAfter, oct.closingBalance);
});

test('a trade belongs to the month it closed in, to the second', () => {
  assert.equal(buildStatement(trades, funding, 2026, 9).rows.some(r => r.reference === 'XAUUSD:2'), true);
  assert.equal(buildStatement(trades, funding, 2026, 10).rows[0].reference, 'XAUUSD:3');
});

test('trade rows carry what is needed to check them against the broker', () => {
  const [, first] = buildStatement(trades, funding, 2026, 9).rows;
  assert.deepEqual(first, {
    kind: 'trade', time: '2026-09-23T11:00:00', openTime: '2026-09-23T10:30:00', reference: 'XAUUSD:1', symbol: 'XAUUSD',
    side: 'BUY', size: DEFAULT_LOT_SIZE, entryPrice: 4000, exitPrice: 4010, commission: 0, amount: 10, balanceAfter: 35.23,
    timeIsEstimate: false,
  });
});

test('a recorded size is used; an estimated close time is flagged', () => {
  const [row] = buildStatement(trades, funding, 2026, 10).rows;
  assert.equal(row.size, 0.02);
  assert.equal(row.timeIsEstimate, true);
});

test('a month with no activity carries the balance through', () => {
  const s = buildStatement(trades, funding, 2026, 11);
  assert.equal(s.openingBalance, 43.03);
  assert.equal(s.closingBalance, 43.03);
  assert.deepEqual(s.rows, []);
  const before = buildStatement(trades, funding, 2026, 8);
  assert.equal(before.openingBalance, 0);
  assert.equal(before.closingBalance, 0);
});

test('totals are exact for amounts floats add badly', () => {
  const many = Array.from({ length: 300 }, (_, i) => ({ time: `2026-05-${String((i % 28) + 1).padStart(2, '0')}T10:00:00`, profit: 0.1 }));
  const s = buildStatement(many, [], 2026, 5);
  assert.equal(s.closedPnl, 30);
  assert.equal(s.closingBalance, 30);
});

test('statementMonths lists active months, newest first', () => {
  assert.deepEqual(statementMonths(trades, funding), [{ year: 2026, month: 10 }, { year: 2026, month: 9 }]);
  assert.deepEqual(statementMonths([], []), []);
});

test('CSV holds the header, the summary and every row', () => {
  const csv = statementCsv(buildStatement(trades, funding, 2026, 10), { name: 'Test Name', broker: 'Broker', accountNo: '123' });
  const lines = csv.split('\n');
  assert.equal(lines[0], 'Monthly statement (self-prepared from the broker order history)');
  assert.equal(lines[1], 'Name,Test Name');
  assert.equal(lines[3], 'Account,123');
  assert.equal(lines[4], 'Period,2026-10');
  assert.equal(lines[7], 'Opening balance,33.73');
  assert.equal(lines[9], 'Withdrawals,-30.00');
  assert.equal(lines[12], 'Closing balance,43.03');
  assert.equal(lines[16], '2026-10-01 00:00:00,,buy,XAUUSD:3,XAUUSD,0.02,4000,4020,0.00,40.00,73.73,close time estimated');
  assert.equal(lines[17], '2026-10-20 09:00:00,,withdrawal,,,,,,,-30.00,43.73,');
});
