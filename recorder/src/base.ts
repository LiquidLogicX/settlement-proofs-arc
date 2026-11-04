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

/**
 * Minimum chain-time age for a Base payment after Denim (200ms blocks).
 * A fixed block count is not a wait: 12 blocks is about 2.4 seconds.
 * `block.timestamp` stays in seconds, so this does not shrink with the faster cadence.
 */
export const BASE_MIN_SETTLEMENT_SECONDS = 60;

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
  /** Which settlement rule accepted the payment. */
  settledBy: "time" | "l1-safe";
};

export type BaseChainBlock = {
  number: bigint | null;
  timestamp: bigint;
};

export type BaseBlockQuery = { blockNumber: bigint } | { blockTag: "latest" | "safe" };

/** Minimal Base read surface so tests can fake receipts without a viem client. */
export type BasePaymentReader = {
  getTransactionReceipt: (args: { hash: Hex }) => Promise<{
    status: "success" | "reverted";
    blockNumber: bigint;
    logs: readonly { address: Address; topics: readonly Hex[] | Hex[]; data: Hex }[];
  }>;
  getBlock: (args: BaseBlockQuery) => Promise<BaseChainBlock>;
};

export type BaseSettlementInput = {
  blockNumber: bigint;
  blockTimestamp: bigint;
  /** Latest chain head number. */
  head: bigint;
  /** Timestamp of `head`, in seconds. Chain time, not the recorder clock. */
  headTimestamp: bigint;
  /**
   * Block number of the `safe` tag (L1-safe head), or null when that tag
   * could not be read. Null never counts as settled.
   */
  safeHead: bigint | null;
  /**
   * Extra confirmation floor. `0` disables it. The Arc rail default is still
   * `MIN_CONFIRMATIONS` (12); this function does not invent that default.
   */
  minConfirmations: number;
  minSeconds?: number;
};

export type BaseSettlementDecision =
  | { settled: true; confirmations: bigint; via: "time" | "l1-safe" }
  | { settled: false; confirmations: bigint; message: string };

export function createBaseClient(rpcUrl: string) {
  return createPublicClient({
    chain: base,
    transport: http(rpcUrl),
  });
}

export function asBasePaymentReader(client: ReturnType<typeof createBaseClient>): BasePaymentReader {
  return {
    getTransactionReceipt: (args) => client.getTransactionReceipt(args),
    getBlock: (args) => client.getBlock(args),
  };
}

/**
 * Base settlement after Denim.
 *
 * Accepted when the payment block is at least {@link BASE_MIN_SETTLEMENT_SECONDS}
 * older than the chain head, **or** its number is at or behind the L1-safe head
 * (`blockNumber <= safe`). The safe head block itself is L1-safe, so equality counts.
 * `minConfirmations` is an additional floor and does not replace either rule.
 */
export function assessBaseSettlement(input: BaseSettlementInput): BaseSettlementDecision {
  const minSeconds = input.minSeconds ?? BASE_MIN_SETTLEMENT_SECONDS;
  const confirmations = input.head - input.blockNumber + 1n;

  if (input.blockNumber > input.head || confirmations < 1n) {
    return {
      settled: false,
      confirmations,
      message: `Base transaction block ${input.blockNumber} is ahead of chain head ${input.head}`,
    };
  }

  const age = input.headTimestamp - input.blockTimestamp;
  const aged = age >= BigInt(minSeconds);
  // `<=` so a payment in the safe head block counts. "Behind" alone would
  // exclude that block even though the safe tag already covers it.
  const behindSafe = input.safeHead !== null && input.blockNumber <= input.safeHead;
  const floor = input.minConfirmations > 0 ? BigInt(input.minConfirmations) : 0n;
  const floorMet = confirmations >= floor;

  if ((aged || behindSafe) && floorMet) {
    return { settled: true, confirmations, via: aged ? "time" : "l1-safe" };
  }

  const reasons: string[] = [];
  if (!aged && !behindSafe) reasons.push(settlementWaitMessage(age, minSeconds, input));
  if (!floorMet) {
    reasons.push(
      `Base transaction has ${confirmations} confirmation(s); need at least ${floor}`,
    );
  }
  return { settled: false, confirmations, message: reasons.join(". ") };
}

function settlementWaitMessage(
  age: bigint,
  minSeconds: number,
  input: BaseSettlementInput,
): string {
  const ageText =
    age < 0n
      ? `Base transaction block timestamp is ${-age}s ahead of the chain head (need at least ${minSeconds}s of age)`
      : `Base transaction is ${age}s old (need at least ${minSeconds}s)`;
  const safeText =
    input.safeHead === null
      ? "the L1-safe head is unavailable"
      : `block ${input.blockNumber} is not at or behind the L1-safe head ${input.safeHead}`;
  return `${ageText} and ${safeText}`;
}

/**
 * Verify a Base USDC ERC-20 Transfer for the claimed srcTxHash (1A notarize).
 * Unmatched amounts are always rejected — no ALLOW_UNVERIFIED_AMOUNT path.
 * Uses Base JSON-RPC only (receipts / logs / the `safe` block tag). No explorer HTTP API.
 */
export async function verifyBasePayment(args: {
  client: BasePaymentReader;
  txHash: Hex;
  payee: Address;
  amountUSDC: Erc20UsdcAmount;
  minConfirmations: number;
  usdcAddress?: Address;
}): Promise<BaseVerification> {
  const {
    client,
    txHash,
    payee,
    amountUSDC,
    minConfirmations,
    usdcAddress = BASE_USDC,
  } = args;

  const receipt = await client.getTransactionReceipt({ hash: txHash }).catch(() => null);
  if (!receipt) {
    throw Object.assign(new Error("Base transaction not found or not yet confirmed"), {
      status: 400,
      code: "TX_NOT_CONFIRMED",
    });
  }

  if (receipt.status !== "success") {
    throw Object.assign(new Error("Base transaction failed (status reverted)"), {
      status: 400,
      code: "TX_FAILED",
    });
  }

  const [latest, block] = await Promise.all([
    client.getBlock({ blockTag: "latest" }),
    client.getBlock({ blockNumber: receipt.blockNumber }),
  ]);
  if (latest.number == null) {
    throw Object.assign(new Error("Base chain head has no block number"), {
      status: 503,
      code: "BASE_HEAD_UNAVAILABLE",
    });
  }

  const age = latest.timestamp - block.timestamp;
  // Only read `safe` when chain time is still short. A hung safe-tag call must
  // not delay a payment that is already 60 seconds old.
  let safeHead: bigint | null = null;
  if (age < BigInt(BASE_MIN_SETTLEMENT_SECONDS)) {
    safeHead = await client
      .getBlock({ blockTag: "safe" })
      .then((safe) => safe.number)
      .catch(() => null);
  }

  const decision = assessBaseSettlement({
    blockNumber: receipt.blockNumber,
    blockTimestamp: block.timestamp,
    head: latest.number,
    headTimestamp: latest.timestamp,
    safeHead,
    minConfirmations,
  });
  if (!decision.settled) {
    throw Object.assign(new Error(decision.message), {
      status: 400,
      code: "TX_NOT_CONFIRMED",
    });
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
    confirmations: decision.confirmations,
    blockTimestamp: block.timestamp,
    status: "success",
    usdcTransferMatched: true,
    amountUSDC,
    payer: match.payer ?? null,
    settledBy: decision.via,
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
