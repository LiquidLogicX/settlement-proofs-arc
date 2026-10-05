import { type Address, type Hex, isAddress, isHex } from "viem";
import { ARC_ERC20_USDC, BASE_USDC } from "./decimals.js";
import { parseMinGasWei } from "./gas-guard.js";
import {
  PATH_USD,
  TEMPO_MODERATO_EXPLORER,
  TEMPO_MODERATO_RPC,
  type TokenAllowlist,
  parseMinFeeBalance,
  parseTempoTokens,
} from "./tempo.js";

/** @deprecated Prefer ARC_ERC20_USDC from decimals.ts (typed 6-dec ERC-20). */
export const ARC_USDC = ARC_ERC20_USDC;

export { BASE_USDC, ARC_ERC20_USDC };

/** Rail 1 (original, 1A): USDC payment on Base → proof on Arc. */
export type ArcRailConfig = {
  /** Base JSON-RPC — verify payment receipts/logs (1A). */
  baseRpcUrl: string;
  /** Arc JSON-RPC — eth_call / write proofs only. Never the explorer HTTP API. */
  arcRpcUrl: string;
  settlementProofsAddress: Address;
  recorderPrivateKey: Hex;
  minConfirmations: number;
  /** Refuse Arc writes below this native gas balance (18-dec wei). */
  minRecorderGasWei: bigint;
};

/** Rail 2: TIP-20 stablecoin payment on Tempo → proof on Tempo (Moderato testnet). */
export type TempoRailConfig = {
  rpcUrl: string;
  explorer: string;
  settlementProofsAddress: Address;
  recorderPrivateKey: Hex;
  minConfirmations: number;
  /** TIP-20 used to pay recorder fees (Tempo has no native gas token). */
  feeToken: Address;
  /** Payment tokens the recorder accepts as proof of payment. */
  tokens: TokenAllowlist;
  /** Refuse writes below this fee-token balance (6-dec TIP-20 units). */
  minFeeBalance: bigint;
  /** Only true when TEMPO_ALLOW_MAINNET=true. Mainnet chain 4217 is refused otherwise. */
  allowMainnet: boolean;
};

export type AppConfig = {
  port: number;
  host: string;
  recorderApiKey: string;
  /** Public verifier origin used to build verifyUrl in responses. */
  verifierBaseUrl: string;
  arc: ArcRailConfig | null;
  tempo: TempoRailConfig | null;
};

type Env = Record<string, string | undefined>;

function value(env: Env, name: string): string | undefined {
  const v = env[name]?.trim();
  return v ? v : undefined;
}

function required(env: Env, name: string, context?: string): string {
  const v = value(env, name);
  if (!v) {
    throw new Error(
      `Missing required environment variable ${name}${context ? ` (${context})` : ""}`,
    );
  }
  return v;
}

function parsePrivateKey(raw: string, name: string): Hex {
  const key = raw.startsWith("0x") ? raw : `0x${raw}`;
  if (!isHex(key) || key.length !== 66) {
    throw new Error(`${name} must be a 32-byte hex key`);
  }
  return key as Hex;
}

function parseAddressVar(env: Env, name: string, context: string): Address {
  const raw = required(env, name, context);
  if (!isAddress(raw, { strict: false })) {
    throw new Error(`${name} must be a valid address`);
  }
  return raw as Address;
}

const ARC_VARS = [
  "BASE_RPC_URL",
  "ARC_RPC_URL",
  "SETTLEMENT_PROOFS_ADDRESS",
  "SETTLEMENT_RECORDER_PRIVATE_KEY",
] as const;

const TEMPO_TRIGGER_VARS = ["TEMPO_SETTLEMENT_PROOFS_ADDRESS", "TEMPO_RECORDER_PRIVATE_KEY"] as const;

function rejectBannedEnv(env: Env) {
  // Hard reject any leftover confidentiality / bypass env — must not ship on a proof registry.
  const banned = ["ALLOW_UNVERIFIED_AMOUNT", "VIEW_SALT_KEY", "VIEW_SALT_KEY_ID"] as const;
  for (const name of banned) {
    if (value(env, name)) {
      throw new Error(
        `${name} is not supported (Decision 1A+2B). Remove it from the environment.`,
      );
    }
  }
  for (const key of Object.keys(env)) {
    if (/^VIEW_SALT_KEY_\d+$/.test(key) && value(env, key)) {
      throw new Error(
        `${key} is not supported (Decision 2B). Remove confidentiality salts from the environment.`,
      );
    }
  }
}

