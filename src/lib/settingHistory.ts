// A setting that changes how trades are read keeps a history of its values, so that changing it
// only reaches what happens from then on and never rewrites a figure that is already in the past.
// Kept free of app imports so it can be unit-tested with `node --test`.

// One value, in force from `from` until the next change. `from` is a local time ("YYYY-MM-DD" or
// "YYYY-MM-DD HH:mm:ss"); "" is the value for everything before the first change.
export interface SettingChange {
  from: string;
  value: number;
}

const msOf = (time: string) => (time ? new Date(time.length === 10 ? `${time}T00:00:00` : time.replace(' ', 'T')).getTime() : -Infinity);

// The value in force at a moment (ms), or `fallback` with no history or for a moment that cannot be read.
export function valueAt(history: SettingChange[] | undefined, at: number, fallback: number): number {
  if (!history?.length || Number.isNaN(at)) return fallback;
  let value = fallback;
  for (const c of [...history].sort((a, b) => msOf(a.from) - msOf(b.from))) {
    if (msOf(c.from) > at) break;
    value = c.value;
  }
  return value;
}

// The history after the value is changed from `oldValue` to `newValue`, in force from `from`: the first change
// also records the old value for everything before it, and a change at or before the latest one replaces it.
export function withChange(history: SettingChange[] | undefined, oldValue: number, newValue: number, from: string): SettingChange[] {
  const start = msOf(from);
  const kept = (history?.length ? history : [{ from: '', value: oldValue }]).filter(c => msOf(c.from) < start);
  if (valueAt(kept, start, oldValue) === newValue) return kept;
  return [...kept, { from, value: newValue }].sort((a, b) => msOf(a.from) - msOf(b.from));
}
