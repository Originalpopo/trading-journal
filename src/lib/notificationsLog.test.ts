import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseNotificationsLog, applyNotificationsLog, looksLikeNotificationsLog, linkSavedTrades } from './notificationsLog.ts';
import { parseTradingViewData, groupOrdersIntoTrades } from './tradingViewParser.ts';
import { planImport } from './importPlan.ts';
import { buildRiskContext } from './risk.ts';

// Copied from TradingView as pasted: the newest entry first, tabs and all.
const LOG = `XAUUSD
2026-10-13 10:44:55\t
Take Profit order cancelled on XAUUSD (1251731363)
Buy 0.01 at 4,142.34\t

XAUUSD
2026-10-13 10:44:55\t
Stop Loss order executed on XAUUSD (1251731364)
Buy 0.01 at 4,183.63\t

XAUUSD
2026-10-13 10:43:44\t
Stop Loss order modified on XAUUSD (1251731364)
Buy 0.01 at 4,183.31\t

XAUUSD
2026-10-13 10:43:44\t
Take Profit order modified on XAUUSD (1251731363)
Buy 0.01 at 4,142.34\t

XAUUSD
2026-10-13 10:43:44\t
Limit order executed on XAUUSD (1251731362)
Sell 0.01 at 4,181.96\t

XAUUSD
2026-10-13 10:35:56\t
Limit order placed on XAUUSD (1251731362)
Sell 0.01 at 4,181.82\t

XAUUSD
2026-10-13 10:35:56\t
Stop Loss order placed on XAUUSD (1251731364)
Buy 0.01 at 4,183.31\t

XAUUSD
2026-10-13 10:35:56\t
Take Profit order placed on XAUUSD (1251731363)
Buy 0.01 at 4,142.34`;

const HISTORY = `XAUUSD
Buy
Take Profit\t0.01\t0\t
4,142.34
cancelled
2026-10-13 10:44:55\t\t0.0\t\t\t1251731363\t

XAUUSD
Buy
Stop Loss\t0.01\t0.01\t\t
4,183.31
4,183.63
filled
2026-10-13 10:35:57\tXAUUSD:1251731362\t0.0\t-1.67\t-1.67\t1251731364\t

XAUUSD
Sell
Limit\t0.01\t0.01\t
4,181.82
4,181.96
filled
2026-10-13 10:35:57\tXAUUSD:1251731362\t0.0\t\t\t1251731362\t`;

const NO_EDITS = { exitTimes: {}, initialStops: {} };

test('parseNotificationsLog reads every event, oldest first', () => {
  const events = parseNotificationsLog(LOG);
  assert.equal(events.length, 8);
  assert.deepEqual(events[0], { orderId: '1251731363', symbol: 'XAUUSD', type: 'take profit', action: 'placed', time: '2026-10-13 10:35:56', price: 4142.34 });
  // Within one second the log's own order is kept: the fill comes before the stop it re-states.
  assert.deepEqual(events.filter(e => e.time === '2026-10-13 10:43:44').map(e => `${e.type} ${e.action}`),
    ['limit executed', 'take profit modified', 'stop loss modified']);
  assert.equal(events[7].action, 'cancelled');
});

test('the two pastes are told apart', () => {
  assert.equal(looksLikeNotificationsLog(LOG), true);
  assert.equal(looksLikeNotificationsLog(HISTORY), false);
});

test('the order history alone dates the entry at the placement of the limit order', () => {
  const [t] = groupOrdersIntoTrades(parseTradingViewData(HISTORY));
  assert.equal(t.entryTime, '2026-10-13T10:35:57');
  assert.equal(t.entryOrderPrice, 4181.82);
  assert.equal(t.entryPrice, 4181.96);
  assert.equal(t.entryOrderId, '1251731362');
  assert.equal(t.slOrderId, '1251731364');
});

test('the log gives the real fill times and the stop the position opened with', () => {
  const [t] = applyNotificationsLog(groupOrdersIntoTrades(parseTradingViewData(HISTORY)), parseNotificationsLog(LOG));
  assert.equal(t.entryTime, '2026-10-13T10:43:44');
  assert.equal(t.exitTime, '2026-10-13T10:44:55');
  assert.equal(t.time, '2026-10-13T10:44:55');
  assert.equal(t.duration, 71);
  assert.equal(t.exitTimeConfidence, 'exact');
  assert.equal(t.timesFromLog, true);
  assert.equal(t.initialSlPrice, 4183.31);
  assert.equal(t.initialSlSource, 'log');
});

