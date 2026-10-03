// Yearly figures for the Thai tax filing. The rules come from the account owner, not from this
// code: tax arises when profit reaches the Thai bank, in the year it arrives; principal is counted
// in baht (baht sent out vs baht coming back, as the bank slips show). How a withdrawal splits into
// principal and profit is not fixed by law, so both accepted methods are computed side by side.
import { toCents, fromCents } from './money.ts';

export interface TaxFunding {
  time: string; // when the broker moved the money
  deposit?: number;
  withdraw?: number;
  thb?: number; // baht actually paid or received
  bankDate?: string; // day the Thai bank shows it; decides the tax year
}

export interface TaxTrade {
  time: string;
  profit?: number;
  commission?: number;
}

export interface Split {
  principal: number; // baht counted as principal coming home
  profit: number; // baht counted as profit brought in (never negative)
}

export interface WithdrawalRow {
  time: string;
  bankDate: string;
  taxYear: number;
  usd: number;
  thb: number | null; // null until the user enters what the bank received
  rate: number | null; // baht per dollar actually obtained
  principalFirst: Split | null; // principal comes out first; profit only once it is all back
  proRata: Split | null; // principal leaves in proportion to the share of the account withdrawn
}

export interface YearSummary {
  year: number;
  depositUsd: number;
  depositThb: number;
  withdrawUsd: number;
  withdrawThb: number;
  tradingPnlUsd: number;
  tradeCount: number;
  commissionUsd: number;
  startBalanceUsd: number;
  endBalanceUsd: number;
  profitBroughtInThb: { principalFirst: number; proRata: number };
  missingThb: number; // deposits/withdrawals of this year with no baht amount yet
  // For on-screen estimates only, never for filing: the rate of the latest real transfer up to
  // the end of this year. Null until one transfer has a baht amount.
  approxRate: ApproxRate | null;
}

export interface ApproxRate {
  rate: number; // baht per dollar
  date: string; // bank date of the transfer it comes from
  kind: 'deposit' | 'withdrawal';
}

export interface TaxReport {
  years: YearSummary[];
  withdrawals: WithdrawalRow[];
  principalLeftThb: { principalFirst: number; proRata: number }; // baht principal still abroad
  depositsMissingThb: number;
  withdrawalsMissingThb: number;
  // False while any baht amount is missing: principal is then understated or a split is absent.
  isComplete: boolean;
}

const toMs = (time: string) => new Date(time.replace(' ', 'T')).getTime();
const yearOf = (time: string) => new Date(time.replace(' ', 'T')).getFullYear();

