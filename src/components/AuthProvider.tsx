"use client";

import { useState, useEffect } from "react";
import { doc, getDoc } from "firebase/firestore";
import { onAuthStateChanged, signInWithPopup, signOut, User } from "firebase/auth";
import { db, auth, googleProvider } from "@/lib/firebase";
import { PinScreen } from "./PinScreen";
import { LoginScreen } from "./LoginScreen";

interface AuthSettings {
  pin: string;
  hint: string;
}

type AuthStatus = "loading" | "signedOut" | "denied" | "error" | "locked" | "unlocked";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<User | null>(null);
  const [globalSettings, setGlobalSettings] = useState<AuthSettings | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | undefined>();

  useEffect(() => {
    // Google sign-in protects the data (Firestore rules); the PIN is only a quick lock on top of it.
    return onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (!u) {
        setStatus("signedOut");
        return;
      }

      setStatus("loading");
      try {
        const docSnap = await getDoc(doc(db, "settings", "auth"));
        const settings = docSnap.exists() ? (docSnap.data() as AuthSettings) : null;
        setGlobalSettings(settings);

        if (!settings?.pin) {
          setStatus("unlocked");
        } else {
          const localPin = localStorage.getItem("tradejournal_pin");
          setStatus(localPin === settings.pin ? "unlocked" : "locked");
        }
      } catch (error) {
        console.error("Error fetching auth settings:", error);
        if ((error as { code?: string } | null)?.code === "permission-denied") {
          setStatus("denied");
        } else {
          setErrorMessage((error as { message?: string } | null)?.message);
          setStatus("error");
        }
      }
    });
  }, []);

  const handleSignIn = async () => {
    await signInWithPopup(auth, googleProvider);
  };

  const handleSignOut = async () => {
    await signOut(auth);
  };

  const handleUnlock = (enteredPin: string) => {
    if (globalSettings && enteredPin === globalSettings.pin) {
      localStorage.setItem("tradejournal_pin", enteredPin);
      setStatus("unlocked");
      return true;
    }
    return false;
  };

  if (status === "loading") {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-stone-50">
        <div className="w-8 h-8 border-4 border-orange-400 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (status === "signedOut" || status === "denied" || status === "error") {
    return (
      <LoginScreen
        mode={status === "signedOut" ? "signIn" : status}
        email={user?.email}
        uid={user?.uid}
        message={errorMessage}
        onSignIn={handleSignIn}
        onSignOut={handleSignOut}
      />
    );
  }

  if (status === "locked") {
    return <PinScreen hint={globalSettings?.hint || ""} onUnlock={handleUnlock} />;
  }

  return <>{children}</>;
}
