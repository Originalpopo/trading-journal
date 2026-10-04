"use client";

import { useState } from "react";
import { ShieldCheck, ShieldAlert } from "lucide-react";
import { useJournalStore } from "@/store/useJournalStore";
import { backupAge } from "@/lib/backupReminder";

// How old the latest backup is, or null while the journal has nothing to back up.
function useBackupAge() {
  const hasData = useJournalStore(state => state.trades.length > 0 || state.funding.length > 0);
  const lastBackupAt = useJournalStore(state => state.preferences.lastBackupAt);
  // Read once per mount; the age only matters to the day.
  const [now] = useState(() => new Date());
  return hasData ? backupAge(lastBackupAt, now) : null;
}

// Red dot on the corner of an Upload button (which must be `relative`) while a backup is overdue.
export function BackupDueDot() {
  const age = useBackupAge();
  if (!age?.isDue) return null;
  return <span title={`${age.label}: download a backup`} className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-red-900 ring-2 ring-white" />;
}

// One line saying how old the latest backup is. Turns red when the backup is overdue.
export default function BackupReminder() {
  const age = useBackupAge();
  if (!age) return null;
  const Icon = age.isDue ? ShieldAlert : ShieldCheck;
  return (
    <span className={`flex items-center gap-1 text-[10px] font-bold ${age.isDue ? 'text-red-900' : 'text-stone-400'}`}>
      <Icon className="w-3 h-3" /> {age.label}
    </span>
  );
}
