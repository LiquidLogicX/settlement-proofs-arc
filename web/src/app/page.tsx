import { Ledger } from "@/components/ledger";
import { SiteChrome } from "@/components/site-chrome";
import { getNetwork, parseNetworkId } from "@/lib/config";
import { fetchLedger, serializeLedger } from "@/lib/proofs";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ network?: string }>;
};

export default async function Home({ searchParams }: PageProps) {
  const params = await searchParams;
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
      active="ledger"
      network={networkId}
      title={`Settlement proofs on ${network.label}`}
      subtitle={
        <>
          Public networks: <span className="text-foreground">Arc</span>,{" "}
          <span className="text-foreground">Base</span>, and{" "}
          <span className="text-foreground">Tempo</span>. USDC payments stay on Base; Arc and
          Tempo host append-only SettlementProofs registries with cleartext payee + public{" "}
          <code className="text-llx-link">srcTxHash</code>. Not privacy. No wallet required to
          read. {network.blurb}
        </>
      }
    >
      <Ledger initialData={initialData} initialError={initialError} networkId={networkId} />
    </SiteChrome>
  );
}
