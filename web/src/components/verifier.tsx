"use client";

import Link from "next/link";
import { type FormEvent, type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ProofExplorerLinks } from "@/components/proof-links";
import {
  arcAddressUrl,
  arcTxUrl,
  baseAddressUrl,
  baseTxUrl,
  formatPaidAt,
  formatUsdc,
  getPublicConfig,
} from "@/lib/config";
import {
  deserializeLookup,
  type ProofLookupResult,
  type ProofQueryKind,
  type SerializedLookupResult,
} from "@/lib/proofs";

const config = getPublicConfig();

const KIND_LABEL: Record<ProofQueryKind, string> = {
  refId: "Matched as settlement ID (refId)",
  arcTx: "Matched as Arc proof transaction",
  srcTxHash: "Matched as Base payment (srcTxHash)",
};

type LookupApiBody =
  | SerializedLookupResult
  | { status?: undefined; error?: string };

export function Verifier({ initialQuery = "" }: { initialQuery?: string }) {
  const [query, setQuery] = useState(initialQuery);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ProofLookupResult | null>(null);
  const autoRan = useRef(false);

  const runLookup = useCallback(async (raw: string) => {
    const trimmed = raw.trim();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      if (!trimmed) {
        setError("Enter a settlement ID (refId) or a transaction hash.");
        return;
      }
      const response = await fetch(
        `/api/proofs/lookup?q=${encodeURIComponent(trimmed)}`,
        { cache: "no-store" },
      );
      const body = (await response.json()) as LookupApiBody;
      if (!("status" in body) || !body.status) {
        throw new Error(
          ("error" in body && body.error) || `Lookup failed (${response.status})`,
        );
      }
      setResult(deserializeLookup(body));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (autoRan.current) return;
    if (!initialQuery.trim()) return;
    autoRan.current = true;
    void runLookup(initialQuery);
  }, [initialQuery, runLookup]);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void runLookup(query);
  }

  if (!config.settlementProofsAddress) {
    return (
      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle>Verifier not configured</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            Set <code className="text-foreground">NEXT_PUBLIC_SETTLEMENT_PROOFS_ADDRESS</code> to
            the Arc registry address, then rebuild or restart the web app.
          </p>
          <p>Read-only. No API key. No wallet required.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="border-border bg-card">
        <CardHeader className="pb-3">
          <p className="text-xs tracking-[0.2em] text-llx-label uppercase">Public verifier</p>
          <CardTitle className="text-xl text-foreground sm:text-2xl">
            Look up a settlement proof
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Paste a settlement ID (<code className="text-llx-link">refId</code>), an Arc proof
            transaction hash, or a Base payment{" "}
            <code className="text-llx-link">srcTxHash</code>. Data comes from Arc JSON-RPC only
            — not a privacy product.
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="flex flex-col gap-3 sm:flex-row">
            <div className="relative w-full flex-1">
              <Search className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="0x… refId or tx hash"
                className="border-border bg-background pl-8 font-mono text-sm text-llx-mono"
                aria-label="Settlement ID or transaction hash"
                spellCheck={false}
                autoComplete="off"
              />
            </div>
            <Button type="submit" disabled={loading} className="sm:min-w-28">
              {loading ? <Loader2 className="animate-spin" /> : <Search />}
              Verify
            </Button>
          </form>
          <p className="mt-3 text-xs text-muted-foreground">
            Registry:{" "}
            <a
              href={arcAddressUrl(config.arcExplorer, config.settlementProofsAddress)}
              target="_blank"
              rel="noreferrer"
              className="break-all font-mono text-llx-link hover:text-foreground"
            >
              {config.settlementProofsAddress}
            </a>
          </p>
        </CardContent>
      </Card>

      {error ? (
        <Card className="border-destructive/40 bg-destructive/10">
          <CardContent className="pt-6 text-sm">Could not query Arc RPC: {error}</CardContent>
        </Card>
      ) : null}

      {result?.status === "invalid" ? (
        <Card className="border-amber-500/30 bg-amber-500/10">
          <CardContent className="pt-6 text-sm text-amber-50">{result.message}</CardContent>
        </Card>
      ) : null}

      {result?.status === "not_found" ? (
        <Card className="border-dashed border-border bg-card">
          <CardHeader>
            <CardTitle className="text-lg text-foreground">Not found</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>{result.message}</p>
            <p className="break-all font-mono text-xs text-llx-mono">{result.query}</p>
          </CardContent>
        </Card>
      ) : null}

      {result?.status === "found" ? (
        <FoundProof
          proof={result.proof}
          queryKind={result.queryKind}
          selfTest={result.selfTest}
        />
      ) : null}
    </div>
  );
}

