import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupOrdersIntoTrades, findImportWarnings, parseTradingViewData, parseTradingViewCSVData, type ParsedOrder } from './tradingViewParser.ts';

// Compact order builder: filled orders carry a position ID; exits carry P&L.
const order = (o: Partial<ParsedOrder> & Pick<ParsedOrder, 'side' | 'type' | 'status' | 'updateTime' | 'orderId'>): ParsedOrder =>
  ({ symbol: 'XAUUSD', ...o });

test('SL hit in a bracket: exit time is when the paired TP was cancelled', () => {
  const trades = groupOrdersIntoTrades([
    order({ side: 'Buy', type: 'Limit', status: 'filled', updateTime: '2026-01-05 10:00:00', positionId: 'P:100', avgFillPrice: 2000, orderId: '100' }),
    order({ side: 'Sell', type: 'Take Profit', status: 'cancelled', updateTime: '2026-01-05 10:45:30', limitOrStopPrice: 2010, orderId: '101' }),
    // SL was dragged to break-even at 10:20; TradingView keeps that as its "Update Time"
    order({ side: 'Sell', type: 'Stop Loss', status: 'filled', updateTime: '2026-01-05 10:20:00', positionId: 'P:100', limitOrStopPrice: 2000, avgFillPrice: 1999.9, pnl: -0.1, orderId: '102' }),
  ]);
  assert.equal(trades.length, 1);
  const t = trades[0];
  assert.equal(t.entryTime, '2026-01-05T10:00:00');
  assert.equal(t.exitTime, '2026-01-05T10:45:30');
  assert.equal(t.time, '2026-01-05T10:45:30');
  assert.equal(t.exitTimeConfidence, 'exact');
  assert.equal(t.duration, 45 * 60 + 30);
  assert.equal(t.tpPrice, 2010);
  assert.equal(t.slPrice, 2000);
});

test('TP hit in a bracket: exit time is when the paired SL was cancelled', () => {
  const [t] = groupOrdersIntoTrades([
    order({ side: 'Sell', type: 'Limit', status: 'filled', updateTime: '2026-01-05 12:00:00', positionId: 'P:200', avgFillPrice: 2000, orderId: '200' }),
    order({ side: 'Buy', type: 'Take Profit', status: 'filled', updateTime: '2026-01-05 12:00:00', positionId: 'P:200', limitOrStopPrice: 1990, avgFillPrice: 1990, pnl: 10, orderId: '201' }),
    order({ side: 'Buy', type: 'Stop Loss', status: 'cancelled', updateTime: '2026-01-05 12:30:00', limitOrStopPrice: 2005, orderId: '202' }),
  ]);
  assert.equal(t.exitTime, '2026-01-05T12:30:00');
  assert.equal(t.exitTimeConfidence, 'exact');
  assert.equal(t.slPrice, 2005);
});

test('manual market close keeps its own time', () => {
  const [t] = groupOrdersIntoTrades([
    order({ side: 'Buy', type: 'Limit', status: 'filled', updateTime: '2026-01-05 09:00:00', positionId: 'P:300', avgFillPrice: 2000, orderId: '300' }),
    order({ side: 'Sell', type: 'Stop Loss', status: 'cancelled', updateTime: '2026-01-05 09:40:00', limitOrStopPrice: 1995, orderId: '301' }),
    order({ side: 'Sell', type: 'Market', status: 'filled', updateTime: '2026-01-05 09:40:00', positionId: 'P:300', avgFillPrice: 2008, pnl: 8, orderId: '350' }),
  ]);
  assert.equal(t.exitTime, '2026-01-05T09:40:00');
  assert.equal(t.exitTimeConfidence, 'exact');
  assert.equal(t.profit, 8);
});