export function buildTaxReport(trades: TaxTrade[], funding: TaxFunding[]): TaxReport {
  type Event = { ms: number; trade?: TaxTrade; funding?: TaxFunding };
  const events: Event[] = [
    ...funding.map(f => ({ ms: toMs(f.time), funding: f })),
    ...trades.map(t => ({ ms: toMs(t.time), trade: t })),
  ].filter(e => !isNaN(e.ms)).sort((a, b) => a.ms - b.ms);

  // Everything below is in whole cents / satang.
  const years = new Map<number, {
    depositUsd: number; depositThb: number; withdrawUsd: number; withdrawThb: number;
    pnl: number; tradeCount: number; commission: number; endBalance: number;
    profitFirst: number; profitProRata: number; missingThb: number;
  }>();
  const yearRow = (year: number) => {
    if (!years.has(year)) {
      years.set(year, {
        depositUsd: 0, depositThb: 0, withdrawUsd: 0, withdrawThb: 0, pnl: 0, tradeCount: 0, commission: 0,
        endBalance: 0, profitFirst: 0, profitProRata: 0, missingThb: 0,
      });
    }
    return years.get(year)!;
  };

  let balance = 0;
  let principalFirstPool = 0;
  let proRataPool = 0;
  let depositsMissingThb = 0;
  let withdrawalsMissingThb = 0;
  const withdrawals: WithdrawalRow[] = [];
  const balanceAtEndOf = new Map<number, number>();
  const realRates: (ApproxRate & { year: number })[] = [];
  const bankDateOf = (f: TaxFunding) => f.bankDate || f.time.replace(' ', 'T').slice(0, 10);

  for (const e of events) {
    const brokerYear = new Date(e.ms).getFullYear();

    if (e.trade) {
      const row = yearRow(brokerYear);
      row.pnl += toCents(e.trade.profit);
      row.commission += toCents(e.trade.commission);
      row.tradeCount++;
      balance += toCents(e.trade.profit);
    } else if (e.funding) {
      const f = e.funding;
      const bankYear = f.bankDate ? yearOf(f.bankDate) : brokerYear;
      const thb = f.thb && f.thb > 0 ? toCents(f.thb) : null;
      const deposit = toCents(f.deposit);
      const withdraw = toCents(f.withdraw);

      if (deposit > 0) {
        const row = yearRow(bankYear);
        row.depositUsd += deposit;
        if (thb === null) { row.missingThb++; depositsMissingThb++; }
        else {
          row.depositThb += thb; principalFirstPool += thb; proRataPool += thb;
          realRates.push({ rate: thb / deposit, date: bankDateOf(f), kind: 'deposit', year: bankYear });
        }
        balance += deposit;
      }

      if (withdraw > 0) {
        const row = yearRow(bankYear);
        row.withdrawUsd += withdraw;

        // The share of the account that leaves takes the same share of the principal with it.
        const share = balance > 0 ? Math.min(1, withdraw / balance) : 1;
        const proRataPrincipal = Math.round(proRataPool * share);
        proRataPool -= proRataPrincipal;

        let principalFirst: Split | null = null;
        let proRata: Split | null = null;
        if (thb === null) {
          row.missingThb++;
          withdrawalsMissingThb++;
        } else {
          row.withdrawThb += thb;
          realRates.push({ rate: thb / withdraw, date: bankDateOf(f), kind: 'withdrawal', year: bankYear });
          const firstPrincipal = Math.min(thb, principalFirstPool);
          principalFirstPool -= firstPrincipal;
          principalFirst = { principal: fromCents(firstPrincipal), profit: fromCents(thb - firstPrincipal) };
          // Receiving less than the principal share is a loss on the transfer, not negative income.
          proRata = { principal: fromCents(proRataPrincipal), profit: fromCents(Math.max(0, thb - proRataPrincipal)) };
          row.profitFirst += thb - firstPrincipal;
          row.profitProRata += Math.max(0, thb - proRataPrincipal);
        }

        withdrawals.push({
          time: f.time,
          bankDate: bankDateOf(f),
          taxYear: bankYear,
          usd: fromCents(withdraw),
          thb: thb === null ? null : fromCents(thb),
          rate: thb === null ? null : thb / withdraw,
          principalFirst,
          proRata,
        });
        balance -= withdraw;
      }
    }

    balanceAtEndOf.set(brokerYear, balance);
    yearRow(brokerYear); // a year with any activity gets a row
  }

  const sortedYears = Array.from(years.keys()).sort((a, b) => a - b);
  const summaries: YearSummary[] = [];
  let carried = 0;
  if (sortedYears.length > 0) {
    for (let year = sortedYears[0]; year <= sortedYears[sortedYears.length - 1]; year++) {
      const row = yearRow(year);
      const end = balanceAtEndOf.has(year) ? balanceAtEndOf.get(year)! : carried;
      const latest = realRates.filter(r => r.year <= year).sort((a, b) => a.date.localeCompare(b.date)).pop();
      summaries.push({
        year,
        depositUsd: fromCents(row.depositUsd),
        depositThb: fromCents(row.depositThb),
        withdrawUsd: fromCents(row.withdrawUsd),
        withdrawThb: fromCents(row.withdrawThb),
        tradingPnlUsd: fromCents(row.pnl),
        tradeCount: row.tradeCount,
        commissionUsd: fromCents(row.commission),
        startBalanceUsd: fromCents(carried),
        endBalanceUsd: fromCents(end),
        profitBroughtInThb: { principalFirst: fromCents(row.profitFirst), proRata: fromCents(row.profitProRata) },
        missingThb: row.missingThb,
        approxRate: latest ? { rate: latest.rate, date: latest.date, kind: latest.kind } : null,
      });
      carried = end;
    }
  }

  return {
    years: summaries,
    withdrawals,
    principalLeftThb: { principalFirst: fromCents(principalFirstPool), proRata: fromCents(proRataPool) },
    depositsMissingThb,
    withdrawalsMissingThb,
    isComplete: depositsMissingThb === 0 && withdrawalsMissingThb === 0,
  };
}

const csvCell = (value: string | number | null) => {
  const text = value === null ? '' : typeof value === 'number' ? value.toFixed(2) : value;
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

// Two tables in one file: the yearly summary, then every withdrawal with both splits.
export function taxReportCsv(report: TaxReport): string {
  const lines: (string | number | null)[][] = [
    ['Year', 'Start balance USD', 'Deposits USD', 'Deposits THB', 'Withdrawals USD', 'Withdrawals THB', 'Trading P&L USD',
      'Trades', 'Commission USD', 'End balance USD', 'Profit brought in THB (principal first)', 'Profit brought in THB (pro rata)',
      'Entries missing THB'],
    ...report.years.map(y => [
      String(y.year), y.startBalanceUsd, y.depositUsd, y.depositThb, y.withdrawUsd, y.withdrawThb, y.tradingPnlUsd,
      String(y.tradeCount), y.commissionUsd, y.endBalanceUsd, y.profitBroughtInThb.principalFirst, y.profitBroughtInThb.proRata,
      String(y.missingThb),
    ]),
    [],
    ['Withdrawal (broker time)', 'Bank date', 'Tax year', 'USD', 'THB received', 'THB per USD',
      'Principal THB (principal first)', 'Profit THB (principal first)', 'Principal THB (pro rata)', 'Profit THB (pro rata)'],
    ...report.withdrawals.map(w => [
      w.time, w.bankDate, String(w.taxYear), w.usd, w.thb, w.rate === null ? null : w.rate.toFixed(4),
      w.principalFirst?.principal ?? null, w.principalFirst?.profit ?? null, w.proRata?.principal ?? null, w.proRata?.profit ?? null,
    ]),
  ];
  return lines.map(line => line.map(csvCell).join(',')).join('\n');
}
