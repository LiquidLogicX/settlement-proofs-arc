import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Address, Hex } from "viem";
import { createApp, resolveRailId } from "../src/app.js";
import { deriveRefId, type Proof } from "../src/arc.js";
import { loadConfig } from "../src/config.js";
import { parseErc20UsdcAmount, type Erc20UsdcAmount } from "../src/decimals.js";
import { formatProofMemo } from "../src/proof-memo.js";
import { tempoVerifierNetwork, type Rail, type RailId, type VerifiedPayment, type WriteArgs } from "../src/rails.js";

const KEY = "test-key";
const PAYER = "0x5eA5bE7aDf358fB239037406c55016ac8aB01f49" as Address;
const PAYEE = "0xfd689a93346AA40D2F38dC2ab6Eb436A57AA45c7" as Address;
const PAY_TX = "0x592d108234d07171b9dd3e43f0390ebbac989276bf53031522219e1ddfd8eb71" as Hex;
const PROOF_TX = "0xa74d1f33a90c39e7886dfdff5897081bf948b7315b38340f453bd9d742272dda" as Hex;
const REGISTRY = "0x2ec4CF47e6964b33FEd3718f07885ed44aF52c0b" as Address;

/** In-memory rail that behaves like the Tempo rail (verify → memo → write). */
function fakeTempoRail(opts: { lowGas?: boolean; amountOnChain?: bigint } = {}) {
  const store = new Map<string, Proof>();
  const writes: WriteArgs[] = [];
  const rail: Rail = {
    id: "tempo",
    label: "Tempo → Tempo",
    payment: { network: "tempo", chainId: 42431, explorer: "https://explore.testnet.tempo.xyz" },
    registry: { network: "tempo", chainId: 42431, address: REGISTRY, explorer: "https://explore.testnet.tempo.xyz" },
    recorderAddress: "0xc300c1092b949bCE55E7d0B0d86Cb733d03fA114",
    minConfirmations: 1,
    async readProof(refId) {
      return store.get(refId.toLowerCase()) ?? null;
    },
    async verifyPayment({ amountUSDC }): Promise<VerifiedPayment> {
      const onChain = opts.amountOnChain ?? 12_500_000n;
      if ((amountUSDC as bigint) !== onChain) {
        throw Object.assign(new Error("TIP-20 stablecoin Transfer to payee/amount did not match on Tempo"), {
          status: 400,
          code: "TIP20_AMOUNT_UNVERIFIED",
        });
      }
      return {
        chainId: 42431,
        blockTimestamp: 1_791_223_316n,
        payer: PAYER,
        token: "0x20C0000000000000000000000000000000000001",
        tokenSymbol: "AlphaUSD",
        transferMemo: "INV-2026-1001",
      };
    },
    validateNote: () => null,
    buildMemo: (note, p) =>
      formatProofMemo({ paymentChainId: p.chainId, tokenSymbol: p.tokenSymbol, note: note || p.transferMemo || "" }),
    async assertCanWrite() {
      if (opts.lowGas) throw Object.assign(new Error("low"), { status: 503, code: "LOW_GAS_BALANCE" });
    },
    async writeProof(args) {
      writes.push(args);
      store.set(args.refId.toLowerCase(), {
        refId: args.refId,
        payee: args.payee,
        amountUSDC: args.amountUSDC,
        paidAt: args.paidAt,
        srcTxHash: args.srcTxHash,
        memo: args.memo,
        recordedAt: 1_791_223_318,
      });
      return PROOF_TX;
    },
    async findProofId(refId) {
      return store.has(refId.toLowerCase()) ? store.size : null;
    },
    async findProofTxHash(refId) {
      return store.has(refId.toLowerCase()) ? PROOF_TX : null;
    },
    async health() {
      return { rail: "tempo", lowGas: Boolean(opts.lowGas) };
    },
  };
  return { rail, writes, store };
}