test('trades the log does not cover are left as the history has them', () => {
  const trades = groupOrdersIntoTrades(parseTradingViewData(HISTORY));
  const [t] = applyNotificationsLog(trades, parseNotificationsLog(LOG.replaceAll('1251731362', '999')));
  assert.equal(t.entryTime, '2026-10-13T10:35:57');
  assert.equal(t.timesFromLog, undefined);
  assert.equal(t.initialSlPrice, undefined);
});

// A buy whose stop is dragged to the entry and then hit; the history only shows the moved stop.
const MOVED_HISTORY = `XAUUSD
Sell
Take Profit\t0.01\t0\t
4,214.56
cancelled
2026-10-09 19:36:44\t\t0.0\t\t\t1250421093\t

XAUUSD
Sell
Stop Loss\t0.01\t0.01\t\t
4,180.44
4,180.28
filled
2026-10-09 19:30:56\tXAUUSD:1250421092\t0.0\t-0.16\t-0.16\t1250421094\t

XAUUSD
Buy
Limit\t0.01\t0.01\t
4,180.34
4,180.44
filled
2026-10-09 18:48:10\tXAUUSD:1250421092\t0.0\t\t\t1250421092\t`;

const event = (time: string, text: string, price: string) => `XAUUSD\n${time}\t\n${text}\nSell 0.01 at ${price}\t`;
const MOVED_LOG = [
  event('2026-10-09 19:36:44', 'Stop Loss order executed on XAUUSD (1250421094)', '4,180.28'),
  event('2026-10-09 19:30:56', 'Stop Loss order modified on XAUUSD (1250421094)', '4,180.44'),
  event('2026-10-09 18:55:02', 'Stop Loss order modified on XAUUSD (1250421094)', '4,179.20'),
  event('2026-10-09 18:55:02', 'Limit order executed on XAUUSD (1250421092)', '4,180.44'),
  event('2026-10-09 18:48:10', 'Stop Loss order placed on XAUUSD (1250421094)', '4,179.20'),
  event('2026-10-09 18:48:10', 'Limit order placed on XAUUSD (1250421092)', '4,180.34'),
].join('\n\n');

test('a stop moved to break-even: 1R is exact with the log, a default without it', () => {
  const history = groupOrdersIntoTrades(parseTradingViewData(MOVED_HISTORY));
  const ctx = { ...buildRiskContext(history, 1.5), contractSizes: { XAUUSD: 100 } };

  const [alone] = planImport(history, [], NO_EDITS, ctx);
  assert.equal(alone.result.riskIsEstimate, true);
  assert.equal(alone.result.risk, 1.5);
  assert.equal(alone.result.resultType, 'BE');

  const [withLog] = planImport(applyNotificationsLog(history, parseNotificationsLog(MOVED_LOG)), [], NO_EDITS, ctx);
  assert.equal(withLog.result.initialSlPrice, 4179.2);
  assert.equal(withLog.result.riskIsEstimate, false);
  assert.ok(Math.abs(withLog.result.risk! - 1.14) < 1e-9); // 4180.34 - 4179.20
  assert.equal(withLog.result.resultType, 'BE');
  assert.equal(withLog.result.entryTime, '2026-10-09T18:55:02');
  assert.ok(!('slOrderId' in withLog.result));
});

test('what the log said outlives a later import of the history alone', () => {
  const history = groupOrdersIntoTrades(parseTradingViewData(MOVED_HISTORY));
  const ctx = { ...buildRiskContext(history, 1.5), contractSizes: { XAUUSD: 100 } };
  const [first] = planImport(applyNotificationsLog(history, parseNotificationsLog(MOVED_LOG)), [], NO_EDITS, ctx);
  const saved = { id: 'doc1', ...first.result } as any;

  const [again] = planImport(history, [saved], NO_EDITS, ctx);
  assert.equal(again.action, 'same');
  assert.equal(again.keptLogTimes, true);
  assert.equal(again.result.entryTime, '2026-10-09T18:55:02');
  assert.equal(again.result.initialSlPrice, 4179.2);
});

