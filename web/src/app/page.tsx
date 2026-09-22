import { Ledger } from "@/components/ledger";
import { SiteChrome } from "@/components/site-chrome";
import { fetchLedger, serializeLedger } from "@/lib/proofs";

export const dynamic = "force-dynamic";

export default async function Home() {
  let initialData = null;
  let initialError: string | null = null;
  try {
    initialData = serializeLedger(await fetchLedger());
  } catch (err) {
    initialError = err instanceof Error ? err.message : String(err);
  }

  return (
    <SiteChrome
      active="ledger"
      title="Settlement proofs on Arc"
      subtitle={
        <>
          Public, append-only <span className="text-foreground">settlement proofs on Arc</span>.
          USDC payments stay on <span className="text-foreground">Base</span>; each proof stores a
          cleartext payee and the public Base payment{" "}
          <code className="text-llx-link">srcTxHash</code>, with Arc explorer + BaseScan links
          on every row. Not privacy. No wallet required to read.
        </>
      }
    >
      <Ledger initialData={initialData} initialError={initialError} />
    </SiteChrome>
  );
}
