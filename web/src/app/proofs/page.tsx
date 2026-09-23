import { Ledger } from "@/components/ledger";
import { SiteChrome } from "@/components/site-chrome";
import { Verifier } from "@/components/verifier";
import { getNetwork, parseNetworkId } from "@/lib/config";
import { fetchLedger, serializeLedger } from "@/lib/proofs";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ q?: string; query?: string; network?: string }>;
};

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
          Public verifier across <span className="text-foreground">Arc</span>,{" "}
          <span className="text-foreground">Base</span>, and{" "}
          <span className="text-foreground">Tempo</span>. Look up by settlement ID (
          <code className="text-llx-link">refId</code>), registry proof tx, or Base{" "}
          <code className="text-llx-link">srcTxHash</code>. Cleartext payee. Real RPC data only.
          Not a privacy product.
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
