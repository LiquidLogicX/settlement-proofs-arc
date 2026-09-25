import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Address, Hex } from "viem";
import { type ArcReader, findProofId, findProofTxHash } from "../src/proof-lookup.js";
import {
  DEFAULT_MIN_RECORDER_GAS_WEI,
  isGasLow,
  lowGasError,
  parseMinGasWei,
} from "../src/gas-guard.js";

const CONTRACT = "0x1de52cbc4490a7873ef007e51cb91a5b374facb1" as Address;
// Real proof #1 on Arc (eip155:5042): refId + recording tx.
const PROOF1_REF =
  "0xe6db5a86740c0e40943c06268bda4e09b45ac0a45fd6c5d7b7f2550e19e0c50e" as Hex;
const PROOF1_ARC_TX =
  "0x2bb316073c034140d74d73ca67ad2b71bfaaa9dea531d69290a16efdd0f10bbe" as Hex;
const PROOF1_BLOCK = 22_199_386n;

function fakeArc(opts: {
  refIds: Hex[];
  tip?: bigint;
  logs?: Array<{ block: bigint; refId: Hex; tx: Hex }>;
}) {
  const calls = { getProofAt: 0, getLogs: 0 };
  const client: ArcReader = {
    async readContract(args) {
      if (args.functionName === "proofCount") return BigInt(opts.refIds.length);
      calls.getProofAt++;
      const i = Number((args.args as [bigint])[0]);
      return { refId: opts.refIds[i] };
    },
    async getBlockNumber() {
      return opts.tip ?? 22_300_000n;
    },
    async getBlock({ blockNumber }) {
      // ~0.5 s blocks anchored on proof #1 (block 22_199_386 @ 1790091148)
      return { timestamp: 1_790_091_148n + (blockNumber - PROOF1_BLOCK) / 2n };
    },
    async getContractEvents(args) {
      calls.getLogs++;
      assert.ok(args.toBlock - args.fromBlock < 10_000n, "chunk must stay under Arc 10k cap");
      return (opts.logs ?? [])
        .filter(
          (l) =>
            l.block >= args.fromBlock &&
            l.block <= args.toBlock &&
            (!args.args?.refId || l.refId === args.args.refId),
        )
        .map((l) => ({ transactionHash: l.tx, args: { refId: l.refId } }));
    },
  };
  return { client, calls };
}

describe("findProofId (1-based index in SettlementProofs)", () => {
  it("proof #1 is index 0 → proofId 1", async () => {
    const { client } = fakeArc({ refIds: [PROOF1_REF] });
    assert.equal(await findProofId(client, CONTRACT, PROOF1_REF), 1);
  });

  it("scans newest first — a just-written proof costs one getProofAt", async () => {
    const newest = ("0x" + "ab".repeat(32)) as Hex;
    const { client, calls } = fakeArc({ refIds: [PROOF1_REF, ("0x" + "11".repeat(32)) as Hex, newest] });
    assert.equal(await findProofId(client, CONTRACT, newest), 3);
    assert.equal(calls.getProofAt, 1);
  });

  it("returns null when refId is not recorded", async () => {
    const { client } = fakeArc({ refIds: [PROOF1_REF] });
    assert.equal(await findProofId(client, CONTRACT, ("0x" + "00".repeat(32)) as Hex), null);
  });
});

describe("findProofTxHash (PaymentRecorded by indexed refId)", () => {
  it("finds proof #1's Arc tx walking back in <10k-block windows", async () => {
    const { client, calls } = fakeArc({
      refIds: [PROOF1_REF],
      logs: [{ block: PROOF1_BLOCK, refId: PROOF1_REF, tx: PROOF1_ARC_TX }],
    });
    assert.equal(await findProofTxHash(client, CONTRACT, PROOF1_REF), PROOF1_ARC_TX);
    assert.ok(calls.getLogs >= 2, "needed more than one window");
  });

  it("with recordedAt, jumps to the estimated block — one getLogs call", async () => {
    const { client, calls } = fakeArc({
      refIds: [PROOF1_REF],
      tip: 22_700_000n,
      logs: [{ block: PROOF1_BLOCK, refId: PROOF1_REF, tx: PROOF1_ARC_TX }],
    });
    const tx = await findProofTxHash(client, CONTRACT, PROOF1_REF, { recordedAt: 1_790_091_148 });
    assert.equal(tx, PROOF1_ARC_TX);
    assert.equal(calls.getLogs, 1);
  });

  it("returns null when never emitted", async () => {
    const { client } = fakeArc({ refIds: [], tip: 20_000n });
    assert.equal(await findProofTxHash(client, CONTRACT, PROOF1_REF), null);
  });
});

describe("gas guard", () => {
  it("defaults to 0.05 native USDC (18-dec)", () => {
    assert.equal(parseMinGasWei(undefined), DEFAULT_MIN_RECORDER_GAS_WEI);
    assert.equal(DEFAULT_MIN_RECORDER_GAS_WEI, 5n * 10n ** 16n);
  });
  it("rejects non-integer override", () => {
    assert.throws(() => parseMinGasWei("0.05"));
    assert.equal(parseMinGasWei("1000"), 1000n);
  });
  it("flags low balance and builds a 503 LOW_GAS_BALANCE error", () => {
    assert.equal(isGasLow(10n, 11n), true);
    assert.equal(isGasLow(493_300_832_000_000_000n, DEFAULT_MIN_RECORDER_GAS_WEI), false);
    const e = lowGasError(10n, 11n) as Error & { status: number; code: string };
    assert.equal(e.status, 503);
    assert.equal(e.code, "LOW_GAS_BALANCE");
  });
});
