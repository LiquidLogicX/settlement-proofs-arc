/**
 * Where did the money move? Per-proof payment source + an independent on-chain
 * re-check, done by the verifier itself (it does not trust the recorder):
 *
 * - Arc registry proofs: payment is a USDC Transfer on Base (untagged memo).
 * - Tempo registry proofs: memo starts with `eip155:<chainId>/<token>` and the
 *   payment is a TIP-20 stablecoin Transfer on Tempo.
 *
 * The verifier fetches the payment receipt over JSON-RPC and looks for a
 * Transfer to the recorded payee for the recorded amount, which also yields
 * the payer address (the registry stores payee only).
 */
import {
  type Address,
  type Hex,
  createPublicClient,
  decodeEventLog,
  defineChain,
  http,
  isAddressEqual,
} from "viem";
import { getNetwork, type NetworkId } from "./config";
import { parseProofMemo } from "./proof-memo";

export const BASE_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as Address;
const TIP20_PREFIX = "0x20c000000000000000000000";
const TEMPO_CHAIN_IDS = new Set([42431, 4217]);

export type PaymentCheck = "matched" | "mismatch" | "unavailable" | "synthetic";

export type PaymentInfo = {
  network: "base" | "tempo";
  chainId: number;
  label: string;
  explorer: string;
  tokenSymbol: string;
  token: string | null;
  payer: string | null;
  /** Operator note with the chain/token tag stripped. */
  note: string;
  check: PaymentCheck;
};

const transferAbi = [
  {
    type: "event",
    name: "Transfer",
    inputs: [
      { name: "from", type: "address", indexed: true },
      { name: "to", type: "address", indexed: true },
      { name: "value", type: "uint256", indexed: false },
    ],
  },
] as const;

/** Pure: which chain holds srcTxHash for this proof? */
export function resolvePaymentSource(
  registry: NetworkId,
  memo: string,
): Omit<PaymentInfo, "payer" | "token" | "check"> {
  const parsed = parseProofMemo(memo);
  const tagged = parsed.paymentChainId;
  const isTempo = tagged !== null && TEMPO_CHAIN_IDS.has(tagged) && registry === "tempo";
  const net = getNetwork(isTempo ? "tempo" : "base");
  return {
    network: isTempo ? "tempo" : "base",
    chainId: isTempo ? (tagged as number) : 8453,
    label: net.label,
    explorer: net.explorer,
    tokenSymbol: isTempo ? (parsed.tokenSymbol ?? "USD") : "USDC",
    note: parsed.paymentChainId !== null ? parsed.note : memo,
  };
}

type Log = { address: Address; topics: readonly Hex[]; data: Hex };

/** Pure: find Transfer(to = payee, value = amount) from an acceptable token. */
export function findPaymentTransfer(
  logs: readonly Log[],
  network: "base" | "tempo",
  payee: string,
  amount: bigint,
): { payer: Address; token: Address } | null {
  for (const log of logs) {
    const tokenOk =
      network === "base"
        ? isAddressEqual(log.address, BASE_USDC)
        : log.address.toLowerCase().startsWith(TIP20_PREFIX);
    if (!tokenOk) continue;
    try {
      const ev = decodeEventLog({ abi: transferAbi, data: log.data, topics: log.topics as [Hex, ...Hex[]] });
      if (ev.eventName !== "Transfer") continue;
      if (isAddressEqual(ev.args.to, payee as Address) && ev.args.value === amount) {
        return { payer: ev.args.from, token: log.address };
      }
    } catch {
      // not a Transfer
    }
  }
  return null;
}

const clients = new Map<string, ReturnType<typeof createPublicClient>>();
function paymentClient(network: "base" | "tempo") {
  const def = getNetwork(network);
  const key = `${network}:${def.paymentRpcUrl}`;
  let client = clients.get(key);
  if (!client) {
    client = createPublicClient({
      chain: defineChain({
        id: def.chainId,
        name: def.label,
        nativeCurrency: { name: "USD", symbol: "USD", decimals: 18 },
        rpcUrls: { default: { http: [def.paymentRpcUrl] } },
      }),
      transport: http(def.paymentRpcUrl, { timeout: 8_000 }),
    });
    clients.set(key, client);
  }
  return client;
}

/** Resolve payment source and re-check it on-chain (best effort; never throws). */
export async function resolvePayment(args: {
  registry: NetworkId;
  memo: string;
  srcTxHash: Hex;
  payee: string;
  amountUSDC: bigint;
  synthetic?: boolean;
}): Promise<PaymentInfo> {
  const source = resolvePaymentSource(args.registry, args.memo);
  if (args.synthetic) {
    return { ...source, payer: null, token: null, check: "synthetic" };
  }
  try {
    const receipt = await paymentClient(source.network).getTransactionReceipt({ hash: args.srcTxHash });
    if (receipt.status !== "success") {
      return { ...source, payer: null, token: null, check: "mismatch" };
    }
    const hit = findPaymentTransfer(receipt.logs, source.network, args.payee, args.amountUSDC);
    return hit
      ? { ...source, payer: hit.payer, token: hit.token, check: "matched" }
      : { ...source, payer: null, token: null, check: "mismatch" };
  } catch {
    return { ...source, payer: null, token: null, check: "unavailable" };
  }
}

/** Run async jobs with a small concurrency cap (public RPCs rate-limit bursts). */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/** Payment info for display: the resolved one, or the memo-derived source when not resolved. */
export function paymentOf(
  proof: { memo: string; payment: PaymentInfo | null },
  registry: NetworkId,
): PaymentInfo {
  return (
    proof.payment ?? { ...resolvePaymentSource(registry, proof.memo), payer: null, token: null, check: "unavailable" }
  );
}
