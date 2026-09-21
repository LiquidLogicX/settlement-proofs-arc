"use client";

import { useMemo, useState } from "react";
import { ExternalLink, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  arcAddressUrl,
  baseAddressUrl,
  formatPaidAt,
  formatUsdc,
  getPublicConfig,
  shortenAddress,
} from "@/lib/config";
import { ProofExplorerLinks } from "@/components/proof-links";
import {
  deserializeLedger,
  type LedgerProof,
  type LedgerSnapshot,
  type SerializedLedger,
} from "@/lib/proofs";

const config = getPublicConfig();

type LedgerResponse = SerializedLedger & { error?: string };

export function Ledger({
  initialData,
  initialError,
}: {
  initialData: SerializedLedger | null;
  initialError: string | null;
}) {
  const [data, setData] = useState<LedgerSnapshot | null>(() =>
    initialData ? deserializeLedger(initialData) : null,
  );
  const [error, setError] = useState<string | null>(initialError);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/ledger", { cache: "no-store" });
      const body = (await response.json()) as LedgerResponse;
      if (!response.ok) {
        throw new Error(body.error || `Ledger request failed (${response.status})`);
      }
      setData(deserializeLedger(body));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    if (!q) return data.proofs;
    return data.proofs.filter((proof) => {
      return (
        proof.payee.toLowerCase().includes(q) ||
        proof.memo.toLowerCase().includes(q) ||
        proof.refId.toLowerCase().includes(q) ||
        proof.srcTxHash.toLowerCase().includes(q)
      );
    });
  }, [data, query]);

  if (!config.settlementProofsAddress && !data) {
    return (
      <Card className="border-purple-500/30 bg-card/80">
        <CardHeader>
          <CardTitle>Ledger not configured</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            Set <code className="text-silver-100">NEXT_PUBLIC_SETTLEMENT_PROOFS_ADDRESS</code> to
            the redeployed Arc contract, then rebuild or restart the web app.
          </p>
          <p>No wallet is required to read this registry.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard
          label="Total settled"
          value={data ? `${formatUsdc(data.totalSettled)} USDC` : "—"}
          hint="Sum of notarized Base USDC (6-dec ERC-20 units)"
        />
        <StatCard
          label="Proofs"
          value={data ? String(data.proofCount) : "—"}
          hint="Append-only records"
        />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-md">
          <Search className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter by payee, memo, or hash"
            className="border-white/10 bg-black/30 pl-8 text-silver-50"
            aria-label="Filter proofs"
          />
        </div>
        <div className="flex items-center gap-2">
          {config.settlementProofsAddress ? (
            <a
              href={arcAddressUrl(config.arcExplorer, config.settlementProofsAddress)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-sm text-violet-300 hover:text-violet-200"
            >
              Contract on Arc
              <ExternalLink className="size-3.5" />
            </a>
          ) : null}
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={loading ? "animate-spin" : ""} />
            Refresh
          </Button>
        </div>
      </div>

      {error ? (
        <Card className="border-destructive/40 bg-destructive/10">
          <CardContent className="pt-6 text-sm">
            Could not read the Arc registry: {error}
          </CardContent>
        </Card>
      ) : null}

      {data && data.proofs.length === 0 ? (
        <Card className="border-dashed border-white/15 bg-card/50">
          <CardContent className="py-12 text-center text-muted-foreground">
            No settlement proofs recorded yet. When the treasurer pays USDC on Base, the
            recorder notarizes an immutable proof on Arc here.
          </CardContent>
        </Card>
      ) : null}

      {filtered.length > 0 ? (
        <>
          <div className="hidden overflow-hidden rounded-xl border border-white/10 md:block">
            <Table>
              <TableHeader>
                <TableRow className="border-white/10 hover:bg-transparent">
                  <TableHead className="text-silver-300">Date (UTC)</TableHead>
                  <TableHead className="text-silver-300">Payee</TableHead>
                  <TableHead className="text-right text-silver-300">Amount</TableHead>
                  <TableHead className="text-silver-300">Memo</TableHead>
                  <TableHead className="text-right text-silver-300">Links</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((proof) => (
                  <ProofRow key={proof.refId} proof={proof} />
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="grid gap-3 md:hidden">
            {filtered.map((proof) => (
              <ProofCard key={proof.refId} proof={proof} />
            ))}
          </div>
        </>
      ) : null}

      {data && query && filtered.length === 0 && data.proofs.length > 0 ? (
        <p className="text-sm text-muted-foreground">No proofs match that filter.</p>
      ) : null}
    </div>
  );
}

function StatCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <Card className="border-violet-500/25 bg-[linear-gradient(180deg,rgba(139,92,246,0.12),rgba(12,10,18,0.9))]">
      <CardHeader className="pb-2">
        <p className="text-xs tracking-[0.2em] text-violet-300 uppercase">{label}</p>
        <CardTitle className="font-mono text-3xl font-medium text-silver-50 sm:text-4xl">
          {value}
        </CardTitle>
      </CardHeader>
      <CardContent className="text-xs text-muted-foreground">{hint}</CardContent>
    </Card>
  );
}

function ProofRow({ proof }: { proof: LedgerProof }) {
  return (
    <TableRow className="border-white/10">
      <TableCell className="whitespace-nowrap text-silver-200">
        {formatPaidAt(proof.paidAt)}
      </TableCell>
      <TableCell>
        <a
          href={baseAddressUrl(config.baseExplorer, proof.payee)}
          target="_blank"
          rel="noreferrer"
          className="font-mono text-sm text-violet-200 hover:text-violet-100"
          title={proof.payee}
        >
          {shortenAddress(proof.payee)}
        </a>
      </TableCell>
      <TableCell className="text-right font-mono text-silver-50">
        {formatUsdc(proof.amountUSDC)}{" "}
        <span className="text-muted-foreground">USDC</span>
      </TableCell>
      <TableCell className="max-w-xs truncate text-silver-200" title={proof.memo}>
        {proof.memo || "—"}
      </TableCell>
      <TableCell className="text-right">
        <ProofExplorerLinks proof={proof} />
      </TableCell>
    </TableRow>
  );
}

function ProofCard({ proof }: { proof: LedgerProof }) {
  return (
    <Card className="border-white/10 bg-card/80">
      <CardContent className="space-y-3 pt-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs text-muted-foreground">{formatPaidAt(proof.paidAt)}</p>
            <p className="font-mono text-lg text-silver-50">{formatUsdc(proof.amountUSDC)} USDC</p>
          </div>
        </div>
        <a
          href={baseAddressUrl(config.baseExplorer, proof.payee)}
          target="_blank"
          rel="noreferrer"
          className="font-mono text-sm text-violet-200 hover:text-violet-100"
          title={proof.payee}
        >
          {shortenAddress(proof.payee)}
        </a>
        <p className="text-sm text-silver-200">{proof.memo || "No memo"}</p>
        <ProofExplorerLinks proof={proof} />
      </CardContent>
    </Card>
  );
}

