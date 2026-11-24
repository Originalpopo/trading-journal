// A restore puts the journal back exactly as the backup file had it: what is not in the file goes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseBackup, idsToRemove, countIds, summariseBackup } from './restorePlan.ts';

const file = JSON.stringify({
  trades: [{ id: 't1', entryTime: '2026-11-02T14:32:06' }, { id: 't2', entryTime: '2026-11-24T09:43:49' }],
  funding: [{ id: 'f1' }, { id: 'f2' }],
  dayNotes: [{ date: '2026-11-01' }],
  weekNotes: [{ week: '2026-W45' }],
  preferences: { riskPct: 2, lastBackupAt: '2026-11-24T02:45:50.829Z' },
});

test('entries added after the backup are removed; entries in the file are kept', () => {
  const { backup } = parseBackup(file);
  const remove = idsToRemove({
    trades: ['t1', 't3'],
    funding: ['f1', 'f2', 'new1', 'new2'],
    dayNotes: ['2026-11-01', '2026-11-24'],
    weekNotes: [],
  }, backup);
  assert.deepEqual(remove, { trades: ['t3'], funding: ['new1', 'new2'], dayNotes: ['2026-11-24'], weekNotes: [] });
  assert.equal(countIds(remove), 4);
});

test('an empty journal has nothing to remove', () => {
  const { backup } = parseBackup(file);
  assert.equal(countIds(idsToRemove({ trades: [], funding: [], dayNotes: [], weekNotes: [] }, backup)), 0);
});

test('a backup with no trades removes every trade in the journal', () => {
  const { backup } = parseBackup(JSON.stringify({ trades: [], funding: [{ id: 'f1' }] }));
  assert.deepEqual(idsToRemove({ trades: ['t1', 't2'], funding: ['f1'], dayNotes: [], weekNotes: [] }, backup).trades, ['t1', 't2']);
});

test('summary counts what the file holds and when it was made', () => {
  const { backup, skipped } = parseBackup(file);
  const s = summariseBackup(backup, skipped);
  assert.deepEqual(
    [s.trades, s.funding, s.dayNotes, s.weekNotes, s.hasPreferences, s.skipped, s.firstTrade, s.lastTrade, s.madeAt],
    [2, 2, 1, 1, true, 0, '2026-11-02T14:32:06', '2026-11-24T09:43:49', '2026-11-24T02:45:50.829Z'],
  );
});

test('entries without an ID are left out and counted; a file without settings keeps the current ones', () => {
  const { backup, skipped } = parseBackup(JSON.stringify({ trades: [{ id: 't1' }, { profit: 5 }, { id: '' }], dayNotes: [{ text: 'x' }] }));
  assert.equal(backup.trades.length, 1);
  assert.equal(skipped, 3);
  assert.equal(backup.preferences, null);
});

test('a file that is not a journal backup is refused', () => {
  assert.throws(() => parseBackup('{"foo":1}'));
  assert.throws(() => parseBackup('[1,2]'));
  assert.throws(() => parseBackup('not json'));
});

test('trading settings come from the file; last backup time and reminder days stay as they are now', async () => {
  const { prefsAfterRestore } = await import('./restorePlan.ts');
  const after = prefsAfterRestore(
    { riskPct: 2, beThreshold: 0.4, lastBackupAt: 'old', backupDueDays: 30 },
    { riskPct: 1.5, dayStartHour: 6, lastBackupAt: 'new', backupDueDays: 14 },
  );
  assert.deepEqual(after, { riskPct: 2, beThreshold: 0.4, lastBackupAt: 'new', backupDueDays: 14 });
  assert.deepEqual(prefsAfterRestore({ riskPct: 2, lastBackupAt: 'old' }, {}), { riskPct: 2 });
});
