import type { LinkedTrade } from './tradingViewParser.ts';

// TradingView's "Notifications log" tab: one entry per order event. Unlike the order history it
// keeps every placement and move of a stop with its price, and the moment an order really filled
// (the history's "Update Time" of a filled limit order is when it was placed).

export type LogAction = 'placed' | 'modified' | 'executed' | 'cancelled' | 'rejected';

export interface LogEvent {
  orderId: string;
  symbol: string;
  type: string; // 'limit', 'stop loss', 'take profit', 'market', ...
  action: LogAction;
  time: string; // 'YYYY-MM-DD HH:MM:SS'
  price?: number;
}

const TIME_LINE = /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/;
const EVENT_LINE = /^(.+?) order (placed|modified|executed|cancelled|rejected) on (\S+) \((\d+)\)/i;
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
      current = {
        orderId: eventMatch[4], symbol: eventMatch[3], type: eventMatch[1].toLowerCase(), action: eventMatch[2].toLowerCase() as LogAction, time,
      };
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

function groupByOrder(events: LogEvent[]) {
  const byOrder = new Map<string, LogEvent[]>();
  for (const e of events) {
    if (!byOrder.has(e.orderId)) byOrder.set(e.orderId, []);
    byOrder.get(e.orderId)!.push(e);
  }
  return byOrder;
}

const findExecution = (byOrder: Map<string, LogEvent[]>, orderId?: string) =>
  (orderId ? byOrder.get(orderId)?.find(e => e.action === 'executed') : undefined);

const isProtective = (e: LogEvent) => e.type === 'stop loss' || e.type === 'take profit';

// For a log pasted without the order history: ties it to trades already in the journal. A saved
// position ID is "SYMBOL:<ID of the order that opened it>", and a TP/SL placed with that order gets
// its ID + 1 or + 2. One added later is the first placed on the symbol while the trade was open.
// Returns only the trades whose opening fill is in the log, with the order IDs filled in.
export function linkSavedTrades<T extends LinkedTrade>(trades: T[], events: LogEvent[]): T[] {
  const byOrder = groupByOrder(events);
  // A TP/SL that came with any other order the log shows belongs to that order's position.
  const bracketIds = new Set<string>();
  for (const e of events) {
    if (isProtective(e)) continue;
    const id = parseInt(e.orderId, 10);
    bracketIds.add(String(id + 1));
    bracketIds.add(String(id + 2));
  }

  const linked: T[] = [];
  for (const trade of trades) {
    const entryOrderId = trade.positionId?.split(':').pop();
    const entryFill = entryOrderId && /^\d+$/.test(entryOrderId) ? findExecution(byOrder, entryOrderId) : undefined;
    if (!entryOrderId || !entryFill) continue;

    const id = parseInt(entryOrderId, 10);
    const bracket = [String(id + 1), String(id + 2)].filter(oid => byOrder.get(oid)?.some(isProtective));
    // The saved exit is never earlier than the stop's last move, so a stop placed by then is inside it.
    const savedExit = (trade.exitTime || trade.time || '').replace('T', ' ');
    const addedLater = [...byOrder.entries()]
      .filter(([oid, orderEvents]) => !bracketIds.has(oid) && isProtective(orderEvents[0]) && orderEvents[0].symbol === entryFill.symbol
        && orderEvents[0].time >= entryFill.time && (!savedExit || orderEvents[0].time <= savedExit))
      .map(([oid]) => oid);
    const orderIds = [...bracket, ...addedLater];
    const ordersOfType = (type: string) => orderIds.filter(oid => byOrder.get(oid)![0].type === type);

    const exitFill = orderIds
      .map(oid => findExecution(byOrder, oid))
      .filter((e): e is LogEvent => !!e && e.time >= entryFill.time)
      .sort((a, b) => a.time.localeCompare(b.time))[0];

    linked.push({ ...trade, entryOrderId, exitOrderId: exitFill?.orderId, slOrderId: ordersOfType('stop loss')[0] });
  }
  return linked;
}

// Fills in what only the log knows: when the entry and exit really filled, and where the stop was
// when the position opened. Trades the log does not cover are returned untouched.
export function applyNotificationsLog<T extends LinkedTrade>(trades: T[], events: LogEvent[]): T[] {
  if (events.length === 0) return trades;
  const byOrder = groupByOrder(events);
  const executionOf = (orderId?: string) => findExecution(byOrder, orderId);

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
