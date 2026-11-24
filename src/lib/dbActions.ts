import { collection, doc, getDoc, getDocs, setDoc, writeBatch, type DocumentReference } from 'firebase/firestore';
import { db } from './firebase';
import { clearChartCache, deleteCachedCandles } from './chartCache';
import { COLLECTIONS, docIdOf, idsToRemove, prefsAfterRestore, type Backup, type Ids } from './restorePlan';
import type { Trade, Funding, Preferences } from '@/store/useJournalStore';
import type { DayNote } from './dayNotes';
import type { WeekNote } from './weekNotes';

// The IDs in the journal right now, read from Firestore itself (not the screen's copy, which may still be loading).
const currentIds = async (): Promise<Ids> => {
  const out = {} as Ids;
  for (const name of COLLECTIONS) {
    out[name] = (await getDocs(collection(db, name))).docs.map(d => d.id);
  }
  return out;
};

type Write = { ref: DocumentReference; data?: Record<string, unknown> }; // no data = delete

// How far a restore or clear has got, for the bar in its popup: steps done out of all steps.
export type Progress = (done: number, total: number) => void;

// Counts steps as they finish and passes them on. Batches of 100 (Firestore allows 500) so the bar moves in
// visible steps on a journal of a few hundred entries.
const BATCH = 100;
const progressCounter = (total: number, onProgress?: Progress) => {
  let done = 0;
  onProgress?.(0, total);
  return (n: number) => { done = Math.min(total, done + n); onProgress?.(done, total); };
};

const commitInBatches = async (writes: Write[], step: (n: number) => void) => {
  for (let i = 0; i < writes.length; i += BATCH) {
    const part = writes.slice(i, i + BATCH);
    const batch = writeBatch(db);
    for (const w of part) {
      if (w.data) batch.set(w.ref, w.data);
      else batch.delete(w.ref);
    }
    await batch.commit();
    step(part.length);
  }
};

// Deletes every trade, funding entry, day note and week note, and the cached chart candles. Settings (risk, BE,
// balance checks, statement details) and the PIN are kept. Asking first is the caller's job (ClearDataModal).
export const clearAllData = async (onProgress?: Progress) => {
  const ids = await currentIds();
  const deletes = COLLECTIONS.flatMap(name => ids[name].map(id => ({ ref: doc(db, name, id) })));
  const step = progressCounter(deletes.length + 1, onProgress); // + 1: the chart cache at the end
  await commitInBatches(deletes, step);
  await clearChartCache();
  step(1);
};

// Preferences are part of the backup: they hold the broker balance-check history and the
// statement details, which are evidence and cannot be rebuilt from the trades.
export const downloadDatabase = (trades: Trade[], funding: Funding[], dayNotes: DayNote[], weekNotes: WeekNote[], preferences: Preferences) => {
  const lastBackupAt = new Date().toISOString();
  const data = {
    trades,
    funding,
    dayNotes,
    weekNotes,
    preferences: { ...preferences, lastBackupAt }
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `tradejournal_db_${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  // Remembered so the backup reminder can say how old the latest backup is.
  setDoc(doc(db, "settings", "preferences"), { lastBackupAt }, { merge: true })
    .catch(e => console.error("Error recording the backup time:", e));
};

// Puts the journal back exactly as the backup file had it. Everything in the file is written first, and only then
// is what the file does not have deleted, so a failure half-way never leaves less than there was. Settings are
// replaced by the file's, except the last backup time and reminder days (prefsAfterRestore); the PIN lives in
// settings/auth and is never touched. A file without settings keeps the current ones. Asking first is the caller's job (RestoreModal).
export const restoreDatabase = async (backup: Backup, onProgress?: Progress) => {
  const remove = idsToRemove(await currentIds(), backup);
  const writes = COLLECTIONS.flatMap(name => backup[name].map(d => ({ ref: doc(db, name, docIdOf(name, d)), data: d })));
  const deletes = COLLECTIONS.flatMap(name => remove[name].map(id => ({ ref: doc(db, name, id) })));
  // Steps: each entry written, the settings, each entry deleted, and the chart cache of each removed trade.
  const step = progressCounter(writes.length + (backup.preferences ? 1 : 0) + deletes.length + remove.trades.length, onProgress);

  await commitInBatches(writes, step);
  if (backup.preferences) {
    const prefsRef = doc(db, "settings", "preferences");
    const current = (await getDoc(prefsRef)).data() ?? {};
    await setDoc(prefsRef, prefsAfterRestore(backup.preferences, current));
    step(1);
  }
  await commitInBatches(deletes, step);

  // Candles cached for trades that are gone would never be read again.
  for (const id of remove.trades) {
    await deleteCachedCandles(id);
    step(1);
  }
  return remove;
};
