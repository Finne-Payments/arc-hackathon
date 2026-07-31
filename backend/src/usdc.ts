/* USDC uses 6 decimals. Amounts are stored as decimal strings and only
   converted to base units at the contract boundary (PRD §9.1). This module is
   the single place that knows about the 6-decimal scale. */

export const USDC_DECIMALS = 6;

/** "33.34" → 33_340_000 (base units, as BigInt). Throws on non-finite / negative. */
export function toBaseUnits(decimalString: string): bigint {
  const n = Number(decimalString);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`Invalid USDC amount: ${decimalString}`);
  }
  // Round to the cent at the contract's precision, matching USDC's 6 decimals.
  return BigInt(Math.round(n * 1_000_000));
}

/** 33_340_000 → "33.34" (always 2 display decimals for the UI). */
export function fromBaseUnitsDisplay(base: bigint): string {
  const units = Number(base);
  return (units / 1_000_000).toFixed(2);
}

/** 33_340_000 → "33.340000" (full precision, for canonical hashing). */
export function fromBaseUnitsExact(base: bigint): string {
  const s = base.toString().padStart(USDC_DECIMALS + 1, "0");
  const intPart = s.slice(0, -USDC_DECIMALS);
  const fracPart = s.slice(-USDC_DECIMALS);
  return `${intPart}.${fracPart}`;
}
