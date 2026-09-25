import { type Address, type Hex, isAddress, isHex } from "viem";
import { ARC_ERC20_USDC, BASE_USDC } from "./decimals.js";
import { parseMinGasWei } from "./gas-guard.js";

/** @deprecated Prefer ARC_ERC20_USDC from decimals.ts (typed 6-dec ERC-20). */
export const ARC_USDC = ARC_ERC20_USDC;

export { BASE_USDC, ARC_ERC20_USDC };

export type AppConfig = {
  port: number;
  host: string;
  /** Base JSON-RPC — verify payment receipts/logs (1A). */
  baseRpcUrl: string;
  /** Arc JSON-RPC — eth_call / write proofs only. Never the explorer HTTP API. */
  arcRpcUrl: string;
  settlementProofsAddress: Address;
  recorderPrivateKey: Hex;
  minConfirmations: number;
  recorderApiKey: string;
  /** Refuse Arc writes below this native gas balance (18-dec wei). */
  minRecorderGasWei: bigint;
};

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}

function parsePrivateKey(raw: string): Hex {
  const key = raw.startsWith("0x") ? raw : `0x${raw}`;
  if (!isHex(key) || key.length !== 66) {
    throw new Error("SETTLEMENT_RECORDER_PRIVATE_KEY must be a 32-byte hex key");
  }
  return key as Hex;
}

export function loadConfig(): AppConfig {
  const settlementProofsAddress = required("SETTLEMENT_PROOFS_ADDRESS");
  if (!isAddress(settlementProofsAddress)) {
    throw new Error("SETTLEMENT_PROOFS_ADDRESS must be a valid address");
  }

  // Hard reject any leftover confidentiality / bypass env — must not ship on a proof registry.
  const banned = [
    "ALLOW_UNVERIFIED_AMOUNT",
    "VIEW_SALT_KEY",
    "VIEW_SALT_KEY_ID",
  ] as const;
  for (const name of banned) {
    if (process.env[name]?.trim()) {
      throw new Error(
        `${name} is not supported (Decision 1A+2B). Remove it from the environment.`,
      );
    }
  }
  for (const key of Object.keys(process.env)) {
    if (/^VIEW_SALT_KEY_\d+$/.test(key) && process.env[key]?.trim()) {
      throw new Error(
        `${key} is not supported (Decision 2B). Remove confidentiality salts from the environment.`,
      );
    }
  }

  return {
    port: Number(process.env.PORT ?? "10000"),
    host: process.env.HOST ?? "0.0.0.0",
    baseRpcUrl: required("BASE_RPC_URL"),
    arcRpcUrl: required("ARC_RPC_URL"),
    settlementProofsAddress: settlementProofsAddress as Address,
    recorderPrivateKey: parsePrivateKey(required("SETTLEMENT_RECORDER_PRIVATE_KEY")),
    // Default 12: Base mainnet reorg depth; avoid recording proofs that can be
    // orphaned by a shallow reorganization of recent blocks.
    minConfirmations: Math.max(1, Number(process.env.MIN_CONFIRMATIONS ?? "12")),
    recorderApiKey: required("RECORDER_API_KEY"),
    minRecorderGasWei: parseMinGasWei(process.env.MIN_RECORDER_GAS_WEI),
  };
}
