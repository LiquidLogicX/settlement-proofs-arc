import { Ledger } from "@/components/ledger";
import { SiteChrome } from "@/components/site-chrome";
import { fetchLedger, serializeLedger } from "@/lib/proofs";

export const dynamic = "force-dynamic";

export default async function ProofsPage() {
  let initialData = null;
  let initialError: string | null = null;
  try {
    initialData = serializeLedger(await fetchLedger());
  } catch (err) {
    initialError = err instanceof Error ? err.message : String(err);
  }

  return (
    <SiteChrome
      active="proofs"
      title="Recorded proofs"
      subtitle={
        <>
          Each row is a settlement proof on Arc: Arc proof transaction + source Base payment
          transaction. Cleartext payee. Public <code className="text-violet-200">srcTxHash</code>.
          Not a privacy product.
        </>
      }
    >
      <Ledger initialData={initialData} initialError={initialError} />
    </SiteChrome>
  );
}