function FoundProof({
  proof,
  queryKind,
  selfTest,
}: {
  proof: import("@/lib/proofs").LedgerProof;
  queryKind: ProofQueryKind;
  selfTest: boolean;
}) {
  return (
    <Card className="border-border bg-card">
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge className="border-llx-found-border bg-transparent text-llx-found-text">
            Found
          </Badge>
          {selfTest ? (
            <Badge className="border-llx-selftest-border bg-transparent text-llx-selftest-text">
              Self-test
            </Badge>
          ) : null}
          <span className="text-xs text-muted-foreground">{KIND_LABEL[queryKind]}</span>
        </div>
        <div>
          <p className="text-xs tracking-[0.2em] text-llx-label uppercase">Amount (USDC)</p>
          <CardTitle className="font-mono text-3xl text-foreground">
            {formatUsdc(proof.amountUSDC)}{" "}
            <span className="text-lg text-muted-foreground">USDC</span>
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <dl className="grid gap-4 text-sm sm:grid-cols-2">
          <Field label="Settlement ID (refId)" mono full>
            <Link
              href={`/proofs/${proof.refId}`}
              className="break-all text-llx-link hover:text-foreground"
            >
              {proof.refId}
            </Link>
          </Field>
          <Field label="Payee (Base)">
            <a
              href={baseAddressUrl(config.baseExplorer, proof.payee)}
              target="_blank"
              rel="noreferrer"
              className="break-all font-mono text-llx-link hover:text-foreground"
            >
              {proof.payee}
            </a>
          </Field>
          <Field label="Paid at (UTC)">{formatPaidAt(proof.paidAt)}</Field>
          <Field label="Recorded at (UTC)">{formatPaidAt(proof.recordedAt)}</Field>
          <Field label="Memo" full>
            <span className="inline-flex flex-wrap items-center gap-2">
              <span>{proof.memo || "—"}</span>
              {selfTest ? (
                <Badge
                  variant="outline"
                  className="border-llx-selftest-border text-llx-selftest-text"
                >
                  llx-self-test-0.001
                </Badge>
              ) : null}
            </span>
          </Field>
          <Field label="Base payment tx (srcTxHash)" mono full>
            <a
              href={baseTxUrl(config.baseExplorer, proof.srcTxHash)}
              target="_blank"
              rel="noreferrer"
              className="break-all text-llx-link hover:text-foreground"
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
                className="break-all text-llx-link hover:text-foreground"
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
                      className="inline text-llx-link hover:text-foreground"
                      style={{ overflowWrap: "normal", wordBreak: "normal" }}
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
  );
}

function Field({
  label,
  children,
  mono,
  full,
}: {
  label: string;
  children: ReactNode;
  mono?: boolean;
  full?: boolean;
}) {
  return (
    <div className={full ? "sm:col-span-2" : undefined}>
      <dt className="text-xs tracking-[0.15em] text-llx-label uppercase">{label}</dt>
      <dd
        className={
          mono
            ? "mt-1 break-words whitespace-normal font-mono text-xs text-llx-mono"
            : "mt-1 break-words whitespace-normal text-foreground"
        }
      >
        {children}
      </dd>
    </div>
  );
}
