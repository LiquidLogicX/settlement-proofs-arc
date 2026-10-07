/**
 * Browser tab title for proofs.liquidlogicx.com, derived from the ?network= query param.
 *
 *   tempo / tempo-mainnet → "LLX Settlement Proofs · Tempo"
 *   arc                   → "LLX Settlement Proofs · Arc"
 *   base                  → "LLX Settlement Proofs · Base"
 *   missing / unknown     → "LLX Settlement Proofs"
 *
 * Kept dependency-free so the server (generateMetadata) and the client
 * (NetworkTabTitle, on client-side network switches) share one source of truth.
 */
export const BASE_TAB_TITLE = "LLX Settlement Proofs";

export function networkTabTitle(network: string | string[] | null | undefined): string {
  const raw = Array.isArray(network) ? network[0] : network;
  switch (raw) {
    case "tempo":
    case "tempo-mainnet":
      return `${BASE_TAB_TITLE} · Tempo`;
    case "arc":
      return `${BASE_TAB_TITLE} · Arc`;
    case "base":
      return `${BASE_TAB_TITLE} · Base`;
    default:
      return BASE_TAB_TITLE;
  }
}
