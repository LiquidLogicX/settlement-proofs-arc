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
};

export function createBaseClient(rpcUrl: string) {
  return createPublicClient({
    chain: base,
    transport: http(rpcUrl),
  });
}

/**
 * Verify a Base USDC ERC-20 Transfer for the claimed srcTxHash (1A notarize).
 * Unmatched amounts are always rejected — no ALLOW_UNVERIFIED_AMOUNT path.
 * Uses Base JSON-RPC only (receipts / logs). No explorer HTTP API.
 */
export async function verifyBasePayment(args: {
  client: ReturnType<typeof createBaseClient>;
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

  const head = await client.getBlockNumber();
  const confirmations = head - receipt.blockNumber + 1n;
  if (confirmations < BigInt(minConfirmations)) {
    throw Object.assign(
      new Error(
        `Base transaction has ${confirmations} confirmation(s); need at least ${minConfirmations}`,
      ),
      { status: 400, code: "TX_NOT_CONFIRMED" },
    );
  }

  const block = await client.getBlock({ blockNumber: receipt.blockNumber });
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
  };
}

function matchUsdcTransfer(
  logs: readonly { address: Address; topics: readonly Hex[] | Hex[]; data: Hex }[],
  payee: Address,
  amountUSDC: Erc20UsdcAmount,
  usdcAddress: Address,
): { matched: boolean; reason: string } {
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
        return { matched: true, reason: "matched" };
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
