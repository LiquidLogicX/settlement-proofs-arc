import assert from "node:assert/strict";
import { test } from "node:test";
import {
  type Address,
  type Hex,
  encodeAbiParameters,
  keccak256,
  pad,
  stringToHex,
} from "viem";
import { findPaymentTransfer } from "../src/lib/payments";
import {
  isAllowlistedTempoToken,
  tempoLedgerAllowlist,
  tempoLedgerTokenSymbol,
} from "../src/lib/tempo-tokens";

const PAYER = "0x5eA5bE7aDf358fB239037406c55016ac8aB01f49" as Address;
const PAYEE = "0xfd689a93346AA40D2F38dC2ab6Eb436A57AA45c7" as Address;
const ALPHA = "0x20C0000000000000000000000000000000000001" as Address;
const USDCE = "0x20C000000000000000000000b9537d11c60E8b50" as Address;
const STRANGER = "0x20C0000000000000000000000000000000000099" as Address;
const TRANSFER_TOPIC = keccak256(stringToHex("Transfer(address,address,uint256)"));

function transferLog(token: Address, amount: bigint) {
  return {
    address: token,
    topics: [TRANSFER_TOPIC, pad(PAYER), pad(PAYEE)] as Hex[],
    data: encodeAbiParameters([{ type: "uint256" }], [amount]),
  };
}

test("Tempo testnet ledger allowlist is the four Moderato stablecoins", () => {
  assert.equal(tempoLedgerAllowlist("tempo").size, 4);
  assert.equal(isAllowlistedTempoToken("tempo", ALPHA), true);
  assert.equal(tempoLedgerTokenSymbol("tempo", ALPHA), "AlphaUSD");
  assert.equal(isAllowlistedTempoToken("tempo", STRANGER), false);
  assert.equal(isAllowlistedTempoToken("tempo-mainnet", ALPHA), false);
});

test("Tempo mainnet ledger allowlist is USDC.e and pathUSD", () => {
  assert.equal(isAllowlistedTempoToken("tempo-mainnet", USDCE), true);
  assert.equal(tempoLedgerTokenSymbol("tempo-mainnet", USDCE), "USDC.e");
  assert.equal(isAllowlistedTempoToken("tempo-mainnet", "0x20C0000000000000000000000000000000000000"), true);
  assert.equal(isAllowlistedTempoToken("tempo", USDCE), false);
});

test("payment re-check matches only an allowlisted TIP-20, not every 0x20c0 prefix", () => {
  const amount = 1_000_000n;
  const ok = findPaymentTransfer([transferLog(ALPHA, amount)], "tempo", PAYEE, amount);
  assert.ok(ok);
  assert.equal(ok?.token, ALPHA);

  const blocked = findPaymentTransfer([transferLog(STRANGER, amount)], "tempo", PAYEE, amount);
  assert.equal(blocked, null);

  const mainnet = findPaymentTransfer([transferLog(USDCE, amount)], "tempo-mainnet", PAYEE, amount);
  assert.equal(mainnet?.token, USDCE);

  const alphaOnMainnet = findPaymentTransfer([transferLog(ALPHA, amount)], "tempo-mainnet", PAYEE, amount);
  assert.equal(alphaOnMainnet, null);
});
