import {
  type Address,
  type Hex,
  createPublicClient,
  decodeEventLog,
  getAddress,
  http,
  isAddressEqual,
} from "viem";
import { base } from "viem/chains";
import { erc20TransferAbi } from "./abi.js";
import {
  BASE_USDC,
  type Erc20UsdcAmount,
} from "./decimals.js";

export type BaseVerification = {
  txHash: Hex;
  blockNumber: bigint;
  confirmations: bigint;
  blockTimestamp: bigint;
  status: "success";
  usdcTransferMatched: true;
  /** Matched Transfer value in 6-decimal ERC-20 units. */
  amountUSDC: Erc20UsdcAmount;
  /** `from` of the matched USDC Transfer (the payer). */
  payer: Address | null;
};

export function createBaseClient(rpcUrl: string) {
  return createPublicClient({
    chain: base,
    transport: http(rpcUrl),
  });
}

/** Base slot time after the Denim upgrade (2026-11-05 18:00 UTC). Not the pre-Denim 2s slot. */
export const BASE_SLOT_MS = 200;

export type BaseBlockRef = { number: bigint; timestamp: bigint };

/** Narrow Base read surface so verifyBasePayment can be tested without a live RPC. */
export type BasePaymentReader = {
  getTransactionReceipt: (args: { hash: Hex }) => Promise<{
    status: "success" | "reverted";
    blockNumber: bigint;
    logs: readonly { address: Address; topics: readonly Hex[] | Hex[]; data: Hex }[];
  }>;
  getBlock: (args: { blockNumber: bigint } | { blockTag: "latest" }) => Promise<BaseBlockRef>;
  /** `eth_getBlockByNumber("safe")` block number, or null when the tag is unavailable. */
  getSafeBlockNumber: () => Promise<bigint | null>;
};

export function basePaymentReader(client: ReturnType<typeof createBaseClient>): BasePaymentReader {
  return {
    getTransactionReceipt: (args) => client.getTransactionReceipt(args),
    async getBlock(args) {
      const block =
        "blockNumber" in args
          ? await client.getBlock({ blockNumber: args.blockNumber })
          : await client.getBlock({ blockTag: "latest" });
      if (block.number == null) {
        throw Object.assign(new Error("Base block has no number"), {
          status: 503,
          code: "BASE_RPC_UNAVAILABLE",
        });
      }
      return { number: block.number, timestamp: block.timestamp };
    },
    async getSafeBlockNumber() {
      try {
        const block = await client.getBlock({ blockTag: "safe" });
        return block.number ?? null;
      } catch {
        return null;
      }
    },
  };
}

/**
 * Seconds to wait before retrying a Base payment that is not final yet.
 *
 * The binding wait is the time gate (`MIN_CONFIRMATION_SECONDS - elapsed`), waived
 * when the tx is already at or below the safe head. A block-floor deficit is
 * converted at the post-Denim 200ms slot — never at the old 2s block time
 * (`blocksShort * 2`). Callers should use the max of the two.
 */
export function baseRetryAfterSeconds(args: {
  elapsedSeconds: number;
  minConfirmationSeconds: number;
  confirmations: number;
  minConfirmations: number;
  /** True when the tx block is already included in the safe head. */
  timeGateWaived: boolean;
}): number {
  const elapsed = Number.isFinite(args.elapsedSeconds) ? Math.max(0, args.elapsedSeconds) : 0;
  const timeLeft = args.timeGateWaived ? 0 : Math.max(0, Math.ceil(args.minConfirmationSeconds - elapsed));
  const blocksLeft = Math.max(0, args.minConfirmations - args.confirmations);
  const blockLeftSeconds = Math.ceil((blocksLeft * BASE_SLOT_MS) / 1000);
  return Math.max(timeLeft, blockLeftSeconds);
}

/**
 * Verify a Base USDC ERC-20 Transfer for the claimed srcTxHash (1A notarize).
 * Unmatched amounts are always rejected — no ALLOW_UNVERIFIED_AMOUNT path.
 * Uses Base JSON-RPC only (receipts / logs). No explorer HTTP API.
 *
 * Finality (Base Denim, 200ms slots as of 2026-11-05 18:00 UTC):
 *   confirmations >= MIN_CONFIRMATIONS (default 300)
 *   AND (
 *     head.timestamp - tx.timestamp >= MIN_CONFIRMATION_SECONDS (default 60)
 *     OR tx.blockNumber <= eth_getBlockByNumber("safe")
 *   )
 * Not-yet-final responses are 400 TX_NOT_CONFIRMED with retryAfterSeconds.
 */
