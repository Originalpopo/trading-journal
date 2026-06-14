import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
    apiKey: "AIzaSyCdTWVtcP0-YHV9nQLxzK79aU4lVBhLpnE",
    authDomain: "tradejournal-df173.firebaseapp.com",
    projectId: "tradejournal-df173",
    storageBucket: "tradejournal-df173.firebasestorage.app",
    messagingSenderId: "738812583165",
    appId: "1:738812583165:web:2ca559c03edeea16953294"
};

// Initialize Firebase only if it hasn't been initialized already (important for Next.js SSR/HMR)
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(app);

export { app, db };
