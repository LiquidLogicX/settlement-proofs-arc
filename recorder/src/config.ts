import { type Address, type Hex, isAddress, isHex } from "viem";

/** Arc mainnet ERC-20 USDC predeploy (6 decimals). See docs/decimals-empirical.md. */
export const ARC_USDC = "0x3600000000000000000000000000000000000000" as const;

export type AppConfig = {
  port: number;
  host: string;
  arcRpcUrl: string;
  settlementProofsAddress: Address;
  recorderPrivateKey: Hex;
  minConfirmations: number;
  recorderApiKey: string;
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

  return {
    port: Number(process.env.PORT ?? "10000"),
    host: process.env.HOST ?? "0.0.0.0",
    arcRpcUrl: required("ARC_RPC_URL"),
    settlementProofsAddress: settlementProofsAddress as Address,
    recorderPrivateKey: parsePrivateKey(required("SETTLEMENT_RECORDER_PRIVATE_KEY")),
    // Default 6: Arc confirmations before recording a proof.
    minConfirmations: Math.max(1, Number(process.env.MIN_CONFIRMATIONS ?? "6")),
    recorderApiKey: required("RECORDER_API_KEY"),
  };
}
