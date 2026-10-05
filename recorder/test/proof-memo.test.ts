import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatProofMemo, parseProofMemo } from "../src/proof-memo.js";
// The verifier ships its own copy (no shared package). Both must agree.
import * as web from "../../web/src/lib/proof-memo.js";

const FIXTURES = [
  "eip155:42431/AlphaUSD Design retainer, Oct",
  "eip155:42431/pathUSD",
  "eip155:4217/USDC.e  spaced   note ",
  "llx-self-test-0.001",
  "",
  "eip155:/broken",
  "eip155:42431 AlphaUSD missing slash",
];

describe("proof memo convention", () => {
  it("round-trips chain + token + note", () => {
    const memo = formatProofMemo({ paymentChainId: 42431, tokenSymbol: "AlphaUSD", note: "INV 1" });
    assert.equal(memo, "eip155:42431/AlphaUSD INV 1");
    assert.deepEqual(parseProofMemo(memo), {
      paymentChainId: 42431,
      tokenSymbol: "AlphaUSD",
      note: "INV 1",
    });
  });

  it("untagged memos keep their original meaning (Base USDC)", () => {
    assert.deepEqual(parseProofMemo("llx-self-test-0.001"), {
      paymentChainId: null,
      tokenSymbol: null,
      note: "llx-self-test-0.001",
    });
  });

  it("sanitizes symbol, collapses whitespace, caps note length", () => {
    const memo = formatProofMemo({
      paymentChainId: 42431,
      tokenSymbol: "Al pha$USD",
      note: `a\n\n b ${"x".repeat(500)}`,
    });
    const parsed = parseProofMemo(memo);
    assert.equal(parsed.tokenSymbol, "AlphaUSD");
    assert.ok(parsed.note.startsWith("a b "));
    assert.ok(parsed.note.length <= 128);
  });

  it("web verifier copy parses every fixture identically", () => {
    for (const memo of FIXTURES) {
      assert.deepEqual(web.parseProofMemo(memo), parseProofMemo(memo), memo);
    }
  });
});
