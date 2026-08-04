/* ============================================================================
   Micro-USDC helpers — all money is stored/processed as integer micro-USDC
   strings (6 decimals). Never use JS Number for money math (BE-02, INT-01).
   ========================================================================== */

/** USDC has 6 decimals. 1 USDC = 1_000_000 micro-USDC. */
export const USDC_DECIMALS = 6;
export const MICRO_FACTOR = 1_000_000n;

/**
 * Parse a human USDC amount string ("300", "100.5", "33.34") into micro-USDC
 * bigint. Rejects negative, NaN, > 6 decimal places, and non-numeric input.
 */
export function toMicroUsdc(human: string): bigint {
  if (typeof human !== "string" || human.trim() === "") {
    throw new Error(`Invalid USDC amount: "${human}" (must be a decimal string).`);
  }
  const trimmed = human.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error(`Invalid USDC amount: "${human}" (must be a non-negative decimal).`);
  }
  const [whole, frac = ""] = trimmed.split(".");
  if (frac.length > USDC_DECIMALS) {
    throw new Error(`Invalid USDC amount: "${human}" (max ${USDC_DECIMALS} decimal places).`);
  }
  const paddedFrac = frac.padEnd(USDC_DECIMALS, "0");
  return BigInt(whole) * MICRO_FACTOR + BigInt(paddedFrac);
}

/** Format micro-USDC bigint as a human display string ("300.00"). */
export function fromMicroUsdc(micro: bigint, displayDecimals = 2): string {
  const whole = micro / MICRO_FACTOR;
  const frac = micro % MICRO_FACTOR;
  const fracStr = frac.toString().padStart(USDC_DECIMALS, "0");
  if (displayDecimals <= 0) return whole.toString();
  return `${whole}.${fracStr.slice(0, displayDecimals)}`;
}

/** Canonical micro-USDC string for storage/hash envelopes (no decimal point). */
export function microUsdcString(micro: bigint): string {
  return micro.toString();
}

/** Add two micro-USDC amounts (bigint). */
export function addUsdc(a: bigint, b: bigint): bigint {
  return a + b;
}

/** Subtract two micro-USDC amounts (bigint). Throws on negative result. */
export function subUsdc(a: bigint, b: bigint): bigint {
  const result = a - b;
  if (result < 0n) throw new Error(`USDC underflow: ${a} - ${b} < 0.`);
  return result;
}

/** Check that a challenge amount is within bounds: 0 < challenge ≤ total. */
export function isChallengeWithinBounds(challengeMicro: bigint, totalMicro: bigint): boolean {
  return challengeMicro > 0n && challengeMicro <= totalMicro;
}
