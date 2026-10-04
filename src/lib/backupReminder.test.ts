import { test } from 'node:test';
import assert from 'node:assert/strict';
import { backupAge } from './backupReminder.ts';

const now = new Date('2026-10-04T12:00:00.000Z');

test('no backup yet is overdue', () => {
  assert.deepEqual(backupAge(undefined, now), { days: null, isDue: true, label: 'Never backed up' });
  assert.equal(backupAge('not a date', now).days, null);
});

test('counts whole days since the last backup', () => {
  assert.deepEqual(backupAge('2026-10-04T08:00:00.000Z', now), { days: 0, isDue: false, label: 'Backed up today' });
  assert.deepEqual(backupAge('2026-10-03T11:00:00.000Z', now), { days: 1, isDue: false, label: 'Last backup yesterday' });
  assert.deepEqual(backupAge('2026-09-22T12:00:00.000Z', now), { days: 12, isDue: false, label: 'Last backup 12 days ago' });
});

test('overdue only after 30 full days', () => {
  assert.equal(backupAge('2026-09-04T12:00:00.000Z', now).isDue, false); // exactly 30 days
  assert.equal(backupAge('2026-09-03T12:00:00.000Z', now).isDue, true); // 31 days
});

test('a backup dated in the future counts as today', () => {
  assert.equal(backupAge('2026-10-05T12:00:00.000Z', now).days, 0);
});
