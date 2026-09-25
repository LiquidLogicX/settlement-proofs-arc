/**
 * Read-only proof lookups for /api/prove (liquid-logic-agent) idempotency.
 *
 * - proofId  = 1-based position in the SettlementProofs append-only array
 *              (getProofAt(proofId - 1)). Proof #1 is index 0.
 * - proofTxHash = Arc tx that emitted PaymentRecorded(refId, …).
 *
 * Arc JSON-RPC only (eth_call / eth_getLogs). Never the explorer HTTP API.
 */
import type { Address, Hex } from "viem";
import { settlementProofsAbi } from "./abi.js";

/** Max getProofAt reads when resolving a refId → proofId (newest first). */
export const PROOF_INDEX_SCAN_LIMIT = 1024;

/**
 * Arc public RPC caps eth_getLogs at ~10_000 blocks per call; 9_000 is safe.
 * 256 windows ≈ 2.3M blocks back from tip.
 */
export const LOG_CHUNK_SIZE = 9_000n;
export const LOG_MAX_WINDOWS = 256;

/** Minimal read surface so unit tests can pass a fake client. */
export type ArcReader = {
  readContract: (args: {
    address: Address;
    abi: typeof settlementProofsAbi;
    functionName: "proofCount" | "getProofAt";
    args?: readonly unknown[];
  }) => Promise<unknown>;
  getBlockNumber: () => Promise<bigint>;
  getBlock: (args: { blockNumber: bigint }) => Promise<{ timestamp: bigint }>;
  getContractEvents: (args: {
    address: Address;
    abi: typeof settlementProofsAbi;
    eventName: "PaymentRecorded";
    args?: { refId?: Hex };
    fromBlock: bigint;
    toBlock: bigint;
  }) => Promise<Array<{ transactionHash: Hex | null; args: { refId?: Hex } }>>;
};

/**
 * 1-based proofId for refId, scanning newest → oldest (a just-written proof is
 * found on the first read). Returns null if not found within the scan limit.
 */
export async function findProofId(
  client: ArcReader,
  address: Address,
  refId: Hex,
  scanLimit = PROOF_INDEX_SCAN_LIMIT,
): Promise<number | null> {
  const count = (await client.readContract({
    address,
    abi: settlementProofsAbi,
    functionName: "proofCount",
  })) as bigint;
  const want = refId.toLowerCase();
  let scanned = 0;
  for (let i = count - 1n; i >= 0n && scanned < scanLimit; i--, scanned++) {
    const proof = (await client.readContract({
      address,
      abi: settlementProofsAbi,
      functionName: "getProofAt",
      args: [i],
    })) as { refId: Hex };
    if (proof.refId.toLowerCase() === want) return Number(i) + 1;
  }
  return null;
}

/**
 * Estimate the Arc block whose timestamp is ~unixSeconds from the tip and a
 * sample block `sampleSpan` back (average block time). A few RPC calls instead
 * of walking millions of blocks — the public Arc RPC rate-limits bursts.
 */
export async function estimateBlockAt(
  client: ArcReader,
  unixSeconds: number,
  sampleSpan = 100_000n,
): Promise<bigint> {
  const tip = await client.getBlockNumber();
  const tipBlock = await client.getBlock({ blockNumber: tip });
  const sampleNumber = tip > sampleSpan ? tip - sampleSpan : 0n;
  const sample = await client.getBlock({ blockNumber: sampleNumber });
  const dt = Number(tipBlock.timestamp - sample.timestamp);
  const blocks = Number(tip - sampleNumber);
  if (dt <= 0 || blocks <= 0) return tip;
  const secondsPerBlock = dt / blocks;
  const back = BigInt(Math.max(0, Math.round((Number(tipBlock.timestamp) - unixSeconds) / secondsPerBlock)));
  return back >= tip ? 0n : tip - back;
}

/**
 * Arc tx hash that recorded refId (PaymentRecorded, refId is an indexed topic).
 * With `recordedAt` (from getProof) we start at the estimated block and search
 * outward in alternating windows; without it we walk back from the tip.
 */
export async function findProofTxHash(
  client: ArcReader,
  address: Address,
  refId: Hex,
  opts: { chunk?: bigint; maxWindows?: number; recordedAt?: number } = {},
): Promise<Hex | null> {
  const chunk = opts.chunk ?? LOG_CHUNK_SIZE;
  const maxWindows = opts.maxWindows ?? LOG_MAX_WINDOWS;
  const want = refId.toLowerCase();

  async function scan(fromBlock: bigint, toBlock: bigint): Promise<Hex | null> {
    const logs = await client.getContractEvents({
      address,
      abi: settlementProofsAbi,
      eventName: "PaymentRecorded",
      args: { refId },
      fromBlock,
      toBlock,
    });
    const hit = logs.find((l) => l.transactionHash && l.args.refId?.toLowerCase() === want);
    return hit?.transactionHash ?? null;
  }

  const tip = await client.getBlockNumber();

  if (opts.recordedAt) {
    const center = await estimateBlockAt(client, opts.recordedAt);
    const half = chunk / 2n;
    // window 0 centered on the estimate, then alternate later/earlier windows
    for (let w = 0; w < Math.min(maxWindows, 16); w++) {
      const k = BigInt(Math.ceil(w / 2));
      const shift = w === 0 ? 0n : (w % 2 === 1 ? 1n : -1n) * k * chunk;
      let from = center - half + shift;
      let to = center + half - 1n + shift;
      if (to < 0n || from > tip) continue;
      if (from < 0n) from = 0n;
      if (to > tip) to = tip;
      const hit = await scan(from, to);
      if (hit) return hit;
    }
  }

  let toBlock = tip;
  for (let w = 0; w < maxWindows; w++) {
    const fromBlock = toBlock + 1n >= chunk ? toBlock - (chunk - 1n) : 0n;
    const hit = await scan(fromBlock, toBlock);
    if (hit) return hit;
    if (fromBlock === 0n) break;
    toBlock = fromBlock - 1n;
  }
  return null;
}
