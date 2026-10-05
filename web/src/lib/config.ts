import { type Address, getAddress, isAddress } from "viem";

/** Visible networks on proofs.liquidlogicx.com. */
export type NetworkId = "arc" | "base" | "tempo";

export type NetworkRole = "registry" | "payment";

export type NetworkDefinition = {
  id: NetworkId;
  label: string;
  shortLabel: string;
  role: NetworkRole;
  chainId: number;
  /** Human explorer root (browser UI only). */
  explorer: string;
  /** JSON-RPC for registry reads. Payment networks omit this. */
  rpcUrl?: string;
  /** JSON-RPC used to re-check the payment transaction (payer, token, amount). */
  paymentRpcUrl: string;
  /** First block worth scanning for PaymentRecorded logs (registry deploy block). */
  logsFromBlock?: bigint;
  /** Max eth_getLogs block span the public RPC accepts (minus margin). */
  logChunk: bigint;
  /** SettlementProofs address when this network hosts a registry. */
  settlementProofsAddress: Address | null;
  /** eip155 chain reference string. */
  eip155: string;
  blurb: string;
};

export type PublicConfig = {
  networks: Record<NetworkId, NetworkDefinition>;
  defaultNetwork: NetworkId;
  /** @deprecated Prefer getNetwork("arc") — kept for gradual callers. */
  arcRpcUrl: string;
  settlementProofsAddress: Address | null;
  arcExplorer: string;
  arcChainId: number;
  baseExplorer: string;
};

function stripSlash(url: string) {
  return url.replace(/\/+$/, "");
}

function parseAddress(raw: string | undefined): Address | null {
  const address = raw?.trim() ?? "";
  if (!address || !isAddress(address, { strict: false })) return null;
  try {
    return getAddress(address);
  } catch {
    return null;
  }
}

/** Selector order: registries first (Arc, Tempo), then the Base payment rail. */
export const NETWORK_IDS: NetworkId[] = ["arc", "tempo", "base"];

/** Tempo Moderato SettlementProofs v2 (2026-10-05): Tempo payment → Tempo proof.
 *  Production default. Legacy v1 (0x35d7…ce51) is superseded and must not be the verifier default
 *  — see docs/deployments.md. */
export const TEMPO_MODERATO_REGISTRY = "0x2ec4CF47e6964b33FEd3718f07885ed44aF52c0b";
/** Deploy block of TEMPO_MODERATO_REGISTRY (log scans start here). */
export const TEMPO_MODERATO_REGISTRY_FROM_BLOCK = "38311217";

export function isNetworkId(value: string | null | undefined): value is NetworkId {
  return value === "arc" || value === "base" || value === "tempo";
}

export function parseNetworkId(
  value: string | null | undefined,
  fallback: NetworkId = "arc",
): NetworkId {
  return isNetworkId(value) ? value : fallback;
}

