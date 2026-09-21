import { type Address, isAddress } from "viem";

export type PublicConfig = {
  arcRpcUrl: string;
  settlementProofsAddress: Address | null;
  /** Human UI only (root pages). Programmatic verify uses arcRpcUrl — never the explorer HTTP API. */
  arcExplorer: string;
  arcChainId: number;
  /** BaseScan root for public srcTxHash (1A: payment on Base). */
  baseExplorer: string;
};

function stripSlash(url: string) {
  return url.replace(/\/+$/, "");
}

export function getPublicConfig(): PublicConfig {
  const address = process.env.NEXT_PUBLIC_SETTLEMENT_PROOFS_ADDRESS?.trim() ?? "";
  return {
    arcRpcUrl: process.env.NEXT_PUBLIC_ARC_RPC_URL?.trim() || "https://rpc.mainnet.arc.io",
    settlementProofsAddress: isAddress(address) ? address : null,
    arcExplorer: stripSlash(
      process.env.NEXT_PUBLIC_ARC_EXPLORER?.trim() || "https://explorer.arc.io",
    ),
    arcChainId: Number(process.env.NEXT_PUBLIC_ARC_CHAIN_ID ?? "5042"),
    baseExplorer: stripSlash(
      process.env.NEXT_PUBLIC_BASE_EXPLORER?.trim() || "https://basescan.org",
    ),
  };
}

export function arcTxUrl(explorer: string, hash: string) {
  return `${explorer}/tx/${hash}`;
}

export function arcAddressUrl(explorer: string, address: string) {
  return `${explorer}/address/${address}`;
}

export function baseTxUrl(explorer: string, hash: string) {
  return `${explorer}/tx/${hash}`;
}

export function baseAddressUrl(explorer: string, address: string) {
  return `${explorer}/address/${address}`;
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
