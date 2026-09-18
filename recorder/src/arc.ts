import {
  type Account,
  type Address,
  type Hex,
  type Chain,
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  defineChain,
  encodePacked,
  getAddress,
  http,
  isAddressEqual,
  keccak256,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { erc20TransferAbi, settlementProofsAbi } from "./abi.js";
import { ARC_USDC } from "./config.js";

export const arcMainnet = defineChain({
  id: 5042,
  name: "Arc",
  nativeCurrency: { name: "USD Coin", symbol: "USDC", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.mainnet.arc.io"] },
  },
  blockExplorers: {
    default: { name: "Arc Explorer", url: "https://explorer.arc.io" },
  },
});

export const arcTestnet = defineChain({
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USD Coin", symbol: "USDC", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.testnet.arc.io"] },
  },
  blockExplorers: {
    default: { name: "Arc Testnet Explorer", url: "https://testnet.arcscan.app" },
  },
});

export function arcChainFromId(chainId: number): Chain {
  if (chainId === arcTestnet.id) return arcTestnet;
  return { ...arcMainnet, id: chainId };
}

export type Proof = {
  refId: Hex;
  payee: Address;
  amountUSDC: bigint;
  paidAt: number;
  srcTxHash: Hex;
  memo: string;
  recordedAt: number;
};

/** refId = keccak256(abi.encodePacked(srcTxHash, payee, amountUSDC)) */
export function deriveRefId(srcTxHash: Hex, payee: Address, amountUSDC: bigint): Hex {
  return keccak256(
    encodePacked(["bytes32", "address", "uint256"], [srcTxHash, payee, amountUSDC]),
  );
}

export function serializeProof(proof: Proof) {
  return {
    refId: proof.refId,
    payee: proof.payee,
    amountUSDC: proof.amountUSDC.toString(),
    paidAt: proof.paidAt,
    srcTxHash: proof.srcTxHash,
    memo: proof.memo,
    recordedAt: proof.recordedAt,
  };
}

export function createArcClients(args: { rpcUrl: string; privateKey: Hex; chain: Chain }) {
  const account = privateKeyToAccount(args.privateKey);
  const publicClient = createPublicClient({
    chain: args.chain,
    transport: http(args.rpcUrl),
  });
  const walletClient = createWalletClient({
    account,
    chain: args.chain,
    transport: http(args.rpcUrl),
  });
  return { account, publicClient, walletClient };
}

export type ArcVerification = {
  txHash: Hex;
  blockNumber: bigint;
  confirmations: bigint;
  blockTimestamp: bigint;
  status: "success";
};

/**
 * Verify an Arc USDC ERC-20 Transfer (including x402 facilitator settlements
 * that emit Transfer) for the claimed srcTxHash before writing a proof.
 * Unmatched amounts are always rejected — no unverified path.
 */
export async function verifyArcPayment(args: {
  client: ReturnType<typeof createPublicClient>;
  txHash: Hex;
  payee: Address;
  amountUSDC: bigint;
  minConfirmations: number;
  usdcAddress?: Address;
}): Promise<ArcVerification> {
  const {
    client,
    txHash,
    payee,
    amountUSDC,
    minConfirmations,
    usdcAddress = ARC_USDC,
  } = args;

  const receipt = await client.getTransactionReceipt({ hash: txHash }).catch(() => null);
  if (!receipt) {
    throw Object.assign(new Error("Arc transaction not found or not yet confirmed"), {
      status: 400,
      code: "TX_NOT_CONFIRMED",
    });
  }

  if (receipt.status !== "success") {
    throw Object.assign(new Error("Arc transaction failed (status reverted)"), {
      status: 400,
      code: "TX_FAILED",
    });
  }

  const head = await client.getBlockNumber();
  const confirmations = head - receipt.blockNumber + 1n;
  if (confirmations < BigInt(minConfirmations)) {
    throw Object.assign(
      new Error(
        `Arc transaction has ${confirmations} confirmation(s); need at least ${minConfirmations}`,
      ),
      { status: 400, code: "TX_NOT_CONFIRMED" },
    );
  }

  const block = await client.getBlock({ blockNumber: receipt.blockNumber });
  const match = matchUsdcTransfer(receipt.logs, payee, amountUSDC, usdcAddress);
  if (!match.matched) {
    throw Object.assign(
      new Error(`USDC Transfer to payee/amount did not match on Arc: ${match.reason}`),
      { status: 400, code: "USDC_AMOUNT_UNVERIFIED" },
    );
  }

  return {
    txHash,
    blockNumber: receipt.blockNumber,
    confirmations,
    blockTimestamp: block.timestamp,
    status: "success",
  };
}

function matchUsdcTransfer(
  logs: readonly { address: Address; topics: readonly Hex[] | Hex[]; data: Hex }[],
  payee: Address,
  amountUSDC: bigint,
  usdcAddress: Address,
): { matched: boolean; reason: string } {
  const usdcLogs = logs.filter((log) => isAddressEqual(log.address, usdcAddress));
  if (usdcLogs.length === 0) {
    return { matched: false, reason: `no Transfer logs from Arc USDC ${usdcAddress}` };
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
      if (isAddressEqual(to, payee) && value === amountUSDC) {
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

export async function readProof(args: {
  publicClient: ReturnType<typeof createPublicClient>;
  address: Address;
  refId: Hex;
}): Promise<Proof | null> {
  const exists = await args.publicClient.readContract({
    address: args.address,
    abi: settlementProofsAbi,
    functionName: "exists",
    args: [args.refId],
  });
  if (!exists) return null;
  const proof = await args.publicClient.readContract({
    address: args.address,
    abi: settlementProofsAbi,
    functionName: "getProof",
    args: [args.refId],
  });
  return {
    refId: proof.refId,
    payee: proof.payee,
    amountUSDC: proof.amountUSDC,
    paidAt: Number(proof.paidAt),
    srcTxHash: proof.srcTxHash,
    memo: proof.memo,
    recordedAt: Number(proof.recordedAt),
  };
}

export async function writeProof(args: {
  walletClient: ReturnType<typeof createWalletClient>;
  publicClient: ReturnType<typeof createPublicClient>;
  account: Account;
  address: Address;
  refId: Hex;
  payee: Address;
  amountUSDC: bigint;
  paidAt: number;
  srcTxHash: Hex;
  memo: string;
}): Promise<Hex> {
  const hash = await args.walletClient.writeContract({
    account: args.account,
    address: args.address,
    abi: settlementProofsAbi,
    functionName: "recordPayment",
    args: [
      args.refId,
      args.payee,
      args.amountUSDC,
      BigInt(args.paidAt),
      args.srcTxHash,
      args.memo,
    ],
    chain: args.walletClient.chain,
  });
  const receipt = await args.publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    throw Object.assign(new Error("Arc recordPayment transaction reverted"), {
      status: 502,
      code: "ARC_WRITE_FAILED",
      hash,
    });
  }
  return hash;
}

export function isDuplicateRefError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /DuplicateRefId/i.test(message) || /0x[0-9a-f]*refid/i.test(message);
}
