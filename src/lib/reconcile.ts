// Compares the journal's balance with the balance the broker reports. The journal builds its
// balance from deposits, withdrawals and every trade's P&L, so a mismatch means something is
// missing, duplicated or wrong (a trade, a funding entry, or a fee/swap the journal never saw).
import { toCents, fromCents } from './money.ts';

// The broker's balance as the user read it at `time` (closed trades only, not equity).
export interface BalanceCheck {
  time: string;
  balance: number;
}

interface TimedTrade { time: string; profit?: number }
interface TimedFunding { time: string; deposit?: number; withdraw?: number }

export interface Reconciliation {
  journalBalance: number; // what the journal says the balance was at the check time
  brokerBalance: number;
  difference: number; // journal minus broker; 0 when they agree
  matches: boolean;
  tradeCount: number; // trades counted up to the check time
}

const toMs = (time: string) => new Date(time.replace(' ', 'T')).getTime();

export function reconcileBalance(check: BalanceCheck, trades: TimedTrade[], funding: TimedFunding[]): Reconciliation {
  const checkMs = toMs(check.time);
  let cents = 0;
  let tradeCount = 0;

  for (const f of funding) {
    if (toMs(f.time) <= checkMs) cents += toCents(f.deposit) - toCents(f.withdraw);
  }
  for (const t of trades) {
    if (toMs(t.time) <= checkMs) {
      cents += toCents(t.profit);
      tradeCount++;
    }
  }

  const brokerCents = toCents(check.balance);
  return {
    journalBalance: fromCents(cents),
    brokerBalance: fromCents(brokerCents),
    difference: fromCents(cents - brokerCents),
    matches: cents === brokerCents,
    tradeCount,
  };
}
