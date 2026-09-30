import { collection, deleteField, doc, getDoc, getDocs, query, setDoc, where, writeBatch } from 'firebase/firestore';
import { db } from './firebase';

export interface Candle {
  time: number; // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
}

// Candles fetched for a trade's chart live in their own collection, one doc per trade and timeframe.
// They used to sit on the trade itself (trade.chartData), so every load of the trade list downloaded
// the candles of every trade ever opened.
const CHART_CACHE = 'chartCache';
const cacheDocId = (tradeId: string, tf: string) => `${tradeId}_${tf}`;

// The timeframe key candles are cached under for a trade's TF setting.
export function normalizeChartTf(tf?: string): string {
  if (!tf) return '15m';
  const lower = tf.toLowerCase();
  if (['1h', '1m', '5m', '15m', '1s', '5s', '15s'].includes(lower)) return lower;
  if (lower.includes('s')) return '1m';
  return tf;
}

// Old trades stored either { [tf]: candles } or a bare array for the trade's own TF.
export function legacyChartDataToMap(chartData: unknown, tradeTf?: string): Record<string, Candle[]> {
  if (!chartData) return {};
  if (Array.isArray(chartData)) return { [normalizeChartTf(tradeTf)]: chartData as Candle[] };
  return chartData as Record<string, Candle[]>;
}

export async function loadCachedCandles(tradeId: string, tf: string): Promise<Candle[] | null> {
  const snap = await getDoc(doc(db, CHART_CACHE, cacheDocId(tradeId, tf)));
  return snap.exists() ? (snap.data().candles as Candle[]) : null;
}

export async function saveCachedCandles(tradeId: string, tf: string, candles: Candle[]) {
  await setDoc(doc(db, CHART_CACHE, cacheDocId(tradeId, tf)), { tradeId, tf, candles });
}

async function deleteDocsInBatches(refs: ReturnType<typeof doc>[]) {
  for (let i = 0; i < refs.length; i += 500) {
    const batch = writeBatch(db);
    refs.slice(i, i + 500).forEach(ref => batch.delete(ref));
    await batch.commit();
  }
}

export async function deleteCachedCandles(tradeId: string) {
  const snap = await getDocs(query(collection(db, CHART_CACHE), where('tradeId', '==', tradeId)));
  await deleteDocsInBatches(snap.docs.map(d => d.ref));
}

export async function clearChartCache() {
  const snap = await getDocs(collection(db, CHART_CACHE));
  await deleteDocsInBatches(snap.docs.map(d => d.ref));
}

// One-off move of candles still stored on trades into the chartCache collection.
// Each trade's cache docs are written in the same batch that removes chartData from the trade.
export async function migrateLegacyChartData(trades: { id: string; tf?: string; chartData?: unknown }[]) {
  let batch = writeBatch(db);
  let ops = 0;
  for (const t of trades) {
    if (!t.chartData) continue;
    const entries = Object.entries(legacyChartDataToMap(t.chartData, t.tf))
      .filter(([, candles]) => Array.isArray(candles) && candles.length > 0);

    if (ops + entries.length + 1 > 500) {
      await batch.commit();
      batch = writeBatch(db);
      ops = 0;
    }
    for (const [tf, candles] of entries) {
      batch.set(doc(db, CHART_CACHE, cacheDocId(t.id, tf)), { tradeId: t.id, tf, candles });
      ops++;
    }
    batch.update(doc(db, 'trades', t.id), { chartData: deleteField() });
    ops++;
  }
  if (ops > 0) await batch.commit();
}
