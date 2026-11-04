import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  type Address,
  type Hex,
  encodeAbiParameters,
  keccak256,
  pad,
  stringToHex,
} from "viem";
import {
  BASE_MIN_SETTLEMENT_SECONDS,
  type BasePaymentReader,
  assessBaseSettlement,
  verifyBasePayment,
} from "../src/base.js";
import { BASE_USDC, parseErc20UsdcAmount } from "../src/decimals.js";

const PAYER = "0x1111111111111111111111111111111111111111" as Address;
const PAYEE = "0x2222222222222222222222222222222222222222" as Address;
const TX = `0x${"ab".repeat(32)}` as Hex;
const TRANSFER_TOPIC = keccak256(stringToHex("Transfer(address,address,uint256)"));

const BLOCK = 1_000n;
const T0 = 1_700_000_000n;

function transferLog(from: Address, to: Address, amount: bigint) {
  return {
    address: BASE_USDC,
    topics: [TRANSFER_TOPIC, pad(from), pad(to)] as Hex[],
    data: encodeAbiParameters([{ type: "uint256" }], [amount]),
  };
}

describe("assessBaseSettlement", () => {
  const base = {
    blockNumber: BLOCK,
    blockTimestamp: T0,
    head: BLOCK + 11n,
    headTimestamp: T0 + 2n,
    safeHead: BLOCK - 1n,
    minConfirmations: 12,
  };

  it("rejects a 12-confirmation block that is only ~2s old (Denim block time)", () => {
    const d = assessBaseSettlement(base);
    assert.equal(d.settled, false);
    if (!d.settled) {
      assert.match(d.message, /2s old/);
      assert.match(d.message, /L1-safe head 999/);
      assert.equal(d.confirmations, 12n);
    }
  });

  it("accepts the same block once chain time has advanced 60 seconds", () => {
    const d = assessBaseSettlement({ ...base, headTimestamp: T0 + BigInt(BASE_MIN_SETTLEMENT_SECONDS) });
    assert.deepEqual(d, { settled: true, confirmations: 12n, via: "time" });
  });

  it("rejects 59 seconds", () => {
    const d = assessBaseSettlement({
      ...base,
      headTimestamp: T0 + BigInt(BASE_MIN_SETTLEMENT_SECONDS) - 1n,
    });
    assert.equal(d.settled, false);
    if (!d.settled) assert.match(d.message, /59s old/);
  });

  it("accepts a young block that is at the L1-safe head", () => {
    const d = assessBaseSettlement({ ...base, safeHead: BLOCK });
    assert.deepEqual(d, { settled: true, confirmations: 12n, via: "l1-safe" });
  });

  it("accepts a young block strictly behind the L1-safe head", () => {
    const d = assessBaseSettlement({ ...base, safeHead: BLOCK + 1n });
    assert.equal(d.settled, true);
    if (d.settled) assert.equal(d.via, "l1-safe");
  });

  it("does not treat a missing safe head as settled", () => {
    const d = assessBaseSettlement({ ...base, safeHead: null });
    assert.equal(d.settled, false);
    if (!d.settled) assert.match(d.message, /L1-safe head is unavailable/);
  });

  it("keeps MIN_CONFIRMATIONS as an extra floor on top of time", () => {
    const d = assessBaseSettlement({
      ...base,
      head: BLOCK + 10n,
      headTimestamp: T0 + 60n,
      minConfirmations: 12,
    });
    assert.equal(d.settled, false);
    if (!d.settled) {
      assert.match(d.message, /11 confirmation\(s\)/);
      assert.match(d.message, /need at least 12/);
      assert.doesNotMatch(d.message, /L1-safe/);
    }
  });

  it("keeps MIN_CONFIRMATIONS as an extra floor on top of L1-safe inclusion", () => {
    const d = assessBaseSettlement({
      ...base,
      head: BLOCK + 10n,
      safeHead: BLOCK,
      minConfirmations: 12,
    });
    assert.equal(d.settled, false);
    if (!d.settled) assert.match(d.message, /11 confirmation/);
  });

  it("a floor of 0 does not add a block-count wait", () => {
    const d = assessBaseSettlement({
      ...base,
      head: BLOCK,
      headTimestamp: T0 + 60n,
      safeHead: null,
      minConfirmations: 0,
    });
    assert.deepEqual(d, { settled: true, confirmations: 1n, via: "time" });
  });

  it("rejects a block ahead of the chain head", () => {
    const d = assessBaseSettlement({ ...base, head: BLOCK - 1n, headTimestamp: T0 + 120n });
    assert.equal(d.settled, false);
    if (!d.settled) assert.match(d.message, /ahead of chain head/);
  });

  it("rejects a block timestamp ahead of the head timestamp", () => {
    const d = assessBaseSettlement({ ...base, headTimestamp: T0 - 5n, safeHead: null });
    assert.equal(d.settled, false);
    if (!d.settled) assert.match(d.message, /5s ahead of the chain head/);
  });

  it("prefers time when both time and L1-safe would pass", () => {
    const d = assessBaseSettlement({
      ...base,
      headTimestamp: T0 + 90n,
      safeHead: BLOCK,
    });
    assert.deepEqual(d, { settled: true, confirmations: 12n, via: "time" });
  });
});

