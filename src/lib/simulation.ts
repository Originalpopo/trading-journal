// Monte Carlo of a trading strategy. Each trade is either drawn from the winning results or from
// all the other results (losses and break-evens), expressed in R (multiples of the amount risked).
// Kept free of app imports so it can be unit-tested with `node --test`.

export interface SimParams {
  balance: number;
  risk: number; // $ risked per trade, used when riskPercent is not set
  riskPercent?: number; // when > 0, each trade risks this % of the balance at that moment instead
  winRate: number; // 0..1: chance that a trade is drawn from winOutcomes
  winOutcomes: number[]; // R results of winning trades
  otherOutcomes: number[]; // R results of every other trade
  trades: number;
}

// The simple model: every win pays `rr` times the risk, every other trade loses the risk.
export const binaryOutcomes = (rr: number) => ({ winOutcomes: [rr], otherOutcomes: [-1] });

export interface SimPath {
  balances: number[]; // starting balance, then the balance after each trade
  endBalance: number;
  netProfit: number;
  growth: number; // % of the starting balance
  winRate: number; // % of the trades taken that made money
  maxDD: number;
  maxDDPct: number;
  lowestBal: number;
  recoveryFactor: number;
  maxConsWins: number;
  maxConsLosses: number;
  wipedOut: boolean; // the balance reached zero; no trades are taken after that
  tradesTaken: number;
}

const draw = (pool: number[], random: () => number): number => {
  if (pool.length === 0) return 0;
  if (pool.length === 1) return pool[0];
  return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))];
};

export function simulatePath(params: SimParams, random: () => number = Math.random): SimPath {
  const { balance, risk, riskPercent, winRate, winOutcomes, otherOutcomes, trades } = params;
  let current = balance, peak = balance, lowestBal = balance;
  let maxDD = 0, maxDDPct = 0;
  let wins = 0, consWins = 0, consLosses = 0, maxConsWins = 0, maxConsLosses = 0;
  let wipedOut = balance <= 0;
  let tradesTaken = 0;
  const balances = [current];

  for (let t = 0; t < trades; t++) {
    if (wipedOut) {
      balances.push(current); // an empty account cannot trade its way back
      continue;
    }

    const stake = riskPercent && riskPercent > 0 ? current * (riskPercent / 100) : risk;
    const result = draw(random() <= winRate ? winOutcomes : otherOutcomes, random);
    current += stake * result;
    tradesTaken++;

    // A break-even result (0R) neither extends nor breaks a streak.
    if (result > 0) {
      wins++;
      consWins++;
      consLosses = 0;
      if (consWins > maxConsWins) maxConsWins = consWins;
    } else if (result < 0) {
      consLosses++;
      consWins = 0;
      if (consLosses > maxConsLosses) maxConsLosses = consLosses;
    }

    if (current <= 0) {
      current = 0;
      wipedOut = true;
    }
    if (current > peak) peak = current;
    if (current < lowestBal) lowestBal = current;

    const dd = peak - current;
    if (dd > maxDD) maxDD = dd;
    const ddPct = peak > 0 ? (dd / peak) * 100 : 0;
    if (ddPct > maxDDPct) maxDDPct = ddPct;

    balances.push(current);
  }

  const netProfit = current - balance;
  return {
    balances,
    endBalance: current,
    netProfit,
    growth: balance > 0 ? (netProfit / balance) * 100 : 0,
    winRate: tradesTaken > 0 ? (wins / tradesTaken) * 100 : 0,
    maxDD,
    maxDDPct,
    lowestBal,
    recoveryFactor: maxDD > 0 ? netProfit / maxDD : 0,
    maxConsWins,
    maxConsLosses,
    wipedOut,
    tradesTaken,
  };
}

// What many runs say together. A handful of drawn paths can all look lucky or unlucky; these
// figures show the range the same inputs really produce.
export interface SimOutlook {
  runs: number;
  medianEnd: number;
  lowEnd: number; // 1 run in 20 ends below this
  highEnd: number; // 1 run in 20 ends above this
  chanceOfLoss: number; // % of runs ending below the starting balance
  chanceOfWipeout: number; // % of runs whose balance reached zero
  medianMaxDDPct: number;
  badMaxDDPct: number; // 1 run in 20 has a deeper drawdown than this
}

// Value below which `fraction` of the sorted values fall (nearest rank).
export function percentile(sorted: number[], fraction: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(fraction * sorted.length) - 1));
  return sorted[index];
}

// Keeps the work bounded when the user asks for a very long path.
export const outlookRuns = (trades: number) => Math.max(100, Math.min(1000, Math.floor(2_000_000 / Math.max(1, trades))));

export function simulateOutlook(params: SimParams, runs: number = outlookRuns(params.trades), random: () => number = Math.random): SimOutlook {
  const ends: number[] = [];
  const drawdowns: number[] = [];
  let losses = 0, wipeouts = 0;

  for (let i = 0; i < runs; i++) {
    const path = simulatePath(params, random);
    ends.push(path.endBalance);
    drawdowns.push(path.maxDDPct);
    if (path.endBalance < params.balance) losses++;
    if (path.wipedOut) wipeouts++;
  }

  ends.sort((a, b) => a - b);
  drawdowns.sort((a, b) => a - b);
  return {
    runs,
    medianEnd: percentile(ends, 0.5),
    lowEnd: percentile(ends, 0.05),
    highEnd: percentile(ends, 0.95),
    chanceOfLoss: runs > 0 ? (losses / runs) * 100 : 0,
    chanceOfWipeout: runs > 0 ? (wipeouts / runs) * 100 : 0,
    medianMaxDDPct: percentile(drawdowns, 0.5),
    badMaxDDPct: percentile(drawdowns, 0.95),
  };
}

// A measured win rate is only an estimate of the true one. This is the low end of the range the
// sample supports (Wilson score interval, 95%): with few trades it sits far below the measured rate.
export function cautiousWinRate(winRate: number, sampleSize: number, z: number = 1.96): number {
  if (sampleSize <= 0) return 0;
  const p = Math.min(1, Math.max(0, winRate));
  const z2 = z * z;
  const centre = p + z2 / (2 * sampleSize);
  const margin = z * Math.sqrt((p * (1 - p)) / sampleSize + z2 / (4 * sampleSize * sampleSize));
  return Math.max(0, (centre - margin) / (1 + z2 / sampleSize));
}
