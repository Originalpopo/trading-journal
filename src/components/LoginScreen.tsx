"use client";

import { useState } from "react";
import { Flame, LogOut, ShieldAlert } from "lucide-react";

interface LoginScreenProps {
  mode: "signIn" | "denied" | "error";
  email?: string | null;
  uid?: string;
  message?: string;
  onSignIn: () => Promise<void>;
  onSignOut: () => Promise<void>;
}

export function LoginScreen({ mode, email, uid, message, onSignIn, onSignOut }: LoginScreenProps) {
  const [isBusy, setIsBusy] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);

  const handleSignIn = async () => {
    setIsBusy(true);
    setSignInError(null);
    try {
      await onSignIn();
    } catch (error: any) {
      if (error?.code !== "auth/popup-closed-by-user" && error?.code !== "auth/cancelled-popup-request") {
        setSignInError(error?.message || "Sign in failed.");
      }
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-white flex flex-col items-center justify-center z-50">
      <div className="flex flex-col items-center max-w-sm w-full px-6 text-center">
        <div className="flex items-center gap-2 mb-12">
          <Flame className="w-12 h-12 text-orange-400" strokeWidth={1.5} />
          <h1 className="text-3xl font-extrabold text-stone-900 tracking-tight">
            Trade<span className="text-orange-400">Journal</span>
          </h1>
        </div>

        {mode === "signIn" && (
          <>
            <button
              onClick={handleSignIn}
              disabled={isBusy}
              className="w-full px-6 py-3 bg-orange-400 hover:bg-orange-500 disabled:opacity-50 text-white font-bold rounded-xl transition shadow-lg shadow-orange-200"
            >
              {isBusy ? "Signing in..." : "Sign in with Google"}
            </button>
            {signInError && <p className="text-red-900 text-xs font-semibold mt-4">{signInError}</p>}
          </>
        )}

        {mode !== "signIn" && (
          <>
            <ShieldAlert className="w-10 h-10 text-red-900 mb-4" />
            <p className="text-stone-950 font-bold mb-2">
              {mode === "denied" ? "This account has no access." : "Could not load the journal."}
            </p>
            {mode === "error" && message && <p className="text-stone-500 text-xs font-medium mb-2">{message}</p>}
            {email && <p className="text-stone-500 text-sm font-medium">{email}</p>}
            {uid && <p className="text-stone-400 text-[11px] font-mono mt-1 mb-8 break-all select-all">UID: {uid}</p>}
            <div className="flex gap-3 w-full">
              {mode === "error" && (
                <button
                  onClick={() => window.location.reload()}
                  className="flex-1 px-6 py-3 bg-orange-400 hover:bg-orange-500 text-white font-bold rounded-xl transition"
                >
                  Retry
                </button>
              )}
              <button
                onClick={onSignOut}
                className="flex-1 px-6 py-3 bg-stone-100 hover:bg-stone-200 text-stone-600 font-bold rounded-xl transition flex items-center justify-center gap-2"
              >
                <LogOut className="w-4 h-4" />
                Sign out
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
