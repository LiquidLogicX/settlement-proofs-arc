import type { Metadata } from "next";
import { Ledger } from "@/components/ledger";
import { SiteChrome } from "@/components/site-chrome";
import { getNetwork, parseNetworkId } from "@/lib/config";
import { fetchLedger, serializeLedger } from "@/lib/proofs";
import { networkTabTitle } from "@/lib/tab-title";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ network?: string }>;
};

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const { network } = await searchParams;
  return { title: networkTabTitle(network) };
}

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
          Every proof links a real stablecoin payment to an append-only record anyone can check.{" "}
          <span className="text-foreground">Arc</span> registry: USDC paid on{" "}
          <span className="text-foreground">Base</span>.{" "}
          <span className="text-foreground">Tempo</span> registry: TIP-20 stablecoins paid on
          Tempo. Payer, payee, amount, and both transactions are public. No wallet needed to read.{" "}
          {network.blurb}
        </>
      }
    >
      <Ledger initialData={initialData} initialError={initialError} networkId={networkId} />
    </SiteChrome>
  );
}
