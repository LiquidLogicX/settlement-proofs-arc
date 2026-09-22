import {
  type Address,
  type Hex,
  type PublicClient,
  createPublicClient,
  defineChain,
  http,
  parseEventLogs,
} from "viem";
import { settlementProofsAbi } from "./abi";
import { getPublicConfig } from "./config";

/** Memo used by the Arc self-test payment (0.001 USDC). */
export const SELF_TEST_MEMO = "llx-self-test-0.001";

/** Max proofs scanned when matching an input as Base srcTxHash (newest-first). */
export const SRC_TX_SCAN_LIMIT = 64;

export type LedgerProof = {
  refId: Hex;
  payee: string;
  amountUSDC: bigint;
  paidAt: number;
  srcTxHash: Hex;
  memo: string;
  recordedAt: number;
  /** Arc tx that wrote the proof (registry recordPayment), if event scan succeeds. */
  proofTxHash: Hex | null;
};

export type LedgerSnapshot = {
  proofCount: bigint;
  totalSettled: bigint;
  proofs: LedgerProof[];
};

export type SerializedProof = Omit<LedgerProof, "amountUSDC"> & { amountUSDC: string };

export type SerializedLedger = {
  proofCount: string;
  totalSettled: string;
  proofs: SerializedProof[];
};

export type ProofQueryKind = "refId" | "arcTx" | "srcTxHash";

export type ProofLookupResult =
  | { status: "invalid"; message: string }
  | { status: "not_found"; message: string; query: Hex }
  | {
      status: "found";
      query: Hex;
      queryKind: ProofQueryKind;
      proof: LedgerProof;
      selfTest: boolean;
    };

export type SerializedLookupResult =
  | { status: "invalid"; message: string }
  | { status: "not_found"; message: string; query: Hex }
  | {
      status: "found";
      query: Hex;
      queryKind: ProofQueryKind;
      proof: SerializedProof;
      selfTest: boolean;
    };

type RawProof = {
  refId: Hex;
  payee: Address;
  amountUSDC: bigint;
  paidAt: bigint | number;
  srcTxHash: Hex;
  memo: string;
  recordedAt: bigint | number;
};

export function serializeProof(proof: LedgerProof): SerializedProof {
  return {
    ...proof,
    amountUSDC: proof.amountUSDC.toString(),
  };
}

export function deserializeProof(proof: SerializedProof): LedgerProof {
  return {
    ...proof,
    amountUSDC: BigInt(proof.amountUSDC),
  };
}

export function serializeLedger(snapshot: LedgerSnapshot): SerializedLedger {
  return {
    proofCount: snapshot.proofCount.toString(),
    totalSettled: snapshot.totalSettled.toString(),
    proofs: snapshot.proofs.map(serializeProof),
  };
}

export function deserializeLedger(payload: SerializedLedger): LedgerSnapshot {
  return {
    proofCount: BigInt(payload.proofCount),
    totalSettled: BigInt(payload.totalSettled),
    proofs: payload.proofs.map(deserializeProof),
  };
}

export function serializeLookup(result: ProofLookupResult): SerializedLookupResult {
  if (result.status === "found") {
    return {
      status: "found",
      query: result.query,
      queryKind: result.queryKind,
      proof: serializeProof(result.proof),
      selfTest: result.selfTest,
    };
  }
  return result;
}

export function deserializeLookup(payload: SerializedLookupResult): ProofLookupResult {
  if (payload.status === "found") {
    return {
      status: "found",
      query: payload.query,
      queryKind: payload.queryKind,
      proof: deserializeProof(payload.proof),
      selfTest: payload.selfTest,
    };
  }
  return payload;
}

export function isSelfTestMemo(memo: string): boolean {
  return memo.trim() === SELF_TEST_MEMO;
}

