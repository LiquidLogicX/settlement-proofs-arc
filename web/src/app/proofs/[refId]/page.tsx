import Link from "next/link";
import { notFound } from "next/navigation";
import { ProofExplorerLinks } from "@/components/proof-links";
import { SiteChrome } from "@/components/site-chrome";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  arcAddressUrl,
  arcTxUrl,
  baseAddressUrl,
  baseTxUrl,
  formatPaidAt,
  formatUsdc,
  getPublicConfig,
} from "@/lib/config";
import { fetchProofByRefId, isSelfTestMemo } from "@/lib/proofs";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ refId: string }>;
};

export default async function ProofDetailPage({ params }: PageProps) {
  const { refId: rawRefId } = await params;
  const config = getPublicConfig();

  let error: string | null = null;
  let proof: Awaited<ReturnType<typeof fetchProofByRefId>> = null;

  try {
    proof = await fetchProofByRefId(rawRefId);
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
      title="Proof detail"
      subtitle={
        <>
          Settlement proof on Arc with explorer links for the Arc record and the source Base
          payment. Public notarization — payee and srcTxHash are cleartext. Not a privacy product.
        </>
      }
    >
      <div className="mb-6">
        <Link href="/proofs" className="text-sm text-violet-300 hover:text-violet-100">
          ← Verifier &amp; all proofs
        </Link>
      </div>

      {error ? (
        <Card className="border-destructive/40 bg-destructive/10">
          <CardContent className="pt-6 text-sm">{error}</CardContent>
        </Card>
      ) : null}

      {proof ? (
        <Card className="border-violet-500/25 bg-card/90">
          <CardHeader>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <p className="text-xs tracking-[0.2em] text-violet-300 uppercase">
                Settlement proof on Arc
              </p>
              {selfTest ? (
                <Badge className="border-amber-400/50 bg-amber-400/15 text-amber-100">
                  Self-test
                </Badge>
              ) : null}
            </div>
            <CardTitle className="font-mono text-3xl text-silver-50">
              {formatUsdc(proof.amountUSDC)} USDC
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <dl className="grid gap-4 text-sm sm:grid-cols-2">
              <Field label="refId" mono full>
                {proof.refId}
              </Field>
              <Field label="Payee (Base)">
                <a
                  href={baseAddressUrl(config.baseExplorer, proof.payee)}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-violet-200 hover:text-violet-100"
                >
                  {proof.payee}
                </a>
              </Field>
              <Field label="Paid at (UTC)">{formatPaidAt(proof.paidAt)}</Field>
              <Field label="Recorded at (UTC)">{formatPaidAt(proof.recordedAt)}</Field>
              <Field label="Memo" full>
                {proof.memo || "—"}
              </Field>
              <Field label="Base payment tx (srcTxHash)" mono full>
                <a
                  href={baseTxUrl(config.baseExplorer, proof.srcTxHash)}
                  target="_blank"
                  rel="noreferrer"
                  className="text-violet-200 hover:text-violet-100"
                >
                  {proof.srcTxHash}
                </a>
              </Field>
              <Field label="Arc proof tx" mono full>
                {proof.proofTxHash ? (
                  <a
                    href={arcTxUrl(config.arcExplorer, proof.proofTxHash)}
                    target="_blank"
                    rel="noreferrer"
                    className="text-fuchsia-200 hover:text-fuchsia-100"
                  >
                    {proof.proofTxHash}
                  </a>
                ) : (
                  <span className="text-muted-foreground">
                    Not indexed from PaymentRecorded logs yet
                    {config.settlementProofsAddress ? (
                      <>
                        {" · "}
                        <a
                          href={arcAddressUrl(
                            config.arcExplorer,
                            config.settlementProofsAddress,
                          )}
                          target="_blank"
                          rel="noreferrer"
                          className="text-violet-300 hover:text-violet-100"
                        >
                          open registry on Arc explorer
                        </a>
                      </>
                    ) : null}
                  </span>
                )}
              </Field>
            </dl>
            <ProofExplorerLinks proof={proof} align="start" />
          </CardContent>
        </Card>
      ) : null}
    </SiteChrome>
  );
}

function Field({
  label,
  children,
  mono,
  full,
}: {
  label: string;
  children: React.ReactNode;
  mono?: boolean;
  full?: boolean;
}) {
  return (
    <div className={full ? "sm:col-span-2" : undefined}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={mono ? "mt-1 break-all font-mono text-xs text-silver-200" : "mt-1 text-silver-100"}>
        {children}
      </dd>
    </div>
  );
}
