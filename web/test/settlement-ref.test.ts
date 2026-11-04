import assert from "node:assert/strict";
import { test } from "node:test";
import type { Hex } from "viem";
import {
  canonicalRefId,
  filterVerifiedProofs,
  ledgerRows,
  settlementRefMessage,
  usedRefIdsForSettlement,
  verifySettlementRef,
  type SettlementPayload,
} from "../src/lib/settlement-ref";

const SRC = "0x592d108234d07171b9dd3e43f0390ebbac989276bf53031522219e1ddfd8eb71" as Hex;
const PAYEE = "0xfd689a93346AA40D2F38dC2ab6Eb436A57AA45c7";
const AMOUNT = 12_500_000n;
const REF = "0x064a33b196b10c9f249165de66419d9daafb21616633ea15085d53e06d9dc14c" as Hex;
const OTHER = `0x${"22".repeat(32)}` as Hex;

const body: SettlementPayload = {
  refId: REF,
  payee: PAYEE,
  amountUSDC: AMOUNT,
  paidAt: 1_791_223_316,
  srcTxHash: SRC,
};

test("verifier accepts the refId bound into the payload", () => {
  assert.equal(canonicalRefId(SRC, PAYEE, AMOUNT), REF);
  const verdict = verifySettlementRef({
    claimedRefId: REF,
    payload: body,
    usedRefIds: new Set(),
  });
  assert.equal(verdict.ok, true);
});

test("verifier rejects a refId that does not match", () => {
  const verdict = verifySettlementRef({
    claimedRefId: OTHER,
    payload: body,
    usedRefIds: new Set(),
  });
  assert.equal(verdict.ok, false);
  if (!verdict.ok) {
    assert.equal(verdict.code, "REF_MISMATCH");
    assert.match(settlementRefMessage(verdict.code), /does not match/);
  }
});

test("verifier rejects a reused refId", () => {
  const used = new Set<string>();
  const first = verifySettlementRef({ claimedRefId: REF, payload: body, usedRefIds: used });
  assert.equal(first.ok, true);
  if (first.ok) used.add(first.refId.toLowerCase());
  const replay = verifySettlementRef({ claimedRefId: REF, payload: body, usedRefIds: used });
  assert.equal(replay.ok, false);
  if (!replay.ok) {
    assert.equal(replay.code, "REF_REUSED");
    assert.match(settlementRefMessage(replay.code), /replayed/);
  }
  assert.equal(filterVerifiedProofs([body, body]).length, 1);
});

test("ledger keeps a caller-chosen refId and labels it legacy", () => {
  const legacy = { ...body, refId: OTHER };
  const rows = ledgerRows([body, legacy, body]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0]?.legacy, false);
  assert.equal(rows[1]?.legacy, true);
  assert.equal(rows[1]?.refId, OTHER);
});

test("an indexed legacy proof makes the canonical refId count as reused", () => {
  const legacy = { ...body, refId: OTHER };
  const used = usedRefIdsForSettlement([legacy], {
    srcTxHash: body.srcTxHash,
    payee: body.payee,
    amountUSDC: body.amountUSDC,
  });
  const verdict = verifySettlementRef({ claimedRefId: REF, payload: body, usedRefIds: used });
  assert.equal(verdict.ok, false);
  if (!verdict.ok) assert.equal(verdict.code, "REF_REUSED");
});
