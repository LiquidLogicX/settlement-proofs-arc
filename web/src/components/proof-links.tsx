import { ExternalLink } from "lucide-react";
import {
  arcAddressUrl,
  arcTxUrl,
  baseTxUrl,
  getPublicConfig,
} from "@/lib/config";
import type { LedgerProof } from "@/lib/proofs";

const config = getPublicConfig();

/** Explicit Base payment + Arc proof / explorer links for a recorded proof. */
export function ProofExplorerLinks({
  proof,
  align = "end",
}: {
  proof: Pick<LedgerProof, "srcTxHash" | "proofTxHash">;
  align?: "start" | "end";
}) {
  const justify = align === "end" ? "justify-end" : "justify-start";

  return (
    <div className={`flex flex-wrap gap-2 ${justify}`}>
      <a
        href={baseTxUrl(config.baseExplorer, proof.srcTxHash)}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 rounded-full border border-violet-500/30 bg-violet-500/10 px-2.5 py-1 text-xs text-violet-200 hover:border-violet-400/50 hover:text-violet-50"
        title={proof.srcTxHash}
      >
        Base payment tx
        <ExternalLink className="size-3" />
      </a>
      {proof.proofTxHash ? (
        <a
          href={arcTxUrl(config.arcExplorer, proof.proofTxHash)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 rounded-full border border-fuchsia-500/30 bg-fuchsia-500/10 px-2.5 py-1 text-xs text-fuchsia-100 hover:border-fuchsia-400/50 hover:text-fuchsia-50"
          title={proof.proofTxHash}
        >
          Arc proof tx
          <ExternalLink className="size-3" />
        </a>
      ) : config.settlementProofsAddress ? (
        <a
          href={arcAddressUrl(config.arcExplorer, config.settlementProofsAddress)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-xs text-silver-200 hover:border-white/30 hover:text-silver-50"
        >
          Arc registry
          <ExternalLink className="size-3" />
        </a>
      ) : (
        <a
          href={config.arcExplorer}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-xs text-silver-200 hover:border-white/30 hover:text-silver-50"
        >
          Arc explorer
          <ExternalLink className="size-3" />
        </a>
      )}
    </div>
  );
}
