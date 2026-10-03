import type { Trade, ExitTimeConfidence } from '@/store/useJournalStore';
import Papa from 'papaparse';
import { sumMoney } from './money.ts';

export interface ParsedOrder {
  symbol: string;
  side: string;
  type: string;
  limitOrStopPrice?: number;
  avgFillPrice?: number;
  filledQty?: number;
  status: string;
  updateTime: string;
  positionId?: string;
  commission?: number;
  pnl?: number;
  orderId?: string;
}

export function parseTradingViewData(raw: string): ParsedOrder[] {
  const blocks = raw.split(/\r?\n\r?\n/).filter(b => b.trim());
  const orders: ParsedOrder[] = [];

  for (const block of blocks) {
    const lines = block.split(/\r?\n/).map(l => l.trim()).filter(l => l);
    if (lines.length < 5) continue;

    const symbol = lines[0];
    const side = lines[1];
    const typeLine = lines[2].split('\t');
    const type = typeLine[0];
    const filledQty = parseFloat((typeLine[2] || '').replace(/,/g, '')) || undefined;

    const statusIndex = lines.findIndex(l => 
        l.toLowerCase() === 'filled' || 
        l.toLowerCase() === 'cancelled' || 
        l.toLowerCase() === 'rejected'
    );
    if (statusIndex === -1) continue;

    const status = lines[statusIndex].toLowerCase();
    
    let limitOrStopPrice, avgFillPrice;
    if (statusIndex === 4) {
      const p = parseFloat(lines[3].replace(/,/g, ''));
      if (status === 'filled' && type.toLowerCase() === 'market') avgFillPrice = p;
      else if (status === 'filled') avgFillPrice = p;
      else limitOrStopPrice = p;
    } else if (statusIndex === 5) {
      limitOrStopPrice = parseFloat(lines[3].replace(/,/g, ''));
      avgFillPrice = parseFloat(lines[4].replace(/,/g, ''));
    }

    const lastLine = lines[statusIndex + 1];
    if (!lastLine) continue;
    const rawParts = lastLine.split('\t');
    
    let positionId, pnl, orderId;
    const timeRaw = rawParts[0];
    const posIdRaw = rawParts[1];
    const commRaw = rawParts[2];
    const pnlRaw = rawParts[3];
    
    let oidRaw = rawParts[4];
    if (rawParts.length >= 6 && rawParts[5] && rawParts[5].trim() !== '') {
        oidRaw = rawParts[5].trim();
    }

    if (posIdRaw && posIdRaw.includes(':')) positionId = posIdRaw;
    if (pnlRaw && pnlRaw !== '') pnl = parseFloat(pnlRaw);
    const commission = parseFloat((commRaw || '').replace(/,/g, '')) || 0;
    if (oidRaw && oidRaw !== '') orderId = oidRaw;

    if (!orderId && pnlRaw && pnlRaw.length >= 8 && !pnlRaw.includes('.')) {
        orderId = pnlRaw;
        pnl = undefined;
    }

    if (!orderId && rawParts.length > 0) {
        const lastPart = rawParts[rawParts.length - 1];
        if (lastPart.length >= 8 && !lastPart.includes('.')) {
             orderId = lastPart;
        }
    }

    orders.push({
      symbol, side, type, limitOrStopPrice, avgFillPrice, filledQty, status, updateTime: timeRaw, positionId, commission, pnl, orderId
    });
  }

  return orders;
}

// An exit at exactly 0.00 is still an exit, so only an empty cell means "no P&L".
const parsePnl = (raw: string | undefined): number | undefined => {
  const cleaned = (raw || '').replace(/,/g, '').trim();
  if (cleaned === '') return undefined;
  const val = parseFloat(cleaned);
  return isNaN(val) ? undefined : val;
};

export function parseTradingViewCSVData(csvText: string): ParsedOrder[] {
  const result = Papa.parse(csvText, { header: true, skipEmptyLines: true });
  const orders: ParsedOrder[] = [];
  for (const row of result.data as Record<string, string>[]) {
    if (!row['Symbol'] || !row['Status']) continue;
    const limitOrStopPrice = parseFloat((row['Limit Price'] || row['Stop Price'] || '').replace(/,/g, ''));
    const avgFillPrice = parseFloat((row['Avg Fill Price'] || '').replace(/,/g, ''));
    
    orders.push({
      symbol: row['Symbol'].trim(),
      side: row['Side'].trim(),
      type: row['Type'].trim(),
      limitOrStopPrice: isNaN(limitOrStopPrice) ? undefined : limitOrStopPrice,
      avgFillPrice: isNaN(avgFillPrice) ? undefined : avgFillPrice,
      filledQty: parseFloat((row['Filled Qty'] || '').replace(/,/g, '')) || undefined,
      status: row['Status'].trim().toLowerCase(),
      updateTime: (row['Update Time'] || row['Date'] || '').trim(),
      positionId: row['Position ID'] ? row['Position ID'].trim() : undefined,
      commission: parseFloat((row['Commission'] || '').replace(/,/g, '')) || 0,
      pnl: parsePnl(row['Closed P&L'] || row['Closed P&L ($)']),
      orderId: row['Order ID'] ? row['Order ID'].trim() : undefined
    });
  }
  return orders;
}

