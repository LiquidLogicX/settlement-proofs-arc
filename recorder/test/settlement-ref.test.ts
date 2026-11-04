import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Hex } from "viem";
import {
  canonicalRefId,
  filterVerifiedProofs,
  settlementPayloadHash,
  verifySettlementRef,
  type SettlementPayload,
} from "../src/settlement-ref.js";
// The verifier ships its own copy (no shared package). Both must agree.
import * as web from "../../web/src/lib/settlement-ref.js";

const SRC = "0x592d108234d07171b9dd3e43f0390ebbac989276bf53031522219e1ddfd8eb71" as Hex;
const PAYEE = "0xfd689a93346AA40D2F38dC2ab6Eb436A57AA45c7";
const AMOUNT = 12_500_000n;
const PAID_AT = 1_791_223_316;
const REF = "0x064a33b196b10c9f249165de66419d9daafb21616633ea15085d53e06d9dc14c" as Hex;
const PAYLOAD_HASH = "0xf98bb56636fb2c50fd25c1aff908af054bf7ddd29232fc4bf70c6de243d34970" as Hex;
const OTHER = `0x${"11".repeat(32)}` as Hex;

function payload(over: Partial<SettlementPayload> = {}): SettlementPayload {
  return {
    refId: REF,
    payee: PAYEE,
    amountUSDC: AMOUNT,
    paidAt: PAID_AT,
    srcTxHash: SRC,
    ...over,
  };
}

describe("settlement refId binding", () => {
  it("binds refId into the hashed payload and matches the live proof vector", () => {
    assert.equal(canonicalRefId(SRC, PAYEE, AMOUNT), REF);
    const hash = settlementPayloadHash(payload());
    assert.equal(hash, PAYLOAD_HASH);
    const swapped = settlementPayloadHash(payload({ refId: OTHER }));
    assert.notEqual(swapped, hash);
  });

  it("accepts a claimed refId that matches the payload", () => {
    const verdict = verifySettlementRef({
      claimedRefId: REF.toUpperCase() as Hex,
      payload: payload(),
      payloadHash: PAYLOAD_HASH,
      usedRefIds: new Set(),
    });
    assert.equal(verdict.ok, true);
    if (verdict.ok) assert.equal(verdict.payloadHash, PAYLOAD_HASH);
  });

  it("rejects a claimed refId that does not match the payload", () => {
    const verdict = verifySettlementRef({
      claimedRefId: OTHER,
      payload: payload(),
      usedRefIds: new Set(),
    });
    assert.equal(verdict.ok, false);
    if (!verdict.ok) {
      assert.equal(verdict.code, "REF_MISMATCH");
      assert.equal(verdict.expectedRefId, REF);
    }
  });

  it("rejects a payload whose refId is not the canonical payment hash", () => {
    const verdict = verifySettlementRef({
      claimedRefId: OTHER,
      payload: payload({ refId: OTHER }),
      usedRefIds: new Set(),
    });
    assert.equal(verdict.ok, false);
    if (!verdict.ok) assert.equal(verdict.code, "REF_MISMATCH");
  });

  it("rejects a presented hash that was not computed over this refId", () => {
    const verdict = verifySettlementRef({
      claimedRefId: REF,
      payload: payload(),
      payloadHash: settlementPayloadHash(payload({ refId: OTHER })),
      usedRefIds: new Set(),
    });
    assert.equal(verdict.ok, false);
    if (!verdict.ok) assert.equal(verdict.code, "REF_MISMATCH");
  });

  it("rejects a reused refId", () => {
    const used = new Set<string>([REF.toLowerCase()]);
    const verdict = verifySettlementRef({
      claimedRefId: REF,
      payload: payload(),
      usedRefIds: used,
    });
    assert.equal(verdict.ok, false);
    if (!verdict.ok) assert.equal(verdict.code, "REF_REUSED");
  });

  it("drops a replayed refId and an unbound refId from a proof list", () => {
    const secondSrc = `0x${"ab".repeat(32)}` as Hex;
    const secondRef = canonicalRefId(secondSrc, PAYEE, 1n);
    const accepted = filterVerifiedProofs([
      payload(),
      payload(),
      payload({ refId: OTHER, srcTxHash: secondSrc, amountUSDC: 1n }),
      payload({ refId: secondRef, srcTxHash: secondSrc, amountUSDC: 1n }),
    ]);
    assert.equal(accepted.length, 2);
    assert.equal(accepted[0]?.refId, REF);
    assert.equal(accepted[1]?.refId, secondRef);
  });

  it("web verifier copy agrees on the live vector", () => {
    assert.equal(web.canonicalRefId(SRC, PAYEE, AMOUNT), canonicalRefId(SRC, PAYEE, AMOUNT));
    assert.equal(web.settlementPayloadHash(payload()), settlementPayloadHash(payload()));
    const args = {
      claimedRefId: OTHER,
      payload: payload(),
      usedRefIds: new Set<string>(),
    };
    assert.deepEqual(web.verifySettlementRef(args), verifySettlementRef(args));
    const replay = { ...args, claimedRefId: REF, usedRefIds: new Set([REF.toLowerCase()]) };
    assert.deepEqual(web.verifySettlementRef(replay), verifySettlementRef(replay));
  });
});
