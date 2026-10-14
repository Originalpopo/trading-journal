import { test } from 'node:test';
import assert from 'node:assert/strict';
import { weekKeyOf, weekKeyOfDay, daysOfWeek, formatWeekRange, summarizeWeek, groupNotesByWeek } from './weekNotes.ts';

test('a week is named by its Sunday, also across a month edge', () => {
  assert.equal(weekKeyOf(new Date(2026, 9, 14, 23, 59)), '2026-10-11');
  assert.equal(weekKeyOf(new Date(2026, 9, 11)), '2026-10-11');
  assert.equal(weekKeyOf(new Date(2026, 9, 17)), '2026-10-11');
  assert.equal(weekKeyOfDay('2026-10-02'), '2026-09-27');
  assert.equal(weekKeyOfDay('2026-09-30'), '2026-09-27');
});

test('daysOfWeek lists Sunday to Saturday', () => {
  assert.deepEqual(daysOfWeek('2026-09-27'), ['2026-09-27', '2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03']);
});

test('formatWeekRange writes the month once when it can', () => {
  assert.equal(formatWeekRange('2026-10-11'), 'Oct 11 – 17, 2026');
  assert.equal(formatWeekRange('2026-09-27'), 'Sep 27 – Oct 3, 2026');
  assert.equal(formatWeekRange('2026-12-27'), 'Dec 27, 2026 – Jan 2, 2027');
});

test('summarizeWeek adds up the whole week across the month edge, day by day', () => {
  const trades = [
    { time: '2026-09-30T21:58:34', profit: -1.4, risk: 1.46, rr: -0.96, resultType: 'SL' },
    { time: '2026-10-01T14:15:06', profit: 18.99, risk: 1.42, rr: 13.37, resultType: 'TP' },
    { time: '2026-10-02 10:00:32', profit: 0.08, risk: 1.5, rr: 0.05, resultType: 'BE' },
    { time: '2026-10-04T10:00:00', profit: 5, risk: 1, rr: 5, resultType: 'TP' }, // next week
  ];
  const week = summarizeWeek(trades, '2026-09-27');
  assert.deepEqual([week.count, week.pnl, week.wins, week.losses, week.bes], [3, 17.67, 1, 1, 1]);
  assert.equal(week.days.length, 7);
  assert.deepEqual(week.days.map(d => d.count), [0, 0, 0, 1, 1, 1, 0]);
  assert.equal(week.days[4].pnl, 18.99);
});

const day = (date: string, content: string) => ({ date, content, mood: 'meh' });

test('groupNotesByWeek puts each day note under its week, newest first', () => {
  const groups = groupNotesByWeek(
    [day('2026-09-28', 'a'), day('2026-10-13', 'b'), day('2026-10-02', 'c'), day('2026-10-12', 'd')],
    [{ week: '2026-10-04', content: 'quiet week', mood: 'meh' }, { week: '2026-09-27', content: 'review', mood: 'smile' }],
  );
  assert.deepEqual(groups.map(g => g.week), ['2026-10-11', '2026-10-04', '2026-09-27']);
  assert.deepEqual(groups[0].dayNotes.map(n => n.date), ['2026-10-13', '2026-10-12']);
  assert.equal(groups[0].weekNote, undefined);
  assert.equal(groups[1].weekNote?.content, 'quiet week');
  assert.deepEqual(groups[1].dayNotes, []);
  assert.deepEqual(groups[2].dayNotes.map(n => n.date), ['2026-10-02', '2026-09-28']);
});

test('a search keeps the whole week of a matching note', () => {
  const dayNotes = [day('2026-10-12', 'entered too early'), day('2026-10-13', 'calm'), day('2026-10-02', 'calm')];
  const weekNotes = [{ week: '2026-09-27', content: 'Break Block worked', mood: 'laugh' }];
  const byDay = groupNotesByWeek(dayNotes, weekNotes, 'EARLY');
  assert.deepEqual(byDay.map(g => g.week), ['2026-10-11']);
  assert.equal(byDay[0].dayNotes.length, 2);
  assert.deepEqual(groupNotesByWeek(dayNotes, weekNotes, 'break block').map(g => g.week), ['2026-09-27']);
  assert.deepEqual(groupNotesByWeek(dayNotes, weekNotes, 'sep 27').map(g => g.week), ['2026-09-27']);
  assert.equal(groupNotesByWeek(dayNotes, weekNotes, '').length, 2);
});
