// Money is added in whole cents. Adding dollar amounts as floats leaves stray fractions
// (49 real trades summed to -8.920000000000003 instead of -8.92), which breaks exact comparisons
// against the broker and can eventually round a total to the wrong cent.

export const toCents = (amount: number | string | undefined | null): number =>
  Math.round((Number(amount) || 0) * 100);

export const fromCents = (cents: number): number => cents / 100;

export const addMoney = (a: number | string | undefined | null, b: number | string | undefined | null): number =>
  fromCents(toCents(a) + toCents(b));

export const subMoney = (a: number | string | undefined | null, b: number | string | undefined | null): number =>
  fromCents(toCents(a) - toCents(b));

export const sumMoney = (amounts: (number | string | undefined | null)[]): number =>
  fromCents(amounts.reduce((cents: number, amount) => cents + toCents(amount), 0));
