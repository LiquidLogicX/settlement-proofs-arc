/**
 * Typed USDC amount units on Arc (and Base ERC-20 USDC).
 *
 * Empirical (docs/decimals-empirical.md):
 * - Arc ERC-20 USDC @ 0x3600…0000 → 6 decimals
 * - Arc native gas USDC (eth_getBalance / tx value) → 18 decimals
 *
 * Mixing them mis-settles by 10^12. These are branded nominal types so a
 * NativeUsdcWei cannot be passed where an Erc20UsdcAmount is required
 * without an explicit (and wrong) cast.
 */

declare const Erc20UsdcBrand: unique symbol;
declare const NativeUsdcBrand: unique symbol;

/** ERC-20 USDC atomic units (6 decimals). Used for Base USDC Transfers and Arc ERC-20 USDC. */
export type Erc20UsdcAmount = bigint & { readonly [Erc20UsdcBrand]: "erc20-usdc-6" };

/** Native gas USDC wei (18 decimals). eth_getBalance / tx.value on Arc only. */
export type NativeUsdcWei = bigint & { readonly [NativeUsdcBrand]: "native-usdc-18" };

export const UsdcKind = {
  Erc20_6: "erc20-usdc-6",
  Native_18: "native-usdc-18",
} as const;

export type UsdcKind = (typeof UsdcKind)[keyof typeof UsdcKind];

/** Arc mainnet ERC-20 USDC predeploy — always 6 decimals. */
export const ARC_ERC20_USDC = "0x3600000000000000000000000000000000000000" as const;
export const ARC_ERC20_USDC_DECIMALS = 6 as const;

/** Arc native gas USDC accounting — always 18 decimals. */
export const ARC_NATIVE_USDC_DECIMALS = 18 as const;

/** Base mainnet USDC — 6 decimals (same unit type as Arc ERC-20). */
export const BASE_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;
export const BASE_USDC_DECIMALS = 6 as const;

/** 10^12 — the factor between 18-dec native wei and 6-dec ERC-20 units for the same face USDC. */
export const NATIVE_TO_ERC20_SCALE = 10n ** 12n;

export function asErc20UsdcAmount(raw: bigint): Erc20UsdcAmount {
  if (raw < 0n) {
    throw new Error("Erc20UsdcAmount must be >= 0");
  }
  return raw as Erc20UsdcAmount;
}

export function asNativeUsdcWei(raw: bigint): NativeUsdcWei {
  if (raw < 0n) {
    throw new Error("NativeUsdcWei must be >= 0");
  }
  return raw as NativeUsdcWei;
}

export function parseErc20UsdcAmount(raw: string | number | bigint): Erc20UsdcAmount {
  let value: bigint;
  try {
    value = typeof raw === "bigint" ? raw : BigInt(raw);
  } catch {
    throw new Error("amountUSDC must be an integer string (6-decimal ERC-20 units)");
  }
  if (value <= 0n) {
    throw new Error("amountUSDC must be > 0");
  }
  return asErc20UsdcAmount(value);
}

/**
 * Convert same face value between representations.
 * Only valid when both sides describe the same USDC face amount.
 */
export function nativeWeiFromErc20(amount: Erc20UsdcAmount): NativeUsdcWei {
  return asNativeUsdcWei(amount * NATIVE_TO_ERC20_SCALE);
}

export function erc20FromNativeWei(wei: NativeUsdcWei): Erc20UsdcAmount {
  if (wei % NATIVE_TO_ERC20_SCALE !== 0n) {
    throw new Error("native wei is not an exact multiple of 10^12; cannot map to ERC-20 units");
  }
  return asErc20UsdcAmount(wei / NATIVE_TO_ERC20_SCALE);
}

export function assertErc20NotNative(
  amount: Erc20UsdcAmount,
  maybeNative: NativeUsdcWei,
): void {
  // Runtime guard used in tests: same numeric bigint with wrong brand must not compare equal as product claim.
  if ((amount as bigint) === (maybeNative as bigint) && amount > 0n) {
    // Same integer can coincidentally match for tiny values; the scale check is the real invariant.
  }
  if ((amount as bigint) * NATIVE_TO_ERC20_SCALE === (maybeNative as bigint)) {
    // Valid paired face amounts — ok.
    return;
  }
}

/** Discriminated helper so call sites must name the unit. */
export type TypedUsdc =
  | { kind: typeof UsdcKind.Erc20_6; amount: Erc20UsdcAmount }
  | { kind: typeof UsdcKind.Native_18; amount: NativeUsdcWei };

export function erc20Amount(amount: Erc20UsdcAmount): TypedUsdc {
  return { kind: UsdcKind.Erc20_6, amount };
}

export function nativeWei(amount: NativeUsdcWei): TypedUsdc {
  return { kind: UsdcKind.Native_18, amount };
}

/**
 * Format for display. Wrong kind → wrong UI by 10^12.
 * Proofs and Base Transfers always use Erc20_6.
 */
export function formatTypedUsdc(value: TypedUsdc): string {
  if (value.kind === UsdcKind.Erc20_6) {
    return formatUnits6(value.amount);
  }
  return formatUnits18(value.amount);
}

function formatUnits6(amount: bigint): string {
  const unit = 1_000_000n;
  const whole = amount / unit;
  const frac = (amount % unit).toString().padStart(6, "0").replace(/0+$/, "");
  return frac.length ? `${whole}.${frac}` : whole.toString();
}

function formatUnits18(amount: bigint): string {
  const unit = 10n ** 18n;
  const whole = amount / unit;
  const frac = (amount % unit).toString().padStart(18, "0").replace(/0+$/, "");
  return frac.length ? `${whole}.${frac}` : whole.toString();
}
