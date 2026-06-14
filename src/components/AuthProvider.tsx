"use client";

import { useState, useEffect } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { PinScreen } from "./PinScreen";

interface AuthSettings {
  pin: string;
  hint: string;
}

const DEFAULT_SETTINGS: AuthSettings = {
  pin: "3060",
  hint: "โทรศัพท์บ้านเก่า",
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [globalSettings, setGlobalSettings] = useState<AuthSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const docRef = doc(db, "settings", "auth");
        const docSnap = await getDoc(docRef);

        let currentSettings = DEFAULT_SETTINGS;

        if (docSnap.exists()) {
          currentSettings = docSnap.data() as AuthSettings;
        } else {
          // Initialize defaults in Firebase if it doesn't exist
          await setDoc(docRef, DEFAULT_SETTINGS);
        }

        setGlobalSettings(currentSettings);

        const localPin = localStorage.getItem("tradejournal_pin");
        if (localPin === currentSettings.pin) {
          setIsAuthenticated(true);
        } else {
          setIsAuthenticated(false);
        }
      } catch (error) {
        console.error("Error fetching auth settings:", error);
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();
  }, []);

  const handleUnlock = (enteredPin: string) => {
    if (enteredPin === globalSettings.pin) {
      localStorage.setItem("tradejournal_pin", enteredPin);
      setIsAuthenticated(true);
      return true;
    }
    return false;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <PinScreen hint={globalSettings.hint} onUnlock={handleUnlock} />;
  }

  return <>{children}</>;
}
