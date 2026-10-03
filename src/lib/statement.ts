// Monthly account statement in USD, built from the journal. It exists to show where money that
// was later withdrawn came from: opening balance + deposits + closed P/L - withdrawals = closing
// balance, with every trade and transfer of the month listed in order.
import { toCents, fromCents } from './money.ts';

// Lot size of trades saved before the size was recorded; the account has only ever traded this.
export const DEFAULT_LOT_SIZE = 0.01;

export interface StatementTrade {
  time: string; // close time
  entryTime?: string;
  positionId?: string;
  symbol?: string;
  side?: string;
  size?: number;
  entryPrice?: number;
  exitPrice?: number;
  profit?: number;
  commission?: number;
  exitTimeConfidence?: string;
}

export interface StatementFunding {
  time: string;
  deposit?: number;
  withdraw?: number;
}

export interface StatementRow {
  kind: 'trade' | 'deposit' | 'withdrawal';
  time: string; // close time of a trade, or when the broker moved the money
  openTime?: string;
  reference?: string; // the broker's position ID
  symbol?: string;
  side?: string;
  size?: number;
  entryPrice?: number;
  exitPrice?: number;
  commission: number;
  amount: number; // P/L of a trade; + for a deposit, - for a withdrawal
  balanceAfter: number;
  timeIsEstimate: boolean; // the close time could not be read exactly from the broker data
}

export interface Statement {
  year: number;
  month: number; // 1..12
  openingBalance: number;
  deposits: number;
  withdrawals: number;
  closedPnl: number;
  commission: number;
  closingBalance: number;
  tradeCount: number;
  rows: StatementRow[];
}

const toMs = (time: string) => new Date(time.replace(' ', 'T')).getTime();
const monthKeyOf = (ms: number) => { const d = new Date(ms); return d.getFullYear() * 12 + d.getMonth(); };

interface Entry { ms: number; trade?: StatementTrade; funding?: StatementFunding }

const sortedEntries = (trades: StatementTrade[], funding: StatementFunding[]): Entry[] =>
  [
    ...funding.map(f => ({ ms: toMs(f.time), funding: f })),
    ...trades.map(t => ({ ms: toMs(t.time), trade: t })),
  ].filter(e => !isNaN(e.ms)).sort((a, b) => a.ms - b.ms);

// Months that have at least one trade or transfer, newest first.
export function statementMonths(trades: StatementTrade[], funding: StatementFunding[]): { year: number; month: number }[] {
  const keys = new Set(sortedEntries(trades, funding).map(e => monthKeyOf(e.ms)));
  return Array.from(keys).sort((a, b) => b - a).map(key => ({ year: Math.floor(key / 12), month: (key % 12) + 1 }));
}

export function buildStatement(trades: StatementTrade[], funding: StatementFunding[], year: number, month: number): Statement {
  const target = year * 12 + (month - 1);
  // Everything is added in whole cents.
  let balance = 0, opening = 0, deposits = 0, withdrawals = 0, closedPnl = 0, commission = 0, tradeCount = 0;
  const rows: StatementRow[] = [];

  for (const e of sortedEntries(trades, funding)) {
    const key = monthKeyOf(e.ms);
    if (key > target) break;
    const inMonth = key === target;

    if (e.trade) {
      const t = e.trade;
      const pnl = toCents(t.profit);
      balance += pnl;
      if (!inMonth) { opening = balance; continue; }
      closedPnl += pnl;
      commission += toCents(t.commission);
      tradeCount++;
      rows.push({
        kind: 'trade',
        time: t.time,
        openTime: t.entryTime,
        reference: t.positionId,
        symbol: t.symbol,
        side: t.side,
        size: t.size ?? DEFAULT_LOT_SIZE,
        entryPrice: t.entryPrice,
        exitPrice: t.exitPrice,
        commission: fromCents(toCents(t.commission)),
        amount: fromCents(pnl),
        balanceAfter: fromCents(balance),
        timeIsEstimate: t.exitTimeConfidence === 'estimated' || t.exitTimeConfidence === 'uncertain',
      });
    } else if (e.funding) {
      // One journal entry can only be a deposit or a withdrawal, but both are handled.
      for (const [kind, cents] of [['deposit', toCents(e.funding.deposit)], ['withdrawal', -toCents(e.funding.withdraw)]] as const) {
        if (cents === 0) continue;
        balance += cents;
        if (!inMonth) { opening = balance; continue; }
        if (kind === 'deposit') deposits += cents; else withdrawals -= cents;
        rows.push({ kind, time: e.funding.time, commission: 0, amount: fromCents(cents), balanceAfter: fromCents(balance), timeIsEstimate: false });
      }
    }
  }

  return {
    year,
    month,
    openingBalance: fromCents(opening),
    deposits: fromCents(deposits),
    withdrawals: fromCents(withdrawals),
    closedPnl: fromCents(closedPnl),
    commission: fromCents(commission),
    closingBalance: fromCents(opening + deposits - withdrawals + closedPnl),
    tradeCount,
    rows,
  };
}

const csvCell = (value: string | number | undefined) => {
  const text = value === undefined ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const money = (value: number) => value.toFixed(2);

export interface StatementProfile {
  name?: string;
  broker?: string;
  accountNo?: string;
}

export function statementCsv(statement: Statement, profile: StatementProfile): string {
  const period = `${statement.year}-${String(statement.month).padStart(2, '0')}`;
  const lines: (string | number | undefined)[][] = [
    ['Monthly statement (self-prepared from the broker order history)'],
    ['Name', profile.name || ''],
    ['Broker', profile.broker || ''],
    ['Account', profile.accountNo || ''],
    ['Period', period],
    ['Currency', 'USD'],
    [],
    ['Opening balance', money(statement.openingBalance)],
    ['Deposits', money(statement.deposits)],
    ['Withdrawals', money(-statement.withdrawals)],
    ['Closed P/L', money(statement.closedPnl)],
    ['Commission reported by broker', money(statement.commission)],
    ['Closing balance', money(statement.closingBalance)],
    ['Trades', statement.tradeCount],
    [],
    ['Close time', 'Open time', 'Type', 'Position ID', 'Symbol', 'Size', 'Open price', 'Close price', 'Commission', 'Amount', 'Balance', 'Note'],
    ...statement.rows.map(r => [
      r.time.replace('T', ' '),
      r.openTime ? r.openTime.replace('T', ' ') : '',
      r.kind === 'trade' ? (r.side || '').toLowerCase() : r.kind,
      r.reference,
      r.symbol,
      r.size,
      r.entryPrice,
      r.exitPrice,
      r.kind === 'trade' ? money(r.commission) : '',
      money(r.amount),
      money(r.balanceAfter),
      r.timeIsEstimate ? 'close time estimated' : '',
    ]),
  ];
  return lines.map(line => line.map(csvCell).join(',')).join('\n');
}
