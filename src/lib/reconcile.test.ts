import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reconcileBalance, hasActivityAfter, localTimestamp } from './reconcile.ts';

const funding = [
  { time: '2026-07-01T09:00:00', deposit: 100, withdraw: 0 },
  { time: '2026-07-20T09:00:00', deposit: 0, withdraw: 30 },
];
const trades = [
  { time: '2026-07-08T14:10:08', profit: -0.72 },
  { time: '2026-07-08T14:07:41', profit: -0.01 },
  { time: '2026-07-08T12:40:52', profit: -1.32 },
  { time: '2026-07-25T10:00:00', profit: 4.5 },
];

test('matches when the broker balance equals deposits - withdrawals + P&L', () => {
  const r = reconcileBalance({ time: '2026-07-31T00:00:00', balance: 72.45 }, trades, funding);
  assert.equal(r.journalBalance, 72.45);
  assert.equal(r.difference, 0);
  assert.equal(r.matches, true);
  assert.equal(r.tradeCount, 4);
});

test('only events up to the check time are counted', () => {
  const r = reconcileBalance({ time: '2026-07-10T00:00:00', balance: 97.95 }, trades, funding);
  assert.equal(r.journalBalance, 97.95);
  assert.equal(r.matches, true);
  assert.equal(r.tradeCount, 3);
});

test('an event at exactly the check time is included', () => {
  const r = reconcileBalance({ time: '2026-07-08T12:40:52', balance: 98.68 }, trades, funding);
  assert.equal(r.matches, true);
});

test('a missing trade shows up as the exact difference', () => {
  const withoutOne = trades.filter(t => t.profit !== -1.32);
  const r = reconcileBalance({ time: '2026-07-31T00:00:00', balance: 72.45 }, withoutOne, funding);
  assert.equal(r.matches, false);
  assert.equal(r.difference, 1.32); // journal is 1.32 higher than the broker
});

test('a one-cent difference is not hidden', () => {
  const r = reconcileBalance({ time: '2026-07-31T00:00:00', balance: 72.44 }, trades, funding);
  assert.equal(r.matches, false);
  assert.equal(r.difference, 0.01);
});

test('float noise in the journal total does not cause a false mismatch', () => {
  const many = Array.from({ length: 1000 }, (_, i) => ({ time: `2026-08-01T00:00:${String(i % 60).padStart(2, '0')}`, profit: 0.01 }));
  const r = reconcileBalance({ time: '2026-08-02T00:00:00', balance: 10 }, many, []);
  assert.equal(r.matches, true);
  assert.equal(r.journalBalance, 10);
});

test('times written with a space instead of T are read the same way', () => {
  const r = reconcileBalance({ time: '2026-07-31 00:00:00', balance: 72.45 }, trades.map(t => ({ ...t, time: t.time.replace('T', ' ') })), funding);
  assert.equal(r.matches, true);
});

test('hasActivityAfter: only entries newer than the check count', () => {
  assert.equal(hasActivityAfter({ time: '2026-07-31T00:00:00', balance: 0 }, trades, funding), false);
  assert.equal(hasActivityAfter({ time: '2026-07-25T10:00:00', balance: 0 }, trades, funding), false); // same moment
  assert.equal(hasActivityAfter({ time: '2026-07-24T00:00:00', balance: 0 }, trades, funding), true); // a trade
  assert.equal(hasActivityAfter({ time: '2026-07-15T00:00:00', balance: 0 }, [], funding), true); // a withdrawal
});

test('localTimestamp writes the local wall clock in the stored format', () => {
  assert.equal(localTimestamp(new Date(2026, 9, 3, 14, 5, 9)), '2026-10-03T14:05:09');
  assert.match(localTimestamp(), /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
});
