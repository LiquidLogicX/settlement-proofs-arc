import assert from "node:assert/strict";
import { test } from "node:test";
import { BASE_TAB_TITLE, networkTabTitle } from "../src/lib/tab-title";

test("Tempo testnet and mainnet both show the Tempo tab title", () => {
  assert.equal(networkTabTitle("tempo"), "LLX Proofs · Tempo");
  assert.equal(networkTabTitle("tempo-mainnet"), "LLX Proofs · Tempo");
});

test("Arc and Base have their own tab titles", () => {
  assert.equal(networkTabTitle("arc"), "LLX Proofs · Arc");
  assert.equal(networkTabTitle("base"), "LLX Proofs · Base");
});

test("missing or unknown network falls back to the default title", () => {
  assert.equal(BASE_TAB_TITLE, "LLX Proofs");
  assert.equal(networkTabTitle(undefined), "LLX Proofs");
  assert.equal(networkTabTitle(null), "LLX Proofs");
  assert.equal(networkTabTitle(""), "LLX Proofs");
  assert.equal(networkTabTitle("solana"), "LLX Proofs");
});

test("repeated ?network= params use the first value", () => {
  assert.equal(networkTabTitle(["tempo", "arc"]), "LLX Proofs · Tempo");
});

test("old titles are gone and every title stays short enough for a Chrome tab", () => {
  for (const n of [undefined, "arc", "base", "tempo", "tempo-mainnet"]) {
    const t = networkTabTitle(n);
    assert.notEqual(t, "Settlement proofs on Arc");
    assert.doesNotMatch(t, /Settlement Proofs/);
    assert.ok(t.length <= 18, `${t} is ${t.length} chars`);
  }
});
