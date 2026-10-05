/**
 * On-chain memo convention for proofs whose payment did NOT happen on Base.
 *
 * The SettlementProofs contract has one free-form `memo` string and no
 * "source chain" field (same ABI on Arc and Tempo, no redeploy needed). For
 * Tempo payments the recorder prefixes the memo with a CAIP-2 chain id and the
 * TIP-20 token symbol so any reader (the public verifier, an auditor, a script)
 * knows where `srcTxHash` lives without trusting the recorder:
 *
 *   eip155:42431/AlphaUSD invoice-2026-10-001
 *   └─ chain ─┘ └token─┘ └─ operator note ─┘
 *
 * A memo without the prefix keeps the original meaning (Base USDC payment).
 *
 * Keep this file dependency-free: recorder/src/proof-memo.ts mirrors it and a
 * recorder test asserts both parse the same fixtures identically.
 */

export type ParsedProofMemo = {
  /** EVM chain id of the payment (srcTxHash) when tagged, else null (= Base USDC). */
  paymentChainId: number | null;
  /** Token symbol recorded at write time (e.g. "AlphaUSD"), else null. */
  tokenSymbol: string | null;
  /** Operator note with the tag stripped. */
  note: string;
};

const TAG = /^eip155:(\d{1,12})\/([A-Za-z0-9._-]{1,32})(?:\s+([\s\S]*))?$/;

/** Max operator note length kept on-chain for tagged memos. */
export const MAX_NOTE_LENGTH = 128;

export function formatProofMemo(args: {
  paymentChainId: number;
  tokenSymbol: string;
  note?: string;
}): string {
  const symbol = args.tokenSymbol.replace(/[^A-Za-z0-9._-]/g, "").slice(0, 32) || "TIP20";
  const note = (args.note ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_NOTE_LENGTH);
  const tag = `eip155:${args.paymentChainId}/${symbol}`;
  return note ? `${tag} ${note}` : tag;
}

export function parseProofMemo(memo: string): ParsedProofMemo {
  const match = TAG.exec(memo.trim());
  if (!match) {
    return { paymentChainId: null, tokenSymbol: null, note: memo };
  }
  return {
    paymentChainId: Number(match[1]),
    tokenSymbol: match[2] ?? null,
    note: (match[3] ?? "").trim(),
  };
}
