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
import { mapLimit, resolvePayment, type PaymentInfo } from "./payments";
import {
  getNetwork,
  getPublicConfig,
  isTempoNetwork,
  parseNetworkId,
  type NetworkDefinition,
  type NetworkId,
} from "./config";

/** Memo used by the registry self-test payment (0.001 USDC). */
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
  /** Payment chain + independent on-chain re-check (payer, token). Null if not resolved. */
  payment: PaymentInfo | null;
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

/** Known Tempo Moderato synthetic self-test refId (demo; not a real Base payment). */
export const TEMPO_SYNTHETIC_SELF_TEST_REF_ID =
  "0xc1de754b33b29c17b260d90a39a357d2ce656ffeea8ef786d218f685401ed624" as Hex;

/**
 * Tempo Moderato self-tests use a made-up srcTxHash. Label them synthetic/demo in UI.
 * Arc self-tests keep the existing "Self-test" badge (Arc proof #1 was a real Base payment).
 */
export function isTempoSyntheticSelfTest(args: {
  networkId: NetworkId;
  selfTest?: boolean;
  memo?: string;
  refId?: string;
}): boolean {
  if (!isTempoNetwork(args.networkId)) return false;
  if (args.selfTest) return true;
  if (args.memo !== undefined && isSelfTestMemo(args.memo)) return true;
  if (args.refId && args.refId.toLowerCase() === TEMPO_SYNTHETIC_SELF_TEST_REF_ID) return true;
  return false;
}

/** Badge copy for self-test / synthetic proofs. Arc stays "Self-test"; Tempo is explicit. */
export function selfTestBadgeLabel(networkId: NetworkId): string {
  return isTempoNetwork(networkId) ? "Synthetic demo" : "Self-test";
}

