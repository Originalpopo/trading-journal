import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planImport } from './importPlan.ts';

// A saved trade as the app stores it; only the fields import planning looks at matter here.
const saved = (overrides: Record<string, unknown> = {}) => ({
  id: 'doc1',
  positionId: 'XAUUSD:100',
  symbol: 'XAUUSD',
  profit: -1,
  risk: 1.5,
  rr: -0.67,
  resultType: 'SL',
  strategy: 'my notes',
  isOnPlan: true,
  checklists: ['On Plan', 'Follow'],
  tf: '1m',
  entryTime: '2026-01-05T10:00:00',
  time: '2026-01-05T10:00:00',
  exitTime: '2026-01-05T10:00:00',
  ...overrides,
}) as any;

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
  const [row] = planImport([parsed()], [], {});
  assert.equal(row.action, 'new');
});

test('re-import fixes the times of an existing trade and shows the old exit time', () => {
  const [row] = planImport([parsed()], [saved()], {});
  assert.equal(row.action, 'update');
  assert.equal(row.updates!.exitTime, '2026-01-05T10:30:00');
  assert.equal(row.updates!.time, '2026-01-05T10:30:00');
  assert.equal(row.previousExitTime, '2026-01-05T10:00:00');
  assert.equal(row.keptManualTimes, false);
});

test('re-import never touches checklists, notes, TF or risk', () => {
  const [row] = planImport([parsed()], [saved()], {});
  for (const field of ['checklists', 'strategy', 'tf', 'risk', 'rr', 'isOnPlan', 'profit']) {
    assert.ok(!(field in row.updates!), `${field} should not be updated`);
  }
});

test('times the user set by hand are kept on re-import', () => {
  const [row] = planImport([parsed()], [saved({ exitTime: '2026-01-05T10:20:00', time: '2026-01-05T10:20:00', exitTimeConfidence: 'manual' })], {});
  assert.equal(row.keptManualTimes, true);
  assert.equal(row.action, 'same');
  assert.equal(row.result.exitTime, '2026-01-05T10:20:00');
  assert.equal(row.previousExitTime, undefined);
});

test('an exit time typed in the preview is applied and marked manual', () => {
  const [row] = planImport([parsed({ exitTimeConfidence: 'uncertain' })], [saved()], { 'XAUUSD:100': '2026-01-05T10:11' });
  assert.equal(row.action, 'update');
  assert.equal(row.updates!.exitTime, '2026-01-05T10:11:00'); // seconds restored
  assert.equal(row.updates!.duration, 11 * 60);
  assert.equal(row.updates!.exitTimeConfidence, 'manual');
  assert.equal(row.invalidExit, false);
});

test('a preview edit may replace an older hand-set time', () => {
  const [row] = planImport([parsed()], [saved({ exitTimeConfidence: 'manual' })], { 'XAUUSD:100': '2026-01-05T10:45:00' });
  assert.equal(row.keptManualTimes, false);
  assert.equal(row.updates!.exitTime, '2026-01-05T10:45:00');
});

test('an edited exit before the entry is flagged', () => {
  const [row] = planImport([parsed()], [], { 'XAUUSD:100': '2026-01-05T09:59:00' });
  assert.equal(row.invalidExit, true);
});

test('already up to date when nothing differs', () => {
  const existing = saved({ time: '2026-01-05T10:30:00', exitTime: '2026-01-05T10:30:00', duration: 1800, exitTimeConfidence: 'exact' });
  const [row] = planImport([parsed()], [existing], {});
  assert.equal(row.action, 'same');
});