function loadArc(env: Env): ArcRailConfig | null {
  if (!ARC_VARS.some((name) => value(env, name))) return null;
  const ctx = "Base→Arc rail";
  return {
    baseRpcUrl: required(env, "BASE_RPC_URL", ctx),
    arcRpcUrl: required(env, "ARC_RPC_URL", ctx),
    settlementProofsAddress: parseAddressVar(env, "SETTLEMENT_PROOFS_ADDRESS", ctx),
    recorderPrivateKey: parsePrivateKey(
      required(env, "SETTLEMENT_RECORDER_PRIVATE_KEY", ctx),
      "SETTLEMENT_RECORDER_PRIVATE_KEY",
    ),
    // Default 12: Base mainnet reorg depth; avoid recording proofs that can be
    // orphaned by a shallow reorganization of recent blocks.
    minConfirmations: Math.max(1, Number(env.MIN_CONFIRMATIONS ?? "12")),
    minRecorderGasWei: parseMinGasWei(env.MIN_RECORDER_GAS_WEI),
  };
}

function loadTempo(env: Env): TempoRailConfig | null {
  if (!TEMPO_TRIGGER_VARS.some((name) => value(env, name))) return null;
  const ctx = "Tempo rail";
  const feeTokenRaw = value(env, "TEMPO_FEE_TOKEN") ?? PATH_USD;
  if (!isAddress(feeTokenRaw, { strict: false })) {
    throw new Error("TEMPO_FEE_TOKEN must be a TIP-20 token address");
  }
  return {
    rpcUrl: value(env, "TEMPO_RPC_URL") ?? TEMPO_MODERATO_RPC,
    explorer: (value(env, "TEMPO_EXPLORER") ?? TEMPO_MODERATO_EXPLORER).replace(/\/+$/, ""),
    settlementProofsAddress: parseAddressVar(env, "TEMPO_SETTLEMENT_PROOFS_ADDRESS", ctx),
    recorderPrivateKey: parsePrivateKey(
      required(env, "TEMPO_RECORDER_PRIVATE_KEY", ctx),
      "TEMPO_RECORDER_PRIVATE_KEY",
    ),
    // Tempo finality is deterministic (Simplex BFT): one block is final.
    minConfirmations: Math.max(1, Number(env.TEMPO_MIN_CONFIRMATIONS ?? "1")),
    feeToken: feeTokenRaw as Address,
    tokens: parseTempoTokens(env.TEMPO_ALLOWED_TOKENS),
    minFeeBalance: parseMinFeeBalance(env.TEMPO_MIN_RECORDER_FEE_BALANCE),
    allowMainnet: value(env, "TEMPO_ALLOW_MAINNET") === "true",
  };
}

export function loadConfig(env: Env = process.env): AppConfig {
  rejectBannedEnv(env);

  const arc = loadArc(env);
  const tempo = loadTempo(env);
  if (!arc && !tempo) {
    throw new Error(
      "No rail configured. Set the Base→Arc variables (BASE_RPC_URL, ARC_RPC_URL, SETTLEMENT_PROOFS_ADDRESS, SETTLEMENT_RECORDER_PRIVATE_KEY) and/or the Tempo variables (TEMPO_SETTLEMENT_PROOFS_ADDRESS, TEMPO_RECORDER_PRIVATE_KEY).",
    );
  }
  if (
    arc &&
    tempo &&
    arc.recorderPrivateKey.toLowerCase() === tempo.recorderPrivateKey.toLowerCase()
  ) {
    throw new Error(
      "TEMPO_RECORDER_PRIVATE_KEY must differ from SETTLEMENT_RECORDER_PRIVATE_KEY (keep the Arc and Tempo recorder wallets separate).",
    );
  }

  return {
    port: Number(env.PORT ?? "10000"),
    host: env.HOST ?? "0.0.0.0",
    recorderApiKey: required(env, "RECORDER_API_KEY"),
    verifierBaseUrl: (value(env, "PUBLIC_VERIFIER_URL") ?? "https://proofs.liquidlogicx.com").replace(
      /\/+$/,
      "",
    ),
    arc,
    tempo,
  };
}