/** Accept 0x-prefixed or bare 32-byte hex (refId or tx hash). */
export function normalizeBytes32Query(raw: string): Hex | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const with0x = /^0x/i.test(trimmed) ? trimmed : `0x${trimmed}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(with0x)) return null;
  return with0x.toLowerCase() as Hex;
}

function registryChain(network: NetworkDefinition) {
  const rpcUrl = network.rpcUrl;
  if (!rpcUrl) {
    throw new Error(`${network.label} is not a registry network.`);
  }
  const native =
    isTempoNetwork(network.id)
      ? { name: "USD", symbol: "USD", decimals: 18 }
      : { name: "USD Coin", symbol: "USDC", decimals: 18 };
  return defineChain({
    id: network.chainId,
    name: network.label,
    nativeCurrency: native,
    rpcUrls: { default: { http: [rpcUrl] } },
  });
}

type RegistryContext = {
  client: PublicClient;
  address: Address;
  network: NetworkDefinition;
};

function requireRegistryContext(networkId: NetworkId = "arc"): RegistryContext {
  const network = getNetwork(networkId);
  if (network.role !== "registry" || !network.rpcUrl) {
    throw new Error(
      `${network.label} is the payment rail — pick Arc or a Tempo tab to read settlement proofs.`,
    );
  }
  if (!network.settlementProofsAddress) {
    throw new Error(
      `SettlementProofs address is not configured for ${network.label}. Set the matching NEXT_PUBLIC_*_SETTLEMENT_PROOFS_ADDRESS.`,
    );
  }

  const client = createPublicClient({
    chain: registryChain(network),
    transport: http(network.rpcUrl),
  });

  return { client, address: network.settlementProofsAddress, network };
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
    payment: null,
  };
}

/** Attach payment source + on-chain payment re-check (best effort, never throws). */
async function withPayment(proof: LedgerProof, networkId: NetworkId): Promise<LedgerProof> {
  const payment = await resolvePayment({
    registry: networkId,
    memo: proof.memo,
    srcTxHash: proof.srcTxHash,
    payee: proof.payee,
    amountUSDC: proof.amountUSDC,
    synthetic: isTempoSyntheticSelfTest({ networkId, memo: proof.memo, refId: proof.refId }),
  });
  return { ...proof, payment };
}

/**
 * Arc public RPC caps eth_getLogs to a ~10_000-block range (span 10_000 fails;
 * span 9_999 works). Walk newest→oldest in LOG_CHUNK_SIZE windows.
 */
const DEFAULT_LOG_CHUNK_SIZE = BigInt(9_000);
/** Max windows from tip (~2.3M blocks). Enough for current registry depth. */
const LOG_MAX_WINDOWS = 256;

async function scanPaymentRecordedTxMap(
  client: PublicClient,
  address: Address,
  options?: {
    refId?: Hex;
    /** Stop once every lowercase refId in this set is mapped. */
    neededRefIds?: Set<string>;
    /** Network-specific eth_getLogs span + earliest block (registry deploy). */
    network?: NetworkDefinition;
    /** Cap on backward windows from tip (default LOG_MAX_WINDOWS). */
    maxWindows?: number;
  },
): Promise<Map<string, Hex>> {
  const map = new Map<string, Hex>();
  const needed = options?.neededRefIds;
  const LOG_CHUNK_SIZE = options?.network?.logChunk ?? DEFAULT_LOG_CHUNK_SIZE;
  const floor = options?.network?.logsFromBlock ?? BigInt(0);

  try {
    let toBlock = await client.getBlockNumber();

    for (let window = 0; window < (options?.maxWindows ?? LOG_MAX_WINDOWS); window++) {
      let fromBlock =
        toBlock + BigInt(1) >= LOG_CHUNK_SIZE ? toBlock - (LOG_CHUNK_SIZE - BigInt(1)) : BigInt(0);
      if (fromBlock < floor) fromBlock = floor;

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

      if (fromBlock <= floor) break;
      toBlock = fromBlock - BigInt(1);
    }
  } catch {
    // Return whatever was collected before the RPC error.
  }

  return map;
}

/**
 * Estimate the block mined at `unixSeconds` from the tip and a sample block
 * (average block time). Two cheap reads instead of walking millions of blocks:
 * Arc and Tempo both produce ~2 blocks/s, so a full backward scan from tip
 * stops reaching older proofs after ~2 weeks.
 */
async function estimateBlockAt(client: PublicClient, unixSeconds: number): Promise<bigint> {
  const tip = await client.getBlockNumber();
  const span = BigInt(200_000);
  const tipBlock = await client.getBlock({ blockNumber: tip });
  const sampleNumber = tip > span ? tip - span : BigInt(0);
  const sample = await client.getBlock({ blockNumber: sampleNumber });
  const dt = Number(tipBlock.timestamp - sample.timestamp);
  const blocks = Number(tip - sampleNumber);
  if (dt <= 0 || blocks <= 0) return tip;
  const back = Math.max(0, Math.round((Number(tipBlock.timestamp) - unixSeconds) / (dt / blocks)));
  return BigInt(back) >= tip ? BigInt(0) : tip - BigInt(back);
}

/** Registry tx for refId, searched in windows around the block estimated from recordedAt. */
async function findProofTxNear(
  client: PublicClient,
  address: Address,
  refId: Hex,
  recordedAt: number,
  network?: NetworkDefinition,
): Promise<Hex | null> {
  if (!recordedAt) return null;
  try {
    const chunk = network?.logChunk ?? DEFAULT_LOG_CHUNK_SIZE;
    const floor = network?.logsFromBlock ?? BigInt(0);
    const tip = await client.getBlockNumber();
    const center = await estimateBlockAt(client, recordedAt);
    const half = chunk / BigInt(2);
    for (let w = 0; w < 12; w++) {
      const k = BigInt(Math.ceil(w / 2));
      const shift = w === 0 ? BigInt(0) : (w % 2 === 1 ? BigInt(1) : BigInt(-1)) * k * chunk;
      let from = center - half + shift;
      let to = center + half - BigInt(1) + shift;
      if (to < floor || from > tip) continue;
      if (from < floor) from = floor;
      if (to > tip) to = tip;
      const logs = await client.getContractEvents({
        address,
        abi: settlementProofsAbi,
        eventName: "PaymentRecorded",
        args: { refId },
        fromBlock: from,
        toBlock: to,
      });
      const hit = logs.find((l) => l.transactionHash && l.args.refId?.toLowerCase() === refId.toLowerCase());
      if (hit?.transactionHash) return hit.transactionHash;
    }
  } catch {
    // fall through
  }
  return null;
}

async function findProofTxByRef(
  client: PublicClient,
  address: Address,
  refId: Hex,
  network?: NetworkDefinition,
): Promise<Hex | null> {
  const map = await scanPaymentRecordedTxMap(client, address, { refId, network });
  return map.get(refId.toLowerCase()) ?? null;
}

async function readProofByRef(
  client: PublicClient,
  address: Address,
  refId: Hex,
  proofTxHash?: Hex | null,
  network?: NetworkDefinition,
): Promise<LedgerProof> {
  const raw = await client.readContract({
    address,
    abi: settlementProofsAbi,
    functionName: "getProof",
    args: [refId],
  });
  const tx =
    proofTxHash !== undefined && proofTxHash !== null
      ? proofTxHash
      : ((await findProofTxNear(client, address, refId, Number(raw.recordedAt), network)) ??
        (await findProofTxByRef(client, address, refId, network)));
  return toLedgerProof(raw, tx);
}

/** proofCount() on a registry (cheap single eth_call; used to pick the default Tempo tab). */
export async function fetchProofCount(networkId: NetworkId): Promise<bigint> {
  const { client, address } = requireRegistryContext(networkId);
  return client.readContract({ address, abi: settlementProofsAbi, functionName: "proofCount" });
}

/** Programmatic ledger: registry JSON-RPC only (eth_call / getLogs). Never explorer HTTP APIs. */
export async function fetchLedger(networkId: NetworkId = "arc"): Promise<LedgerSnapshot> {
  const { client, address, network } = requireRegistryContext(networkId);

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
      : await scanPaymentRecordedTxMap(client, address, { neededRefIds, network, maxWindows: 4 });
  for (const proof of rawProofs) {
    const key = proof.refId.toLowerCase();
    if (proofTxByRef.has(key)) continue;
    const tx = await findProofTxNear(client, address, proof.refId, Number(proof.recordedAt), network);
    if (tx) proofTxByRef.set(key, tx);
  }

  const proofs: LedgerProof[] = rawProofs
    .map((proof) =>
      toLedgerProof(proof, proofTxByRef.get(proof.refId.toLowerCase()) ?? null),
    )
    .sort((a, b) => b.paidAt - a.paidAt || Number(b.recordedAt) - Number(a.recordedAt));

  const enriched = await mapLimit(proofs, 4, (proof) => withPayment(proof, networkId));
  return { proofCount, totalSettled, proofs: enriched };
}

/**
 * Public verifier lookup (read-only registry RPC for Arc or Tempo).
 * Order: treat input as refId (exists/getProof) → registry receipt PaymentRecorded →
 * bounded newest-first scan for matching srcTxHash.
 */
export async function lookupProof(
  rawQuery: string,
  networkId: NetworkId = "arc",
): Promise<ProofLookupResult> {
  const query = normalizeBytes32Query(rawQuery);
  if (!query) {
    return {
      status: "invalid",
      message:
        "Enter a 32-byte hex settlement ID (refId) or transaction hash (0x + 64 hex chars).",
    };
  }

  const { client, address, network } = requireRegistryContext(networkId);

  const exists = await client.readContract({
    address,
    abi: settlementProofsAbi,
    functionName: "exists",
    args: [query],
  });

  if (exists) {
    const proof = await withPayment(
      await readProofByRef(client, address, query, undefined, network),
      networkId,
    );
    return {
      status: "found",
      query,
      queryKind: "refId",
      proof,
      selfTest: isSelfTestMemo(proof.memo),
    };
  }

  // Try as registry recordPayment tx hash via receipt logs.
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
      const proof = await withPayment(
        await readProofByRef(client, address, match.args.refId, receipt.transactionHash, network),
        networkId,
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
        const proofTxHash =
          (await findProofTxNear(client, address, raw.refId, Number(raw.recordedAt), network)) ??
          (await findProofTxByRef(client, address, raw.refId, network));
        const proof = await withPayment(toLedgerProof(raw, proofTxHash), networkId);
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
      `No settlement proof found for that ID or transaction hash on the ${network.label} registry (checked refId, receipt logs, and recent srcTxHash matches).`,
  };
}

/** Fetch a single proof by refId for the detail page. Returns null if missing. */
export async function fetchProofByRefId(
  rawRefId: string,
  networkId: NetworkId = "arc",
): Promise<LedgerProof | null> {
  const refId = normalizeBytes32Query(rawRefId);
  if (!refId) return null;

  const { client, address, network } = requireRegistryContext(networkId);
  const exists = await client.readContract({
    address,
    abi: settlementProofsAbi,
    functionName: "exists",
    args: [refId],
  });
  if (!exists) return null;
  return withPayment(await readProofByRef(client, address, refId, undefined, network), networkId);
}


export function resolveNetworkId(raw: string | null | undefined): NetworkId {
  return parseNetworkId(raw, getPublicConfig().defaultNetwork);
}
