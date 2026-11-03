import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayKey, dayKeyOfTime, tradingDayOf, tradingDayStartMs, summarizeDay, tradesOfDay, searchDayNotes, normalizeMood, MOOD_IDS } from './dayNotes.ts';

test('dayKey writes the local date', () => {
  assert.equal(dayKey(new Date(2026, 9, 3, 23, 59)), '2026-10-03');
  assert.equal(dayKey(new Date(2026, 0, 5, 0, 0)), '2026-01-05');
});

test('dayKeyOfTime reads stored times in both spellings and rejects junk', () => {
  assert.equal(dayKeyOfTime('2026-10-02T17:07:50', 0), '2026-10-02');
  assert.equal(dayKeyOfTime('2026-10-02 00:00:01', 0), '2026-10-02');
  assert.equal(dayKeyOfTime('not a time', 0), null);
  assert.equal(dayKeyOfTime(undefined, 0), null);
});

test('a trading day starting at 5am: a close before 5 belongs to the day before, also across a month and year', () => {
  assert.equal(dayKeyOfTime('2026-11-07T01:00:00', 5), '2026-11-06'); // Saturday 1am counts as Friday
  assert.equal(dayKeyOfTime('2026-11-07 04:59:59', 5), '2026-11-06');
  assert.equal(dayKeyOfTime('2026-11-07T05:00:00', 5), '2026-11-07');
  assert.equal(dayKeyOfTime('2026-12-01T02:00:00', 5), '2026-11-30');
  assert.equal(dayKeyOfTime('2027-01-01T04:00:00', 5), '2026-12-31');
  assert.equal(tradingDayOf(new Date(2026, 10, 7, 1, 0), 5), '2026-11-06');
  assert.equal(tradingDayOf(new Date(2026, 10, 7, 1, 0), 0), '2026-11-07');
  assert.equal(tradingDayStartMs('2026-11-06', 5), new Date(2026, 10, 6, 5, 0).getTime());
});

test('summarizeDay and tradesOfDay take a trade closed after midnight into the evening before', () => {
  const trades = [
    { time: '2026-11-06T22:00:00', profit: 1, rr: 1, resultType: 'TP' },
    { time: '2026-11-07T01:00:00', profit: 2, rr: 2, resultType: 'TP' },
    { time: '2026-11-07T06:00:00', profit: 4, rr: 4, resultType: 'TP' },
  ];
  assert.equal(summarizeDay(trades, '2026-11-06', 5).pnl, 3);
  assert.equal(summarizeDay(trades, '2026-11-07', 5).pnl, 4);
  assert.deepEqual(tradesOfDay(trades, '2026-11-06', 5).map(t => t.profit), [1, 2]);
});

const trades = [
  { time: '2026-10-01T07:58:13', profit: -1.37, risk: 1.4, rr: -0.98 },
  { time: '2026-10-01T14:15:06', profit: 18.99, risk: 1.42, rr: 13.37 },
  { time: '2026-10-01T23:59:59', profit: 0.08, risk: 1.5, rr: 0.05 },
  { time: '2026-10-02T00:00:00', profit: -0.85, risk: 0.78, rr: -1.09 },
];

test('summarizeDay counts only the trades that closed that day, to the second', () => {
  const s = summarizeDay(trades, '2026-10-01', 0);
  assert.equal(s.count, 3);
  assert.equal(s.pnl, 17.7);
  assert.ok(Math.abs(s.rr - 12.44) < 1e-9);
  assert.deepEqual([s.wins, s.losses, s.bes], [1, 1, 1]);
});

test('summarizeDay: a day without trades is all zeros', () => {
  assert.deepEqual(summarizeDay(trades, '2026-10-04', 0), { count: 0, pnl: 0, rr: 0, wins: 0, losses: 0, bes: 0 });
});

test('summarizeDay adds money exactly', () => {
  const many = Array.from({ length: 30 }, () => ({ time: '2026-05-05T10:00:00', profit: 0.1 }));
  assert.equal(summarizeDay(many, '2026-05-05', 0).pnl, 3);
});

test('tradesOfDay lists the day\'s trades from the earliest close', () => {
  const shuffled = [trades[2], trades[3], trades[0], trades[1]];
  assert.deepEqual(tradesOfDay(shuffled, '2026-10-01', 0).map(t => t.profit), [-1.37, 18.99, 0.08]);
  assert.deepEqual(tradesOfDay(shuffled, '2026-10-02', 0).map(t => t.profit), [-0.85]);
  assert.deepEqual(tradesOfDay(shuffled, '2026-10-05', 0), []);
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
