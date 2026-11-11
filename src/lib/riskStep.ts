// Risk per trade in steps: the dollar risk is a set % of the balance it was last set from (the anchor), and
// stays the same between steps so it needn't be worked out on every trade. Once the balance has grown a
// set % above the anchor it is time to step the risk up; once it has fallen a (smaller) set % below, to step
// it down, faster than up, so a losing run eats less of the account.
// Kept free of app imports so it can be unit-tested with `node --test`.
import { toCents, fromCents } from './money.ts';

export const DEFAULT_RISK_PCT = 2;
export const DEFAULT_RISK_STEP_UP_PCT = 20;
export const DEFAULT_RISK_STEP_DOWN_PCT = 10;

// The balance the risk was last set from, when (ISO time), and the dollars it gave. `risk` is kept so a later
// change of the % in Settings shows as a step to take, not as a quiet change of the risk.
export interface RiskAnchor {
  balance: number;
  at: string;
  risk?: number; // missing on the first one set, before this was kept: the anchor's share at the % then
}

// One Risk per Trade set: from `from` (ISO time) on, `risk` dollars a trade. Kept in dollars, so changing the
// % later never rewrites the past. Trades whose first stop is unknown use the one in force when entered.
export interface RiskChange {
  from: string;
  risk: number;
}

export interface RiskStep {
  anchorBalance: number;
  riskNow: number; // dollars, to the cent: the anchor's share
  upAt: number; // the balance that calls for a step up
  downAt: number; // the balance that calls for a step down
  state: 'hold' | 'up' | 'down' | 'pct'; // 'pct': the % in Settings no longer gives the risk set
  riskAtBalance: number; // the risk the current balance would give, to step to
}

export const share = (balance: number, pct: number) => fromCents(Math.round(toCents(balance) * pct / 100));

// `anchor` missing: the risk has not been set yet, and the current balance stands in for it.
export function riskStep(balance: number, pct: number, anchor: RiskAnchor | undefined, upPct: number, downPct: number): RiskStep {
  const anchorBalance = anchor?.balance ?? balance;
  const upAt = share(anchorBalance, 100 + upPct);
  const downAt = share(anchorBalance, 100 - downPct);
  const riskNow = anchor?.risk ?? share(anchorBalance, pct);
  const pctChanged = anchor?.risk !== undefined && share(anchorBalance, pct) !== anchor.risk;
  return {
    anchorBalance,
    riskNow,
    upAt,
    downAt,
    state: balance >= upAt && upPct > 0 ? 'up' : balance <= downAt && downPct > 0 ? 'down' : pctChanged ? 'pct' : 'hold',
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

// The risks set so far, oldest first. The first anchor was saved before the history was kept: it stands in
// for its own entry, at the % then (`pctThen`).
export function riskHistoryOf(history: RiskChange[] | undefined, anchor: RiskAnchor | undefined, pctThen: number): RiskChange[] {
  if (history?.length) return [...history].sort((a, b) => a.from.localeCompare(b.from));
  return anchor ? [{ from: anchor.at, risk: anchor.risk ?? share(anchor.balance, pctThen) }] : [];
}

// What setting the risk from `balance` at `pct` now saves: the new anchor, and the history with it added.
export function setRiskFrom(balance: number, pct: number, at: string, history: RiskChange[]): { riskAnchor: RiskAnchor; riskHistory: RiskChange[] } {
  const risk = share(balance, pct);
  return { riskAnchor: { balance, at, risk }, riskHistory: [...history, { from: at, risk }] };
}

// How far over the Risk per Trade set a trade's 1R may go and still count as kept, in %: lots come in steps of
// 0.01, so the risk set can rarely be hit to the cent.
export const DEFAULT_RISK_OVER_PCT = 10;

export type RiskKept = 'within' | 'over' | 'unchecked';

// Whether a trade kept to the Risk per Trade in force when it was entered. Only a trade whose 1R is known (its
// first stop, or a risk the user typed) can be checked: a guessed 1R is the usual one and says nothing. Nor can a
// trade from before any risk was set. Over means more than `overPct` % above the risk set, to the cent.
export function riskKeptOf(risk: number, riskIsEstimate: boolean | undefined, riskSet: number | null, overPct: number): RiskKept {
  if (riskIsEstimate !== false || !(risk > 0) || riskSet === null || !(riskSet > 0)) return 'unchecked';
  return toCents(risk) > toCents(share(riskSet, 100 + overPct)) ? 'over' : 'within';
}
