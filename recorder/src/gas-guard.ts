/**
 * Low-balance guard: refuse to start an Arc write when the recorder wallet's
 * native gas balance (18-dec USDC wei) is under the threshold. Callers get a
 * 503 LOW_GAS_BALANCE instead of a write failing mid-flight.
 */
import type { NativeUsdcWei } from "./decimals.js";

/** Default 0.05 native USDC (18 decimals). Override with MIN_RECORDER_GAS_WEI. */
export const DEFAULT_MIN_RECORDER_GAS_WEI = 50_000_000_000_000_000n;

export function parseMinGasWei(raw: string | undefined): bigint {
  const v = raw?.trim();
  if (!v) return DEFAULT_MIN_RECORDER_GAS_WEI;
  if (!/^\d+$/.test(v)) {
    throw new Error("MIN_RECORDER_GAS_WEI must be an integer (18-dec native USDC wei)");
  }
  return BigInt(v);
}

export function isGasLow(balance: NativeUsdcWei | bigint, minWei: bigint): boolean {
  return (balance as bigint) < minWei;
}

export function lowGasError(balance: bigint, minWei: bigint) {
  return Object.assign(
    new Error(
      `Recorder Arc gas balance ${balance.toString()} wei is below the ${minWei.toString()} wei threshold; refusing to write. Retry after the recorder is topped up.`,
    ),
    { status: 503, code: "LOW_GAS_BALANCE" },
  );
}