function app(rails: Partial<Record<RailId, Rail>>) {
  return createApp({
    rails,
    recorderApiKey: KEY,
    verifierBaseUrl: "https://proofs.liquidlogicx.com",
    quiet: true,
  });
}

function post(a: ReturnType<typeof app>, path: string, body: unknown, key = KEY) {
  return a.request(path, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
  });
}

const body = { txHash: PAY_TX, payee: PAYEE, amountUSDC: "12500000" };

describe("POST /v1/tempo/proofs — Tempo payment in, Tempo proof out", () => {
  it("verifies the TIP-20 payment, writes a tagged proof, returns links", async () => {
    const { rail, writes } = fakeTempoRail();
    const res = await post(app({ tempo: rail }), "/v1/tempo/proofs", { ...body, memo: "Design retainer" });
    assert.equal(res.status, 201);
    const json = (await res.json()) as Record<string, any>;
    const refId = deriveRefId(PAY_TX, PAYEE, parseErc20UsdcAmount("12500000"));
    assert.equal(json.rail, "tempo");
    assert.equal(json.idempotent, false);
    assert.equal(json.proof.refId, refId);
    assert.equal(json.proof.memo, "eip155:42431/AlphaUSD Design retainer");
    assert.equal(json.proof.paidAt, 1_791_223_316, "paidAt defaults to the Tempo block time");
    assert.equal(json.payment.chain, "eip155:42431");
    assert.equal(json.payment.payer, PAYER);
    assert.equal(json.payment.tokenSymbol, "AlphaUSD");
    assert.equal(json.payment.transferMemo, "INV-2026-1001");
    assert.equal(json.payment.explorerUrl, `https://explore.testnet.tempo.xyz/tx/${PAY_TX}`);
    assert.equal(json.registry.txHash, PROOF_TX);
    assert.equal(json.registry.contract, REGISTRY);
    assert.equal(json.verifyUrl, `https://proofs.liquidlogicx.com/proofs/${refId}?network=tempo`);
    assert.equal(writes.length, 1);
  });

  it("falls back to the on-chain TIP-20 memo when no note is given", async () => {
    const { rail } = fakeTempoRail();
    const res = await post(app({ tempo: rail }), "/v1/tempo/proofs", body);
    const json = (await res.json()) as Record<string, any>;
    assert.equal(json.proof.memo, "eip155:42431/AlphaUSD INV-2026-1001");
  });

  it("same payment twice → 200 idempotent, no second write", async () => {
    const { rail, writes } = fakeTempoRail();
    const a = app({ tempo: rail });
    assert.equal((await post(a, "/v1/tempo/proofs", body)).status, 201);
    const again = await post(a, "/v1/tempo/proofs", body);
    assert.equal(again.status, 200);
    assert.equal(((await again.json()) as { idempotent: boolean }).idempotent, true);
    assert.equal(writes.length, 1);
  });

  it("amount mismatch → 400 and nothing recorded", async () => {
    const { rail, writes } = fakeTempoRail({ amountOnChain: 1n });
    const res = await post(app({ tempo: rail }), "/v1/tempo/proofs", body);
    assert.equal(res.status, 400);
    assert.equal(((await res.json()) as { code: string }).code, "TIP20_AMOUNT_UNVERIFIED");
    assert.equal(writes.length, 0);
  });

  it("low recorder fee balance → 503 before writing", async () => {
    const { rail, writes } = fakeTempoRail({ lowGas: true });
    const res = await post(app({ tempo: rail }), "/v1/tempo/proofs", body);
    assert.equal(res.status, 503);
    assert.equal(writes.length, 0);
  });

  it("requires the API key", async () => {
    const { rail } = fakeTempoRail();
    assert.equal((await post(app({ tempo: rail }), "/v1/tempo/proofs", body, "nope")).status, 401);
  });

  it("POST /v1/proofs with chain=tempo is equivalent", async () => {
    const { rail } = fakeTempoRail();
    const res = await post(app({ tempo: rail }), "/v1/proofs", { ...body, chain: "tempo" });
    assert.equal(res.status, 201);
  });

  it("chain=base on a Tempo-only recorder → 400 BAD_CHAIN", async () => {
    const { rail } = fakeTempoRail();
    const res = await post(app({ tempo: rail }), "/v1/proofs", { ...body, chain: "base" });
    assert.equal(res.status, 400);
    assert.equal(((await res.json()) as { code: string }).code, "BAD_CHAIN");
  });

  it("lookup by txHash/payee/amount with chain=tempo", async () => {
    const { rail } = fakeTempoRail();
    const a = app({ tempo: rail });
    await post(a, "/v1/tempo/proofs", body);
    const res = await a.request(
      `/v1/proofs/lookup?chain=tempo&txHash=${PAY_TX}&payee=${PAYEE}&amountUSDC=12500000`,
      { headers: { "x-api-key": KEY } },
    );
    assert.equal(res.status, 200);
    const json = (await res.json()) as Record<string, any>;
    assert.equal(json.found, true);
    assert.equal(json.registry.txHash, PROOF_TX);
  });
});

