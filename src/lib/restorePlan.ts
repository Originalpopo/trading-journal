// Reading a backup file and working out what a restore will do, kept free of Firebase so it can be tested.
// A restore puts the journal back exactly as it was in the file: everything in the file is written back, and
// every trade, funding entry and note that is not in the file is deleted. Settings are replaced by the file's.

type Doc = Record<string, unknown>;

export type Backup = {
  trades: Doc[];      // id = trade.id
  funding: Doc[];     // id = funding.id
  dayNotes: Doc[];    // id = note.date
  weekNotes: Doc[];   // id = note.week
  preferences: Doc | null; // null when the file has none (backups made before settings were included)
};

export type Ids = { trades: string[]; funding: string[]; dayNotes: string[]; weekNotes: string[] };

const keyOf = { trades: 'id', funding: 'id', dayNotes: 'date', weekNotes: 'week' } as const;
export const COLLECTIONS = ['trades', 'funding', 'dayNotes', 'weekNotes'] as const;
export type CollectionName = typeof COLLECTIONS[number];

// Entries without their ID can't be written back, so they are left out (and counted as left out).
export function parseBackup(jsonData: string): { backup: Backup; skipped: number } {
  const data = JSON.parse(jsonData);
  if (!data || typeof data !== 'object' || Array.isArray(data)
    || (!data.trades && !data.funding && !data.dayNotes && !data.weekNotes && !data.preferences)) {
    throw new Error('Invalid database format.');
  }
  let skipped = 0;
  const list = (name: CollectionName): Doc[] => {
    const raw: unknown[] = Array.isArray(data[name]) ? data[name] : [];
    const kept = raw.filter((d): d is Doc => {
      const key = d && typeof d === 'object' ? (d as Doc)[keyOf[name]] : undefined;
      return typeof key === 'string' && key !== '' && !key.includes('/');
    });
    skipped += raw.length - kept.length;
    return kept;
  };
  const prefs = data.preferences;
  return {
    backup: {
      trades: list('trades'),
      funding: list('funding'),
      dayNotes: list('dayNotes'),
      weekNotes: list('weekNotes'),
      preferences: prefs && typeof prefs === 'object' && !Array.isArray(prefs) && Object.keys(prefs).length > 0 ? prefs : null,
    },
    skipped,
  };
}

export const idsOf = (backup: Backup): Ids => ({
  trades: backup.trades.map(d => d[keyOf.trades] as string),
  funding: backup.funding.map(d => d[keyOf.funding] as string),
  dayNotes: backup.dayNotes.map(d => d[keyOf.dayNotes] as string),
  weekNotes: backup.weekNotes.map(d => d[keyOf.weekNotes] as string),
});

export const docIdOf = (name: CollectionName, d: Doc) => d[keyOf[name]] as string;

// What is in the journal now but not in the file: these are deleted by the restore.
export function idsToRemove(current: Ids, backup: Backup): Ids {
  const inFile = idsOf(backup);
  const out = {} as Ids;
  for (const name of COLLECTIONS) {
    const keep = new Set(inFile[name]);
    out[name] = current[name].filter(id => !keep.has(id));
  }
  return out;
}

export const countIds = (ids: Ids) => COLLECTIONS.reduce((n, name) => n + ids[name].length, 0);

export type BackupSummary = {
  trades: number;
  funding: number;
  dayNotes: number;
  weekNotes: number;
  hasPreferences: boolean;
  skipped: number;
  firstTrade: string | null;
  lastTrade: string | null;
  madeAt: string | null;
};

export function summariseBackup(backup: Backup, skipped = 0): BackupSummary {
  const times = backup.trades.map(t => t.entryTime).filter((t): t is string => typeof t === 'string' && t !== '').sort();
  const madeAt = backup.preferences?.lastBackupAt;
  return {
    trades: backup.trades.length,
    funding: backup.funding.length,
    dayNotes: backup.dayNotes.length,
    weekNotes: backup.weekNotes.length,
    hasPreferences: backup.preferences !== null,
    skipped,
    firstTrade: times[0] ?? null,
    lastTrade: times[times.length - 1] ?? null,
    madeAt: typeof madeAt === 'string' ? madeAt : null,
  };
}

// Settings a restore never takes from the file: they belong to the app and its backups, not to the trading record.
// The PIN is not among the settings at all (it lives in settings/auth and is not in a backup), so it is never touched.
export const PREFS_KEPT_ON_RESTORE = ['lastBackupAt', 'backupDueDays'] as const;

// The settings after a restore: the file's trading settings, with the kept ones as they are now.
export function prefsAfterRestore(fromFile: Doc, current: Doc): Doc {
  const out: Doc = { ...fromFile };
  for (const key of PREFS_KEPT_ON_RESTORE) {
    if (key in current) out[key] = current[key];
    else delete out[key];
  }
  return out;
}