/** Accept 0x-prefixed or bare 32-byte hex (refId or tx hash). */
export function normalizeBytes32Query(raw: string): Hex | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const with0x = /^0x/i.test(trimmed) ? trimmed : `0x${trimmed}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(with0x)) return null;
  return with0x.toLowerCase() as Hex;
}

/** Arc native gas USDC = 18 decimals. Proof amountUSDC stays 6-dec ERC-20 units (Base USDC). */
function arcChain(chainId: number, rpcUrl: string) {
  return defineChain({
    id: chainId,
    name: chainId === 5042002 ? "Arc Testnet" : "Arc",
    nativeCurrency: { name: "USD Coin", symbol: "USDC", decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  });
}

type ArcContext = {
  client: PublicClient;
  address: Address;
};

function requireArcContext(): ArcContext {
  const config = getPublicConfig();
  if (!config.settlementProofsAddress) {
    throw new Error("NEXT_PUBLIC_SETTLEMENT_PROOFS_ADDRESS is not set to a valid address.");
  }

  const client = createPublicClient({
    chain: arcChain(config.arcChainId, config.arcRpcUrl),
    transport: http(config.arcRpcUrl),
  });

  return { client, address: config.settlementProofsAddress };
}

function toLedgerProof(raw: RawProof, proofTxHash: Hex | null): LedgerProof {
  return {
    refId: raw.refId,
    payee: raw.payee,
    amountUSDC: raw.amountUSDC,
    paidAt: Number(raw.paidAt),
    srcTxHash: raw.srcTxHash,
    memo: raw.memo,
    recordedAt: Number(raw.recordedAt),
    proofTxHash,
  };
}

/**
 * Arc public RPC caps eth_getLogs to a ~10_000-block range (span 10_000 fails;
 * span 9_999 works). Walk newest→oldest in LOG_CHUNK_SIZE windows.
 */
const LOG_CHUNK_SIZE = BigInt(9_000);
/** Max windows from tip (~2.3M blocks). Enough for current registry depth. */
const LOG_MAX_WINDOWS = 256;

async function scanPaymentRecordedTxMap(
  client: PublicClient,
  address: Address,
  options?: {
    refId?: Hex;
    /** Stop once every lowercase refId in this set is mapped. */
    neededRefIds?: Set<string>;
  },
): Promise<Map<string, Hex>> {
  const map = new Map<string, Hex>();
  const needed = options?.neededRefIds;

  try {
    let toBlock = await client.getBlockNumber();

    for (let window = 0; window < LOG_MAX_WINDOWS; window++) {
      const fromBlock =
        toBlock + BigInt(1) >= LOG_CHUNK_SIZE ? toBlock - (LOG_CHUNK_SIZE - BigInt(1)) : BigInt(0);

      const logs = await client.getContractEvents({
        address,
        abi: settlementProofsAbi,
        eventName: "PaymentRecorded",
        args: options?.refId ? { refId: options.refId } : undefined,
        fromBlock,
        toBlock,
      });

      for (const log of logs) {
        if (log.transactionHash && log.args.refId) {
          map.set(log.args.refId.toLowerCase(), log.transactionHash);
        }
      }

      if (options?.refId && map.has(options.refId.toLowerCase())) {
        break;
      }
      if (needed && needed.size > 0) {
        let allFound = true;
        for (const id of needed) {
          if (!map.has(id)) {
            allFound = false;
            break;
          }
        }
        if (allFound) break;
      }

      if (fromBlock === BigInt(0)) break;
      toBlock = fromBlock - BigInt(1);
    }
  } catch {
    // Return whatever was collected before the RPC error.
  }

  return map;
}

async function findProofTxByRef(
  client: PublicClient,
  address: Address,
  refId: Hex,
): Promise<Hex | null> {
  const map = await scanPaymentRecordedTxMap(client, address, { refId });
  return map.get(refId.toLowerCase()) ?? null;
}

async function readProofByRef(
  client: PublicClient,
  address: Address,
  refId: Hex,
  proofTxHash?: Hex | null,
): Promise<LedgerProof> {
  const raw = await client.readContract({
    address,
    abi: settlementProofsAbi,
    functionName: "getProof",
    args: [refId],
  });
  const tx =
    proofTxHash !== undefined ? proofTxHash : await findProofTxByRef(client, address, refId);
  return toLedgerProof(raw, tx);
}

/** Programmatic ledger: Arc JSON-RPC only (eth_call / getLogs). Never the explorer HTTP API. */
export async function fetchLedger(): Promise<LedgerSnapshot> {
  const { client, address } = requireArcContext();

  const [proofCount, totalSettled] = await Promise.all([
    client.readContract({ address, abi: settlementProofsAbi, functionName: "proofCount" }),
    client.readContract({ address, abi: settlementProofsAbi, functionName: "totalSettled" }),
  ]);

  const count = Number(proofCount);
  const rawProofs =
    count === 0
      ? []
      : await Promise.all(
          Array.from({ length: count }, (_, index) =>
            client.readContract({
              address,
              abi: settlementProofsAbi,
              functionName: "getProofAt",
              args: [BigInt(index)],
            }),
          ),
        );

  const neededRefIds = new Set(rawProofs.map((proof) => proof.refId.toLowerCase()));
  const proofTxByRef =
    neededRefIds.size === 0
      ? new Map<string, Hex>()
      : await scanPaymentRecordedTxMap(client, address, { neededRefIds });

  const proofs: LedgerProof[] = rawProofs
    .map((proof) =>
      toLedgerProof(proof, proofTxByRef.get(proof.refId.toLowerCase()) ?? null),
    )
    .sort((a, b) => b.paidAt - a.paidAt || Number(b.recordedAt) - Number(a.recordedAt));

  return { proofCount, totalSettled, proofs };
}

/**
 * Public verifier lookup (read-only Arc RPC).
 * Order: treat input as refId (exists/getProof) → Arc receipt PaymentRecorded →
 * bounded newest-first scan for matching srcTxHash.
 */
export async function lookupProof(rawQuery: string): Promise<ProofLookupResult> {
  const query = normalizeBytes32Query(rawQuery);
  if (!query) {
    return {
      status: "invalid",
      message:
        "Enter a 32-byte hex settlement ID (refId) or transaction hash (0x + 64 hex chars).",
    };
  }

  const { client, address } = requireArcContext();

  const exists = await client.readContract({
    address,
    abi: settlementProofsAbi,
    functionName: "exists",
    args: [query],
  });

  if (exists) {
    const proof = await readProofByRef(client, address, query);
    return {
      status: "found",
      query,
      queryKind: "refId",
      proof,
      selfTest: isSelfTestMemo(proof.memo),
    };
  }

  // Try as Arc recordPayment tx hash via receipt logs.
  try {
    const receipt = await client.getTransactionReceipt({ hash: query });
    const events = parseEventLogs({
      abi: settlementProofsAbi,
      logs: receipt.logs,
      eventName: "PaymentRecorded",
    });
    const match = events.find(
      (event) => event.address.toLowerCase() === address.toLowerCase() && event.args.refId,
    );
    if (match?.args.refId) {
      const proof = await readProofByRef(
        client,
        address,
        match.args.refId,
        receipt.transactionHash,
      );
      return {
        status: "found",
        query,
        queryKind: "arcTx",
        proof,
        selfTest: isSelfTestMemo(proof.memo),
      };
    }
  } catch {
    // Not an Arc tx we can read, or RPC error — fall through to srcTxHash scan.
  }

  // Bounded scan: match Base payment srcTxHash (newest indices first).
  const proofCount = await client.readContract({
    address,
    abi: settlementProofsAbi,
    functionName: "proofCount",
  });
  const count = Number(proofCount);
  if (count > 0) {
    const scan = Math.min(count, SRC_TX_SCAN_LIMIT);
    const start = count - scan;
    const rawProofs = await Promise.all(
      Array.from({ length: scan }, (_, offset) => {
        const index = start + offset;
        return client.readContract({
          address,
          abi: settlementProofsAbi,
          functionName: "getProofAt",
          args: [BigInt(index)],
        });
      }),
    );

    for (let i = rawProofs.length - 1; i >= 0; i--) {
      const raw = rawProofs[i];
      if (raw.srcTxHash.toLowerCase() === query) {
        const proofTxHash = await findProofTxByRef(client, address, raw.refId);
        const proof = toLedgerProof(raw, proofTxHash);
        return {
          status: "found",
          query,
          queryKind: "srcTxHash",
          proof,
          selfTest: isSelfTestMemo(proof.memo),
        };
      }
    }
  }

  return {
    status: "not_found",
    query,
    message:
      "No settlement proof found for that ID or transaction hash on the Arc registry (checked refId, Arc receipt logs, and recent srcTxHash matches).",
  };
}

/** Fetch a single proof by refId for the detail page. Returns null if missing. */
export async function fetchProofByRefId(rawRefId: string): Promise<LedgerProof | null> {
  const refId = normalizeBytes32Query(rawRefId);
  if (!refId) return null;

  const { client, address } = requireArcContext();
  const exists = await client.readContract({
    address,
    abi: settlementProofsAbi,
    functionName: "exists",
    args: [refId],
  });
  if (!exists) return null;
  return readProofByRef(client, address, refId);
}
