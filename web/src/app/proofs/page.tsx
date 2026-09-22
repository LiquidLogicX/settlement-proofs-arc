import { Ledger } from "@/components/ledger";
import { SiteChrome } from "@/components/site-chrome";
import { Verifier } from "@/components/verifier";
import { fetchLedger, serializeLedger } from "@/lib/proofs";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ q?: string; query?: string }>;
};

export default async function ProofsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const initialQuery = (params.q ?? params.query ?? "").trim();

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
      title="Verify a proof"
      subtitle={
        <>
          Public verifier for settlement proofs on Arc. Look up by settlement ID (
          <code className="text-llx-link">refId</code>), Arc proof tx, or Base{" "}
          <code className="text-llx-link">srcTxHash</code>. Cleartext payee. Real Arc RPC data
          only. Not a privacy product.
        </>
      }
    >
      <div className="space-y-12">
        <Verifier initialQuery={initialQuery} />

        <section className="space-y-4 border-t border-white/10 pt-10">
          <div>
            <h2 className="text-xl font-semibold text-foreground">Recorded proofs ledger</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Full append-only list from the same Arc registry. Filter locally or open a row&apos;s
              detail page.
            </p>
          </div>
          <Ledger initialData={initialData} initialError={initialError} />
        </section>
      </div>
    </SiteChrome>
  );
}
