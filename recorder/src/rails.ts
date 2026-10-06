/**
 * A "rail" = where the payment is verified + where the proof is written.
 *
 *   arc   : USDC Transfer on Base (8453)        → SettlementProofs on Arc
 *   tempo : TIP-20 stablecoin Transfer on Tempo → SettlementProofs on Tempo
 *
 * Both rails share the contract ABI, refId derivation, idempotency, and the
 * "unmatched amounts are never recorded" rule. app.ts only talks to this
 * interface, so tests can drive the HTTP API with fake rails.
 */
import { type Address, type Hex, createPublicClient, http } from "viem";
import {
  arcChainFromId,
  createArcClients,
  readProof,
  readRecorderNativeGasBalance,
  writeProof,
  type Proof,
} from "./arc.js";
import { createBaseClient, verifyBasePayment } from "./base.js";
import type { ArcRailConfig, TempoRailConfig } from "./config.js";
import { ARC_ERC20_USDC_DECIMALS, ARC_NATIVE_USDC_DECIMALS, type Erc20UsdcAmount } from "./decimals.js";
import { isGasLow, lowGasError } from "./gas-guard.js";
import { type ArcReader, findProofId, findProofTxHash } from "./proof-lookup.js";
import { formatProofMemo, parseProofMemo } from "./proof-memo.js";
import {
  TEMPO_MAINNET_CHAIN_ID,
  createTempoClients,
  describeTransferMemo,
  lowFeeBalanceError,
  readFeeTokenBalance,
  verifyTempoPayment,
  type TempoPaymentReader,
} from "./tempo.js";

export type RailId = "arc" | "tempo";

export type VerifiedPayment = {
  chainId: number;
  blockTimestamp: bigint;
  payer: Address | null;
  token: Address | null;
  tokenSymbol: string;
  /** 32-byte TIP-20 memo (Tempo transferWithMemo) as text when printable, else hex. */
  transferMemo: string | null;
};

export type WriteArgs = {
  refId: Hex;
  payee: Address;
  amountUSDC: Erc20UsdcAmount;
  paidAt: number;
  srcTxHash: Hex;
  memo: string;
};

export type Rail = {
  id: RailId;
  /** Human label, e.g. "Base → Arc". */
  label: string;
  payment: { network: "base" | "tempo"; chainId: number; explorer: string };
  registry: {
    network: RailId;
    chainId: number;
    address: Address;
    explorer: string;
    /** Public verifier tab key used in verifyUrl (?network=…). Defaults to `network`. */
    verifierNetwork?: string;
  };
  recorderAddress: Address;
  minConfirmations: number;
  readProof(refId: Hex): Promise<Proof | null>;
  verifyPayment(args: { txHash: Hex; payee: Address; amountUSDC: Erc20UsdcAmount }): Promise<VerifiedPayment>;
  /** Validate the operator note for this rail; return an error string to reject (400). */
  validateNote(note: string): string | null;
  /** On-chain memo written with the proof. */
  buildMemo(note: string, payment: VerifiedPayment): string;
  /** Throws a 503 LOW_GAS_BALANCE error when the recorder cannot pay for a write. */
  assertCanWrite(): Promise<void>;
  writeProof(args: WriteArgs): Promise<Hex>;
  findProofId(refId: Hex): Promise<number | null>;
  findProofTxHash(refId: Hex, recordedAt?: number): Promise<Hex | null>;
  health(): Promise<Record<string, unknown>>;
};

/** Reject notes that would masquerade as a non-Base payment tag on the Arc rail. */
function rejectTaggedNote(note: string): string | null {
  return parseProofMemo(note).paymentChainId !== null
    ? "memo must not start with an eip155:<chainId>/<token> tag; that prefix is reserved for the recorder"
    : null;
}

