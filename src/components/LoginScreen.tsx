"use client";

import { useState } from "react";
import { Flame, LogOut, ShieldAlert } from "lucide-react";
import Button from "@/components/Button";

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
    } catch (error) {
      const { code, message } = (error ?? {}) as { code?: string; message?: string };
      if (code !== "auth/popup-closed-by-user" && code !== "auth/cancelled-popup-request") {
        setSignInError(message || "Sign in failed.");
      }
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-card flex flex-col items-center justify-center z-50">
      <div className="flex flex-col items-center max-w-sm w-full px-6 text-center">
        <div className="flex items-center gap-2 mb-12">
          <Flame className="w-12 h-12 text-accent" strokeWidth={1.5} />
          <h1 className="text-display font-black text-ink tracking-tight">
            Trade<span className="text-accent">Journal</span>
          </h1>
        </div>

        {mode === "signIn" && (
          <>
            <Button variant="primary" onClick={handleSignIn} disabled={isBusy} className="w-full">
              {isBusy ? "Signing in..." : "Sign in with Google"}
            </Button>
            {signInError && <p className="text-loss text-small font-semibold mt-4">{signInError}</p>}
          </>
        )}

        {mode !== "signIn" && (
          <>
            <ShieldAlert className="w-10 h-10 text-loss mb-4" />
            <p className="text-ink font-bold mb-2">
              {mode === "denied" ? "This account has no access." : "Could not load the journal."}
            </p>
            {mode === "error" && message && <p className="text-ink-muted text-small font-semibold mb-2">{message}</p>}
            {email && <p className="text-ink-muted text-body font-semibold">{email}</p>}
            {uid && <p className="text-ink-faint text-caption font-mono mt-1 mb-8 break-all select-all">UID: {uid}</p>}
            <div className="flex gap-3 w-full">
              {mode === "error" && (
                <Button variant="primary" onClick={() => window.location.reload()} className="flex-1">
                  Retry
                </Button>
              )}
              <Button variant="secondary" icon={LogOut} onClick={onSignOut} className="flex-1">
                Sign out
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
