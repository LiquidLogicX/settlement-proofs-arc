import assert from "node:assert/strict";
import { test } from "node:test";
import { BASE_TAB_TITLE, networkTabTitle } from "../src/lib/tab-title";

test("Tempo testnet and mainnet both show the Tempo tab title", () => {
  assert.equal(networkTabTitle("tempo"), "LLX Settlement Proofs · Tempo");
  assert.equal(networkTabTitle("tempo-mainnet"), "LLX Settlement Proofs · Tempo");
});

test("Arc and Base have their own tab titles", () => {
  assert.equal(networkTabTitle("arc"), "LLX Settlement Proofs · Arc");
  assert.equal(networkTabTitle("base"), "LLX Settlement Proofs · Base");
});

test("missing or unknown network falls back to the default title", () => {
  assert.equal(BASE_TAB_TITLE, "LLX Settlement Proofs");
  assert.equal(networkTabTitle(undefined), "LLX Settlement Proofs");
  assert.equal(networkTabTitle(null), "LLX Settlement Proofs");
  assert.equal(networkTabTitle(""), "LLX Settlement Proofs");
  assert.equal(networkTabTitle("solana"), "LLX Settlement Proofs");
});

test("repeated ?network= params use the first value", () => {
  assert.equal(networkTabTitle(["tempo", "arc"]), "LLX Settlement Proofs · Tempo");
});

test("old static title is gone", () => {
  for (const n of [undefined, "arc", "base", "tempo", "tempo-mainnet"]) {
    assert.notEqual(networkTabTitle(n), "Settlement proofs on Arc");
  }
});