describe("Tempo mainnet verifyUrl", () => {
  it("mainnet chain 4217 links to the Tempo mainnet verifier tab; testnet keeps ?network=tempo", () => {
    assert.equal(tempoVerifierNetwork(4217), "tempo-mainnet");
    assert.equal(tempoVerifierNetwork(42431), "tempo");
  });

  it("verifyUrl uses registry.verifierNetwork when set", async () => {
    const { rail } = fakeTempoRail();
    const mainnetRail: Rail = {
      ...rail,
      registry: { ...rail.registry, chainId: 4217, verifierNetwork: "tempo-mainnet" },
    };
    const res = await post(app({ tempo: mainnetRail }), "/v1/tempo/proofs", body);
    assert.equal(res.status, 201);
    const json = (await res.json()) as Record<string, any>;
    const refId = deriveRefId(PAY_TX, PAYEE, parseErc20UsdcAmount("12500000"));
    assert.equal(json.verifyUrl, `https://proofs.liquidlogicx.com/proofs/${refId}?network=tempo-mainnet`);
    assert.equal(json.registry.network, "tempo", "API field stays the rail id");
  });
});

describe("rail selection", () => {
  const tempo = fakeTempoRail().rail;
  const arc = { ...tempo, id: "arc" } as Rail;
  it("defaults to Arc when configured (backwards compatible), else Tempo", () => {
    assert.equal(resolveRailId(undefined, { arc, tempo }), "arc");
    assert.equal(resolveRailId(undefined, { tempo }), "tempo");
  });
  it("accepts CAIP-2 ids", () => {
    assert.equal(resolveRailId("eip155:42431", { tempo }), "tempo");
    assert.equal(resolveRailId("eip155:8453", { arc }), "arc");
  });
  it("rejects unknown chains", () => {
    assert.ok(typeof resolveRailId("solana", { arc, tempo }) !== "string");
  });
});

