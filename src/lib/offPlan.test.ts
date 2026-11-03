import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_OFF_PLAN_REASONS, reasonUsage, reasonsOfTrade, offPlanWithoutReason, reasonsOrDefault, offeredReasons, withoutReason } from './offPlan.ts';

const reasons = DEFAULT_OFF_PLAN_REASONS;

test('reasons of a trade: only off-plan trades have them, in the list order, skipping removed ids', () => {
  const off = { checklists: [], isOnPlan: false, offPlanReasons: ['early-tp', 'gone', 'early-be'] };
  assert.deepEqual(reasonsOfTrade(off, reasons).map(r => r.id), ['early-be', 'early-tp']);
  // An on-plan trade never shows a reason, even one left in its data.
  assert.deepEqual(reasonsOfTrade({ checklists: ['On Plan'], isOnPlan: true, offPlanReasons: ['early-be'] }, reasons), []);
});

test('off-plan trades with no reason are found; old trades with no mark count as on plan', () => {
  const trades = [
    { id: 'a', checklists: [], isOnPlan: false },
    { id: 'b', checklists: [], isOnPlan: false, offPlanReasons: ['early-be'] },
    { id: 'c', checklists: [], isOnPlan: false, offPlanReasons: ['gone'] },
    { id: 'd' },
    { id: 'e', checklists: ['On Plan'], isOnPlan: true },
  ];
  assert.deepEqual(offPlanWithoutReason(trades, reasons).map(t => t.id), ['a', 'c']);
});

test('usage counts each reason once per off-plan trade', () => {
  const usage = reasonUsage([
    { isOnPlan: false, offPlanReasons: ['early-be', 'early-be', 'early-tp'] },
    { isOnPlan: false, offPlanReasons: ['early-be'] },
    { isOnPlan: true, checklists: ['On Plan'], offPlanReasons: ['early-tp'] },
  ]);
  assert.equal(usage.get('early-be'), 2);
  assert.equal(usage.get('early-tp'), 1);
});

test('the default list stands in until the user saves their own, even an empty one', () => {
  assert.equal(reasonsOrDefault(undefined), DEFAULT_OFF_PLAN_REASONS);
  assert.deepEqual(reasonsOrDefault([]), []);
});

test('removing a reason a trade names keeps it on that trade, but no longer offers it to others', () => {
  const usage = new Map([['early-be', 2]]);
  const kept = withoutReason(reasons, 'early-be', usage);
  assert.equal(kept.find(r => r.id === 'early-be')!.removed, true);
  // An unused one goes outright.
  assert.equal(withoutReason(reasons, 'early-tp', usage).some(r => r.id === 'early-tp'), false);
  // The trade still shows it and still counts as having a reason.
  const trade = { isOnPlan: false, offPlanReasons: ['early-be'] };
  assert.deepEqual(reasonsOfTrade(trade, kept).map(r => r.name), ['เลื่อน BE ก่อนแผน']);
  assert.deepEqual(offPlanWithoutReason([trade], kept), []);
  // Offered on that trade's Edit (to take it off), not on another.
  assert.equal(offeredReasons(kept, ['early-be']).some(r => r.id === 'early-be'), true);
  assert.equal(offeredReasons(kept, []).some(r => r.id === 'early-be'), false);
});
