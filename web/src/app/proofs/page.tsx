import type { Metadata } from "next";
import { Ledger } from "@/components/ledger";
import { SiteChrome } from "@/components/site-chrome";
import { Verifier } from "@/components/verifier";
import { getNetwork, parseNetworkId } from "@/lib/config";
import { fetchLedger, serializeLedger } from "@/lib/proofs";
import { networkTabTitle } from "@/lib/tab-title";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ q?: string; query?: string; network?: string }>;
};

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const { network } = await searchParams;
  return { title: networkTabTitle(network) };
}

export default async function ProofsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const initialQuery = (params.q ?? params.query ?? "").trim();
  const networkId = parseNetworkId(params.network);
  const network = getNetwork(networkId);

  let initialData = null;
  let initialError: string | null = null;
  if (network.role === "registry") {
    try {
      initialData = serializeLedger(await fetchLedger(networkId));
    } catch (err) {
      initialError = err instanceof Error ? err.message : String(err);
    }
  }

  return (
    <SiteChrome
      active="proofs"
      network={networkId}
      title={`Verify a proof · ${network.label}`}
      subtitle={
        <>
          Public verifier for <span className="text-foreground">Arc</span> and{" "}
          <span className="text-foreground">Tempo</span> registries. Look up by settlement ID (
          <code className="text-llx-link">refId</code>), proof record tx, or the payment tx (
          <code className="text-llx-link">srcTxHash</code>) on Base or Tempo. The page re-checks
          the payment on its own chain. Real RPC data only. Not a privacy product.
        </>
      }
    >
      <div className="space-y-12">
        <Verifier initialQuery={initialQuery} networkId={networkId} />

        <section className="space-y-4 border-t border-white/10 pt-10">
          <div>
            <h2 className="text-xl font-semibold text-foreground">Recorded proofs ledger</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Full append-only list from the selected registry. Filter locally or open a row&apos;s
              detail page.
            </p>
          </div>
          <Ledger initialData={initialData} initialError={initialError} networkId={networkId} />
        </section>
      </div>
    </SiteChrome>
  );
}