describe("loadConfig rails", () => {
  const K1 = `0x${"11".repeat(32)}`;
  const K2 = `0x${"22".repeat(32)}`;
  const arcEnv = {
    BASE_RPC_URL: "https://mainnet.base.org",
    ARC_RPC_URL: "https://rpc.mainnet.arc.io",
    SETTLEMENT_PROOFS_ADDRESS: "0x1de52cbc4490a7873ef007e51cb91a5b374facb1",
    SETTLEMENT_RECORDER_PRIVATE_KEY: K1,
    RECORDER_API_KEY: KEY,
  };
  const tempoEnv = {
    TEMPO_SETTLEMENT_PROOFS_ADDRESS: REGISTRY,
    TEMPO_RECORDER_PRIVATE_KEY: K2,
    RECORDER_API_KEY: KEY,
  };

  it("existing Arc-only env still loads unchanged", () => {
    const cfg = loadConfig(arcEnv);
    assert.ok(cfg.arc);
    assert.equal(cfg.tempo, null);
    assert.equal(cfg.arc.minConfirmations, 12);
  });

  it("Tempo-only env loads with Moderato defaults", () => {
    const cfg = loadConfig(tempoEnv);
    assert.equal(cfg.arc, null);
    assert.ok(cfg.tempo);
    assert.equal(cfg.tempo.rpcUrl, "https://rpc.moderato.tempo.xyz");
    assert.equal(cfg.tempo.minConfirmations, 1);
    assert.equal(cfg.tempo.allowMainnet, false);
    assert.equal(cfg.tempo.tokens.size, 4);
  });

  it("both rails together", () => {
    const cfg = loadConfig({ ...arcEnv, ...tempoEnv });
    assert.ok(cfg.arc && cfg.tempo);
  });

  it("Tempo mainnet env (Render switch-over) leaves the Arc rail config identical", () => {
    const mainnetEnv = {
      TEMPO_SETTLEMENT_PROOFS_ADDRESS: "0x9940a8fE88f8BE0bB8E05686631Fd638DC1DfE6A",
      TEMPO_RECORDER_PRIVATE_KEY: K2,
      TEMPO_RPC_URL: "https://rpc.tempo.xyz",
      TEMPO_EXPLORER: "https://explore.tempo.xyz",
      TEMPO_ALLOW_MAINNET: "true",
      TEMPO_FEE_TOKEN: "0x20C000000000000000000000b9537d11c60E8b50",
      TEMPO_ALLOWED_TOKENS:
        "0x20C000000000000000000000b9537d11c60E8b50:USDC.e,0x20C0000000000000000000000000000000000000:pathUSD",
      TEMPO_MIN_RECORDER_FEE_BALANCE: "50000",
      TEMPO_MIN_CONFIRMATIONS: "1",
    };
    const arcOnly = loadConfig(arcEnv);
    const both = loadConfig({ ...arcEnv, ...mainnetEnv });
    assert.deepEqual(both.arc, arcOnly.arc);
    assert.ok(both.tempo);
    assert.equal(both.tempo.allowMainnet, true);
    assert.equal(both.tempo.rpcUrl, "https://rpc.tempo.xyz");
    assert.equal(both.tempo.feeToken, "0x20C000000000000000000000b9537d11c60E8b50");
    assert.equal(both.tempo.tokens.get("0x20c000000000000000000000b9537d11c60e8b50")?.symbol, "USDC.e");
    assert.equal(both.tempo.tokens.size, 2);
  });

  it("refuses to reuse the Arc recorder key on Tempo", () => {
    assert.throws(
      () => loadConfig({ ...arcEnv, ...tempoEnv, TEMPO_RECORDER_PRIVATE_KEY: K1 }),
      /must differ/,
    );
  });

  it("partial Tempo env is an error, not a silent skip", () => {
    assert.throws(
      () => loadConfig({ RECORDER_API_KEY: KEY, TEMPO_SETTLEMENT_PROOFS_ADDRESS: REGISTRY }),
      /TEMPO_RECORDER_PRIVATE_KEY/,
    );
  });

  it("no rail at all is an error", () => {
    assert.throws(() => loadConfig({ RECORDER_API_KEY: KEY }), /No rail configured/);
  });

  it("still rejects confidentiality / bypass env", () => {
    assert.throws(() => loadConfig({ ...tempoEnv, ALLOW_UNVERIFIED_AMOUNT: "1" }), /not supported/);
  });
});

describe("Arc rail note guard", () => {
  it("an operator cannot spoof a Tempo tag on a Base→Arc proof", async () => {
    const { rail } = fakeTempoRail();
    const arcLike: Rail = {
      ...rail,
      id: "arc",
      validateNote: (note) => (note.startsWith("eip155:") ? "reserved" : null),
    };
    const res = await post(app({ arc: arcLike }), "/v1/proofs", {
      ...body,
      memo: "eip155:42431/AlphaUSD fake",
    });
    assert.equal(res.status, 400);
  });
});

// Keep the Erc20UsdcAmount import used for type-level clarity.
export type _Amount = Erc20UsdcAmount;
