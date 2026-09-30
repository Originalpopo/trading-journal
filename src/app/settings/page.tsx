"use client";

import { useState, useEffect } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { signOut } from "firebase/auth";
import { db, auth } from "@/lib/firebase";
import { Lock, Save, UserCircle, LogOut, Copy, Check } from "lucide-react";

export default function SettingsPage() {
  const currentUser = auth.currentUser;
  const [isUidCopied, setIsUidCopied] = useState(false);
  const [pin, setPin] = useState("");
  const [hint, setHint] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const docRef = doc(db, "settings", "auth");
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          const data = docSnap.data();
          setPin(data.pin || "");
          setHint(data.hint || "");
        }

      } catch (error) {
        console.error("Error fetching settings:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchSettings();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pin.length !== 4 || !/^\d+$/.test(pin)) {
      alert("PIN must be exactly 4 digits.");
      return;
    }

    setIsSaving(true);
    try {
      await setDoc(doc(db, "settings", "auth"), {
        pin,
        hint,
      });
      // Update local storage so the current device doesn't get locked out immediately
      localStorage.setItem("tradejournal_pin", pin);
      alert("Settings saved successfully! Other devices will be forced to re-enter the new PIN.");
    } catch (error) {
      console.error("Error saving settings:", error);
      alert("Failed to save settings.");
    } finally {
      setIsSaving(false);
    }
  };



  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-8 h-8 border-4 border-orange-400 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-3xl font-extrabold text-stone-950 tracking-tight">Settings</h2>
        </div>
      </div>

      <div className="bg-white rounded-2xl p-8 shadow-sm">
        <div className="flex items-center gap-3 mb-6 pb-6 border-b border-stone-100">
          <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center">
            <UserCircle className="w-5 h-5 text-orange-400" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-stone-950">Account</h3>
            <p className="text-sm text-stone-500 font-medium">Only the account whose UID is set in the Firestore rules can read or write data.</p>
          </div>
        </div>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1 min-w-0">
            <p className="text-sm font-bold text-stone-950">{currentUser?.email || "-"}</p>
            <div className="flex items-center gap-2">
              <p className="text-xs font-mono text-stone-500 break-all select-all">UID: {currentUser?.uid || "-"}</p>
              {currentUser && (
                <button
                  type="button"
                  title="Copy UID"
                  onClick={async () => {
                    await navigator.clipboard.writeText(currentUser.uid);
                    setIsUidCopied(true);
                    setTimeout(() => setIsUidCopied(false), 1500);
                  }}
                  className="text-stone-400 hover:text-orange-400 transition shrink-0"
                >
                  {isUidCopied ? <Check className="w-3.5 h-3.5 text-orange-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => signOut(auth)}
            className="px-6 py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-600 font-bold rounded-xl transition flex items-center justify-center gap-2 shrink-0"
          >
            <LogOut className="w-4 h-4" />
            Sign out
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl p-8 shadow-sm">
        <div className="flex items-center gap-3 mb-6 pb-6 border-b border-stone-100">
          <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center">
            <Lock className="w-5 h-5 text-orange-400" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-stone-950">Security & App Lock</h3>
            <p className="text-sm text-stone-500 font-medium">Configure the PIN used to access this application across all devices.</p>
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="block text-sm font-bold text-stone-950">4-Digit PIN</label>
              <input
                type="text"
                maxLength={4}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                placeholder="4 digits"
                className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 text-sm font-bold text-stone-950 focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20 transition placeholder:font-medium"
              />
              <p className="text-xs text-stone-400 font-medium">Numbers only. Exactly 4 digits.</p>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-bold text-stone-950">PIN Hint</label>
              <input
                type="text"
                value={hint}
                onChange={(e) => setHint(e.target.value)}
                placeholder="Something only you would recognize"
                className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 text-sm font-medium text-stone-950 focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20 transition"
              />
              <p className="text-xs text-stone-400 font-medium">Visible to anyone who tries to log in.</p>
            </div>
          </div>

          <div className="flex justify-end pt-4">
            <button
              type="submit"
              disabled={isSaving || pin.length !== 4}
              className="px-6 py-2.5 bg-orange-400 hover:bg-orange-500 disabled:bg-orange-200 text-white font-bold rounded-xl transition shadow-lg shadow-orange-200 flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              {isSaving ? "Saving..." : "Save Settings"}
            </button>
          </div>
        </form>
      </div>


    </div>
  );
}
