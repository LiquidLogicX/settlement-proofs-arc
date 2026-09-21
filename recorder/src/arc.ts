import {
  type Account,
  type Address,
  type Hex,
  type Chain,
  createPublicClient,
  createWalletClient,
  defineChain,
  encodePacked,
  http,
  keccak256,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { settlementProofsAbi } from "./abi.js";
import {
  ARC_NATIVE_USDC_DECIMALS,
  type Erc20UsdcAmount,
  asNativeUsdcWei,
  type NativeUsdcWei,
} from "./decimals.js";

export const arcMainnet = defineChain({
  id: 5042,
  name: "Arc",
  nativeCurrency: {
    name: "USD Coin",
    symbol: "USDC",
    decimals: ARC_NATIVE_USDC_DECIMALS,
  },
  rpcUrls: {
    default: { http: ["https://rpc.mainnet.arc.io"] },
  },
  blockExplorers: {
    // Human UI only — do not call the explorer HTTP API (Cloudflare). Programmatic = RPC.
    default: { name: "Arc Explorer", url: "https://explorer.arc.io" },
  },
});

export const arcTestnet = defineChain({
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: {
    name: "USD Coin",
    symbol: "USDC",
    decimals: ARC_NATIVE_USDC_DECIMALS,
  },
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
  amountUSDC: Erc20UsdcAmount;
  paidAt: number;
  srcTxHash: Hex;
  memo: string;
  recordedAt: number;
};

/** refId = keccak256(abi.encodePacked(srcTxHash, payee, amountUSDC)) — amount is 6-dec ERC-20 units. */
export function deriveRefId(
  srcTxHash: Hex,
  payee: Address,
  amountUSDC: Erc20UsdcAmount,
): Hex {
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

/** Arc gas balance is native USDC (18 decimals) — never treat as ERC-20 6-dec units. */
export async function readRecorderNativeGasBalance(args: {
  publicClient: ReturnType<typeof createPublicClient>;
  address: Address;
}): Promise<NativeUsdcWei> {
  const wei = await args.publicClient.getBalance({ address: args.address });
  return asNativeUsdcWei(wei);
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
    amountUSDC: proof.amountUSDC as Erc20UsdcAmount,
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
  amountUSDC: Erc20UsdcAmount;
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
