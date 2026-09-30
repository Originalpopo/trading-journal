// Checklist items a trade can be tagged with, in display order.
export const CHECKLIST_NAMES = ['On Plan', 'Follow', 'Reversal', 'Entry 1st', 'Entry 2nd'] as const;

// "Follow" and "Reversal" are mutually exclusive: turning one on turns the other off.
const EXCLUSIVE_WITH: Record<string, string> = { Follow: 'Reversal', Reversal: 'Follow' };

export type ChecklistChange = 'keep' | 'add' | 'remove';

// Applies per-item add/remove changes (e.g. from a bulk edit) to a trade's checklists.
export function applyChecklistChanges(current: string[], changes: Record<string, ChecklistChange>): string[] {
  let result = [...current];
  for (const [name, change] of Object.entries(changes)) {
    if (change === 'remove') {
      result = result.filter(c => c !== name);
    } else if (change === 'add') {
      const other = EXCLUSIVE_WITH[name];
      result = result.filter(c => c !== name && c !== other);
      result.push(name);
    }
  }
  return result;
}

// Setting one side of an exclusive pair to 'add' forces the other to 'remove'.
export function setChecklistChange(
  changes: Record<string, ChecklistChange>,
  name: string,
  change: ChecklistChange,
): Record<string, ChecklistChange> {
  const next = { ...changes, [name]: change };
  const other = EXCLUSIVE_WITH[name];
  if (change === 'add' && other) next[other] = 'remove';
  return next;
}
