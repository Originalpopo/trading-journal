// What has already happened stays put: changing a setting, adding a trade or moving money in or out
// never rewrites a figure of the past.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { valueAt, withChange } from './settingHistory.ts';
import { withDerivedRisk } from './risk.ts';
import { setBeThreshold, setBeThresholdHistory, calcTimeWeightedReturn, type TimelineEvent } from './stats.ts';
import { dayKeyOfTime, tradingDayOf } from './dayNotes.ts';

const near = (actual: number, expected: number, tolerance = 1e-6) =>
  assert.ok(Math.abs(actual - expected) < tolerance, `expected ${expected}, got ${actual}`);
const ms = (t: string) => new Date(t.replace(' ', 'T')).getTime();

test('settingHistory: the first change keeps the old value for everything before it', () => {
  const h = withChange(undefined, 0.4, 0.7, '2026-11-09T12:00:00');
  assert.deepEqual(h, [{ from: '', value: 0.4 }, { from: '2026-11-09T12:00:00', value: 0.7 }]);
  assert.equal(valueAt(h, ms('2026-11-09 11:59:59'), 0.7), 0.4);
  assert.equal(valueAt(h, ms('2026-11-09 12:00:00'), 0.7), 0.7);
  assert.equal(valueAt(undefined, ms('2020-01-01 00:00:00'), 0.7), 0.7);
});

test('settingHistory: changing back on the same day leaves no change behind; day keys work as `from`', () => {
  const once = withChange(undefined, 5, 0, '2026-11-10');
  assert.deepEqual(withChange(once, 0, 5, '2026-11-10'), [{ from: '', value: 5 }]);
  assert.equal(valueAt(once, ms('2026-11-09 00:00:00'), 0), 5);
  assert.equal(valueAt(once, ms('2026-11-10 00:00:00'), 0), 0);
});

// Stop trailed into profit and hit for +0.6R: a TP with a 0.4R BE range, a BE with 0.7R.
const trailed = (time: string) => ({ id: time, symbol: 'XAUUSD', size: 0.01, side: 'BUY', entryPrice: 4000, slPrice: 4001.2,
  initialSlPrice: 3998, initialSlSource: 'manual' as const, exitPrice: 4001.2, exitType: 'Stop Loss', profit: 1.2, risk: 2, time });

test('changing the BE range only relabels trades closed after the change', () => {
  try {
    setBeThreshold(0.7);
    setBeThresholdHistory(withChange(undefined, 0.4, 0.7, '2026-11-09T12:00:00'));
    const [before, after] = withDerivedRisk([trailed('2026-11-09T10:00:00'), trailed('2026-11-09T13:00:00')], 2);
    assert.equal(before.resultType, 'TP');
    assert.equal(after.resultType, 'BE');
  } finally {
    setBeThreshold(undefined);
    setBeThresholdHistory(undefined);
  }
});

test('changing the day start hour keeps every trade in its past day', () => {
  // 03:00 on 9 Nov belonged to 8 Nov while days started at 05:00. Midnight from 10 Nov on.
  const history = withChange(undefined, 5, 0, '2026-11-10');
  const startHour = (day: string) => valueAt(history, ms(`${day} 00:00:00`), 0);
  assert.equal(dayKeyOfTime('2026-11-09T03:00:00', startHour), '2026-11-08');
  assert.equal(dayKeyOfTime('2026-11-09T05:00:00', startHour), '2026-11-09');
  // The day before the change runs to midnight; the new hour applies from then.
  assert.equal(dayKeyOfTime('2026-11-09T23:30:00', startHour), '2026-11-09');
  assert.equal(dayKeyOfTime('2026-11-10T03:00:00', startHour), '2026-11-10');
  // A fixed hour reads as before.
  assert.equal(tradingDayOf(new Date(2026, 10, 9, 4, 59), 5), '2026-11-08');
  assert.equal(tradingDayOf(new Date(2026, 10, 9, 5, 0), 5), '2026-11-09');
});

test('a trade added later never changes the 1R of an earlier one', () => {
  const old = { ...trailed('2026-11-01T10:00:00'), id: 'old', exitType: 'Take Profit', slPrice: 3998 };
  // Later fills that round to $1.02 per point at 0.01 lot.
  const later = [1, 2, 3].map(i => ({ id: `n${i}`, symbol: 'XAUUSD', size: 0.01, side: 'BUY', entryPrice: 4000, exitPrice: 4000.333,
    exitType: 'Take Profit', profit: 0.34, time: `2026-11-0${2 + i}T10:00:00` }));
  const alone = withDerivedRisk([old], 2)[0];
  const grown = withDerivedRisk([old, ...later], 2).find(t => t.id === 'old')!;
  near(alone.risk, 2);
  near(grown.risk, alone.risk);
  near(grown.rr, alone.rr);
});

const deposit = (amount: number): TimelineEvent => ({ type: 'funding', deposit: amount });
const withdraw = (amount: number): TimelineEvent => ({ type: 'funding', withdraw: amount });
const trade = (profit: number): TimelineEvent => ({ type: 'trade', profit });

test('time-weighted return: a deposit or withdrawal does not move it', () => {
  near(calcTimeWeightedReturn([deposit(50), trade(50)]), 100);
  near(calcTimeWeightedReturn([deposit(50), trade(50), deposit(50)]), 100);
  near(calcTimeWeightedReturn([deposit(50), trade(50), withdraw(60)]), 100);
  // +100%, then +$10 on $150: 2 × (160/150) - 1
  near(calcTimeWeightedReturn([deposit(50), trade(50), deposit(50), trade(10)]), (2 * 160 / 150 - 1) * 100);
  near(calcTimeWeightedReturn([]), 0);
  near(calcTimeWeightedReturn([deposit(100), trade(-20)]), -20);
});
