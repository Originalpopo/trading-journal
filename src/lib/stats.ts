// Shared trade statistics. Every page classifies trades and computes summary metrics here,
// so a rule change (e.g. the BE threshold) only has to be made once.
// Kept free of app imports so it can be unit-tested with `node --test`.

export type TradeOutcome = 'win' | 'loss' | 'be';

export interface StatTrade {
  profit?: number;
  risk?: number | string;
  rr?: number;
  resultType?: string;
}

// A trade whose result is within ±0.4R of zero counts as break-even.
export const BE_RR_THRESHOLD = 0.4;

export const parseRisk = (risk: number | string | undefined): number => parseFloat(String(risk || 0)) || 0;

export function classifyTrade(t: StatTrade): TradeOutcome {
  const pnl = t.profit || 0;
  const risk = parseRisk(t.risk);

  const isBE = risk > 0
    ? Math.abs(pnl / risk) <= BE_RR_THRESHOLD
    : (t.resultType === 'BE' || pnl === 0);

  if (isBE) return 'be';
  if (pnl > 0 || t.resultType === 'TP') return 'win';
  return 'loss';
}

const OUTCOME_LABELS: Record<TradeOutcome, 'TP' | 'SL' | 'BE'> = { win: 'TP', loss: 'SL', be: 'BE' };

export const outcomeLabel = (outcome: TradeOutcome) => OUTCOME_LABELS[outcome];

// The resultType stored on a trade, derived the same way trades are classified.
export const deriveResultType = (profit: number, risk: number) => outcomeLabel(classifyTrade({ profit, risk }));

export function calcStandardDeviation(values: number[], mean: number): number {
  if (values.length === 0) return 0;
  const avgSquareDiff = values.reduce((sum, val) => sum + (val - mean) * (val - mean), 0) / values.length;
  return Math.sqrt(avgSquareDiff);
}

export const calcProfitFactor = (grossProfit: number, grossLoss: number) =>
  grossLoss === 0 ? grossProfit : grossProfit / grossLoss;

// 1 = worst (PF < 0.5) ... 5 = best (PF >= 2); 3 when there are no trades yet.
export function healthTierFromProfitFactor(profitFactor: number, totalTrades: number): number {
  if (totalTrades === 0) return 3;
  if (profitFactor >= 2.0) return 5;
  if (profitFactor >= 1.2) return 4;
  if (profitFactor >= 0.8) return 3;
  if (profitFactor >= 0.5) return 2;
  return 1;
}

export interface TradeSummary {
  totalTrades: number;
  wins: number;
  losses: number;
  bes: number;
  netProfit: number;
  grossProfit: number;
  grossLoss: number;
  sumBE: number;
  largestProfit: number;
  largestLoss: number;
  largestBE: number;
  avgWin: number;
  avgLoss: number;
  avgBE: number;
  winRate: number; // 0..1, BE trades excluded
  profitFactor: number;
  expectedPayoff: number;
  expectancyR: number;
  stdDev: number;
  sharpeRatio: number;
  netRR: number;
  avgTPRR: number;
  maxTPRR: number;
  avgSLRR: number;
  maxSLRR: number;
  maxConsWinCount: number;
  maxConsLossCount: number;
  maxConsWinAmt: number;
  maxConsLossAmt: number;
  countAtMaxWinAmt: number;
  countAtMaxLossAmt: number;
  avgConsWin: number;
  avgConsLoss: number;
}

