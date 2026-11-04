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
import { verifyBasePayment, type BasePaymentReader } from "../src/base.js";
import { BASE_USDC, parseErc20UsdcAmount } from "../src/decimals.js";
import { createApp } from "../src/app.js";
import type { Rail } from "../src/rails.js";

const PAYER = "0x5eA5bE7aDf358fB239037406c55016ac8aB01f49" as Address;
const PAYEE = "0xfd689a93346AA40D2F38dC2ab6Eb436A57AA45c7" as Address;
const TX = "0x592d108234d07171b9dd3e43f0390ebbac989276bf53031522219e1ddfd8eb71" as Hex;
const AMOUNT = parseErc20UsdcAmount("12500000");
const TRANSFER_TOPIC = keccak256(stringToHex("Transfer(address,address,uint256)"));

/** Post-Denim slot. The pre-Denim hint was `blocksShort * 2 + 2`. */
const DENIM_SLOT_SECONDS = 0.2;

function transferLog() {
  return {
    address: BASE_USDC,
    topics: [TRANSFER_TOPIC, pad(PAYER), pad(PAYEE)] as Hex[],
    data: encodeAbiParameters([{ type: "uint256" }], [AMOUNT]),
  };
}

function reader(opts: {
  txBlock: bigint;
  txTimestamp: bigint;
  headBlock: bigint;
  headTimestamp: bigint;
  /** null = eth_getBlockByNumber("safe") unavailable. */
  safeBlock: bigint | null;
  receipt?: { status: "success" | "reverted"; blockNumber: bigint; logs: ReturnType<typeof transferLog>[] } | null;
}): BasePaymentReader {
  return {
    async getTransactionReceipt() {
      if (opts.receipt === null) throw new Error("not found");
      return (
        opts.receipt ?? {
          status: "success",
          blockNumber: opts.txBlock,
          logs: [transferLog()],
        }
      );
    },
    async getBlockNumber() {
      return opts.headBlock;
    },
    async getBlock(args) {
      if ("blockTag" in args && args.blockTag === "latest") {
        return { number: opts.headBlock, timestamp: opts.headTimestamp };
      }
      if ("blockNumber" in args && args.blockNumber === opts.txBlock) {
        return { number: opts.txBlock, timestamp: opts.txTimestamp };
      }
      throw new Error(`unexpected getBlock ${JSON.stringify(args)}`);
    },
    async getSafeBlockNumber() {
      return opts.safeBlock;
    },
  };
}

const defaults = {
  txHash: TX,
  payee: PAYEE,
  amountUSDC: AMOUNT,
  minConfirmations: 300,
  minConfirmationSeconds: 60,
};

type NotConfirmed = { status?: number; code?: string; message?: string; retryAfterSeconds?: number };

