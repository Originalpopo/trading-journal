import { doc, writeBatch } from 'firebase/firestore';
import { db } from './firebase';
import { clearChartCache } from './chartCache';
import type { Trade, Funding } from '@/store/useJournalStore';
import type { DayNote } from './dayNotes';

export const clearDatabase = async (
  trades: Trade[],
  funding: Funding[],
  dayNotes: DayNote[],
  onProgress?: (status: string) => void,
  onComplete?: () => void,
  onError?: (error: unknown) => void
) => {
  if (!confirm("Are you SURE you want to clear the entire database?\nThis will delete all trades and funding data!")) {
    return;
  }
  
  const answer = prompt("WARNING: This action is permanent and cannot be undone.\nType 'DELETE' to confirm:");
  if (answer !== "DELETE") {
    alert("Database reset cancelled.");
    return;
  }

  if (onProgress) onProgress("Clearing DB...");

  try {
    let batch = writeBatch(db);
    let count = 0;
    
    // Delete trades
    for (const t of trades) {
      const docRef = doc(db, "trades", t.id);
      batch.delete(docRef);
      count++;
      if (count === 500) {
        await batch.commit();
        batch = writeBatch(db);
        count = 0;
      }
    }
    if (count > 0) {
      await batch.commit();
      batch = writeBatch(db);
      count = 0;
    }

    // Delete funding
    for (const f of funding) {
      const docRef = doc(db, "funding", f.id);
      batch.delete(docRef);
      count++;
      if (count === 500) {
        await batch.commit();
        batch = writeBatch(db);
        count = 0;
      }
    }
    if (count > 0) {
      await batch.commit();
      batch = writeBatch(db);
      count = 0;
    }

    // Delete day notes
    for (const n of dayNotes) {
      const docRef = doc(db, "dayNotes", n.date);
      batch.delete(docRef);
      count++;
      if (count === 500) {
        await batch.commit();
        batch = writeBatch(db);
        count = 0;
      }
    }
    if (count > 0) {
      await batch.commit();
    }

    await clearChartCache();

    alert("Database successfully cleared.");
    if (onComplete) onComplete();
  } catch (e) {
    console.error("Error clearing DB:", e);
    alert("An error occurred while clearing the database.");
    if (onError) onError(e);
  }
};

export const downloadDatabase = (trades: Trade[], funding: Funding[], dayNotes: DayNote[]) => {
  const data = {
    trades,
    funding,
    dayNotes
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
};

export const restoreDatabase = async (
  jsonData: string,
  onProgress?: (status: string) => void,
  onComplete?: (result: { trades: number, funding: number, notes: number }) => void,
  onError?: (error: unknown) => void
) => {
  try {
    const data = JSON.parse(jsonData);
    if (!data.trades && !data.funding && !data.dayNotes) {
      throw new Error("Invalid database format.");
    }

    if (onProgress) onProgress("Restoring DB...");

    let batch = writeBatch(db);
    let count = 0;
    let tradesCount = 0;
    let fundingCount = 0;
    let notesCount = 0;

    // Restore trades
    if (data.trades) {
      for (const t of data.trades) {
        const docRef = doc(db, "trades", t.id);
        batch.set(docRef, t);
        count++;
        tradesCount++;
        if (count === 500) {
          await batch.commit();
          batch = writeBatch(db);
          count = 0;
        }
      }
    }

    // Restore funding
    if (data.funding) {
      for (const f of data.funding) {
        const docRef = doc(db, "funding", f.id);
        batch.set(docRef, f);
        count++;
        fundingCount++;
        if (count === 500) {
          await batch.commit();
          batch = writeBatch(db);
          count = 0;
        }
      }
    }

    // Restore day notes (free-standing notes from older backups are no longer used)
    if (data.dayNotes) {
      for (const n of data.dayNotes) {
        if (!n?.date) continue;
        const docRef = doc(db, "dayNotes", n.date);
        batch.set(docRef, n);
        count++;
        notesCount++;
        if (count === 500) {
          await batch.commit();
          batch = writeBatch(db);
          count = 0;
        }
      }
    }

    if (count > 0) {
      await batch.commit();
    }

    if (onComplete) onComplete({ trades: tradesCount, funding: fundingCount, notes: notesCount });
  } catch (e) {
    console.error("Error restoring DB:", e);
    alert("An error occurred while restoring the database. Ensure the file is a valid JSON database backup.");
    if (onError) onError(e);
  }
};