describe("verifyBasePayment", () => {
  const amount = parseErc20UsdcAmount("1000000");

  function fakeClient(opts: {
    receipt?: { status: "success" | "reverted"; blockNumber: bigint } | null;
    head?: bigint;
    headTimestamp?: bigint;
    blockTimestamp?: bigint;
    safe?: { number: bigint; timestamp: bigint } | "throw" | "skip";
    logs?: ReturnType<typeof transferLog>[];
    latestNumber?: bigint | null;
  }): BasePaymentReader & { safeReads: number } {
    const reader = {
      safeReads: 0,
      async getTransactionReceipt() {
        if (!opts.receipt) throw new Error("not found");
        return {
          status: opts.receipt.status,
          blockNumber: opts.receipt.blockNumber,
          logs: opts.logs ?? [transferLog(PAYER, PAYEE, amount)],
        };
      },
      async getBlock(args: { blockNumber?: bigint; blockTag?: "latest" | "safe" }) {
        if (args.blockTag === "safe") {
          reader.safeReads += 1;
          if (opts.safe === "throw" || opts.safe === undefined) throw new Error("safe unavailable");
          if (opts.safe === "skip") throw new Error("safe should not be read");
          return opts.safe;
        }
        if (args.blockTag === "latest") {
          return {
            number: opts.latestNumber === undefined ? (opts.head ?? BLOCK + 11n) : opts.latestNumber,
            timestamp: opts.headTimestamp ?? T0 + 2n,
          };
        }
        return {
          number: args.blockNumber ?? BLOCK,
          timestamp: opts.blockTimestamp ?? T0,
        };
      },
    };
    return reader;
  }

  it("unknown tx → 400 TX_NOT_CONFIRMED", async () => {
    await assert.rejects(
      verifyBasePayment({
        client: fakeClient({ receipt: null }),
        txHash: TX,
        payee: PAYEE,
        amountUSDC: amount,
        minConfirmations: 12,
      }),
      (err: { status?: number; code?: string }) => err.status === 400 && err.code === "TX_NOT_CONFIRMED",
    );
  });

  it("reverted tx → 400 TX_FAILED", async () => {
    await assert.rejects(
      verifyBasePayment({
        client: fakeClient({ receipt: { status: "reverted", blockNumber: BLOCK } }),
        txHash: TX,
        payee: PAYEE,
        amountUSDC: amount,
        minConfirmations: 12,
      }),
      (err: { code?: string }) => err.code === "TX_FAILED",
    );
  });

  it("does not record a 12-confirmation payment that is only 2 seconds old", async () => {
    const client = fakeClient({
      receipt: { status: "success", blockNumber: BLOCK },
      safe: { number: BLOCK - 1n, timestamp: T0 },
    });
    await assert.rejects(
      verifyBasePayment({
        client,
        txHash: TX,
        payee: PAYEE,
        amountUSDC: amount,
        minConfirmations: 12,
      }),
      (err: { status?: number; code?: string; message?: string }) =>
        err.status === 400 && err.code === "TX_NOT_CONFIRMED" && /2s old/.test(err.message ?? ""),
    );
    assert.equal(client.safeReads, 1);
  });

  it("records once the block is 60 seconds old, without reading the safe head", async () => {
    const client = fakeClient({
      receipt: { status: "success", blockNumber: BLOCK },
      headTimestamp: T0 + 60n,
      safe: "skip",
    });
    const v = await verifyBasePayment({
      client,
      txHash: TX,
      payee: PAYEE,
      amountUSDC: amount,
      minConfirmations: 12,
    });
    assert.equal(v.settledBy, "time");
    assert.equal(v.payer, PAYER);
    assert.equal(v.confirmations, 12n);
    assert.equal(v.usdcTransferMatched, true);
    assert.equal(client.safeReads, 0);
  });

  it("records a young payment once it is behind the L1-safe head", async () => {
    const client = fakeClient({
      receipt: { status: "success", blockNumber: BLOCK },
      safe: { number: BLOCK, timestamp: T0 },
    });
    const v = await verifyBasePayment({
      client,
      txHash: TX,
      payee: PAYEE,
      amountUSDC: amount,
      minConfirmations: 12,
    });
    assert.equal(v.settledBy, "l1-safe");
    assert.equal(client.safeReads, 1);
  });

  it("a safe-tag failure on a young block stays TX_NOT_CONFIRMED", async () => {
    await assert.rejects(
      verifyBasePayment({
        client: fakeClient({
          receipt: { status: "success", blockNumber: BLOCK },
          safe: "throw",
        }),
        txHash: TX,
        payee: PAYEE,
        amountUSDC: amount,
        minConfirmations: 12,
      }),
      (err: { code?: string; message?: string }) =>
        err.code === "TX_NOT_CONFIRMED" && /unavailable/.test(err.message ?? ""),
    );
  });

  it("MIN_CONFIRMATIONS still rejects an old payment below the floor", async () => {
    await assert.rejects(
      verifyBasePayment({
        client: fakeClient({
          receipt: { status: "success", blockNumber: BLOCK },
          head: BLOCK + 2n,
          headTimestamp: T0 + 90n,
          safe: "skip",
        }),
        txHash: TX,
        payee: PAYEE,
        amountUSDC: amount,
        minConfirmations: 12,
      }),
      (err: { code?: string; message?: string }) =>
        err.code === "TX_NOT_CONFIRMED" && /3 confirmation/.test(err.message ?? "") && /12/.test(err.message ?? ""),
    );
  });

  it("wrong amount → 400 USDC_AMOUNT_UNVERIFIED and nothing matched", async () => {
    await assert.rejects(
      verifyBasePayment({
        client: fakeClient({
          receipt: { status: "success", blockNumber: BLOCK },
          headTimestamp: T0 + 60n,
          safe: "skip",
        }),
        txHash: TX,
        payee: PAYEE,
        amountUSDC: parseErc20UsdcAmount("2"),
        minConfirmations: 1,
      }),
      (err: { status?: number; code?: string }) =>
        err.status === 400 && err.code === "USDC_AMOUNT_UNVERIFIED",
    );
  });

  it("chain head without a number → 503", async () => {
    await assert.rejects(
      verifyBasePayment({
        client: fakeClient({
          receipt: { status: "success", blockNumber: BLOCK },
          latestNumber: null,
        }),
        txHash: TX,
        payee: PAYEE,
        amountUSDC: amount,
        minConfirmations: 1,
      }),
      (err: { status?: number; code?: string }) => err.status === 503 && err.code === "BASE_HEAD_UNAVAILABLE",
    );
  });
});