export async function createArcRail(cfg: ArcRailConfig): Promise<Rail> {
  const chainId = await createPublicClient({ transport: http(cfg.arcRpcUrl) }).getChainId();
  const arc = createArcClients({
    rpcUrl: cfg.arcRpcUrl,
    privateKey: cfg.recorderPrivateKey,
    chain: arcChainFromId(chainId),
  });
  const baseClient = createBaseClient(cfg.baseRpcUrl);
  const reader = arc.publicClient as unknown as ArcReader;
  const explorer = arc.publicClient.chain?.blockExplorers?.default.url ?? "https://explorer.arc.io";

  return {
    id: "arc",
    label: "Base → Arc",
    payment: { network: "base", chainId: 8453, explorer: "https://basescan.org" },
    registry: { network: "arc", chainId, address: cfg.settlementProofsAddress, explorer },
    recorderAddress: arc.account.address,
    minConfirmations: cfg.minConfirmations,
    readProof: (refId) =>
      readProof({ publicClient: arc.publicClient, address: cfg.settlementProofsAddress, refId }),
    async verifyPayment({ txHash, payee, amountUSDC }) {
      const v = await verifyBasePayment({
        client: baseClient,
        txHash,
        payee,
        amountUSDC,
        minConfirmations: cfg.minConfirmations,
      });
      return {
        chainId: 8453,
        blockTimestamp: v.blockTimestamp,
        payer: v.payer,
        token: null,
        tokenSymbol: "USDC",
        transferMemo: null,
      };
    },
    validateNote: rejectTaggedNote,
    // Arc rail keeps the original memo semantics (untagged = Base USDC).
    buildMemo: (note) => note,
    async assertCanWrite() {
      const balance = await readRecorderNativeGasBalance({
        publicClient: arc.publicClient,
        address: arc.account.address,
      });
      if (isGasLow(balance, cfg.minRecorderGasWei)) {
        console.warn(
          JSON.stringify({
            msg: "recorder gas low — refusing write",
            rail: "arc",
            balanceWei: balance.toString(),
            minWei: cfg.minRecorderGasWei.toString(),
          }),
        );
        throw lowGasError(balance, cfg.minRecorderGasWei);
      }
    },
    writeProof: (args) =>
      writeProof({
        walletClient: arc.walletClient,
        publicClient: arc.publicClient,
        account: arc.account,
        address: cfg.settlementProofsAddress,
        ...args,
      }),
    findProofId: (refId) => findProofId(reader, cfg.settlementProofsAddress, refId),
    findProofTxHash: (refId, recordedAt) =>
      findProofTxHash(reader, cfg.settlementProofsAddress, refId, { recordedAt }),
    async health() {
      const [arcId, balance] = await Promise.all([
        arc.publicClient.getChainId(),
        readRecorderNativeGasBalance({ publicClient: arc.publicClient, address: arc.account.address }),
      ]);
      return {
        rail: "arc",
        recorder: arc.account.address,
        settlementProofs: cfg.settlementProofsAddress,
        arcChainId: arcId,
        /** Native gas USDC wei (18 decimals) — not ERC-20 6-dec units. */
        recorderArcBalanceWei: balance.toString(),
        recorderArcBalanceDecimals: ARC_NATIVE_USDC_DECIMALS,
        minRecorderGasWei: cfg.minRecorderGasWei.toString(),
        lowGas: isGasLow(balance, cfg.minRecorderGasWei),
        proofAmountDecimals: ARC_ERC20_USDC_DECIMALS,
        minConfirmations: cfg.minConfirmations,
        settlementRail: "base-usdc-notarize-arc",
      };
    },
  };
}

/** Verifier tab for a Tempo chain: mainnet proofs open the "Tempo mainnet" tab, testnet keeps ?network=tempo. */
export function tempoVerifierNetwork(chainId: number): "tempo" | "tempo-mainnet" {
  return chainId === TEMPO_MAINNET_CHAIN_ID ? "tempo-mainnet" : "tempo";
}

/** Tempo public RPC caps eth_getLogs at 100_000 blocks; stay under it. */
export const TEMPO_LOG_CHUNK = 90_000n;

