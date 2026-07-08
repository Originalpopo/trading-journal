import { Trade } from '@/store/useJournalStore';
import Papa from 'papaparse';

export interface ParsedOrder {
  symbol: string;
  side: string;
  type: string;
  limitOrStopPrice?: number;
  avgFillPrice?: number;
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
      symbol, side, type, limitOrStopPrice, avgFillPrice, status, updateTime: timeRaw, positionId, pnl, orderId
    });
  }

  return orders;
}

export function parseTradingViewCSVData(csvText: string): ParsedOrder[] {
  const result = Papa.parse(csvText, { header: true, skipEmptyLines: true });
  const orders: ParsedOrder[] = [];
  for (const row of result.data as any[]) {
    if (!row['Symbol'] || !row['Status']) continue;
    const limitOrStopPrice = parseFloat((row['Limit Price'] || row['Stop Price'] || '').replace(/,/g, ''));
    const avgFillPrice = parseFloat((row['Avg Fill Price'] || '').replace(/,/g, ''));
    
    orders.push({
      symbol: row['Symbol'].trim(),
      side: row['Side'].trim(),
      type: row['Type'].trim(),
      limitOrStopPrice: isNaN(limitOrStopPrice) ? undefined : limitOrStopPrice,
      avgFillPrice: isNaN(avgFillPrice) ? undefined : avgFillPrice,
      status: row['Status'].trim().toLowerCase(),
      updateTime: (row['Update Time'] || row['Date'] || '').trim(),
      positionId: row['Position ID'] ? row['Position ID'].trim() : undefined,
      commission: parseFloat((row['Commission'] || '').replace(/,/g, '')) || 0,
      pnl: parseFloat((row['Closed P&L'] || row['Closed P&L ($)'] || '').replace(/,/g, '')) || undefined,
      orderId: row['Order ID'] ? row['Order ID'].trim() : undefined
    });
  }
  return orders;
}

export function groupOrdersIntoTrades(orders: ParsedOrder[]): Partial<Trade>[] {
  const trades: Partial<Trade>[] = [];
  const filledOrders = orders.filter(o => o.status === 'filled' && o.positionId);
  const cancelledOrders = orders.filter(o => o.status === 'cancelled');

  const positions = new Map<string, ParsedOrder[]>();
  for (const o of filledOrders) {
    if (!o.positionId) continue;
    if (!positions.has(o.positionId)) positions.set(o.positionId, []);
    positions.get(o.positionId)!.push(o);
  }

  for (const [posId, posOrders] of positions.entries()) {
    posOrders.sort((a, b) => {
      const timeDiff = new Date(a.updateTime).getTime() - new Date(b.updateTime).getTime();
      if (timeDiff !== 0) return timeDiff;
      if (a.pnl === undefined && b.pnl !== undefined) return -1;
      if (a.pnl !== undefined && b.pnl === undefined) return 1;
      return 0;
    });
    const entryOrder = posOrders[0];
    const exitOrder = posOrders[posOrders.length - 1];

    if (!entryOrder || !exitOrder || entryOrder === exitOrder) continue; // Need at least 2 distinct filling events or we can't form a full trade? Wait, what if it's open but not closed? For a trading journal, we only care about closed trades.

    const trade: Partial<Trade> = {
      positionId: posId,
      symbol: entryOrder.symbol,
      side: entryOrder.side === 'Buy' ? 'BUY' : 'SELL',
      time: entryOrder.updateTime.replace(' ', 'T'), // Format to standard datetime
      exitTime: exitOrder.updateTime.replace(' ', 'T'),
      entryPrice: entryOrder.avgFillPrice || entryOrder.limitOrStopPrice,
      exitPrice: exitOrder.avgFillPrice || exitOrder.limitOrStopPrice,
      entryType: entryOrder.type,
      exitType: exitOrder.type,
      profit: exitOrder.pnl || 0,
    };

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
