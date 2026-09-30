// Checklist items a trade can be tagged with. Only "On Plan" is still recorded; trades tagged
// earlier with other items (Follow, Reversal, Entry 1st, Entry 2nd) keep those tags in the data,
// they are just no longer shown or edited.
export const CHECKLIST_NAMES = ['On Plan'] as const;

export type ChecklistChange = 'keep' | 'add' | 'remove';

// Applies per-item add/remove changes (e.g. from a bulk edit) to a trade's checklists.
// Items not mentioned, including hidden legacy ones, are left as they are.
export function applyChecklistChanges(current: string[], changes: Record<string, ChecklistChange>): string[] {
  let result = [...current];
  for (const [name, change] of Object.entries(changes)) {
    if (change === 'remove') result = result.filter(c => c !== name);
    else if (change === 'add' && !result.includes(name)) result.push(name);
  }
  return result;
}
