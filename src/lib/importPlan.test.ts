import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planImport, reviewImportWarnings } from './importPlan.ts';

// A saved trade as the app stores it; only the fields import planning looks at matter here.
const saved = (overrides: Record<string, unknown> = {}) => ({
  id: 'doc1',
  positionId: 'XAUUSD:100',
  symbol: 'XAUUSD',
  profit: -1,
  risk: 1.5,
  rr: -1 / 1.5,
  resultType: 'SL',
  riskIsEstimate: true,
  strategy: 'my notes',
  isOnPlan: true,
  checklists: ['On Plan', 'Follow'],
  tf: '1m',
  entryTime: '2026-01-05T10:00:00',
  time: '2026-01-05T10:00:00',
  exitTime: '2026-01-05T10:00:00',
  ...overrides,
}) as any;

const NO_EDITS = { exitTimes: {}, initialStops: {} };
const CTX = { defaultRisk: 1.5, fallbackPointValue: 1 };

const parsed = (overrides: Record<string, unknown> = {}) => ({
  positionId: 'XAUUSD:100',
  symbol: 'XAUUSD',
  profit: -1,
  entryTime: '2026-01-05T10:00:00',
  time: '2026-01-05T10:30:00',
  exitTime: '2026-01-05T10:30:00',
  duration: 1800,
  exitTimeConfidence: 'exact',
  ...overrides,
}) as any;

test('new trade when nothing matches the position', () => {
  const [row] = planImport([parsed()], [], NO_EDITS, CTX);
  assert.equal(row.action, 'new');
});

test('re-import fixes the times of an existing trade and shows the old exit time', () => {
  const [row] = planImport([parsed()], [saved()], NO_EDITS, CTX);
  assert.equal(row.action, 'update');
  assert.equal(row.updates!.exitTime, '2026-01-05T10:30:00');
  assert.equal(row.updates!.time, '2026-01-05T10:30:00');
  assert.equal(row.previousExitTime, '2026-01-05T10:00:00');
  assert.equal(row.keptManualTimes, false);
});

test('re-import never touches checklists, notes or TF', () => {
  const [row] = planImport([parsed()], [saved()], NO_EDITS, CTX);
  for (const field of ['checklists', 'strategy', 'tf', 'isOnPlan', 'profit']) {
    assert.ok(!(field in row.updates!), `${field} should not be updated`);
  }
});

test('times the user set by hand are kept on re-import', () => {
  const [row] = planImport([parsed()], [saved({ exitTime: '2026-01-05T10:20:00', time: '2026-01-05T10:20:00', exitTimeConfidence: 'manual' })], NO_EDITS, CTX);
  assert.equal(row.keptManualTimes, true);
  assert.equal(row.action, 'same');
  assert.equal(row.result.exitTime, '2026-01-05T10:20:00');
  assert.equal(row.previousExitTime, undefined);
});

test('an exit time typed in the preview is applied and marked manual', () => {
  const [row] = planImport([parsed({ exitTimeConfidence: 'uncertain' })], [saved()], { exitTimes: { 'XAUUSD:100': '2026-01-05T10:11' }, initialStops: {} }, CTX);
  assert.equal(row.action, 'update');
  assert.equal(row.updates!.exitTime, '2026-01-05T10:11:00'); // seconds restored
  assert.equal(row.updates!.duration, 11 * 60);
  assert.equal(row.updates!.exitTimeConfidence, 'manual');
  assert.equal(row.invalidExit, false);
});

test('a preview edit may replace an older hand-set time', () => {
  const [row] = planImport([parsed()], [saved({ exitTimeConfidence: 'manual' })], { exitTimes: { 'XAUUSD:100': '2026-01-05T10:45:00' }, initialStops: {} }, CTX);
  assert.equal(row.keptManualTimes, false);
  assert.equal(row.updates!.exitTime, '2026-01-05T10:45:00');
});

test('an edited exit before the entry is flagged', () => {
  const [row] = planImport([parsed()], [], { exitTimes: { 'XAUUSD:100': '2026-01-05T09:59:00' }, initialStops: {} }, CTX);
  assert.equal(row.invalidExit, true);
});

test('already up to date when nothing differs', () => {
  const existing = saved({ time: '2026-01-05T10:30:00', exitTime: '2026-01-05T10:30:00', duration: 1800, exitTimeConfidence: 'exact' });
  const [row] = planImport([parsed()], [existing], NO_EDITS, CTX);
  assert.equal(row.action, 'same');
});

// A full stop-out where the broker still shows the stop it was opened with: 0.49 away.
const stoppedOut = (overrides: Record<string, unknown> = {}) => parsed({
  side: 'SELL', entryPrice: 4179.76, exitPrice: 4180.28, profit: -0.52, slPrice: 4180.25, ...overrides,
});

test('1R comes from the broker stop when it was never moved', () => {
  const [row] = planImport([stoppedOut()], [saved({ profit: -0.52, rr: -0.52 / 1.5, resultType: 'BE' })], NO_EDITS, CTX);
  assert.equal(row.updates!.risk, 0.49);
  assert.equal(row.updates!.resultType, 'SL'); // was counted BE at a flat $1.50
  assert.equal(row.updates!.riskIsEstimate, false);
  assert.equal(row.updates!.initialSlPrice, 4180.25);
  assert.equal(row.previousRisk, 1.5);
});

