/**
 * Settlement refId binding and replay checks.
 *
 * `refId` is `keccak256(abi.encodePacked(srcTxHash, payee, amountUSDC))` and is
 * also a field of `settlementPayloadHash` (`keccak256(abi.encode(...))`).
 * A verifier must reject a refId that does not match that payload, and a
 * refId that was already accepted.
 *
 * recorder/src/settlement-ref.ts mirrors this file. Keep the behavior identical.
 */
import {
  type Address,
  type Hex,
  encodeAbiParameters,
  encodePacked,
  getAddress,
  keccak256,
  parseAbiParameters,
} from "viem";

export type SettlementRefCode = "REF_MISMATCH" | "REF_REUSED";

export type SettlementPayload = {
  refId: Hex;
  payee: string;
  amountUSDC: bigint;
  paidAt: bigint | number;
  srcTxHash: Hex;
};

export type SettlementRefVerdict =
  | { ok: true; refId: Hex; payloadHash: Hex }
  | { ok: false; code: SettlementRefCode; refId: Hex; expectedRefId: Hex };

function norm(hex: string): Hex {
  return hex.toLowerCase() as Hex;
}

/** refId = keccak256(abi.encodePacked(srcTxHash, payee, amountUSDC)). Amount is 6-dec units. */
export function canonicalRefId(srcTxHash: Hex, payee: Address | string, amountUSDC: bigint): Hex {
  return keccak256(
    encodePacked(["bytes32", "address", "uint256"], [srcTxHash, getAddress(payee), amountUSDC]),
  );
}

/**
 * keccak256(abi.encode(refId, payee, amountUSDC, paidAt, srcTxHash)).
 * refId is inside the encoded payload, so a different id produces a different hash.
 */
export function settlementPayloadHash(payload: SettlementPayload): Hex {
  return keccak256(
    encodeAbiParameters(parseAbiParameters("bytes32, address, uint256, uint64, bytes32"), [
      payload.refId,
      getAddress(payload.payee),
      payload.amountUSDC,
      BigInt(payload.paidAt),
      payload.srcTxHash,
    ]),
  );
}

/**
 * Accept a settlement only when:
 * - the claimed refId equals the refId inside the hashed payload
 * - that refId equals the canonical payment hash
 * - a presented payload hash equals the recomputed hash
 * - the refId is not already in `usedRefIds` (replay)
 */
export function verifySettlementRef(args: {
  claimedRefId: Hex;
  payload: SettlementPayload;
  payloadHash?: Hex;
  usedRefIds: ReadonlySet<string>;
}): SettlementRefVerdict {
  let expectedRefId: Hex;
  let payloadHash: Hex;
  try {
    expectedRefId = canonicalRefId(args.payload.srcTxHash, args.payload.payee, args.payload.amountUSDC);
    payloadHash = settlementPayloadHash(args.payload);
  } catch {
    return {
      ok: false,
      code: "REF_MISMATCH",
      refId: norm(args.claimedRefId),
      expectedRefId: `0x${"00".repeat(32)}`,
    };
  }

  const claimed = norm(args.claimedRefId);
  const payloadRef = norm(args.payload.refId);
  const presentedHashDiffers =
    args.payloadHash !== undefined && norm(args.payloadHash) !== norm(payloadHash);
  if (claimed !== payloadRef || payloadRef !== norm(expectedRefId) || presentedHashDiffers) {
    return { ok: false, code: "REF_MISMATCH", refId: claimed, expectedRefId };
  }
  if (args.usedRefIds.has(claimed)) {
    return { ok: false, code: "REF_REUSED", refId: claimed, expectedRefId };
  }
  return { ok: true, refId: expectedRefId, payloadHash };
}

/** Check a recorded proof: its own refId is the claimed id and the payload id. */
export function verifyRecordedProof(
  proof: SettlementPayload,
  usedRefIds: ReadonlySet<string>,
): SettlementRefVerdict {
  return verifySettlementRef({
    claimedRefId: proof.refId,
    payload: proof,
    usedRefIds,
  });
}

/** Keep proofs whose refId is bound and drop a later row that reuses a refId. */
export function filterVerifiedProofs<T extends SettlementPayload>(proofs: readonly T[]): T[] {
  const used = new Set<string>();
  const accepted: T[] = [];
  for (const proof of proofs) {
    const verdict = verifyRecordedProof(proof, used);
    if (!verdict.ok) continue;
    used.add(verdict.refId.toLowerCase());
    accepted.push(proof);
  }
  return accepted;
}

/** True when `refId` was caller-chosen and is not the payment hash. Malformed rows count as legacy. */
export function isLegacySettlementRef(proof: SettlementPayload): boolean {
  try {
    return (
      canonicalRefId(proof.srcTxHash, proof.payee, proof.amountUSDC).toLowerCase() !==
      proof.refId.toLowerCase()
    );
  } catch {
    return true;
  }
}

/**
 * Rows for the public ledger. A later copy of a refId is a replay and is dropped.
 * A caller-chosen refId stays, with `legacy: true`, so older proofs remain visible.
 * On-chain `proofCount` / `totalSettled` already include those rows.
 */
export function ledgerRows<T extends SettlementPayload>(
  proofs: readonly T[],
): Array<T & { legacy: boolean }> {
  const seen = new Set<string>();
  const rows: Array<T & { legacy: boolean }> = [];
  for (const proof of proofs) {
    const id = proof.refId.toLowerCase();
    if (seen.has(id)) continue;
    seen.add(id);
    rows.push({ ...proof, legacy: isLegacySettlementRef(proof) });
  }
  return rows;
}

function sameSettlement(
  proof: SettlementPayload,
  candidate: { srcTxHash: string; payee: string; amountUSDC: bigint },
): boolean {
  return (
    proof.srcTxHash.toLowerCase() === candidate.srcTxHash.toLowerCase() &&
    proof.payee.toLowerCase() === candidate.payee.toLowerCase() &&
    BigInt(proof.amountUSDC) === BigInt(candidate.amountUSDC)
  );
}

/**
 * Ref ids already stored on the registry index (`getProofAt`).
 * If any stored row is this same payment, the canonical refId is included as
 * well, so a second record is `REF_REUSED` even when the first id was caller-chosen.
 */
export function usedRefIdsForSettlement(
  indexed: readonly SettlementPayload[],
  candidate: { srcTxHash: Hex; payee: string; amountUSDC: bigint },
): Set<string> {
  const used = new Set<string>();
  let canonical: Hex | null = null;
  try {
    canonical = canonicalRefId(candidate.srcTxHash, candidate.payee, candidate.amountUSDC);
  } catch {
    canonical = null;
  }
  for (const proof of indexed) {
    used.add(proof.refId.toLowerCase());
    if (canonical && sameSettlement(proof, candidate)) used.add(canonical.toLowerCase());
  }
  return used;
}

export function settlementRefMessage(code: SettlementRefCode): string {
  if (code === "REF_REUSED") {
    return "This settlement refId was already used and cannot be replayed.";
  }
  return "This settlement refId does not match the hashed payload.";
}
