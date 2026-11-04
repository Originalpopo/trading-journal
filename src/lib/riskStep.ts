// Risk per trade in steps: the dollar risk is a set % of the balance it was last set from (the anchor), and
// stays the same between steps so it needn't be worked out on every trade. Once the balance has grown a
// set % above the anchor it is time to step the risk up; once it has fallen a (smaller) set % below, to step
// it down, faster than up, so a losing run eats less of the account.
// Kept free of app imports so it can be unit-tested with `node --test`.
import { toCents, fromCents } from './money.ts';

export const DEFAULT_RISK_PCT = 2;
export const DEFAULT_RISK_STEP_UP_PCT = 20;
export const DEFAULT_RISK_STEP_DOWN_PCT = 10;

// The balance the risk was last set from, and when (ISO time).
export interface RiskAnchor {
  balance: number;
  at: string;
}

export interface RiskStep {
  anchorBalance: number;
  riskNow: number; // dollars, to the cent: the anchor's share
  upAt: number; // the balance that calls for a step up
  downAt: number; // the balance that calls for a step down
  state: 'hold' | 'up' | 'down';
  riskAtBalance: number; // the risk the current balance would give, to step to
}

const share = (balance: number, pct: number) => fromCents(Math.round(toCents(balance) * pct / 100));

// `anchor` missing: the risk has not been set yet, and the current balance stands in for it.
export function riskStep(balance: number, pct: number, anchor: RiskAnchor | undefined, upPct: number, downPct: number): RiskStep {
  const anchorBalance = anchor?.balance ?? balance;
  const upAt = share(anchorBalance, 100 + upPct);
  const downAt = share(anchorBalance, 100 - downPct);
  return {
    anchorBalance,
    riskNow: share(anchorBalance, pct),
    upAt,
    downAt,
    state: balance >= upAt && upPct > 0 ? 'up' : balance <= downAt && downPct > 0 ? 'down' : 'hold',
    riskAtBalance: share(balance, pct),
  };
}

// How far `losses` full 1R losses in a row take the balance down, in %, at `pct` % a trade re-sized after each
// loss: 1 − (1 − pct)^losses.
export const drawdownAfterLosses = (pct: number, losses: number): number =>
  (1 - Math.pow(1 - pct / 100, losses)) * 100;

// The account balance now: deposits less withdrawals plus every trade's profit, to the cent.
export function balanceOf(trades: { profit?: number }[], funding: { deposit?: number; withdraw?: number }[]): number {
  let cents = 0;
  for (const f of funding) cents += toCents(f.deposit || 0) - toCents(f.withdraw || 0);
  for (const t of trades) cents += toCents(t.profit || 0);
  return fromCents(cents);
}
