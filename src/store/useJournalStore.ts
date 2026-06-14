import { create } from 'zustand';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

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
}

export interface Funding {
  id: string;
  time: string;
  deposit: number;
  withdraw: number;
  notes: string;
}

export interface Note {
  id: string;
  title: string;
  date: string;
  content: string;
  icon: string;
  createdAt?: string;
  updatedAt?: string;
}

interface JournalState {
  trades: Trade[];
  funding: Funding[];
  notes: Note[];
  isLoading: boolean;
  initializeListeners: () => () => void;
  addTrade: (trade: Omit<Trade, 'id'>) => Promise<void>;
  updateTrade: (id: string, trade: Partial<Trade>) => Promise<void>;
  deleteTrade: (id: string) => Promise<void>;
  addNote: (note: Omit<Note, 'id'>) => Promise<void>;
  updateNote: (id: string, note: Partial<Note>) => Promise<void>;
  deleteNote: (id: string) => Promise<void>;
}

export const useJournalStore = create<JournalState>((set) => ({
  trades: [],
  funding: [],
  notes: [],
  isLoading: true,
  initializeListeners: () => {
    set({ isLoading: true });

    const unsubscribeTrades = onSnapshot(collection(db, 'trades'), (snapshot) => {
      const tradesData: Trade[] = [];
      snapshot.forEach((doc) => {
        tradesData.push({ id: doc.id, ...doc.data() } as Trade);
      });
      // Sort by time
      tradesData.sort((a, b) => new Date(a.time.replace(' ', 'T')).getTime() - new Date(b.time.replace(' ', 'T')).getTime());
      set({ trades: tradesData });
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

    const unsubscribeNotes = onSnapshot(collection(db, 'notes'), (snapshot) => {
      const notesData: Note[] = [];
      snapshot.forEach((doc) => {
        notesData.push({ id: doc.id, ...doc.data() } as Note);
      });
      notesData.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      set({ notes: notesData, isLoading: false });
    });

    return () => {
      unsubscribeTrades();
      unsubscribeFunding();
      unsubscribeNotes();
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
  deleteTrade: async (id) => {
    try {
      await deleteDoc(doc(db, 'trades', id));
    } catch (error) {
      console.error("Error deleting trade: ", error);
      throw error;
    }
  },
  addNote: async (note) => {
    try {
      await addDoc(collection(db, 'notes'), note);
    } catch (error) {
      console.error("Error adding note: ", error);
      throw error;
    }
  },
  updateNote: async (id, note) => {
    try {
      await updateDoc(doc(db, 'notes', id), note);
    } catch (error) {
      console.error("Error updating note: ", error);
      throw error;
    }
  },
  deleteNote: async (id) => {
    try {
      await deleteDoc(doc(db, 'notes', id));
    } catch (error) {
      console.error("Error deleting note: ", error);
      throw error;
    }
  }
}));