const toMs = (time: string) => new Date(time.replace(' ', 'T')).getTime();
const orderType = (o: ParsedOrder) => o.type.toLowerCase();
const orderIdNum = (o: ParsedOrder) => (o.orderId ? parseInt(o.orderId, 10) : NaN);

interface ResolvedExit {
  time: string;
  confidence: ExitTimeConfidence;
  sibling?: ParsedOrder;
}

// TradingView's "Update Time" on a filled Stop Loss / Take Profit is when that order was last
// placed or moved (e.g. SL dragged to break-even), not when it was hit. When one side of the
// bracket fills, the other side is cancelled at that moment, so its cancel time is the real exit.
function resolveExitTime(
  entry: ParsedOrder,
  exit: ParsedOrder,
  cancelledOrders: ParsedOrder[],
  unfilledBracketIds: Set<number>,
  nextEntryMs: number,
): ResolvedExit {
  const exitType = orderType(exit);
  if (exitType !== 'stop loss' && exitType !== 'take profit') {
    return { time: exit.updateTime, confidence: 'exact' }; // manual/market close: time is correct
  }

  const siblingType = exitType === 'stop loss' ? 'take profit' : 'stop loss';
  const staleMs = toMs(exit.updateTime);
  const candidates = cancelledOrders.filter(o =>
    orderType(o) === siblingType && o.side === exit.side && toMs(o.updateTime) >= staleMs);

  // Placed together with the entry: TP is entry ID + 1, SL is entry ID + 2.
  const entryId = orderIdNum(entry);
  const bracketSibling = candidates.find(o => {
    const diff = orderIdNum(o) - entryId;
    return diff === 1 || diff === 2;
  });
  if (bracketSibling) return { time: bracketSibling.updateTime, confidence: 'exact', sibling: bracketSibling };

  // Placed after the entry: the last matching cancel before the next position opened.
  const inWindow = candidates
    .filter(o => toMs(o.updateTime) < nextEntryMs && !unfilledBracketIds.has(orderIdNum(o)))
    .sort((a, b) => toMs(b.updateTime) - toMs(a.updateTime));
  if (inWindow.length > 0) return { time: inWindow[0].updateTime, confidence: 'estimated', sibling: inWindow[0] };

  return { time: exit.updateTime, confidence: 'uncertain' };
}

