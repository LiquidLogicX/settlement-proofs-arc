import Link from "next/link";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import {
  explorerAddressUrl,
  explorerTxUrl,
  formatPaidAt,
  getNetwork,
  type NetworkId,
} from "@/lib/config";
import { paymentOf, type PaymentCheck, type PaymentInfo } from "@/lib/payments";
import type { LedgerProof } from "@/lib/proofs";

const CHECK_COPY: Record<PaymentCheck, { label: string; className: string }> = {
  matched: {
    label: "Payment re-checked on-chain",
    className: "border-llx-found-border text-llx-found-text",
  },
  mismatch: {
    label: "Payment not found on-chain",
    className: "border-destructive/60 text-destructive",
  },
  unavailable: {
    label: "Payment check unavailable (RPC)",
    className: "border-border text-muted-foreground",
  },
  synthetic: {
    label: "Synthetic demo — no real payment",
    className: "border-llx-selftest-border text-llx-selftest-text",
  },
};

export function PaymentCheckBadge({ payment }: { payment: PaymentInfo }) {
  const copy = CHECK_COPY[payment.check];
  return (
    <Badge variant="outline" className={`bg-transparent ${copy.className}`} title={
      payment.check === "matched"
        ? `The verifier fetched the ${payment.label} receipt and found a ${payment.tokenSymbol} Transfer to the payee for this exact amount.`
        : undefined
    }>
      {copy.label}
    </Badge>
  );
}

/** Chain chip, e.g. "Tempo · AlphaUSD" or "Base · USDC". */
export function ChainChip({ payment }: { payment: PaymentInfo }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs whitespace-nowrap text-foreground">
      <span className={payment.network === "tempo" ? "text-llx-link" : "text-muted-foreground"}>
        {payment.label}
      </span>
      <span className="text-muted-foreground">·</span>
      <span>{payment.tokenSymbol}</span>
    </span>
  );
}

/** Full field list for a proof: chain, amount source, payer → payee, payment tx, record tx. */
export function ProofFieldList({
  proof,
  networkId,
  refIdLink = false,
}: {
  proof: LedgerProof;
  networkId: NetworkId;
  refIdLink?: boolean;
}) {
  const network = getNetwork(networkId);
  const payment = paymentOf(proof, networkId);
  return (
    <dl className="grid gap-4 text-sm sm:grid-cols-2">
      <Field label="Settlement ID (refId)" mono full>
        {refIdLink ? (
          <Link
            href={`/proofs/${proof.refId}?network=${networkId}`}
            className="break-all text-llx-link hover:text-foreground"
          >
            {proof.refId}
          </Link>
        ) : (
          proof.refId
        )}
      </Field>
      <Field label="Payment chain">
        <span className="inline-flex flex-wrap items-center gap-2">
          <ChainChip payment={payment} />
          <span className="text-xs text-muted-foreground">eip155:{payment.chainId}</span>
        </span>
      </Field>
      <Field label="Proof recorded on">
        <span className="inline-flex flex-wrap items-center gap-2">
          <span>{network.label}</span>
          <span className="text-xs text-muted-foreground">{network.eip155}</span>
        </span>
      </Field>
      <Field label={`Payer (${payment.label})`}>
        {payment.payer ? (
          <a
            href={explorerAddressUrl(payment.explorer, payment.payer)}
            target="_blank"
            rel="noreferrer"
            className="break-all font-mono text-llx-link hover:text-foreground"
          >
            {payment.payer}
          </a>
        ) : (
          <span className="text-muted-foreground">
            {payment.check === "synthetic" ? "— (synthetic)" : "Not resolved"}
          </span>
        )}
      </Field>
      <Field label={`Payee (${payment.label})`}>
        <a
          href={explorerAddressUrl(payment.explorer, proof.payee)}
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
        {payment.note || "—"}
      </Field>
      <Field label={`${payment.label} payment tx (srcTxHash)`} mono full>
        <a
          href={explorerTxUrl(payment.explorer, proof.srcTxHash)}
          target="_blank"
          rel="noreferrer"
          className="break-all text-llx-link hover:text-foreground"
        >
          {proof.srcTxHash}
        </a>
        <span className="mt-2 block">
          <PaymentCheckBadge payment={payment} />
        </span>
      </Field>
      <Field label={`${network.shortLabel} proof record tx`} mono full>
        {proof.proofTxHash ? (
          <a
            href={explorerTxUrl(network.explorer, proof.proofTxHash)}
            target="_blank"
            rel="noreferrer"
            className="break-all text-llx-link hover:text-foreground"
          >
            {proof.proofTxHash}
          </a>
        ) : (
          <span className="text-muted-foreground">
            Not indexed from PaymentRecorded logs yet
            {network.settlementProofsAddress ? (
              <>
                {" · "}
                <a
                  href={explorerAddressUrl(network.explorer, network.settlementProofsAddress)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline text-llx-link hover:text-foreground"
                  style={{ overflowWrap: "normal", wordBreak: "normal" }}
                >
                  open registry on {network.shortLabel} explorer
                </a>
              </>
            ) : null}
          </span>
        )}
      </Field>
    </dl>
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