test('TP placed after entry: exit time is estimated from its cancel', () => {
  const [t] = groupOrdersIntoTrades([
    order({ side: 'Buy', type: 'Limit', status: 'filled', updateTime: '2026-01-05 14:00:00', positionId: 'P:400', avgFillPrice: 2000, orderId: '400' }),
    order({ side: 'Sell', type: 'Take Profit', status: 'cancelled', updateTime: '2026-01-05 14:20:00', limitOrStopPrice: 2015, orderId: '470' }),
    order({ side: 'Sell', type: 'Stop Loss', status: 'filled', updateTime: '2026-01-05 14:00:00', positionId: 'P:400', limitOrStopPrice: 1998, avgFillPrice: 1998, pnl: -2, orderId: '460' }),
  ]);
  assert.equal(t.exitTime, '2026-01-05T14:20:00');
  assert.equal(t.exitTimeConfidence, 'estimated');
});

test('SL hit with no TP at all: exit time is flagged uncertain', () => {
  const [t] = groupOrdersIntoTrades([
    order({ side: 'Buy', type: 'Limit', status: 'filled', updateTime: '2026-01-05 16:00:00', positionId: 'P:500', avgFillPrice: 2000, orderId: '500' }),
    order({ side: 'Sell', type: 'Stop Loss', status: 'filled', updateTime: '2026-01-05 16:00:00', positionId: 'P:500', limitOrStopPrice: 1998, avgFillPrice: 1998, pnl: -2, orderId: '530' }),
  ]);
  assert.equal(t.exitTime, '2026-01-05T16:00:00');
  assert.equal(t.exitTimeConfidence, 'uncertain');
});

test('TP/SL of a cancelled, never-filled limit bracket are not used as exits', () => {
  const [t] = groupOrdersIntoTrades([
    order({ side: 'Buy', type: 'Limit', status: 'filled', updateTime: '2026-01-05 16:00:00', positionId: 'P:600', avgFillPrice: 2000, orderId: '600' }),
    order({ side: 'Sell', type: 'Stop Loss', status: 'filled', updateTime: '2026-01-05 16:00:00', positionId: 'P:600', limitOrStopPrice: 1998, avgFillPrice: 1998, pnl: -2, orderId: '630' }),
    // an unrelated buy-limit bracket placed and cancelled later
    order({ side: 'Buy', type: 'Limit', status: 'cancelled', updateTime: '2026-01-05 16:30:00', limitOrStopPrice: 1990, orderId: '700' }),
    order({ side: 'Sell', type: 'Take Profit', status: 'cancelled', updateTime: '2026-01-05 16:30:00', limitOrStopPrice: 2010, orderId: '701' }),
    order({ side: 'Sell', type: 'Stop Loss', status: 'cancelled', updateTime: '2026-01-05 16:30:00', limitOrStopPrice: 1985, orderId: '702' }),
  ]);
  assert.equal(t.exitTimeConfidence, 'uncertain');
});

test('an estimated exit never reaches into the next position', () => {
  const trades = groupOrdersIntoTrades([
    order({ side: 'Buy', type: 'Limit', status: 'filled', updateTime: '2026-01-05 10:00:00', positionId: 'P:800', avgFillPrice: 2000, orderId: '800' }),
    order({ side: 'Sell', type: 'Stop Loss', status: 'filled', updateTime: '2026-01-05 10:00:00', positionId: 'P:800', limitOrStopPrice: 1998, avgFillPrice: 1998, pnl: -2, orderId: '850' }),
    order({ side: 'Buy', type: 'Limit', status: 'filled', updateTime: '2026-01-05 11:00:00', positionId: 'P:900', avgFillPrice: 2001, orderId: '900' }),
    order({ side: 'Sell', type: 'Take Profit', status: 'cancelled', updateTime: '2026-01-05 11:10:00', limitOrStopPrice: 2011, orderId: '901' }),
    order({ side: 'Sell', type: 'Stop Loss', status: 'filled', updateTime: '2026-01-05 11:00:00', positionId: 'P:900', limitOrStopPrice: 1999, avgFillPrice: 1999, pnl: -2, orderId: '902' }),
  ]);
  const first = trades.find(t => t.positionId === 'P:800')!;
  const second = trades.find(t => t.positionId === 'P:900')!;
  assert.equal(first.exitTimeConfidence, 'uncertain');
  assert.equal(second.exitTime, '2026-01-05T11:10:00');
  assert.equal(second.exitTimeConfidence, 'exact');
});

