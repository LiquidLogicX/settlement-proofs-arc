/**
 * TIP-20 tokens the public Tempo ledger will treat as a real payment.
 * Anything else with the TIP-20 address prefix is not a match.
 *
 * Testnet is the Moderato faucet set. Mainnet is the set the recorder must
 * name in TEMPO_ALLOWED_TOKENS before it will start (USDC.e and pathUSD).
 */
import { getAddress, isAddress } from "viem";

export const TEMPO_TESTNET_LEDGER_TOKENS: Readonly<Record<string, string>> = {
  "0x20C0000000000000000000000000000000000000": "pathUSD",
  "0x20C0000000000000000000000000000000000001": "AlphaUSD",
  "0x20c0000000000000000000000000000000000002": "BetaUSD",
  "0x20C0000000000000000000000000000000000003": "ThetaUSD",
};

/** Tempo mainnet stablecoins the ledger accepts. See docs/render-tempo-env.md. */
export const TEMPO_MAINNET_LEDGER_TOKENS: Readonly<Record<string, string>> = {
  "0x20C000000000000000000000b9537d11c60E8b50": "USDC.e",
  "0x20C0000000000000000000000000000000000000": "pathUSD",
};

export type TempoLedgerNetwork = "tempo" | "tempo-mainnet";

function toAllowlist(tokens: Readonly<Record<string, string>>): Map<string, string> {
  const map = new Map<string, string>();
  for (const [address, symbol] of Object.entries(tokens)) {
    map.set(getAddress(address).toLowerCase(), symbol);
  }
  return map;
}

const TESTNET = toAllowlist(TEMPO_TESTNET_LEDGER_TOKENS);
const MAINNET = toAllowlist(TEMPO_MAINNET_LEDGER_TOKENS);

export function tempoLedgerAllowlist(network: TempoLedgerNetwork): ReadonlyMap<string, string> {
  return network === "tempo-mainnet" ? MAINNET : TESTNET;
}

export function isAllowlistedTempoToken(network: TempoLedgerNetwork, address: string): boolean {
  if (!isAddress(address, { strict: false })) return false;
  return tempoLedgerAllowlist(network).has(getAddress(address).toLowerCase());
}

/** Allowlisted symbol, or null when the address is not on that network's list. */
export function tempoLedgerTokenSymbol(network: TempoLedgerNetwork, address: string): string | null {
  if (!isAddress(address, { strict: false })) return null;
  return tempoLedgerAllowlist(network).get(getAddress(address).toLowerCase()) ?? null;
}