test('an initial stop typed in the preview sets 1R and is kept as manual', () => {
  const moved = parsed({ side: 'BUY', entryPrice: 4179.14, exitPrice: 4198.68, profit: 19.54, slPrice: 4179.15 });
  const [row] = planImport([moved], [saved({ profit: 19.54 })], { exitTimes: {}, initialStops: { 'XAUUSD:100': '4178.24' } }, CTX);
  assert.equal(row.updates!.risk, 0.9);
  assert.equal(row.updates!.initialSlSource, 'manual');
  assert.equal(row.invalidInitialSl, false);
});

test('an initial stop on the wrong side of the entry is flagged and ignored', () => {
  const moved = parsed({ side: 'BUY', entryPrice: 4179.14, exitPrice: 4198.68, profit: 19.54, slPrice: 4179.15 });
  const [row] = planImport([moved], [], { exitTimes: {}, initialStops: { 'XAUUSD:100': '4180' } }, CTX);
  assert.equal(row.invalidInitialSl, true);
  assert.equal(row.result.riskIsEstimate, true);
});

test('an initial stop the user entered earlier survives a re-import', () => {
  const moved = parsed({ side: 'BUY', entryPrice: 4179.14, exitPrice: 4198.68, profit: 19.54, slPrice: 4179.15 });
  const existing = saved({ profit: 19.54, risk: 0.9, rr: 19.54 / 0.9, resultType: 'TP', riskIsEstimate: false, initialSlPrice: 4178.24, initialSlSource: 'manual' });
  const [row] = planImport([moved], [existing], NO_EDITS, CTX);
  assert.ok(!row.updates || !('risk' in row.updates));
  assert.equal(row.result.risk, 0.9);
});

test('a known 1R is never replaced by the default guess', () => {
  const moved = parsed({ side: 'BUY', entryPrice: 4179.14, exitPrice: 4198.68, profit: 19.54, slPrice: 4179.15 });
  const existing = saved({ profit: 19.54, risk: 0.8, rr: 19.54 / 0.8, resultType: 'TP', riskIsEstimate: false });
  const [row] = planImport([moved], [existing], NO_EDITS, CTX);
  assert.equal(row.result.risk, 0.8);
});

test('changing the default 1R later does not rewrite past trades', () => {
  const moved = parsed({ side: 'BUY', entryPrice: 4179.14, exitPrice: 4198.68, profit: 19.54, slPrice: 4179.15 });
  const existing = saved({ profit: 19.54, risk: 1.5, rr: 19.54 / 1.5, resultType: 'TP', riskIsEstimate: true });
  const [row] = planImport([moved], [existing], NO_EDITS, { defaultRisk: 5, fallbackPointValue: 1 });
  assert.equal(row.result.risk, 1.5);
  assert.ok(!row.updates || !('risk' in row.updates));
});

test('new trades with an unknown stop use the current default 1R', () => {
  const moved = parsed({ side: 'BUY', entryPrice: 4179.14, exitPrice: 4198.68, profit: 19.54, slPrice: 4179.15 });
  const [row] = planImport([moved], [], NO_EDITS, { defaultRisk: 5, fallbackPointValue: 1 });
  assert.equal(row.result.risk, 5);
  assert.equal(row.result.riskIsEstimate, true);
});

test('re-import replaces a saved P&L that disagrees with the broker and shows the old one', () => {
  const [row] = planImport([parsed({ profit: -1.2 })], [saved()], NO_EDITS, CTX);
  assert.equal(row.action, 'update');
  assert.equal(row.updates!.profit, -1.2);
  assert.equal(row.previousProfit, -1);
  assert.equal(row.result.profit, -1.2);
});

test('float noise in a saved P&L is not treated as a disagreement', () => {
  const [row] = planImport([parsed({ profit: 0.3 })], [saved({ profit: 0.1 + 0.2 })], NO_EDITS, CTX);
  assert.ok(!('profit' in (row.updates || {})));
  assert.equal(row.previousProfit, undefined);
});

test('re-import records commission the broker reports', () => {
  const [row] = planImport([parsed({ commission: 0.07 })], [saved()], NO_EDITS, CTX);
  assert.equal(row.updates!.commission, 0.07);
});

const cutOff = (overrides: Record<string, unknown> = {}) => ({
  kind: 'missingEntry', symbol: 'XAUUSD', time: '2026-10-02 07:51:13', positionId: 'XAUUSD:100', pnl: -0.73, ...overrides,
}) as any;

test('a cut-off position already saved with the same P&L is not a warning', () => {
  const r = reviewImportWarnings([cutOff()], [saved({ profit: -0.73 })]);
  assert.equal(r.warnings.length, 0);
  assert.equal(r.alreadySaved.length, 1);
  assert.equal(r.savedDiffers.length, 0);
});

test('a cut-off position that is not in the journal stays a warning', () => {
  const r = reviewImportWarnings([cutOff()], [saved({ positionId: 'XAUUSD:999', profit: -0.73 })]);
  assert.equal(r.warnings.length, 1);
  assert.equal(r.alreadySaved.length, 0);
});

test('a cut-off position saved with a different P&L is reported with both amounts', () => {
  const r = reviewImportWarnings([cutOff()], [saved({ profit: -0.7 })]);
  assert.equal(r.warnings.length, 0);
  assert.equal(r.savedDiffers.length, 1);
  assert.equal(r.savedDiffers[0].savedProfit, -0.7);
  assert.equal(r.savedDiffers[0].pnl, -0.73);
});

test('other kinds of warning are never hidden by a saved trade', () => {
  const r = reviewImportWarnings([cutOff({ kind: 'splitClose' }), cutOff({ kind: 'noPositionId', positionId: undefined })], [saved({ profit: -0.73 })]);
  assert.equal(r.warnings.length, 2);
});
