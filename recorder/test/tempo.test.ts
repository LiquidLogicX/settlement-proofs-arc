import assert from "node:assert/strict";
import { describe, it } from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { type Address, type Hex, encodeAbiParameters, keccak256, pad, stringToHex, toHex } from "viem";
import { parseErc20UsdcAmount } from "../src/decimals.js";
import {
  PATH_USD,
  TEMPO_TESTNET_STABLECOINS,
  describeTransferMemo,
  matchTip20Transfer,
  parseMinFeeBalance,
  parseTempoTokens,
  toAllowlist,
  verifyTempoPayment,
  type TempoPaymentReader,
} from "../src/tempo.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  fs.readFileSync(path.join(here, "fixtures", "tempo-moderato-payment-1.json"), "utf8"),
) as {
  transactionHash: Hex;
  blockNumber: Hex;
  logs: { address: Address; topics: Hex[]; data: Hex }[];
};

const PAYER = "0x5eA5bE7aDf358fB239037406c55016ac8aB01f49" as Address;
const PAYEE = "0xfd689a93346AA40D2F38dC2ab6Eb436A57AA45c7" as Address;
const ALPHA = "0x20C0000000000000000000000000000000000001" as Address;
const FEE_MANAGER = "0xfeEC000000000000000000000000000000000000" as Address;
const tokens = toAllowlist(TEMPO_TESTNET_STABLECOINS);

const TRANSFER_TOPIC = keccak256(stringToHex("Transfer(address,address,uint256)"));
const MEMO_TOPIC = keccak256(stringToHex("TransferWithMemo(address,address,uint256,bytes32)"));

function transferLog(token: Address, from: Address, to: Address, amount: bigint) {
  return {
    address: token,
    topics: [TRANSFER_TOPIC, pad(from), pad(to)] as Hex[],
    data: encodeAbiParameters([{ type: "uint256" }], [amount]),
  };
}

function memoLog(token: Address, from: Address, to: Address, amount: bigint, memo: Hex) {
  return {
    address: token,
    topics: [MEMO_TOPIC, pad(from), pad(to), memo] as Hex[],
    data: encodeAbiParameters([{ type: "uint256" }], [amount]),
  };
}

describe("matchTip20Transfer — real Moderato receipt (proof #1)", () => {
  it("matches 12.50 AlphaUSD to the payee, extracts payer and TIP-20 memo", () => {
    const m = matchTip20Transfer(fixture.logs, PAYEE, parseErc20UsdcAmount("12500000"), tokens);
    assert.equal(m.matched, true);
    if (!m.matched) return;
    assert.equal(m.token, ALPHA);
    assert.equal(m.tokenSymbol, "AlphaUSD");
    assert.equal(m.payer, PAYER);
    assert.equal(describeTransferMemo(m.transferMemo), "INV-2026-1001");
  });

  it("rejects an off-by-one amount (never records unmatched amounts)", () => {
    const m = matchTip20Transfer(fixture.logs, PAYEE, parseErc20UsdcAmount("12500001"), tokens);
    assert.equal(m.matched, false);
  });

  it("does not treat the fee-manager fee transfer as a payment", () => {
    // 0x140 = 320 units went to the fee manager in the same receipt.
    const m = matchTip20Transfer(fixture.logs, FEE_MANAGER, 320n, tokens);
    assert.equal(m.matched, true, "the log exists…");
    const asPayee = matchTip20Transfer(fixture.logs, PAYEE, 320n, tokens);
    assert.equal(asPayee.matched, false, "…but it is not a payment to the payee");
  });

  it("rejects when the token is not allowlisted", () => {
    const onlyPath = toAllowlist({ [PATH_USD]: "pathUSD" });
    const m = matchTip20Transfer(fixture.logs, PAYEE, 12_500_000n, onlyPath);
    assert.equal(m.matched, false);
    if (!m.matched) assert.match(m.reason, /allowlisted/);
  });
});

describe("matchTip20Transfer — synthetic logs", () => {
  it("plain transfer (no memo) → transferMemo null", () => {
    const logs = [transferLog(ALPHA, PAYER, PAYEE, 1_000_000n)];
    const m = matchTip20Transfer(logs, PAYEE, 1_000_000n, tokens);
    assert.ok(m.matched);
    if (m.matched) assert.equal(m.transferMemo, null);
  });

  it("memo only attaches when token/from/to/amount all match", () => {
    const memo = stringToHex("OTHER", { size: 32 });
    const logs = [
      transferLog(ALPHA, PAYER, PAYEE, 1_000_000n),
      memoLog(ALPHA, PAYER, PAYEE, 2_000_000n, memo),
    ];
    const m = matchTip20Transfer(logs, PAYEE, 1_000_000n, tokens);
    assert.ok(m.matched);
    if (m.matched) assert.equal(m.transferMemo, null);
  });

  it("no logs → clear reason", () => {
    const m = matchTip20Transfer([], PAYEE, 1n, tokens);
    assert.equal(m.matched, false);
  });
});