test('open positions (no exit yet) are skipped', () => {
  const trades = groupOrdersIntoTrades([
    order({ side: 'Buy', type: 'Limit', status: 'filled', updateTime: '2026-01-05 10:00:00', positionId: 'P:1000', avgFillPrice: 2000, orderId: '1000' }),
  ]);
  assert.equal(trades.length, 0);
});

test('parseTradingViewData reads the pasted TradingView history format', () => {
  const pasted = [
    'XAUUSD', 'Buy', 'Take Profit\t0.01\t0', '1,990.00', 'cancelled',
    '2026-01-05 12:30:00\t\t0.0\t\t\t201\t',
    '',
    'XAUUSD', 'Buy', 'Stop Loss\t0.01\t0.01\t\t', '2,005.00', '2,005.10', 'filled',
    '2026-01-05 12:00:00\tXAUUSD:200\t0.0\t-5.1\t-5.1\t202\t',
    '',
    'XAUUSD', 'Sell', 'Limit\t0.01\t0.01\t', '2,000.00', '2,000.00', 'filled',
    '2026-01-05 12:00:00\tXAUUSD:200\t0.0\t\t\t200\t',
  ].join('\n');

  const orders = parseTradingViewData(pasted);
  assert.equal(orders.length, 3);
  const sl = orders.find(o => o.type === 'Stop Loss')!;
  assert.equal(sl.pnl, -5.1);
  assert.equal(sl.orderId, '202');
  assert.equal(sl.limitOrStopPrice, 2005);
  assert.equal(sl.avgFillPrice, 2005.1);

  const [t] = groupOrdersIntoTrades(orders);
  assert.equal(t.side, 'SELL');
  assert.equal(t.exitTime, '2026-01-05T12:30:00');
  assert.equal(t.exitTimeConfidence, 'exact');
});

test('parseTradingViewCSVData keeps a 0.00 exit as an exit', () => {
  const csv = [
    'Symbol,Side,Type,Qty,Filled Qty,Limit Price,Stop Price,Avg Fill Price,Status,Update Time,Position ID,Commission,Closed P&L,Order ID',
    'XAUUSD,Sell,Stop Loss,0.01,0.01,,2000,2000,Filled,2026-01-05 10:05:00,XAUUSD:1,0.0,0.0,3',
    'XAUUSD,Buy,Limit,0.01,0.01,2000,,2000,Filled,2026-01-05 10:00:00,XAUUSD:1,0.0,,1',
  ].join('\n');
  const trades = groupOrdersIntoTrades(parseTradingViewCSVData(csv));
  assert.equal(trades.length, 1);
  assert.equal(trades[0].profit, 0);
});

test('a normal closed position raises no import warning', () => {
  assert.deepEqual(findImportWarnings([
    order({ side: 'Buy', type: 'Limit', status: 'filled', updateTime: '2026-01-05 10:00:00', positionId: 'P:100', avgFillPrice: 2000, orderId: '100' }),
    order({ side: 'Sell', type: 'Take Profit', status: 'cancelled', updateTime: '2026-01-05 10:45:30', limitOrStopPrice: 2010, orderId: '101' }),
    order({ side: 'Sell', type: 'Stop Loss', status: 'filled', updateTime: '2026-01-05 10:20:00', positionId: 'P:100', avgFillPrice: 1999.9, pnl: -0.1, orderId: '102' }),
  ]), []);
});

test('a closing fill whose entry is cut off is reported with its P&L, not dropped silently', () => {
  const orders = [
    order({ side: 'Sell', type: 'Stop Loss', status: 'filled', updateTime: '2026-01-05 10:20:00', positionId: 'P:100', avgFillPrice: 1999, pnl: -0.72, orderId: '102' }),
  ];
  assert.equal(groupOrdersIntoTrades(orders).length, 0);
  assert.deepEqual(findImportWarnings(orders), [
    { kind: 'missingEntry', symbol: 'XAUUSD', time: '2026-01-05 10:20:00', positionId: 'P:100', pnl: -0.72 },
  ]);
});

