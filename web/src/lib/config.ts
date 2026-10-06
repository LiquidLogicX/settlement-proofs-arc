import { type Address, getAddress, isAddress } from "viem";

/** Visible networks on proofs.liquidlogicx.com. */
export type NetworkId = "arc" | "base" | "tempo" | "tempo-mainnet";

/** Tempo registry tabs. `tempo` stays the Moderato testnet key so existing ?network=tempo links keep working. */
export type TempoNetworkId = "tempo" | "tempo-mainnet";

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

/** Selector order: registries first (Arc, Tempo mainnet, Tempo testnet), then the Base payment rail.
 *  The two Tempo tabs are re-ordered at render time so the default Tempo tab comes first
 *  (see tempoTabOrder / lib/tempo-default.ts). */
export const NETWORK_IDS: NetworkId[] = ["arc", "tempo-mainnet", "tempo", "base"];

export const TEMPO_NETWORK_IDS: TempoNetworkId[] = ["tempo-mainnet", "tempo"];

export function isTempoNetwork(id: string | null | undefined): id is TempoNetworkId {
  return id === "tempo" || id === "tempo-mainnet";
}

/** NETWORK_IDS with the default Tempo tab placed first among the Tempo tabs. */
export function tempoTabOrder(defaultTempo: TempoNetworkId): NetworkId[] {
  const other: TempoNetworkId = defaultTempo === "tempo" ? "tempo-mainnet" : "tempo";
  return ["arc", defaultTempo, other, "base"];
}

/** Tempo Moderato SettlementProofs v2 (2026-10-05): Tempo payment → Tempo proof.
 *  Production default. Legacy v1 (0x35d7…ce51) is superseded and must not be the verifier default
 *  — see docs/deployments.md. */
export const TEMPO_MODERATO_REGISTRY = "0x2ec4CF47e6964b33FEd3718f07885ed44aF52c0b";
/** Deploy block of TEMPO_MODERATO_REGISTRY (log scans start here). */
export const TEMPO_MODERATO_REGISTRY_FROM_BLOCK = "38311217";

/** Tempo mainnet SettlementProofs (deployed + Sourcify exact_match 2026-10-05). See docs/tempo-mainnet-prep.md. */
export const TEMPO_MAINNET_REGISTRY = "0x9940a8fE88f8BE0bB8E05686631Fd638DC1DfE6A";
/** Deploy block of TEMPO_MAINNET_REGISTRY. */
export const TEMPO_MAINNET_REGISTRY_FROM_BLOCK = "42806697";
export const TEMPO_MAINNET_CHAIN_ID = 4217;
export const TEMPO_MAINNET_RPC = "https://rpc.tempo.xyz";
export const TEMPO_MAINNET_EXPLORER = "https://explore.tempo.xyz";

export function isNetworkId(value: string | null | undefined): value is NetworkId {
  return value === "arc" || value === "base" || value === "tempo" || value === "tempo-mainnet";
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

  // Tempo mainnet: hardcoded defaults, optional NEXT_PUBLIC_TEMPO_MAINNET_* overrides.
  const tempoMainnetAddress = parseAddress(
    process.env.NEXT_PUBLIC_TEMPO_MAINNET_SETTLEMENT_PROOFS_ADDRESS?.trim() || TEMPO_MAINNET_REGISTRY,
  );
  const tempoMainnetFromBlockRaw =
    process.env.NEXT_PUBLIC_TEMPO_MAINNET_REGISTRY_FROM_BLOCK?.trim() ||
    (tempoMainnetAddress === TEMPO_MAINNET_REGISTRY ? TEMPO_MAINNET_REGISTRY_FROM_BLOCK : "");
  const tempoMainnetFromBlock = /^\d+$/.test(tempoMainnetFromBlockRaw)
    ? BigInt(tempoMainnetFromBlockRaw)
    : undefined;
  const tempoMainnetRpcUrl =
    process.env.NEXT_PUBLIC_TEMPO_MAINNET_RPC_URL?.trim() || TEMPO_MAINNET_RPC;
  const tempoMainnetExplorer = stripSlash(
    process.env.NEXT_PUBLIC_TEMPO_MAINNET_EXPLORER?.trim() || TEMPO_MAINNET_EXPLORER,
  );
  const tempoMainnetChainId = Number(
    process.env.NEXT_PUBLIC_TEMPO_MAINNET_CHAIN_ID ?? String(TEMPO_MAINNET_CHAIN_ID),
  );

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
      label: "Tempo testnet",
      shortLabel: "Tempo testnet",
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
    "tempo-mainnet": {
      id: "tempo-mainnet",
      label: "Tempo mainnet",
      shortLabel: "Tempo mainnet",
      role: "registry",
      chainId: tempoMainnetChainId,
      explorer: tempoMainnetExplorer,
      rpcUrl: tempoMainnetRpcUrl,
      paymentRpcUrl: tempoMainnetRpcUrl,
      logsFromBlock: tempoMainnetFromBlock,
      logChunk: BigInt(90_000),
      settlementProofsAddress: tempoMainnetAddress,
      eip155: `eip155:${tempoMainnetChainId}`,
      blurb:
        "Tempo mainnet: real TIP-20 stablecoin payments (USDC.e) and their proofs both live on Tempo. Registry deployed and source-verified on chain 4217; same SettlementProofs contract as Arc.",
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
