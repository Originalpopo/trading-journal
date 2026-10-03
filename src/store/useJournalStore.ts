import { create } from 'zustand';
import { parseRobustDate } from '@/lib/utils';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, writeBatch, setDoc, arrayUnion } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { migrateLegacyChartData, deleteCachedCandles } from '@/lib/chartCache';
import type { BalanceCheck, BalanceCheckRecord } from '@/lib/reconcile';
import type { StatementProfile } from '@/lib/statement';
import type { DayNote } from '@/lib/dayNotes';

let legacyChartMigrationStarted = false;

// How exitTime was determined: 'exact' from broker data, 'estimated' from a TP/SL placed after
// entry, 'uncertain' when the broker data had nothing better (SL hit with no TP), 'manual' when
// the user set the times by hand (re-importing never overwrites those).
export type ExitTimeConfidence = 'exact' | 'estimated' | 'uncertain' | 'manual';

export interface Trade {
  id: string;
  time: string;
  profit: number;
  risk: number;
  rr: number;
  resultType: string;
  strategy: string;
  isOnPlan: boolean;
  symbol?: string;
  side?: string;
  images?: string[];
  tf?: string;
  checklists?: string[];
  entryPrice?: number;
  exitPrice?: number;
  slPrice?: number;
  tpPrice?: number;
  entryTime?: string;
  exitTime?: string;
  exitTimeConfidence?: ExitTimeConfidence;
  // The stop the trade was opened with (slPrice is where it ended up). 'broker' when read from the
  // broker's history, 'manual' when entered by the user because the stop was moved.
  initialSlPrice?: number;
  initialSlSource?: 'broker' | 'manual';
  // True when `risk` is the default 1R because the initial stop is unknown.
  riskIsEstimate?: boolean;
  orderId?: string;
  positionId?: string;
  entryType?: string;
  exitType?: string;
  duration?: number;
  // Lot size of the opening order, from the broker history (trades saved earlier have none).
  size?: number;
  // Commission the broker reported for the position. Informational: `profit` is the broker's
  // Closed P&L as given and this is not subtracted from it.
  commission?: number;
  // Candles cached by older versions; moved to the chartCache collection on load.
  chartData?: unknown;
}

export interface Funding {
  id: string;
  time: string;
  deposit: number;
  withdraw: number;
  // Baht that actually left or reached the Thai bank account for this transfer, and the day the
  // bank shows it (a withdrawal can arrive days after the broker deducts it). Tax follows these.
  thb?: number;
  bankDate?: string;
  notes: string;
  images?: string[];
}


export interface Preferences {
  // $ risk (1R) used when a trade's initial stop is unknown.
  defaultRisk?: number;
  // Latest broker balance the user entered, compared with the journal's own balance.
  balanceCheck?: BalanceCheck;
  // Every check ever saved, oldest first: evidence that the journal agreed with the broker.
  balanceCheckHistory?: BalanceCheckRecord[];
  // Who the account belongs to, printed on the monthly statement.
  statementProfile?: StatementProfile;
}

interface JournalState {
  trades: Trade[];
  funding: Funding[];
  dayNotes: DayNote[];
  preferences: Preferences;
  isLoading: boolean;
  isPrivacyMode: boolean;
  setIsPrivacyMode: (val: boolean) => void;
  updatePreferences: (prefs: Partial<Preferences>) => Promise<void>;
  saveBalanceCheck: (record: BalanceCheckRecord) => Promise<void>;
  initializeListeners: () => () => void;
  addTrade: (trade: Omit<Trade, 'id'>) => Promise<void>;
  updateTrade: (id: string, trade: Partial<Trade>) => Promise<void>;
  updateTrades: (updates: { id: string; data: Partial<Trade> }[]) => Promise<void>;
  deleteTrade: (id: string) => Promise<void>;
  saveDayNote: (date: string, note: Pick<DayNote, 'content' | 'mood'>) => Promise<void>;
  deleteDayNote: (date: string) => Promise<void>;
}

