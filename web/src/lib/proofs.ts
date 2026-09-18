import {
  type Hex,
  createPublicClient,
  defineChain,
  http,
} from "viem";
import { settlementProofsAbi } from "./abi";
import { getPublicConfig } from "./config";

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

export function serializeLedger(snapshot: LedgerSnapshot): SerializedLedger {
  return {
    proofCount: snapshot.proofCount.toString(),
    totalSettled: snapshot.totalSettled.toString(),
    proofs: snapshot.proofs.map((proof) => ({
      ...proof,
      amountUSDC: proof.amountUSDC.toString(),
    })),
  };
}

export function deserializeLedger(payload: SerializedLedger): LedgerSnapshot {
  return {
    proofCount: BigInt(payload.proofCount),
    totalSettled: BigInt(payload.totalSettled),
    proofs: payload.proofs.map((proof) => ({
      ...proof,
      amountUSDC: BigInt(proof.amountUSDC),
    })),
  };
}

function arcChain(chainId: number, rpcUrl: string) {
  return defineChain({
    id: chainId,
    name: chainId === 5042002 ? "Arc Testnet" : "Arc",
    nativeCurrency: { name: "USD Coin", symbol: "USDC", decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  });
}

export async function fetchLedger(): Promise<LedgerSnapshot> {
  const config = getPublicConfig();
  if (!config.settlementProofsAddress) {
    throw new Error("NEXT_PUBLIC_SETTLEMENT_PROOFS_ADDRESS is not set to a valid address.");
  }

  const client = createPublicClient({
    chain: arcChain(config.arcChainId, config.arcRpcUrl),
    transport: http(config.arcRpcUrl),
  });

  const address = config.settlementProofsAddress;
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

  let proofTxByRef = new Map<string, Hex>();
  try {
    const logs = await client.getContractEvents({
      address,
      abi: settlementProofsAbi,
      eventName: "PaymentRecorded",
      fromBlock: BigInt(0),
      toBlock: "latest",
    });
    for (const log of logs) {
      if (log.transactionHash && log.args.refId) {
        proofTxByRef.set(log.args.refId.toLowerCase(), log.transactionHash);
      }
    }
  } catch {
    proofTxByRef = new Map();
  }

  const proofs: LedgerProof[] = rawProofs
    .map((proof) => ({
      refId: proof.refId,
      payee: proof.payee,
      amountUSDC: proof.amountUSDC,
      paidAt: Number(proof.paidAt),
      srcTxHash: proof.srcTxHash,
      memo: proof.memo,
      recordedAt: Number(proof.recordedAt),
      proofTxHash: proofTxByRef.get(proof.refId.toLowerCase()) ?? null,
    }))
    .sort((a, b) => b.paidAt - a.paidAt || Number(b.recordedAt) - Number(a.recordedAt));

  return { proofCount, totalSettled, proofs };
}
