"use client";

import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { ExternalLink, Loader2, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ProofFieldList } from "@/components/proof-details";
import { ProofExplorerLinks } from "@/components/proof-links";
import { paymentOf } from "@/lib/payments";
import {
  explorerAddressUrl,
  formatUsdc,
  getNetwork,
  isTempoNetwork,
  type NetworkId,
} from "@/lib/config";
import {
  deserializeLookup,
  isTempoSyntheticSelfTest,
  selfTestBadgeLabel,
  type ProofLookupResult,
  type ProofQueryKind,
  type SerializedLookupResult,
} from "@/lib/proofs";

const KIND_LABEL: Record<ProofQueryKind, string> = {
  refId: "Matched as settlement ID (refId)",
  arcTx: "Matched as registry proof transaction",
  srcTxHash: "Matched as payment transaction (srcTxHash)",
};

type LookupApiBody =
  | (SerializedLookupResult & { network?: string })
  | { status?: undefined; error?: string; network?: string };

export function Verifier({
  initialQuery = "",
  networkId,
}: {
  initialQuery?: string;
  networkId: NetworkId;
}) {
  const network = getNetwork(networkId);
  const base = getNetwork("base");
  const [query, setQuery] = useState(initialQuery);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ProofLookupResult | null>(null);
  const autoRan = useRef(false);

  const runLookup = useCallback(
    async (raw: string) => {
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
          `/api/proofs/lookup?network=${networkId}&q=${encodeURIComponent(trimmed)}`,
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
    },
    [networkId],
  );

  useEffect(() => {
    autoRan.current = false;
    setResult(null);
    setError(null);
  }, [networkId]);

  useEffect(() => {
    if (autoRan.current) return;
    if (!initialQuery.trim()) return;
    if (network.role !== "registry") return;
    autoRan.current = true;
    void runLookup(initialQuery);
  }, [initialQuery, runLookup, network.role]);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void runLookup(query);
  }

  if (network.role === "payment") {
    return (
      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle>Base payment network</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>{network.blurb}</p>
          <p>
            The verifier reads SettlementProofs on <strong className="text-foreground">Arc</strong>{" "}
            or <strong className="text-foreground">Tempo</strong>. Paste a Base{" "}
            <code className="text-llx-link">srcTxHash</code> there to match a recorded proof.
          </p>
          <a
            href={base.explorer}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-llx-link hover:text-foreground"
          >
            Open BaseScan
            <ExternalLink className="size-3.5" />
          </a>
        </CardContent>
      </Card>
    );
  }

  if (!network.settlementProofsAddress) {
    return (
      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle>Verifier not configured</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            Set the SettlementProofs address for {network.label}, then rebuild or restart the web
            app.
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
            Look up a settlement proof on {network.label}
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Paste a settlement ID (<code className="text-llx-link">refId</code>), a{" "}
            {network.shortLabel} proof transaction hash, or the{" "}
            {isTempoNetwork(networkId) ? "Tempo" : "Base"} payment transaction hash (
            <code className="text-llx-link">srcTxHash</code>). Data comes from public JSON-RPC
            only — not a privacy product.
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
              href={explorerAddressUrl(network.explorer, network.settlementProofsAddress)}
              target="_blank"
              rel="noreferrer"
              className="break-all font-mono text-llx-link hover:text-foreground"
            >
              {network.settlementProofsAddress}
            </a>
          </p>
        </CardContent>
      </Card>

      {error ? (
        <Card className="border-destructive/40 bg-destructive/10">
          <CardContent className="pt-6 text-sm">
            Could not query {network.label} RPC: {error}
          </CardContent>
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
          networkId={networkId}
        />
      ) : null}
    </div>
  );
}

function FoundProof({
  proof,
  queryKind,
  selfTest,
  networkId,
}: {
  proof: import("@/lib/proofs").LedgerProof;
  queryKind: ProofQueryKind;
  selfTest: boolean;
  networkId: NetworkId;
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
              {selfTestBadgeLabel(networkId)}
            </Badge>
          ) : null}
          <span className="text-xs text-muted-foreground">{KIND_LABEL[queryKind]}</span>
        </div>
        {isTempoSyntheticSelfTest({ networkId, selfTest, refId: proof.refId }) ? (
          <p className="rounded-md border border-llx-selftest-border/50 bg-llx-selftest-border/10 px-3 py-2 text-sm text-llx-selftest-text">
            Synthetic Moderato demo — not a real Base payment. The srcTxHash was made up for
            testnet; production recorder still verifies a live Base USDC Transfer before writing.
          </p>
        ) : null}
        <div>
          <p className="text-xs tracking-[0.2em] text-llx-label uppercase">Amount</p>
          <CardTitle className="font-mono text-3xl text-foreground">
            {formatUsdc(proof.amountUSDC)}{" "}
            <span className="text-lg text-muted-foreground">
              {paymentOf(proof, networkId).tokenSymbol}
            </span>
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <ProofFieldList proof={proof} networkId={networkId} refIdLink />
        <ProofExplorerLinks proof={proof} align="start" networkId={networkId} />
      </CardContent>
    </Card>
  );
}
