import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ARC_ERC20_USDC,
  ARC_ERC20_USDC_DECIMALS,
  ARC_NATIVE_USDC_DECIMALS,
  NATIVE_TO_ERC20_SCALE,
  UsdcKind,
  asErc20UsdcAmount,
  asNativeUsdcWei,
  erc20Amount,
  erc20FromNativeWei,
  formatTypedUsdc,
  nativeWei,
  nativeWeiFromErc20,
  parseErc20UsdcAmount,
} from "../src/decimals.js";

describe("Arc USDC typed decimals", () => {
  it("keeps ERC-20 and native as distinct kinds (6 vs 18)", () => {
    assert.equal(ARC_ERC20_USDC_DECIMALS, 6);
    assert.equal(ARC_NATIVE_USDC_DECIMALS, 18);
    assert.equal(NATIVE_TO_ERC20_SCALE, 10n ** 12n);
    assert.equal(ARC_ERC20_USDC, "0x3600000000000000000000000000000000000000");
  });

  it("formats the same face USDC differently by kind — mixing fails the product claim", () => {
    const erc20 = asErc20UsdcAmount(1_250_000n);
    const native = nativeWeiFromErc20(erc20);

    assert.equal(formatTypedUsdc(erc20Amount(erc20)), "1.25");
    assert.equal(formatTypedUsdc(nativeWei(native)), "1.25");

    const wronglyAsErc20 = formatTypedUsdc(
      erc20Amount(asErc20UsdcAmount(native as unknown as bigint)),
    );
    assert.notEqual(wronglyAsErc20, "1.25");
    assert.equal(wronglyAsErc20, "1250000000000");

    const wronglyAsNative = formatTypedUsdc(
      nativeWei(asNativeUsdcWei(erc20 as unknown as bigint)),
    );
    assert.notEqual(wronglyAsNative, "1.25");
    assert.equal(wronglyAsNative, "0.00000000000125");
  });

  it("round-trips face amounts only through the typed converters", () => {
    const oneUsdc = parseErc20UsdcAmount("1000000");
    const wei = nativeWeiFromErc20(oneUsdc);
    assert.equal(wei, 10n ** 18n);
    assert.equal(erc20FromNativeWei(wei), oneUsdc);
  });

  it("rejects non-exact native→erc20 conversion (detects mixed units)", () => {
    const almost = asNativeUsdcWei(10n ** 18n + 1n);
    assert.throws(() => erc20FromNativeWei(almost), /not an exact multiple/);
  });

  it("fails if someone equates raw 6-dec and 18-dec integers for the same face amount", () => {
    const faceErc20 = asErc20UsdcAmount(5_000_000n);
    const faceNative = nativeWeiFromErc20(faceErc20);
    assert.notEqual(faceErc20 as bigint, faceNative as bigint);
    assert.equal((faceErc20 as bigint) * NATIVE_TO_ERC20_SCALE, faceNative as bigint);
  });

  it("TypedUsdc discriminant forces call sites to name the unit", () => {
    const a = erc20Amount(asErc20UsdcAmount(1n));
    const b = nativeWei(asNativeUsdcWei(1n));
    assert.equal(a.kind, UsdcKind.Erc20_6);
    assert.equal(b.kind, UsdcKind.Native_18);
    assert.notEqual(a.kind, b.kind);
  });
});

describe("no unverified-amount bypass", () => {
  it("sources must not implement an enabling ALLOW_UNVERIFIED_AMOUNT flag", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src");
    const files = await fs.readdir(root);
    const enabling =
      /ALLOW_UNVERIFIED_AMOUNT\s*[=!]==?\s*['"]?(true|1|yes)/i;
    const softBypass =
      /if\s*\(\s*(allowUnverified|ALLOW_UNVERIFIED)/i;
    for (const name of files) {
      if (!name.endsWith(".ts")) continue;
      const text = await fs.readFile(path.join(root, name), "utf8");
      assert.equal(enabling.test(text), false, `${name} must not enable ALLOW_UNVERIFIED_AMOUNT`);
      assert.equal(softBypass.test(text), false, `${name} must not branch on allowUnverified`);
      assert.equal(/\bTxOnly\b/.test(text), false, `${name} must not reference TxOnly`);
    }
  });

  it("loadConfig rejects ALLOW_UNVERIFIED_AMOUNT when set", async () => {
    const prev = { ...process.env };
    try {
      process.env.SETTLEMENT_PROOFS_ADDRESS = "0x0000000000000000000000000000000000000001";
      process.env.BASE_RPC_URL = "https://example.invalid";
      process.env.ARC_RPC_URL = "https://rpc.mainnet.arc.io";
      process.env.SETTLEMENT_RECORDER_PRIVATE_KEY =
        "0x1111111111111111111111111111111111111111111111111111111111111111";
      process.env.RECORDER_API_KEY = "test-key";
      process.env.ALLOW_UNVERIFIED_AMOUNT = "true";
      const { loadConfig } = await import("../src/config.js");
      assert.throws(() => loadConfig(), /ALLOW_UNVERIFIED_AMOUNT is not supported/);
    } finally {
      for (const k of Object.keys(process.env)) {
        if (!(k in prev)) delete process.env[k];
      }
      Object.assign(process.env, prev);
    }
  });
});