test('a position with only its entry is reported as open', () => {
  const [w] = findImportWarnings([
    order({ side: 'Buy', type: 'Limit', status: 'filled', updateTime: '2026-01-05 10:00:00', positionId: 'P:100', avgFillPrice: 2000, orderId: '100' }),
  ]);
  assert.equal(w.kind, 'open');
  assert.equal(w.pnl, undefined);
});

test('a position closed in two parts is imported with the whole P&L and reported', () => {
  const orders = [
    order({ side: 'Buy', type: 'Market', status: 'filled', updateTime: '2026-01-05 10:00:00', positionId: 'P:100', avgFillPrice: 2000, orderId: '100' }),
    order({ side: 'Sell', type: 'Market', status: 'filled', updateTime: '2026-01-05 10:10:00', positionId: 'P:100', avgFillPrice: 2001, pnl: 0.1, orderId: '110' }),
    order({ side: 'Sell', type: 'Market', status: 'filled', updateTime: '2026-01-05 10:20:00', positionId: 'P:100', avgFillPrice: 2002, pnl: 0.2, orderId: '120' }),
  ];
  const [t] = groupOrdersIntoTrades(orders);
  assert.equal(t.profit, 0.3);
  const [w] = findImportWarnings(orders);
  assert.equal(w.kind, 'splitClose');
  assert.equal(w.pnl, 0.3);
});

test('a filled order with P&L but no position ID is reported', () => {
  const [w] = findImportWarnings([
    order({ side: 'Sell', type: 'Market', status: 'filled', updateTime: '2026-01-05 10:10:00', avgFillPrice: 2001, pnl: 1.5, orderId: '110' }),
  ]);
  assert.equal(w.kind, 'noPositionId');
  assert.equal(w.pnl, 1.5);
});

test('commission from the broker is kept on the trade and not subtracted from P&L', () => {
  const [t] = groupOrdersIntoTrades([
    order({ side: 'Buy', type: 'Market', status: 'filled', updateTime: '2026-01-05 10:00:00', positionId: 'P:100', avgFillPrice: 2000, commission: 0.03, orderId: '100' }),
    order({ side: 'Sell', type: 'Market', status: 'filled', updateTime: '2026-01-05 10:10:00', positionId: 'P:100', avgFillPrice: 2001, pnl: 1, commission: 0.04, orderId: '110' }),
  ]);
  assert.equal(t.profit, 1);
  assert.equal(t.commission, 0.07);
});

test('zero commission adds no commission field', () => {
  const [t] = groupOrdersIntoTrades([
    order({ side: 'Buy', type: 'Market', status: 'filled', updateTime: '2026-01-05 10:00:00', positionId: 'P:100', avgFillPrice: 2000, commission: 0, orderId: '100' }),
    order({ side: 'Sell', type: 'Market', status: 'filled', updateTime: '2026-01-05 10:10:00', positionId: 'P:100', avgFillPrice: 2001, pnl: 1, commission: 0, orderId: '110' }),
  ]);
  assert.equal('commission' in t, false);
});

test('the real Eightcap export: every P&L row ends up in a trade and the total is exact', async () => {
  const { readFileSync, existsSync } = await import('node:fs');
  const file = 'eightcap-order-history-all-2026-07-08T07_12_37.312Z.csv';
  if (!existsSync(file)) return; // the broker file is not kept in the repository
  const orders = parseTradingViewCSVData(readFileSync(file, 'utf8').replace(/^﻿/, ''));
  const trades = groupOrdersIntoTrades(orders);
  assert.equal(trades.length, 49);
  assert.equal(trades.reduce((cents, t) => cents + Math.round(t.profit! * 100), 0), -892);
  assert.deepEqual(findImportWarnings(orders), []);
});