// Trades must be in chronological order (oldest first) for the streak figures to be meaningful.
// BE trades do not break a winning or losing streak.
export function summarizeTrades(trades: StatTrade[]): TradeSummary {
  let wins = 0, losses = 0, bes = 0;
  let netProfit = 0, grossProfit = 0, grossLoss = 0, sumBE = 0;
  let largestProfit = 0, largestLoss = 0, largestBE = 0;
  let netRR = 0;
  let tpRRSum = 0, tpRRCount = 0, maxTPRR = 0;
  let slRRSum = 0, slRRCount = 0, maxSLRR = 0;

  let currentWinCount = 0, currentLossCount = 0;
  let currentWinAmt = 0, currentLossAmt = 0;
  let maxConsWinCount = 0, maxConsLossCount = 0;
  let maxConsWinAmt = 0, maxConsLossAmt = 0;
  let countAtMaxWinAmt = 0, countAtMaxLossAmt = 0;
  let winStreaks = 0, sumOfWinStreaks = 0;
  let lossStreaks = 0, sumOfLossStreaks = 0;

  const profits: number[] = [];

  for (const t of trades) {
    const pnl = t.profit || 0;
    const rr = t.rr || 0;
    netProfit += pnl;
    netRR += rr;
    profits.push(pnl);

    const outcome = classifyTrade(t);

    if (outcome === 'be') {
      bes++;
      sumBE += pnl;
      if (Math.abs(pnl) > Math.abs(largestBE)) largestBE = pnl;
    } else if (outcome === 'win') {
      wins++;
      grossProfit += pnl;
      if (pnl > largestProfit) largestProfit = pnl;
      if (rr > 0) {
        tpRRSum += rr;
        tpRRCount++;
        if (rr > maxTPRR) maxTPRR = rr;
      }

      currentWinCount++;
      currentWinAmt += pnl;
      if (currentLossCount > 0) {
        lossStreaks++;
        sumOfLossStreaks += currentLossCount;
        currentLossCount = 0;
        currentLossAmt = 0;
      }
      if (currentWinCount > maxConsWinCount) maxConsWinCount = currentWinCount;
      if (currentWinAmt > maxConsWinAmt) {
        maxConsWinAmt = currentWinAmt;
        countAtMaxWinAmt = currentWinCount;
      }
    } else {
      losses++;
      grossLoss += Math.abs(pnl);
      if (pnl < largestLoss) largestLoss = pnl;
      if (rr < 0) {
        slRRSum += rr;
        slRRCount++;
        if (rr < maxSLRR) maxSLRR = rr;
      }

      currentLossCount++;
      currentLossAmt += Math.abs(pnl);
      if (currentWinCount > 0) {
        winStreaks++;
        sumOfWinStreaks += currentWinCount;
        currentWinCount = 0;
        currentWinAmt = 0;
      }
      if (currentLossCount > maxConsLossCount) maxConsLossCount = currentLossCount;
      if (currentLossAmt > maxConsLossAmt) {
        maxConsLossAmt = currentLossAmt;
        countAtMaxLossAmt = currentLossCount;
      }
    }
  }

  if (currentWinCount > 0) { winStreaks++; sumOfWinStreaks += currentWinCount; }
  if (currentLossCount > 0) { lossStreaks++; sumOfLossStreaks += currentLossCount; }

  const totalTrades = trades.length;
  const expectedPayoff = totalTrades > 0 ? netProfit / totalTrades : 0;
  const avgLoss = losses > 0 ? grossLoss / losses : 0;
  const stdDev = calcStandardDeviation(profits, expectedPayoff);

  return {
    totalTrades, wins, losses, bes,
    netProfit, grossProfit, grossLoss, sumBE,
    largestProfit, largestLoss, largestBE,
    avgWin: wins > 0 ? grossProfit / wins : 0,
    avgLoss,
    avgBE: bes > 0 ? sumBE / bes : 0,
    winRate: (wins + losses) > 0 ? wins / (wins + losses) : 0,
    profitFactor: calcProfitFactor(grossProfit, grossLoss),
    expectedPayoff,
    expectancyR: avgLoss > 0 ? expectedPayoff / avgLoss : 0,
    stdDev,
    sharpeRatio: stdDev !== 0 ? expectedPayoff / stdDev : 0,
    netRR,
    avgTPRR: tpRRCount > 0 ? tpRRSum / tpRRCount : 0,
    maxTPRR,
    avgSLRR: slRRCount > 0 ? slRRSum / slRRCount : 0,
    maxSLRR,
    maxConsWinCount, maxConsLossCount,
    maxConsWinAmt, maxConsLossAmt,
    countAtMaxWinAmt, countAtMaxLossAmt,
    avgConsWin: winStreaks > 0 ? Math.round(sumOfWinStreaks / winStreaks) : 0,
    avgConsLoss: lossStreaks > 0 ? Math.round(sumOfLossStreaks / lossStreaks) : 0,
  };
}