export function groupOrdersIntoTrades(orders: ParsedOrder[]): Partial<Trade>[] {
  const trades: Partial<Trade>[] = [];
  const filledOrders = orders.filter(o => o.status === 'filled' && o.positionId);
  const cancelledOrders = orders.filter(o => o.status === 'cancelled');

  // TP/SL attached to a limit order that was cancelled unfilled never belonged to a position.
  const unfilledBracketIds = new Set<number>();
  for (const o of cancelledOrders) {
    const id = orderIdNum(o);
    if (orderType(o) === 'limit' && !isNaN(id)) {
      unfilledBracketIds.add(id + 1);
      unfilledBracketIds.add(id + 2);
    }
  }

  const positions = new Map<string, ParsedOrder[]>();
  for (const o of filledOrders) {
    if (!o.positionId) continue;
    if (!positions.has(o.positionId)) positions.set(o.positionId, []);
    positions.get(o.positionId)!.push(o);
  }

  // Normally one fill opens (no P&L) and one fill closes (has P&L). Positions without both (still
  // open, or cut off at the edge of the pasted history) are skipped here and reported by
  // findImportWarnings.
  const closedPositions = Array.from(positions.entries())
    .map(([posId, posOrders]) => ({
      posId,
      posOrders,
      entryOrder: posOrders.find(o => o.pnl === undefined),
      exitOrder: posOrders.find(o => o.pnl !== undefined),
    }))
    .filter((p): p is typeof p & { entryOrder: ParsedOrder; exitOrder: ParsedOrder } => !!p.entryOrder && !!p.exitOrder);

  const entryTimesMs = closedPositions.map(p => toMs(p.entryOrder.updateTime)).sort((a, b) => a - b);

  for (const { posId, posOrders, entryOrder, exitOrder } of closedPositions) {
    const entryMs = toMs(entryOrder.updateTime);
    const nextEntryMs = entryTimesMs.find(t => t > entryMs) ?? Infinity;
    const exit = resolveExitTime(entryOrder, exitOrder, cancelledOrders, unfilledBracketIds, nextEntryMs);

    const trade: Partial<Trade> = {
      positionId: posId,
      symbol: entryOrder.symbol,
      side: entryOrder.side === 'Buy' ? 'BUY' : 'SELL',
      time: exit.time.replace(' ', 'T'),
      entryTime: entryOrder.updateTime.replace(' ', 'T'),
      exitTime: exit.time.replace(' ', 'T'),
      exitTimeConfidence: exit.confidence,
      entryPrice: entryOrder.avgFillPrice || entryOrder.limitOrStopPrice,
      exitPrice: exitOrder.avgFillPrice || exitOrder.limitOrStopPrice,
      entryType: entryOrder.type,
      exitType: exitOrder.type,
      // Every closing fill counts, so a position closed in parts still carries its whole P&L.
      profit: sumMoney(posOrders.map(o => o.pnl)),
      duration: Math.max(0, Math.floor((toMs(exit.time) - entryMs) / 1000) || 0),
    };

    // Kept beside the trade, not subtracted: the export does not say whether Closed P&L already
    // includes it.
    const commission = sumMoney(posOrders.map(o => o.commission));
    if (commission !== 0) trade.commission = commission;
    if (entryOrder.filledQty) trade.size = entryOrder.filledQty;

    if (exit.sibling) {
      if (orderType(exit.sibling) === 'take profit') trade.tpPrice = exit.sibling.limitOrStopPrice;
      else trade.slPrice = exit.sibling.limitOrStopPrice;
    }

    // Find SL/TP within filled orders
    for (const o of posOrders) {
      if (o.type.toLowerCase() === 'stop loss') {
        trade.slPrice = o.limitOrStopPrice || o.avgFillPrice;
      }
      if (o.type.toLowerCase() === 'take profit') {
        trade.tpPrice = o.limitOrStopPrice || o.avgFillPrice;
      }
    }

    // Check cancelled orders with matching updateTime
    const exitTimeMatched = cancelledOrders.filter(o => o.updateTime === exitOrder.updateTime);
    for (const o of exitTimeMatched) {
      if (o.type.toLowerCase() === 'stop loss' && !trade.slPrice) trade.slPrice = o.limitOrStopPrice;
      if (o.type.toLowerCase() === 'take profit' && !trade.tpPrice) trade.tpPrice = o.limitOrStopPrice;
    }

    // Check cancelled orders with sequential Order IDs
    if (entryOrder.orderId && (!trade.slPrice || !trade.tpPrice)) {
      const entryIdNum = parseInt(entryOrder.orderId, 10);
      if (!isNaN(entryIdNum)) {
        const proximityOrders = cancelledOrders.filter(o => {
          if (!o.orderId) return false;
          const oidNum = parseInt(o.orderId, 10);
          return Math.abs(oidNum - entryIdNum) <= 5;
        });

        for (const o of proximityOrders) {
          if (o.type.toLowerCase() === 'stop loss' && !trade.slPrice) trade.slPrice = o.limitOrStopPrice;
          if (o.type.toLowerCase() === 'take profit' && !trade.tpPrice) trade.tpPrice = o.limitOrStopPrice;
        }
      }
    }
    
    trades.push(trade);
  }

  trades.sort((a, b) => new Date(b.time!).getTime() - new Date(a.time!).getTime());

  return trades;
}

export type ImportWarningKind =
  | 'missingEntry' // closing fill present but its opening fill is not: real P&L that is not imported
  | 'splitClose' // more than one closing fill; imported with the P&L of all of them added up
  | 'noPositionId' // filled order with P&L that cannot be tied to a position: not imported
  | 'open'; // opening fill only: still open, or the history ends before it closed

export interface ImportWarning {
  kind: ImportWarningKind;
  symbol: string;
  time: string;
  positionId?: string;
  pnl?: number; // money involved, when the broker data states it
}

// Everything in the pasted history that groupOrdersIntoTrades does not turn into a normal trade.
// Nothing here may be dropped silently: each item is money the journal could end up missing.
export function findImportWarnings(orders: ParsedOrder[]): ImportWarning[] {
  const warnings: ImportWarning[] = [];
  const positions = new Map<string, ParsedOrder[]>();

  for (const o of orders) {
    if (o.status !== 'filled') continue;
    if (!o.positionId) {
      if (o.pnl !== undefined) warnings.push({ kind: 'noPositionId', symbol: o.symbol, time: o.updateTime, pnl: o.pnl });
      continue;
    }
    if (!positions.has(o.positionId)) positions.set(o.positionId, []);
    positions.get(o.positionId)!.push(o);
  }

  for (const [positionId, posOrders] of positions) {
    const entries = posOrders.filter(o => o.pnl === undefined);
    const exits = posOrders.filter(o => o.pnl !== undefined);
    const { symbol, updateTime: time } = posOrders[0];
    if (exits.length === 0) {
      warnings.push({ kind: 'open', symbol, time, positionId });
    } else if (entries.length === 0) {
      warnings.push({ kind: 'missingEntry', symbol, time: exits[0].updateTime, positionId, pnl: sumMoney(exits.map(o => o.pnl)) });
    } else if (exits.length > 1) {
      warnings.push({ kind: 'splitClose', symbol, time: exits[0].updateTime, positionId, pnl: sumMoney(exits.map(o => o.pnl)) });
    }
  }

  return warnings;
}
