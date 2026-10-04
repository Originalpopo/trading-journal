// How old the latest database backup is. The journal is the only copy of the trade history,
// so the Upload buttons and popup keep saying when a backup file was last downloaded.
// Kept free of app imports so it can be unit-tested with `node --test`.

// A backup older than this many days is shown as overdue.
export const BACKUP_DUE_DAYS = 30;

export interface BackupAge {
  days: number | null; // whole days since the last backup; null when there has never been one
  isDue: boolean;
  label: string;
}

export function backupAge(lastBackupAt: string | undefined, now: Date): BackupAge {
  const last = lastBackupAt ? new Date(lastBackupAt).getTime() : NaN;
  if (isNaN(last)) return { days: null, isDue: true, label: 'Never backed up' };

  const days = Math.max(0, Math.floor((now.getTime() - last) / 86_400_000));
  const label = days === 0 ? 'Backed up today' : days === 1 ? 'Last backup yesterday' : `Last backup ${days} days ago`;
  return { days, isDue: days > BACKUP_DUE_DAYS, label };
}
