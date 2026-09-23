import { ExternalLink } from "lucide-react";
import {
  explorerAddressUrl,
  explorerTxUrl,
  getNetwork,
  type NetworkId,
} from "@/lib/config";
import type { LedgerProof } from "@/lib/proofs";

/** Explicit Base payment + registry proof / explorer links for a recorded proof. */
export function ProofExplorerLinks({
  proof,
  align = "end",
  networkId = "arc",
}: {
  proof: Pick<LedgerProof, "srcTxHash" | "proofTxHash">;
  align?: "start" | "end";
  networkId?: NetworkId;
}) {
  const justify = align === "end" ? "justify-end" : "justify-start";
  const registry = getNetwork(networkId === "base" ? "arc" : networkId);
  const base = getNetwork("base");

  return (
    <div className={`flex flex-wrap gap-2 ${justify}`}>
      <a
        href={explorerTxUrl(base.explorer, proof.srcTxHash)}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1 text-xs text-llx-link hover:text-foreground"
        title={proof.srcTxHash}
      >
        Base payment tx
        <ExternalLink className="size-3" />
      </a>
      {proof.proofTxHash ? (
        <a
          href={explorerTxUrl(registry.explorer, proof.proofTxHash)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1 text-xs text-llx-link hover:text-foreground"
          title={proof.proofTxHash}
        >
          {registry.shortLabel} proof tx
          <ExternalLink className="size-3" />
        </a>
      ) : registry.settlementProofsAddress ? (
        <a
          href={explorerAddressUrl(registry.explorer, registry.settlementProofsAddress)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1 text-xs text-llx-link hover:text-foreground"
        >
          {registry.shortLabel} registry
          <ExternalLink className="size-3" />
        </a>
      ) : (
        <a
          href={registry.explorer}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1 text-xs text-llx-link hover:text-foreground"
        >
          {registry.shortLabel} explorer
          <ExternalLink className="size-3" />
        </a>
      )}
    </div>
  );
}
