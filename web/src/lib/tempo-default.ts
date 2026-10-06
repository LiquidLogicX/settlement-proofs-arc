/**
 * Which Tempo tab is the "default" one (listed first in the network switcher and
 * linked from the testnet tab once mainnet has data)?
 *
 *   NEXT_PUBLIC_TEMPO_DEFAULT_NETWORK = auto (default) | tempo-mainnet | tempo
 *
 * auto: Tempo mainnet once its registry holds >= 1 proof, otherwise Tempo testnet.
 * The proofCount() read is cached for 60 s and any RPC error falls back to testnet.
 *
 * URLs are never rewritten: ?network=tempo always means Moderato testnet and
 * ?network=tempo-mainnet always means mainnet, so existing proof links keep working.
 */
import { type TempoNetworkId } from "./config";
import { fetchProofCount } from "./proofs";

export type TempoDefaultMode = "auto" | TempoNetworkId;

export function parseTempoDefaultMode(raw: string | undefined | null): TempoDefaultMode {
  const v = raw?.trim().toLowerCase();
  if (v === "tempo-mainnet" || v === "mainnet") return "tempo-mainnet";
  if (v === "tempo" || v === "testnet" || v === "tempo-testnet") return "tempo";
  return "auto";
}

/** Pure: pick the default Tempo tab from the mode and the mainnet proof count (null = unknown). */
export function pickDefaultTempoNetwork(
  mode: TempoDefaultMode,
  mainnetProofCount: bigint | null,
): TempoNetworkId {
  if (mode !== "auto") return mode;
  return mainnetProofCount !== null && mainnetProofCount >= BigInt(1) ? "tempo-mainnet" : "tempo";
}

const TTL_MS = 60_000;
let cache: { at: number; count: bigint | null } | null = null;

async function mainnetProofCount(): Promise<bigint | null> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.count;
  let count: bigint | null = null;
  try {
    count = await Promise.race([
      fetchProofCount("tempo-mainnet"),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 4_000)),
    ]);
  } catch {
    count = null;
  }
  cache = { at: Date.now(), count };
  return count;
}

export async function resolveDefaultTempoNetwork(): Promise<{
  defaultTempo: TempoNetworkId;
  mainnetProofCount: bigint | null;
}> {
  const mode = parseTempoDefaultMode(process.env.NEXT_PUBLIC_TEMPO_DEFAULT_NETWORK);
  const count = mode === "auto" ? await mainnetProofCount() : null;
  return { defaultTempo: pickDefaultTempoNetwork(mode, count), mainnetProofCount: count };
}