test('a log pasted later corrects a trade imported from the history alone', () => {
  const history = groupOrdersIntoTrades(parseTradingViewData(MOVED_HISTORY));
  const ctx = { ...buildRiskContext(history, 1.5), contractSizes: { XAUUSD: 100 } };
  const [first] = planImport(history, [], NO_EDITS, ctx);
  const saved = { id: 'doc1', ...first.result } as any;

  const [again] = planImport(applyNotificationsLog(history, parseNotificationsLog(MOVED_LOG)), [saved], NO_EDITS, ctx);
  assert.equal(again.action, 'update');
  assert.equal(again.updates!.entryTime, '2026-10-09T18:55:02');
  assert.equal(again.updates!.initialSlPrice, 4179.2);
  assert.equal(again.updates!.initialSlSource, 'log');
  assert.equal(again.updates!.riskIsEstimate, false);
  assert.equal(again.previousRisk, 1.5);
});

test('re-import that changes the P&L also changes R and the result', () => {
  const saved = { id: 'd', positionId: 'XAUUSD:100', symbol: 'XAUUSD', profit: -1, risk: 1.5, rr: -1 / 1.5, resultType: 'SL', riskIsEstimate: true, time: '2026-01-05T10:30:00' } as any;
  const [row] = planImport([{ positionId: 'XAUUSD:100', symbol: 'XAUUSD', profit: 3, time: '2026-01-05T10:30:00' }], [saved], NO_EDITS, { defaultRisk: 1.5, fallbackPointValue: 1, contractSizes: {} });
  assert.equal(row.updates!.profit, 3);
  assert.equal(row.updates!.rr, 2);
  assert.equal(row.updates!.resultType, 'TP');
});


test('a log pasted alone corrects a trade saved from the history alone', () => {
  const history = groupOrdersIntoTrades(parseTradingViewData(MOVED_HISTORY));
  const ctx = { ...buildRiskContext(history, 1.5), contractSizes: { XAUUSD: 100 } };
  const [first] = planImport(history, [], NO_EDITS, ctx);
  const saved = { id: 'doc1', ...first.result } as any;
  const other = { id: 'doc2', positionId: 'XAUUSD:999', symbol: 'XAUUSD', profit: 5, time: '2026-10-09T12:00:00' } as any;

  const events = parseNotificationsLog(MOVED_LOG);
  const linked = linkSavedTrades([saved, other], events);
  assert.equal(linked.length, 1);
  assert.equal(linked[0].slOrderId, '1250421094');
  assert.equal(linked[0].exitOrderId, '1250421094');

  const [row] = planImport(applyNotificationsLog(linked, events), [saved, other], NO_EDITS, ctx);
  assert.equal(row.action, 'update');
  assert.equal(row.updates!.entryTime, '2026-10-09T18:55:02');
  assert.equal(row.result.exitTime, '2026-10-09T19:36:44');
  assert.equal(row.updates!.initialSlPrice, 4179.2);
  assert.equal(row.updates!.riskIsEstimate, false);
  assert.equal(row.updates!.profit, undefined);
});

test('a stop added after the fill is found by the log alone', () => {
  const log = [
    event('2026-10-14 09:20:00', 'Stop Loss order executed on XAUUSD (1260000050)', '4,100.00'),
    event('2026-10-14 09:05:00', 'Stop Loss order placed on XAUUSD (1260000050)', '4,100.00'),
    event('2026-10-14 09:00:00', 'Market order executed on XAUUSD (1260000010)', '4,110.00'),
  ].join('\n\n');
  const saved = { id: 'd', positionId: 'XAUUSD:1260000010', symbol: 'XAUUSD', side: 'BUY', profit: -10, time: '2026-10-14T09:20:00' } as any;
  const events = parseNotificationsLog(log);
  const [t] = applyNotificationsLog(linkSavedTrades([saved], events), events);
  assert.equal(t.entryTime, '2026-10-14T09:00:00');
  assert.equal(t.exitTime, '2026-10-14T09:20:00');
  assert.equal(t.initialSlPrice, 4100);
});
