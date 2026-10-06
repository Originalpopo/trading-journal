// Today's USD→THB reference rate, for a rough baht figure under the Dashboard's dollar totals.
// It is a mid-market rate, not what a bank pays, so nothing here may feed the Tax Report or the Statement.

import { toCents, fromCents } from './money.ts';

export interface BahtRate {
  rate: number; // baht per US dollar
  date: string; // "YYYY-MM-DD" the rate was published for
  fetchedOn: string; // local "YYYY-MM-DD" it was downloaded; one download a day is enough
}

const RATE_URL = 'https://api.frankfurter.dev/v1/latest?base=USD&symbols=THB';
const STORAGE_KEY = 'bahtRate';

export const localDay = (now: Date = new Date()): string =>
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

// Reads the rate service's answer; null when it is not a usable rate.
export const parseRate = (body: unknown, fetchedOn: string): BahtRate | null => {
  const data = body as { date?: unknown; rates?: { THB?: unknown } } | null;
  const rate = Number(data?.rates?.THB);
  if (!Number.isFinite(rate) || rate <= 0 || typeof data?.date !== 'string') return null;
  return { rate, date: data.date, fetchedOn };
};

export const toBaht = (usd: number, rate: number): number => fromCents(Math.round(toCents(usd) * rate));

// "≈฿3,519.27", or "≈-฿120.00" for a loss.
export const formatApproxBaht = (usd: number, rate: number): string => {
  const baht = toBaht(usd, rate);
  return `≈${baht < 0 ? '-' : ''}฿${Math.abs(baht).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const readSaved = (): BahtRate | null => {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    return saved && Number.isFinite(saved.rate) && saved.rate > 0 ? saved : null;
  } catch {
    return null;
  }
};

// The rate saved on this device if it was downloaded today, otherwise a fresh one.
// When the download fails, the last saved rate (however old) is better than nothing.
export const loadBahtRate = async (): Promise<BahtRate | null> => {
  const saved = readSaved();
  const today = localDay();
  if (saved?.fetchedOn === today) return saved;
  try {
    const response = await fetch(RATE_URL);
    if (!response.ok) return saved;
    const fresh = parseRate(await response.json(), today);
    if (!fresh) return saved;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh)); } catch { }
    return fresh;
  } catch {
    return saved;
  }
};