export const useJournalStore = create<JournalState>((set) => ({
  trades: [],
  funding: [],
  dayNotes: [],
  preferences: {},
  isLoading: true,
  isPrivacyMode: false,

  setIsPrivacyMode: (val) => set({ isPrivacyMode: val }),

  updatePreferences: async (prefs) => {
    await setDoc(doc(db, 'settings', 'preferences'), prefs, { merge: true });
  },

  // Sets the latest check and appends it to the history in one write.
  saveBalanceCheck: async (record) => {
    await setDoc(doc(db, 'settings', 'preferences'), {
      balanceCheck: { time: record.time, balance: record.balance },
      balanceCheckHistory: arrayUnion(record),
    }, { merge: true });
  },

  initializeListeners: () => {
    set({ isLoading: true });

    const unsubscribeTrades = onSnapshot(collection(db, 'trades'), (snapshot) => {
      const tradesData: Trade[] = [];
      snapshot.forEach((doc) => {
        tradesData.push({ id: doc.id, ...doc.data() } as Trade);
      });
      // Sort by time
      tradesData.sort((a, b) => parseRobustDate(b.time) - parseRobustDate(a.time));
      set({ trades: tradesData });

      if (!legacyChartMigrationStarted && tradesData.some(t => t.chartData)) {
        legacyChartMigrationStarted = true;
        migrateLegacyChartData(tradesData).catch(error => {
          console.error("Error moving chart data out of trades:", error);
          legacyChartMigrationStarted = false;
        });
      }
    });

    const unsubscribePreferences = onSnapshot(doc(db, 'settings', 'preferences'), (snapshot) => {
      set({ preferences: (snapshot.data() as Preferences) || {} });
    });

    const unsubscribeFunding = onSnapshot(collection(db, 'funding'), (snapshot) => {
      const fundingData: Funding[] = [];
      snapshot.forEach((doc) => {
        fundingData.push({ id: doc.id, ...doc.data() } as Funding);
      });
      // Sort by time
      fundingData.sort((a, b) => new Date(a.time.replace(' ', 'T')).getTime() - new Date(b.time.replace(' ', 'T')).getTime());
      set({ funding: fundingData });
    });

    // One document per day, named by its date.
    const unsubscribeNotes = onSnapshot(collection(db, 'dayNotes'), (snapshot) => {
      const notesData: DayNote[] = [];
      snapshot.forEach((doc) => {
        notesData.push({ ...doc.data(), date: doc.id } as DayNote);
      });
      notesData.sort((a, b) => b.date.localeCompare(a.date));
      set({ dayNotes: notesData, isLoading: false });
    });

    return () => {
      unsubscribeTrades();
      unsubscribeFunding();
      unsubscribeNotes();
      unsubscribePreferences();
    };
  },
  addTrade: async (trade) => {
    try {
      await addDoc(collection(db, 'trades'), trade);
    } catch (error) {
      console.error("Error adding trade: ", error);
      throw error;
    }
  },
  updateTrade: async (id, trade) => {
    try {
      const tradeRef = doc(db, 'trades', id);
      await updateDoc(tradeRef, trade);
    } catch (error) {
      console.error("Error updating trade: ", error);
      throw error;
    }
  },
  updateTrades: async (updates) => {
    try {
      for (let i = 0; i < updates.length; i += 500) {
        const batch = writeBatch(db);
        updates.slice(i, i + 500).forEach(({ id, data }) => batch.update(doc(db, 'trades', id), data));
        await batch.commit();
      }
    } catch (error) {
      console.error("Error updating trades: ", error);
      throw error;
    }
  },
  deleteTrade: async (id) => {
    try {
      await deleteDoc(doc(db, 'trades', id));
      deleteCachedCandles(id).catch(error => console.error("Error deleting cached candles: ", error));
    } catch (error) {
      console.error("Error deleting trade: ", error);
      throw error;
    }
  },
  // The date is the document ID, so a day can never hold two notes.
  saveDayNote: async (date, note) => {
    try {
      const now = new Date().toISOString();
      const isNew = !useJournalStore.getState().dayNotes.some(n => n.date === date);
      await setDoc(doc(db, 'dayNotes', date), { ...note, date, updatedAt: now, ...(isNew && { createdAt: now }) }, { merge: true });
    } catch (error) {
      console.error("Error saving day note: ", error);
      throw error;
    }
  },
  deleteDayNote: async (date) => {
    try {
      await deleteDoc(doc(db, 'dayNotes', date));
    } catch (error) {
      console.error("Error deleting day note: ", error);
      throw error;
    }
  }
}));
