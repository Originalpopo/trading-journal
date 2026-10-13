import type { LinkedTrade } from './tradingViewParser.ts';

// TradingView's "Notifications log" tab: one entry per order event. Unlike the order history it
// keeps every placement and move of a stop with its price, and the moment an order really filled
// (the history's "Update Time" of a filled limit order is when it was placed).

export type LogAction = 'placed' | 'modified' | 'executed' | 'cancelled' | 'rejected';

export interface LogEvent {
  orderId: string;
  type: string; // 'limit', 'stop loss', 'take profit', 'market', ...
  action: LogAction;
  time: string; // 'YYYY-MM-DD HH:MM:SS'
  price?: number;
}

const TIME_LINE = /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/;
const EVENT_LINE = /^(.+?) order (placed|modified|executed|cancelled|rejected) on \S+ \((\d+)\)/i;
const PRICE_LINE = /^(?:Buy|Sell)\s+[\d.,]+\s+at\s+([\d.,]+)/i;

// Returns the events oldest first. The log lists the newest first, also within one second, so
// reversing it keeps events of the same second in the order they happened.
export function parseNotificationsLog(raw: string): LogEvent[] {
  const events: LogEvent[] = [];
  let time = '';
  let current: LogEvent | null = null;

  for (const line of raw.split(/\r?\n/).map(l => l.trim())) {
    const timeMatch = line.match(TIME_LINE);
    if (timeMatch) {
      time = timeMatch[1];
      continue;
    }
    const eventMatch = line.match(EVENT_LINE);
    if (eventMatch && time) {
      current = { orderId: eventMatch[3], type: eventMatch[1].toLowerCase(), action: eventMatch[2].toLowerCase() as LogAction, time };
      events.push(current);
      continue;
    }
    const priceMatch = line.match(PRICE_LINE);
    if (priceMatch && current && current.price === undefined) {
      const price = parseFloat(priceMatch[1].replace(/,/g, ''));
      if (Number.isFinite(price)) current.price = price;
    }
  }

  return events
    .map((event, index) => ({ event, index }))
    .sort((a, b) => a.event.time.localeCompare(b.event.time) || b.index - a.index)
    .map(({ event }) => event);
}

export const looksLikeNotificationsLog = (raw: string) =>
  raw.split(/\r?\n/).some(line => EVENT_LINE.test(line.trim()));

const toMs = (time: string) => new Date(time.replace(' ', 'T')).getTime();

// Fills in what only the log knows: when the entry and exit really filled, and where the stop was
// when the position opened. Trades the log does not cover are returned untouched.
export function applyNotificationsLog<T extends LinkedTrade>(trades: T[], events: LogEvent[]): T[] {
  if (events.length === 0) return trades;
  const byOrder = new Map<string, LogEvent[]>();
  for (const e of events) {
    if (!byOrder.has(e.orderId)) byOrder.set(e.orderId, []);
    byOrder.get(e.orderId)!.push(e);
  }
  const executionOf = (orderId?: string) => (orderId ? byOrder.get(orderId)?.find(e => e.action === 'executed') : undefined);

  return trades.map(trade => {
    const entryFill = executionOf(trade.entryOrderId);
    if (!entryFill) return trade;

    const result: T = { ...trade, entryTime: entryFill.time.replace(' ', 'T'), timesFromLog: true };
    const exitFill = executionOf(trade.exitOrderId);
    if (exitFill) {
      const exitTime = exitFill.time.replace(' ', 'T');
      Object.assign(result, { time: exitTime, exitTime, exitTimeConfidence: 'exact' });
    }
    const exitTime = result.exitTime || result.time;
    if (exitTime) result.duration = Math.max(0, Math.floor((toMs(exitTime) - toMs(entryFill.time)) / 1000) || 0);

    // The stop in force when the entry filled: its last placement or move up to that second (the
    // broker repeats the stop as "modified" at the fill), else the first one placed afterwards.
    const stopEvents = (trade.slOrderId ? byOrder.get(trade.slOrderId) || [] : [])
      .filter(e => (e.action === 'placed' || e.action === 'modified') && e.price !== undefined);
    const atEntry = stopEvents.filter(e => e.time <= entryFill.time).pop()
      ?? stopEvents.find(e => e.action === 'placed');
    if (atEntry) Object.assign(result, { initialSlPrice: atEntry.price, initialSlSource: 'log' });

    return result;
  });
}
