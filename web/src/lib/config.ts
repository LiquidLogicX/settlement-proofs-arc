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

export const NETWORK_IDS: NetworkId[] = ["arc", "base", "tempo"];

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
    process.env.NEXT_PUBLIC_TEMPO_SETTLEMENT_PROOFS_ADDRESS ??
      // Moderato testnet deploy (2026-09-23) — SettlementProofs + RECORDER_ROLE
      "0x35d7ec9B87A173774F18182c087bE3296efCce51",
  );

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
      settlementProofsAddress: null,
      eip155: "eip155:8453",
      blurb: "USDC payment rail. srcTxHash on each proof is a Base payment transaction.",
    },
    tempo: {
      id: "tempo",
      label: "Tempo",
      shortLabel: "Tempo",
      role: "registry",
      chainId: tempoChainId,
      explorer: tempoExplorer,
      rpcUrl: tempoRpcUrl,
      settlementProofsAddress: tempoAddress,
      eip155: `eip155:${tempoChainId}`,
      blurb:
        "Tempo Moderato testnet registry (same SettlementProofs ABI). Fees paid in pathUSD.",
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
