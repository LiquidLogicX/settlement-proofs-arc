import Link from "next/link";
import { notFound } from "next/navigation";
import { ProofFieldList } from "@/components/proof-details";
import { ProofExplorerLinks } from "@/components/proof-links";
import { SiteChrome } from "@/components/site-chrome";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatUsdc, getNetwork, parseNetworkId } from "@/lib/config";
import { paymentOf } from "@/lib/payments";
import { fetchProofByRefId, isSelfTestMemo, isTempoSyntheticSelfTest, selfTestBadgeLabel } from "@/lib/proofs";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ refId: string }>;
  searchParams: Promise<{ network?: string }>;
};

export default async function ProofDetailPage({ params, searchParams }: PageProps) {
  const { refId: rawRefId } = await params;
  const sp = await searchParams;
  const networkId = parseNetworkId(sp.network);
  const network = getNetwork(networkId);

  if (network.role !== "registry") {
    notFound();
  }

  let error: string | null = null;
  let proof: Awaited<ReturnType<typeof fetchProofByRefId>> = null;

  try {
    proof = await fetchProofByRefId(rawRefId, networkId);
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  if (!error && !proof) {
    notFound();
  }

  const selfTest = proof ? isSelfTestMemo(proof.memo) : false;

  return (
    <SiteChrome
      active="proofs"
      network={networkId}
      title="Proof detail"
      subtitle={
        <>
          Settlement proof recorded on {network.label}, with the source payment re-checked on its
          own chain. Public notarization: payer, payee, amount, and both transactions are open to
          anyone. Not a privacy product.
        </>
      }
    >
      <div className="mb-6">
        <Link
          href={`/proofs?network=${networkId}`}
          className="text-sm text-llx-link hover:text-foreground"
        >
          ← Verifier &amp; all proofs
        </Link>
      </div>

      {error ? (
        <Card className="border-destructive/40 bg-destructive/10">
          <CardContent className="pt-6 text-sm">{error}</CardContent>
        </Card>
      ) : null}

      {proof ? (
        <Card className="border-border bg-card">
          <CardHeader>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <p className="text-xs tracking-[0.2em] text-llx-label uppercase">
                Settlement proof on {network.label}
              </p>
              {selfTest ? (
                <Badge className="border-llx-selftest-border bg-transparent text-llx-selftest-text">
                  {selfTestBadgeLabel(networkId)}
                </Badge>
              ) : null}
            </div>
            {isTempoSyntheticSelfTest({ networkId, selfTest, refId: proof.refId }) ? (
              <p className="mb-3 text-sm text-llx-selftest-text">
                Synthetic Moderato demo — not a real payment proof.
              </p>
            ) : null}
            <CardTitle className="font-mono text-3xl text-foreground">
              {formatUsdc(proof.amountUSDC)} {paymentOf(proof, networkId).tokenSymbol}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <ProofFieldList proof={proof} networkId={networkId} />
            <ProofExplorerLinks proof={proof} align="start" networkId={networkId} />
          </CardContent>
        </Card>
      ) : null}
    </SiteChrome>
  );
}