export function getPublicConfig(): PublicConfig {
  const arcAddress = parseAddress(process.env.NEXT_PUBLIC_SETTLEMENT_PROOFS_ADDRESS);
  const tempoAddress = parseAddress(
    process.env.NEXT_PUBLIC_TEMPO_SETTLEMENT_PROOFS_ADDRESS?.trim() || TEMPO_MODERATO_REGISTRY,
  );
  const tempoFromBlockRaw =
    process.env.NEXT_PUBLIC_TEMPO_REGISTRY_FROM_BLOCK?.trim() ||
    (tempoAddress === TEMPO_MODERATO_REGISTRY ? TEMPO_MODERATO_REGISTRY_FROM_BLOCK : "");
  const tempoFromBlock = /^\d+$/.test(tempoFromBlockRaw) ? BigInt(tempoFromBlockRaw) : undefined;
  const baseRpcUrl = process.env.NEXT_PUBLIC_BASE_RPC_URL?.trim() || "https://mainnet.base.org";

  const arcRpcUrl =
    process.env.NEXT_PUBLIC_ARC_RPC_URL?.trim() || "https://rpc.mainnet.arc.io";
  const arcExplorer = stripSlash(
    process.env.NEXT_PUBLIC_ARC_EXPLORER?.trim() || "https://explorer.arc.io",
  );
  const arcChainId = Number(process.env.NEXT_PUBLIC_ARC_CHAIN_ID ?? "5042");
  const baseExplorer = stripSlash(
    process.env.NEXT_PUBLIC_BASE_EXPLORER?.trim() || "https://basescan.org",
  );
  const tempoRpcUrl =
    process.env.NEXT_PUBLIC_TEMPO_RPC_URL?.trim() || "https://rpc.moderato.tempo.xyz";
  const tempoExplorer = stripSlash(
    process.env.NEXT_PUBLIC_TEMPO_EXPLORER?.trim() || "https://explore.testnet.tempo.xyz",
  );
  const tempoChainId = Number(process.env.NEXT_PUBLIC_TEMPO_CHAIN_ID ?? "42431");

  const networks: Record<NetworkId, NetworkDefinition> = {
    arc: {
      id: "arc",
      label: "Arc",
      shortLabel: "Arc",
      role: "registry",
      chainId: arcChainId,
      explorer: arcExplorer,
      rpcUrl: arcRpcUrl,
      paymentRpcUrl: baseRpcUrl,
      logChunk: BigInt(9_000),
      settlementProofsAddress: arcAddress,
      eip155: `eip155:${arcChainId}`,
      blurb: "Notarization registry. Payment stays on Base; proofs are append-only on Arc.",
    },
    base: {
      id: "base",
      label: "Base",
      shortLabel: "Base",
      role: "payment",
      chainId: 8453,
      explorer: baseExplorer,
      paymentRpcUrl: baseRpcUrl,
      logChunk: BigInt(9_000),
      settlementProofsAddress: null,
      eip155: "eip155:8453",
      blurb: "USDC payment rail for the Arc registry. srcTxHash on each Arc proof is a Base payment transaction.",
    },
    tempo: {
      id: "tempo",
      label: "Tempo",
      shortLabel: "Tempo",
      role: "registry",
      chainId: tempoChainId,
      explorer: tempoExplorer,
      rpcUrl: tempoRpcUrl,
      paymentRpcUrl: tempoRpcUrl,
      logsFromBlock: tempoFromBlock,
      // Tempo public RPC caps eth_getLogs at 100_000 blocks.
      logChunk: BigInt(90_000),
      settlementProofsAddress: tempoAddress,
      eip155: `eip155:${tempoChainId}`,
      blurb:
        "Tempo Moderato testnet: the stablecoin payment and its proof both live on Tempo (TIP-20 pathUSD / AlphaUSD / BetaUSD / ThetaUSD). Same SettlementProofs contract as Arc.",
    },
  };

  return {
    networks,
    defaultNetwork: "arc",
    arcRpcUrl,
    settlementProofsAddress: arcAddress,
    arcExplorer,
    arcChainId,
    baseExplorer,
  };
}

export function getNetwork(id: NetworkId): NetworkDefinition {
  return getPublicConfig().networks[id];
}

export function registryNetworks(): NetworkDefinition[] {
  return NETWORK_IDS.map(getNetwork).filter((n) => n.role === "registry");
}

export function explorerTxUrl(explorer: string, hash: string) {
  return `${explorer}/tx/${hash}`;
}

export function explorerAddressUrl(explorer: string, address: string) {
  return `${explorer}/address/${address}`;
}

/** @deprecated Prefer explorerTxUrl(network.explorer, hash) */
export function arcTxUrl(explorer: string, hash: string) {
  return explorerTxUrl(explorer, hash);
}

/** @deprecated Prefer explorerAddressUrl(network.explorer, address) */
export function arcAddressUrl(explorer: string, address: string) {
  return explorerAddressUrl(explorer, address);
}

export function baseTxUrl(explorer: string, hash: string) {
  return explorerTxUrl(explorer, hash);
}

export function baseAddressUrl(explorer: string, address: string) {
  return explorerAddressUrl(explorer, address);
}

/** Proof amounts are always 6-decimal ERC-20 USDC units (Base payment / registry). */
export function formatUsdc(amount: bigint): string {
  const negative = amount < BigInt(0);
  const value = negative ? -amount : amount;
  const unit = BigInt(1_000_000);
  const whole = value / unit;
  const frac = (value % unit).toString().padStart(6, "0").replace(/0+$/, "");
  const wholeFmt = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const body = frac.length ? `${wholeFmt}.${frac}` : wholeFmt;
  return negative ? `-${body}` : body;
}

export function formatPaidAt(unixSeconds: number): string {
  if (!unixSeconds) return "—";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(unixSeconds * 1000));
}

export function shortenAddress(address: string): string {
  if (!address || address.length < 10) return address || "—";
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}
