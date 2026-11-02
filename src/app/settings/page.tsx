"use client";

import { useState, useEffect } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { signOut } from "firebase/auth";
import { db, auth } from "@/lib/firebase";
import { Lock, UserCircle, LogOut, Copy, Check, Scale, FileText, Database } from "lucide-react";
import DefaultRiskSetting from "@/components/DefaultRiskSetting";
import StatementProfileSetting from "@/components/StatementProfileSetting";
import BreakEvenSetting from "@/components/settings/BreakEvenSetting";
import DisciplineRulesSetting from "@/components/settings/DisciplineRulesSetting";
import TaxStepsInfo from "@/components/settings/TaxStepsInfo";
import BackupSetting from "@/components/settings/BackupSetting";
import BalanceCheckHistory from "@/components/settings/BalanceCheckHistory";
import SaveRow from "@/components/SaveRow";
import PageHeader from "@/components/PageHeader";
import PillTabs from "@/components/PillTabs";

// Settings are grouped by what they are used for; the open tab is remembered on this device.
const TABS = [
  { id: "trading", label: "Trading", icon: Scale },
  { id: "statement", label: "Statement & Tax", icon: FileText },
  { id: "data", label: "Data & Backup", icon: Database },
  { id: "account", label: "Account", icon: UserCircle },
] as const;
type TabId = typeof TABS[number]["id"];
const TAB_KEY = "settingsTab";

export default function SettingsPage() {
  const [tab, setTabState] = useState<TabId>(() => {
    try {
      const saved = localStorage.getItem(TAB_KEY);
      return TABS.some(t => t.id === saved) ? saved as TabId : "trading";
    } catch { return "trading"; }
  });
  const setTab = (next: TabId) => {
    setTabState(next);
    try { localStorage.setItem(TAB_KEY, next); } catch { }
  };
  const currentUser = auth.currentUser;
  const [isUidCopied, setIsUidCopied] = useState(false);
  const [pin, setPin] = useState("");
  const [hint, setHint] = useState("");
  const [savedAuth, setSavedAuth] = useState({ pin: "", hint: "" }); // as stored, to tell when the form was changed
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
          setSavedAuth({ pin: data.pin || "", hint: data.hint || "" });
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
    if (pin === savedAuth.pin && hint === savedAuth.hint) return; // Enter in an unchanged form
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
      setSavedAuth({ pin, hint });
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
      <PageHeader title="Settings" />

      <PillTabs tabs={TABS} value={tab} onChange={setTab} className="-mx-4 px-4 md:mx-0 md:px-0" />

      {tab === "trading" && (
        <>
          <DefaultRiskSetting />
          <BreakEvenSetting />
          <DisciplineRulesSetting />
        </>
      )}

      {tab === "statement" && (
        <>
          <StatementProfileSetting />
          <TaxStepsInfo />
        </>
      )}

      {tab === "data" && (
        <>
          <BackupSetting />
          <BalanceCheckHistory />
        </>
      )}

      {tab === "account" && (<>
      <div className="bg-white rounded-2xl p-5 md:p-8 shadow-sm">
        <div className="flex items-center gap-3 mb-6 pb-6 border-b border-stone-100">
          <div className="w-10 h-10 shrink-0 rounded-xl bg-orange-50 flex items-center justify-center">
            <UserCircle className="w-5 h-5 text-orange-400" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-stone-950">Account</h3>
            <p className="text-sm text-stone-500 font-medium">เฉพาะบัญชีที่มี UID ตรงกับที่ตั้งไว้ใน Firestore rules เท่านั้นที่อ่านหรือเขียนข้อมูลได้</p>
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

      <div className="bg-white rounded-2xl p-5 md:p-8 shadow-sm">
        <div className="flex items-center gap-3 mb-6 pb-6 border-b border-stone-100">
          <div className="w-10 h-10 shrink-0 rounded-xl bg-orange-50 flex items-center justify-center">
            <Lock className="w-5 h-5 text-orange-400" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-stone-950">Security & App Lock</h3>
            <p className="text-sm text-stone-500 font-medium">ตั้ง PIN ที่ใช้เข้าแอปนี้บนทุกอุปกรณ์</p>
          </div>
        </div>

        <form onSubmit={handleSave}>
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

          <SaveRow isDirty={pin !== savedAuth.pin || hint !== savedAuth.hint} canSave={pin.length === 4} isSaving={isSaving} submit />
        </form>
      </div>
      </>)}
    </div>
  );
}
