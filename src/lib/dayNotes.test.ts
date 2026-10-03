import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayKey, dayKeyOfTime, summarizeDay, searchDayNotes, normalizeMood, MOOD_IDS } from './dayNotes.ts';

test('dayKey writes the local date', () => {
  assert.equal(dayKey(new Date(2026, 9, 3, 23, 59)), '2026-10-03');
  assert.equal(dayKey(new Date(2026, 0, 5, 0, 0)), '2026-01-05');
});

test('dayKeyOfTime reads stored times in both spellings and rejects junk', () => {
  assert.equal(dayKeyOfTime('2026-10-02T17:07:50'), '2026-10-02');
  assert.equal(dayKeyOfTime('2026-10-02 00:00:01'), '2026-10-02');
  assert.equal(dayKeyOfTime('not a time'), null);
  assert.equal(dayKeyOfTime(undefined), null);
});

const trades = [
  { time: '2026-10-01T07:58:13', profit: -1.37, risk: 1.4, rr: -0.98 },
  { time: '2026-10-01T14:15:06', profit: 18.99, risk: 1.42, rr: 13.37 },
  { time: '2026-10-01T23:59:59', profit: 0.08, risk: 1.5, rr: 0.05 },
  { time: '2026-10-02T00:00:00', profit: -0.85, risk: 0.78, rr: -1.09 },
];

test('summarizeDay counts only the trades that closed that day, to the second', () => {
  const s = summarizeDay(trades, '2026-10-01');
  assert.equal(s.count, 3);
  assert.equal(s.pnl, 17.7);
  assert.ok(Math.abs(s.rr - 12.44) < 1e-9);
  assert.deepEqual([s.wins, s.losses, s.bes], [1, 1, 1]);
});

test('summarizeDay: a day without trades is all zeros', () => {
  assert.deepEqual(summarizeDay(trades, '2026-10-04'), { count: 0, pnl: 0, rr: 0, wins: 0, losses: 0, bes: 0 });
});

test('summarizeDay adds money exactly', () => {
  const many = Array.from({ length: 30 }, () => ({ time: '2026-05-05T10:00:00', profit: 0.1 }));
  assert.equal(summarizeDay(many, '2026-05-05').pnl, 3);
});

const notes = [
  { date: '2026-10-01', content: 'Patient today, waited for the level', mood: 'smile' },
  { date: '2026-10-03', content: 'Revenge trade after the first stop', mood: 'sad' },
  { date: '2026-09-28', content: 'ใจร้อน เข้าเร็วไป', mood: 'alert' },
];

test('searchDayNotes: newest first, matches text in any language and dates', () => {
  assert.deepEqual(searchDayNotes(notes, '').map(n => n.date), ['2026-10-03', '2026-10-01', '2026-09-28']);
  assert.deepEqual(searchDayNotes(notes, 'REVENGE').map(n => n.date), ['2026-10-03']);
  assert.deepEqual(searchDayNotes(notes, 'ใจร้อน').map(n => n.date), ['2026-09-28']);
  assert.deepEqual(searchDayNotes(notes, '2026-10').map(n => n.date), ['2026-10-03', '2026-10-01']);
  assert.deepEqual(searchDayNotes(notes, 'nothing like this'), []);
});

test('normalizeMood keeps the faces and maps the earlier icon set onto them', () => {
  for (const id of MOOD_IDS) assert.equal(normalizeMood(id), id);
  assert.equal(normalizeMood('sad'), 'frown');
  for (const old of ['note', 'chart', 'alert', 'bulb', 'up', 'down', '', undefined]) {
    assert.equal(normalizeMood(old), 'meh');
  }
});
