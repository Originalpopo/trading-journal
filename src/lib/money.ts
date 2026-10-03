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

// True when a typed amount has a fraction of a cent (e.g. "1.005"). Such an amount cannot exist
// at the broker, so forms reject it instead of rounding it.
export const hasFractionOfCent = (input: string): boolean => {
  const amount = Number(input);
  return input.trim() !== '' && Number.isFinite(amount) && Math.abs(amount * 100 - Math.round(amount * 100)) > 1e-6;
};