export async function createTempoRail(cfg: TempoRailConfig): Promise<Rail> {
  const chainId = await createPublicClient({ transport: http(cfg.rpcUrl) }).getChainId();
  if (chainId === TEMPO_MAINNET_CHAIN_ID && !cfg.allowMainnet) {
    throw new Error(
      "TEMPO_RPC_URL points at Tempo mainnet (chain 4217). This recorder only runs Tempo on the Moderato testnet unless TEMPO_ALLOW_MAINNET=true is set deliberately.",
    );
  }
  const tempo = createTempoClients({
    rpcUrl: cfg.rpcUrl,
    privateKey: cfg.recorderPrivateKey,
    chainId,
    feeToken: cfg.feeToken,
  });
  const reader = tempo.publicClient as unknown as ArcReader;
  const paymentReader = tempo.publicClient as unknown as TempoPaymentReader;
  const publicForProofs = tempo.publicClient as unknown as ReturnType<typeof createPublicClient>;
  const feeSymbol = cfg.tokens.get(cfg.feeToken.toLowerCase())?.symbol ?? "fee token";

  return {
    id: "tempo",
    label: "Tempo → Tempo",
    payment: { network: "tempo", chainId, explorer: cfg.explorer },
    registry: {
      network: "tempo",
      chainId,
      address: cfg.settlementProofsAddress,
      explorer: cfg.explorer,
      verifierNetwork: tempoVerifierNetwork(chainId),
    },
    recorderAddress: tempo.account.address,
    minConfirmations: cfg.minConfirmations,
    readProof: (refId) =>
      readProof({ publicClient: publicForProofs, address: cfg.settlementProofsAddress, refId }),
    async verifyPayment({ txHash, payee, amountUSDC }) {
      const v = await verifyTempoPayment({
        client: paymentReader,
        txHash,
        payee,
        amountUSDC,
        minConfirmations: cfg.minConfirmations,
        tokens: cfg.tokens,
      });
      return {
        chainId,
        blockTimestamp: v.blockTimestamp,
        payer: v.payer,
        token: v.token,
        tokenSymbol: v.tokenSymbol,
        transferMemo: describeTransferMemo(v.transferMemo),
      };
    },
    validateNote: () => null,
    buildMemo: (note, payment) =>
      formatProofMemo({
        paymentChainId: payment.chainId,
        tokenSymbol: payment.tokenSymbol,
        // Fall back to the on-chain TIP-20 memo so the reconciliation reference is kept.
        note: note || payment.transferMemo || "",
      }),
    async assertCanWrite() {
      const balance = await readFeeTokenBalance({
        publicClient: tempo.publicClient as never,
        feeToken: cfg.feeToken,
        address: tempo.account.address,
      });
      if (balance < cfg.minFeeBalance) {
        console.warn(
          JSON.stringify({
            msg: "recorder fee balance low — refusing write",
            rail: "tempo",
            balance: balance.toString(),
            min: cfg.minFeeBalance.toString(),
          }),
        );
        throw lowFeeBalanceError(balance, cfg.minFeeBalance, feeSymbol);
      }
    },
    writeProof: (args) =>
      writeProof({
        walletClient: tempo.walletClient as never,
        publicClient: publicForProofs,
        account: tempo.account,
        address: cfg.settlementProofsAddress,
        ...args,
      }),
    findProofId: (refId) => findProofId(reader, cfg.settlementProofsAddress, refId),
    findProofTxHash: (refId, recordedAt) =>
      findProofTxHash(reader, cfg.settlementProofsAddress, refId, {
        recordedAt,
        chunk: TEMPO_LOG_CHUNK,
      }),
    async health() {
      const balance = await readFeeTokenBalance({
        publicClient: tempo.publicClient as never,
        feeToken: cfg.feeToken,
        address: tempo.account.address,
      });
      return {
        rail: "tempo",
        recorder: tempo.account.address,
        settlementProofs: cfg.settlementProofsAddress,
        tempoChainId: chainId,
        feeToken: cfg.feeToken,
        feeTokenSymbol: feeSymbol,
        /** Fee-token balance in 6-dec TIP-20 units (Tempo has no native gas token). */
        recorderFeeBalance: balance.toString(),
        minRecorderFeeBalance: cfg.minFeeBalance.toString(),
        lowGas: balance < cfg.minFeeBalance,
        acceptedTokens: [...cfg.tokens.values()].map((t) => `${t.symbol}:${t.address}`),
        proofAmountDecimals: 6,
        minConfirmations: cfg.minConfirmations,
        settlementRail: "tempo-tip20-notarize-tempo",
      };
    },
  };
}

