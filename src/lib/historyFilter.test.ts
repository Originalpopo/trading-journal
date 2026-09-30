import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterHistoryRows, EMPTY_FILTERS, isFilterActive, type HistoryRow } from './historyFilter.ts';
import { applyChecklistChanges, setChecklistChange } from './checklists.ts';

const rows: HistoryRow[] = [
  { id: 'win', time: '2026-01-05T10:00:00', isFunding: false, symbol: 'XAUUSD', side: 'BUY', profit: 20, risk: 10, strategy: 'clean breakout' },
  { id: 'loss', time: '2026-01-06T11:00:00', isFunding: false, symbol: 'XAUUSD', side: 'SELL', profit: -10, risk: 10, exitTimeConfidence: 'uncertain' },
  { id: 'be', time: '2026-01-07T12:00:00', isFunding: false, symbol: 'EURUSD', side: 'BUY', profit: 1, risk: 10 },
  { id: 'dep', time: '2026-01-04T09:00:00', isFunding: true, symbol: 'DEPOSIT', profit: 100, notes: 'initial' },
];
const ids = (r: HistoryRow[]) => r.map(x => x.id);

test('no filters keeps everything', () => {
  assert.deepEqual(ids(filterHistoryRows(rows, EMPTY_FILTERS)), ['win', 'loss', 'be', 'dep']);
  assert.equal(isFilterActive(EMPTY_FILTERS), false);
});

test('result filter uses the same TP/BE/SL rule as the badges and hides funding', () => {
  assert.deepEqual(ids(filterHistoryRows(rows, { ...EMPTY_FILTERS, results: ['BE'] })), ['be']);
  assert.deepEqual(ids(filterHistoryRows(rows, { ...EMPTY_FILTERS, results: ['TP', 'SL'] })), ['win', 'loss']);
});

test('side, kind and needs-check filters', () => {
  assert.deepEqual(ids(filterHistoryRows(rows, { ...EMPTY_FILTERS, side: 'SELL' })), ['loss']);
  assert.deepEqual(ids(filterHistoryRows(rows, { ...EMPTY_FILTERS, kind: 'funding' })), ['dep']);
  assert.deepEqual(ids(filterHistoryRows(rows, { ...EMPTY_FILTERS, kind: 'trades' })), ['win', 'loss', 'be']);
  assert.deepEqual(ids(filterHistoryRows(rows, { ...EMPTY_FILTERS, needsCheck: true })), ['loss']);
});

test('date range is inclusive on both ends', () => {
  assert.deepEqual(ids(filterHistoryRows(rows, { ...EMPTY_FILTERS, from: '2026-01-05', to: '2026-01-06' })), ['win', 'loss']);
});

test('search matches symbol and notes, case-insensitively', () => {
  assert.deepEqual(ids(filterHistoryRows(rows, { ...EMPTY_FILTERS, search: 'eur' })), ['be']);
  assert.deepEqual(ids(filterHistoryRows(rows, { ...EMPTY_FILTERS, search: 'BREAKOUT' })), ['win']);
  assert.deepEqual(ids(filterHistoryRows(rows, { ...EMPTY_FILTERS, search: 'initial' })), ['dep']);
});

test('bulk checklist changes add and remove items', () => {
  assert.deepEqual(applyChecklistChanges(['On Plan', 'Follow'], { 'Entry 1st': 'add', 'On Plan': 'remove' }), ['Follow', 'Entry 1st']);
  assert.deepEqual(applyChecklistChanges(['On Plan'], { 'On Plan': 'keep' }), ['On Plan']);
  assert.deepEqual(applyChecklistChanges(['On Plan'], { 'On Plan': 'add' }), ['On Plan']); // no duplicates
});

test('Follow and Reversal stay mutually exclusive in bulk edits', () => {
  assert.deepEqual(applyChecklistChanges(['On Plan', 'Follow'], { Reversal: 'add' }), ['On Plan', 'Reversal']);
  assert.deepEqual(setChecklistChange({}, 'Follow', 'add'), { Follow: 'add', Reversal: 'remove' });
  assert.deepEqual(setChecklistChange({}, 'Follow', 'remove'), { Follow: 'remove' });
});