describe("Base finality after Denim (200ms blocks)", () => {
  it("rejects a just-mined tx and hints the remaining seconds, not 2s blocks", async () => {
    const confirmations = 1;
    const blocksShort = 300 - confirmations;
    await assert.rejects(
      verifyBasePayment({
        ...defaults,
        client: reader({
          txBlock: 1_000n,
          txTimestamp: 1_700_000_000n,
          headBlock: 1_000n,
          headTimestamp: 1_700_000_000n,
          safeBlock: 900n,
        }),
      }),
      (err: NotConfirmed) => {
        assert.equal(err.status, 400);
        assert.equal(err.code, "TX_NOT_CONFIRMED");
        assert.equal(err.retryAfterSeconds, 60);
        assert.notEqual(err.retryAfterSeconds, blocksShort * 2 + 2);
        return true;
      },
    );
  });

  it("rejects a young tx that already has 300 blocks when it is not in the safe head", async () => {
    await assert.rejects(
      verifyBasePayment({
        ...defaults,
        client: reader({
          txBlock: 1_000n,
          txTimestamp: 1_700_000_000n,
          headBlock: 1_399n,
          headTimestamp: 1_700_000_005n,
          safeBlock: 999n,
        }),
      }),
      (err: NotConfirmed) => {
        assert.equal(err.code, "TX_NOT_CONFIRMED");
        assert.equal(err.retryAfterSeconds, 55);
        assert.notEqual(err.retryAfterSeconds, 0 * 2 + 2);
        return true;
      },
    );
  });

  it("accepts a tx at exactly 60s with exactly 300 confirmations", async () => {
    const v = await verifyBasePayment({
      ...defaults,
      client: reader({
        txBlock: 1_000n,
        txTimestamp: 1_700_000_000n,
        headBlock: 1_299n,
        headTimestamp: 1_700_000_060n,
        safeBlock: null,
      }),
    });
    assert.equal(v.confirmations, 300n);
  });

  it("accepts a tx older than 60s with at least 300 confirmations", async () => {
    const v = await verifyBasePayment({
      ...defaults,
      client: reader({
        txBlock: 1_000n,
        txTimestamp: 1_700_000_000n,
        headBlock: 1_299n,
        headTimestamp: 1_700_000_061n,
        safeBlock: null,
      }),
    });
    assert.equal(v.confirmations, 300n);
    assert.equal(v.blockTimestamp, 1_700_000_000n);
    assert.equal(v.payer, PAYER);
    assert.equal(v.usdcTransferMatched, true);
  });

  it("enforces the 300-block floor even after the time gate has passed", async () => {
    const confirmations = 101;
    const blocksShort = 300 - confirmations;
    await assert.rejects(
      verifyBasePayment({
        ...defaults,
        client: reader({
          txBlock: 1_000n,
          txTimestamp: 1_700_000_000n,
          headBlock: 1_100n,
          headTimestamp: 1_700_000_120n,
          safeBlock: 999n,
        }),
      }),
      (err: NotConfirmed) => {
        assert.equal(err.code, "TX_NOT_CONFIRMED");
        assert.equal(err.retryAfterSeconds, Math.ceil(blocksShort * DENIM_SLOT_SECONDS));
        assert.notEqual(err.retryAfterSeconds, blocksShort * 2 + 2);
        return true;
      },
    );
  });

  it("accepts a tx already at or below the safe head once the block floor is met", async () => {
    const v = await verifyBasePayment({
      ...defaults,
      client: reader({
        txBlock: 1_000n,
        txTimestamp: 1_700_000_000n,
        headBlock: 1_299n,
        headTimestamp: 1_700_000_005n,
        safeBlock: 1_000n,
      }),
    });
    assert.equal(v.blockNumber, 1_000n);
    assert.equal(v.confirmations, 300n);
  });

  it("does not let the safe head skip the block floor", async () => {
    await assert.rejects(
      verifyBasePayment({
        ...defaults,
        client: reader({
          txBlock: 1_000n,
          txTimestamp: 1_700_000_000n,
          headBlock: 1_050n,
          headTimestamp: 1_700_000_200n,
          safeBlock: 1_050n,
        }),
      }),
      (err: NotConfirmed) => err.code === "TX_NOT_CONFIRMED" && (err.retryAfterSeconds ?? 0) > 0,
    );
  });
});

describe("TX_NOT_CONFIRMED HTTP response", () => {
  it("includes retryAfterSeconds from the verifier error", async () => {
    const rail = {
      id: "arc",
      label: "Base → Arc",
      payment: { network: "base", chainId: 8453, explorer: "https://basescan.org" },
      registry: {
        network: "arc",
        chainId: 5042,
        address: "0x1de52cbc4490a7873ef007e51cb91a5b374facb1",
        explorer: "https://explorer.arc.io",
      },
      recorderAddress: "0xc300c1092b949bCE55E7d0B0d86Cb733d03fA114",
      minConfirmations: 300,
      async readProof() {
        return null;
      },
      // Replay checks read the registry index before verifyPayment. An empty
      // index lets this request reach the confirmation-wait error.
      async listProofs() {
        return [];
      },
      async verifyPayment() {
        throw Object.assign(new Error("Base transaction has 1 confirmation(s); need at least 300"), {
          status: 400,
          code: "TX_NOT_CONFIRMED",
          retryAfterSeconds: 60,
        });
      },
      validateNote: () => null,
      buildMemo: (note: string) => note,
      async assertCanWrite() {},
      async writeProof() {
        throw new Error("should not write");
      },
      async findProofId() {
        return null;
      },
      async findProofTxHash() {
        return null;
      },
      async health() {
        return { rail: "arc" };
      },
    } as Rail;

    const app = createApp({
      rails: { arc: rail },
      recorderApiKey: "k",
      verifierBaseUrl: "https://proofs.liquidlogicx.com",
      quiet: true,
    });
    const res = await app.request("/v1/proofs", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer k" },
      body: JSON.stringify({ txHash: TX, payee: PAYEE, amountUSDC: "12500000" }),
    });
    assert.equal(res.status, 400);
    const body = (await res.json()) as { code?: string; retryAfterSeconds?: number };
    assert.equal(body.code, "TX_NOT_CONFIRMED");
    assert.equal(body.retryAfterSeconds, 60);
    assert.equal(res.headers.get("retry-after"), "60");
  });
});