export async function verifyBasePayment(args: {
  client: BasePaymentReader;
  txHash: Hex;
  payee: Address;
  amountUSDC: Erc20UsdcAmount;
  minConfirmations: number;
  /** Head timestamp must be at least this many seconds after the tx block, unless the tx is safe. */
  minConfirmationSeconds?: number;
  usdcAddress?: Address;
}): Promise<BaseVerification> {
  const {
    client,
    txHash,
    payee,
    amountUSDC,
    minConfirmations,
    minConfirmationSeconds = 60,
    usdcAddress = BASE_USDC,
  } = args;

  const receipt = await client.getTransactionReceipt({ hash: txHash }).catch(() => null);
  if (!receipt) {
    const retryAfterSeconds = baseRetryAfterSeconds({
      elapsedSeconds: 0,
      minConfirmationSeconds,
      confirmations: 0,
      minConfirmations,
      timeGateWaived: false,
    });
    throw Object.assign(
      new Error(
        `Base transaction not found or not yet confirmed. Retry in ${retryAfterSeconds}s.`,
      ),
      { status: 400, code: "TX_NOT_CONFIRMED", retryAfterSeconds },
    );
  }

  if (receipt.status !== "success") {
    throw Object.assign(new Error("Base transaction failed (status reverted)"), {
      status: 400,
      code: "TX_FAILED",
    });
  }

  const [head, block, safeBlockNumber] = await Promise.all([
    client.getBlock({ blockTag: "latest" }),
    client.getBlock({ blockNumber: receipt.blockNumber }),
    client.getSafeBlockNumber(),
  ]);
  const confirmations = head.number - receipt.blockNumber + 1n;
  const elapsedSeconds = Number(head.timestamp - block.timestamp);
  const onSafeHead = safeBlockNumber !== null && receipt.blockNumber <= safeBlockNumber;
  const enoughBlocks = confirmations >= BigInt(minConfirmations);
  const enoughTime = Number.isFinite(elapsedSeconds) && elapsedSeconds >= minConfirmationSeconds;
  // Block floor always. Time gate or safe head — either finality signal is enough.
  if (!enoughBlocks || !(enoughTime || onSafeHead)) {
    const retryAfterSeconds = baseRetryAfterSeconds({
      elapsedSeconds,
      minConfirmationSeconds,
      confirmations: Number(confirmations > 0n ? confirmations : 0n),
      minConfirmations,
      timeGateWaived: onSafeHead,
    });
    throw Object.assign(
      new Error(
        `Base transaction has ${confirmations} confirmation(s) and ${Number.isFinite(elapsedSeconds) ? elapsedSeconds : "unknown"}s of age; need at least ${minConfirmations} confirmation(s) and either ${minConfirmationSeconds}s or the safe head. Retry in ${retryAfterSeconds}s.`,
      ),
      { status: 400, code: "TX_NOT_CONFIRMED", retryAfterSeconds },
    );
  }

  const match = matchUsdcTransfer(receipt.logs, payee, amountUSDC, usdcAddress);
  if (!match.matched) {
    throw Object.assign(
      new Error(
        `USDC Transfer to payee/amount did not match on Base: ${match.reason}. Unmatched amounts are never recorded.`,
      ),
      { status: 400, code: "USDC_AMOUNT_UNVERIFIED" },
    );
  }

  return {
    txHash,
    blockNumber: receipt.blockNumber,
    confirmations,
    blockTimestamp: block.timestamp,
    status: "success",
    usdcTransferMatched: true,
    amountUSDC,
    payer: match.payer ?? null,
  };
}

function matchUsdcTransfer(
  logs: readonly { address: Address; topics: readonly Hex[] | Hex[]; data: Hex }[],
  payee: Address,
  amountUSDC: Erc20UsdcAmount,
  usdcAddress: Address,
): { matched: boolean; reason: string; payer?: Address } {
  const usdcLogs = logs.filter((log) => isAddressEqual(log.address, usdcAddress));
  if (usdcLogs.length === 0) {
    return { matched: false, reason: `no Transfer logs from Base USDC ${usdcAddress}` };
  }

  let sawTransfer = false;
  for (const log of usdcLogs) {
    try {
      const decoded = decodeEventLog({
        abi: erc20TransferAbi,
        data: log.data,
        topics: log.topics as [Hex, ...Hex[]],
      });
      if (decoded.eventName !== "Transfer") continue;
      sawTransfer = true;
      const to = getAddress(decoded.args.to as Address);
      const value = decoded.args.value as bigint;
      if (isAddressEqual(to, payee) && value === (amountUSDC as bigint)) {
        return {
          matched: true,
          reason: "matched",
          payer: getAddress(decoded.args.from as Address),
        };
      }
    } catch {
      // keep scanning
    }
  }

  if (!sawTransfer) {
    return { matched: false, reason: "USDC logs present but Transfer decode failed" };
  }
  return {
    matched: false,
    reason: `USDC Transfer logs found but none paid ${amountUSDC.toString()} to ${payee}`,
  };
}