function fakeReader(opts: {
  receipt?: { status: "success" | "reverted"; blockNumber: bigint; logs: typeof fixture.logs } | null;
  head?: bigint;
}): TempoPaymentReader {
  return {
    async getTransactionReceipt() {
      if (!opts.receipt) throw new Error("not found");
      return opts.receipt;
    },
    async getBlockNumber() {
      return opts.head ?? 100n;
    },
    async getBlock() {
      return { timestamp: 1_791_223_316n };
    },
  };
}

describe("verifyTempoPayment", () => {
  const base = {
    txHash: fixture.transactionHash,
    payee: PAYEE,
    amountUSDC: parseErc20UsdcAmount("12500000"),
    minConfirmations: 1,
    tokens,
  };

  it("tx hash in → verified payment out", async () => {
    const v = await verifyTempoPayment({
      ...base,
      client: fakeReader({ receipt: { status: "success", blockNumber: 100n, logs: fixture.logs } }),
    });
    assert.equal(v.payer, PAYER);
    assert.equal(v.tokenSymbol, "AlphaUSD");
    assert.equal(v.confirmations, 1n);
    assert.equal(v.blockTimestamp, 1_791_223_316n);
  });

  it("unknown tx → 400 TX_NOT_CONFIRMED", async () => {
    await assert.rejects(
      verifyTempoPayment({ ...base, client: fakeReader({ receipt: null }) }),
      (err: { status?: number; code?: string }) => err.status === 400 && err.code === "TX_NOT_CONFIRMED",
    );
  });

  it("reverted tx → 400 TX_FAILED", async () => {
    await assert.rejects(
      verifyTempoPayment({
        ...base,
        client: fakeReader({ receipt: { status: "reverted", blockNumber: 100n, logs: fixture.logs } }),
      }),
      (err: { code?: string }) => err.code === "TX_FAILED",
    );
  });

  it("respects TEMPO_MIN_CONFIRMATIONS", async () => {
    await assert.rejects(
      verifyTempoPayment({
        ...base,
        minConfirmations: 5,
        client: fakeReader({ receipt: { status: "success", blockNumber: 100n, logs: fixture.logs }, head: 101n }),
      }),
      (err: { code?: string; message?: string }) =>
        err.code === "TX_NOT_CONFIRMED" && /2 confirmation/.test(err.message ?? ""),
    );
  });

  it("wrong amount → 400 TIP20_AMOUNT_UNVERIFIED", async () => {
    await assert.rejects(
      verifyTempoPayment({
        ...base,
        amountUSDC: parseErc20UsdcAmount("1"),
        client: fakeReader({ receipt: { status: "success", blockNumber: 100n, logs: fixture.logs } }),
      }),
      (err: { status?: number; code?: string }) =>
        err.status === 400 && err.code === "TIP20_AMOUNT_UNVERIFIED",
    );
  });
});

describe("Tempo helpers", () => {
  it("describeTransferMemo decodes printable ASCII and keeps binary as hex", () => {
    assert.equal(describeTransferMemo(stringToHex("PAYOUT-0007", { size: 32 })), "PAYOUT-0007");
    const binary = toHex(new Uint8Array(32).fill(1));
    assert.equal(describeTransferMemo(binary), binary);
    assert.equal(describeTransferMemo(null), null);
  });

  it("parseTempoTokens defaults to the four Moderato stablecoins", () => {
    const list = parseTempoTokens(undefined);
    assert.deepEqual(
      [...list.values()].map((t) => t.symbol),
      ["pathUSD", "AlphaUSD", "BetaUSD", "ThetaUSD"],
    );
  });

  it("parseTempoTokens accepts an explicit list and rejects junk", () => {
    const list = parseTempoTokens(`${ALPHA}:AlphaUSD`);
    assert.equal(list.size, 1);
    assert.throws(() => parseTempoTokens("nope"));
    assert.throws(() => parseTempoTokens("0x123:Bad"));
  });

  it("parseMinFeeBalance", () => {
    assert.equal(parseMinFeeBalance(undefined), 50_000n);
    assert.equal(parseMinFeeBalance("7"), 7n);
    assert.throws(() => parseMinFeeBalance("0.1"));
  });
});
