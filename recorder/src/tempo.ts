/**
 * Tempo rail: payment AND proof on Tempo.
 *
 * A payer sends a USD TIP-20 stablecoin (pathUSD / AlphaUSD / …) to the payee on
 * Tempo. The recorder reads that transaction's receipt over Tempo JSON-RPC,
 * requires a matching TIP-20 `Transfer` (token allowlisted, `to == payee`,
 * `amount == amountUSDC`), then writes an immutable proof to the same
 * `SettlementProofs` contract (same ABI as Arc) deployed on Tempo.
 *
 * - TIP-20 tokens are always 6 decimals, so `amountUSDC` keeps its meaning
 *   (6-decimal USD stablecoin units).
 * - Tempo has no native gas token: `eth_getBalance` returns a placeholder.
 *   Recorder fees are paid in a TIP-20 fee token (pathUSD by default), so the
 *   low-balance guard reads `balanceOf(recorder)` on the fee token instead.
 * - Finality is deterministic (Simplex BFT, ~0.5 s blocks) → 1 confirmation.
 * - Mainnet (chain 4217) is refused unless TEMPO_ALLOW_MAINNET=true is set on
 *   purpose. This repo only runs Tempo on the Moderato testnet.
 */
import {
  type Address,
  type Chain,
  type Hex,
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  defineChain,
  getAddress,
  http,
  isAddress,
  isAddressEqual,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { tempo as tempoMainnet, tempoModerato } from "viem/chains";
import type { Erc20UsdcAmount } from "./decimals.js";

export const TEMPO_MODERATO_CHAIN_ID = 42431;
export const TEMPO_MAINNET_CHAIN_ID = 4217;

export const TEMPO_MODERATO_RPC = "https://rpc.moderato.tempo.xyz";
export const TEMPO_MODERATO_EXPLORER = "https://explore.testnet.tempo.xyz";

/** pathUSD — default fee token for calls to non-TIP-20 contracts. */
export const PATH_USD = "0x20C0000000000000000000000000000000000000" as Address;

/** USD TIP-20 stablecoins issued on Moderato (all 6 decimals; faucet-funded). */
export const TEMPO_TESTNET_STABLECOINS: Readonly<Record<Address, string>> = {
  "0x20C0000000000000000000000000000000000000": "pathUSD",
  "0x20C0000000000000000000000000000000000001": "AlphaUSD",
  "0x20c0000000000000000000000000000000000002": "BetaUSD",
  "0x20C0000000000000000000000000000000000003": "ThetaUSD",
};

/** Default: refuse writes when the recorder holds < 0.05 of the fee token (6-dec). */
export const DEFAULT_MIN_RECORDER_FEE_BALANCE = 50_000n;

export const tip20EventsAbi = [
  {
    type: "event",
    name: "Transfer",
    inputs: [
      { name: "from", type: "address", indexed: true },
      { name: "to", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "TransferWithMemo",
    inputs: [
      { name: "from", type: "address", indexed: true },
      { name: "to", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "memo", type: "bytes32", indexed: true },
    ],
  },
] as const;

export const tip20ReadAbi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

export type TokenAllowlist = ReadonlyMap<string, { address: Address; symbol: string }>;

/** Normalize a { address → symbol } record into a lowercase-keyed allowlist. */
export function toAllowlist(tokens: Readonly<Record<string, string>>): TokenAllowlist {
  const map = new Map<string, { address: Address; symbol: string }>();
  for (const [address, symbol] of Object.entries(tokens)) {
    if (!isAddress(address, { strict: false })) {
      throw new Error(`Invalid TIP-20 token address in allowlist: ${address}`);
    }
    const checksummed = getAddress(address);
    map.set(checksummed.toLowerCase(), { address: checksummed, symbol });
  }
  return map;
}

/**
 * Parse TEMPO_ALLOWED_TOKENS: "0xADDR:Symbol,0xADDR:Symbol". Empty → Moderato
 * stablecoin defaults.
 */
export function parseTempoTokens(raw: string | undefined): TokenAllowlist {
  const value = raw?.trim();
  if (!value) return toAllowlist(TEMPO_TESTNET_STABLECOINS);
  const record: Record<string, string> = {};
  for (const part of value.split(",")) {
    const [address, symbol] = part.trim().split(":");
    if (!address || !symbol) {
      throw new Error('TEMPO_ALLOWED_TOKENS must look like "0xADDR:Symbol,0xADDR:Symbol"');
    }
    record[address.trim()] = symbol.trim();
  }
  return toAllowlist(record);
}

export function parseMinFeeBalance(raw: string | undefined): bigint {
  const v = raw?.trim();
  if (!v) return DEFAULT_MIN_RECORDER_FEE_BALANCE;
  if (!/^\d+$/.test(v)) {
    throw new Error("TEMPO_MIN_RECORDER_FEE_BALANCE must be an integer (6-dec TIP-20 units)");
  }
  return BigInt(v);
}

type ReceiptLog = { address: Address; topics: readonly Hex[] | Hex[]; data: Hex };

export type Tip20Match =
  | {
      matched: true;
      token: Address;
      tokenSymbol: string;
      payer: Address;
      /** 32-byte TIP-20 transfer memo when the payer used transferWithMemo. */
      transferMemo: Hex | null;
    }
  | { matched: false; reason: string };

/**
 * Find a TIP-20 Transfer to `payee` for exactly `amount` from an allowlisted
 * token. Fee-token movements (to the fee manager) never match because `to`
 * must equal the payee. Pure: unit-tested against synthetic receipt logs.
 */
export function matchTip20Transfer(
  logs: readonly ReceiptLog[],
  payee: Address,
  amount: Erc20UsdcAmount | bigint,
  tokens: TokenAllowlist,
): Tip20Match {
  const tokenLogs = logs.filter((log) => tokens.has(log.address.toLowerCase()));
  if (tokenLogs.length === 0) {
    return {
      matched: false,
      reason: `no logs from an allowlisted TIP-20 stablecoin (${[...tokens.values()]
        .map((t) => t.symbol)
        .join(", ")})`,
    };
  }

  type Decoded = { token: Address; name: string; from: Address; to: Address; amount: bigint; memo?: Hex };
  const decoded: Decoded[] = [];
  for (const log of tokenLogs) {
    try {
      const event = decodeEventLog({
        abi: tip20EventsAbi,
        data: log.data,
        topics: log.topics as [Hex, ...Hex[]],
      });
      const args = event.args as { from: Address; to: Address; amount: bigint; memo?: Hex };
      decoded.push({
        token: getAddress(log.address),
        name: event.eventName,
        from: getAddress(args.from),
        to: getAddress(args.to),
        amount: args.amount,
        memo: args.memo,
      });
    } catch {
      // not a transfer event we care about
    }
  }

  const transfers = decoded.filter((d) => d.name === "Transfer");
  if (transfers.length === 0) {
    return { matched: false, reason: "TIP-20 logs present but no Transfer event decoded" };
  }

  const hit = transfers.find(
    (t) => isAddressEqual(t.to, payee) && t.amount === (amount as bigint),
  );
  if (!hit) {
    return {
      matched: false,
      reason: `TIP-20 Transfer logs found but none paid ${amount.toString()} to ${payee}`,
    };
  }

  const memoEvent = decoded.find(
    (d) =>
      d.name === "TransferWithMemo" &&
      isAddressEqual(d.token, hit.token) &&
      isAddressEqual(d.from, hit.from) &&
      isAddressEqual(d.to, hit.to) &&
      d.amount === hit.amount,
  );

  const token = tokens.get(hit.token.toLowerCase())!;
  return {
    matched: true,
    token: token.address,
    tokenSymbol: token.symbol,
    payer: hit.from,
    transferMemo: memoEvent?.memo ?? null,
  };
}

/** Minimal read surface for verifyTempoPayment (fakeable in tests). */
export type TempoPaymentReader = {
  getTransactionReceipt: (args: { hash: Hex }) => Promise<{
    status: "success" | "reverted";
    blockNumber: bigint;
    logs: readonly ReceiptLog[];
  }>;
  getBlockNumber: () => Promise<bigint>;
  getBlock: (args: { blockNumber: bigint }) => Promise<{ timestamp: bigint }>;
};

export type TempoVerification = {
  txHash: Hex;
  blockNumber: bigint;
  confirmations: bigint;
  blockTimestamp: bigint;
  payer: Address;
  token: Address;
  tokenSymbol: string;
  transferMemo: Hex | null;
};

function fail(message: string, code: string): never {
  throw Object.assign(new Error(message), { status: 400, code });
}

/**
 * Verify a Tempo TIP-20 stablecoin payment for `txHash` (tx hash in → verified
 * payment out). Never records unmatched amounts.
 */
export async function verifyTempoPayment(args: {
  client: TempoPaymentReader;
  txHash: Hex;
  payee: Address;
  amountUSDC: Erc20UsdcAmount;
  minConfirmations: number;
  tokens: TokenAllowlist;
}): Promise<TempoVerification> {
  const { client, txHash, payee, amountUSDC, minConfirmations, tokens } = args;

  const receipt = await client.getTransactionReceipt({ hash: txHash }).catch(() => null);
  if (!receipt) fail("Tempo transaction not found or not yet included", "TX_NOT_CONFIRMED");
  if (receipt.status !== "success") fail("Tempo transaction failed (status reverted)", "TX_FAILED");

  const head = await client.getBlockNumber();
  const confirmations = head - receipt.blockNumber + 1n;
  if (confirmations < BigInt(minConfirmations)) {
    fail(
      `Tempo transaction has ${confirmations} confirmation(s); need at least ${minConfirmations}`,
      "TX_NOT_CONFIRMED",
    );
  }

  const match = matchTip20Transfer(receipt.logs, payee, amountUSDC, tokens);
  if (!match.matched) {
    fail(
      `TIP-20 stablecoin Transfer to payee/amount did not match on Tempo: ${match.reason}. Unmatched amounts are never recorded.`,
      "TIP20_AMOUNT_UNVERIFIED",
    );
  }

  const block = await client.getBlock({ blockNumber: receipt.blockNumber });
  return {
    txHash,
    blockNumber: receipt.blockNumber,
    confirmations,
    blockTimestamp: block.timestamp,
    payer: match.payer,
    token: match.token,
    tokenSymbol: match.tokenSymbol,
    transferMemo: match.transferMemo,
  };
}

/** Decode a 32-byte TIP-20 memo as printable ASCII when it is text, else keep hex. */
export function describeTransferMemo(memo: Hex | null): string | null {
  if (!memo) return null;
  const hex = memo.slice(2).replace(/(00)+$/, "");
  const chars = (hex.match(/.{2}/g) ?? []).map((b) => parseInt(b, 16));
  if (chars.length > 0 && chars.every((c) => c >= 0x20 && c < 0x7f)) {
    return String.fromCharCode(...chars);
  }
  return memo;
}

export function tempoChainFor(args: {
  chainId: number;
  rpcUrl: string;
  feeToken: Address;
  explorer?: string;
}): Chain {
  if (args.chainId === TEMPO_MODERATO_CHAIN_ID) {
    return tempoModerato.extend({ feeToken: args.feeToken }) as unknown as Chain;
  }
  if (args.chainId === TEMPO_MAINNET_CHAIN_ID) {
    return tempoMainnet.extend({ feeToken: args.feeToken }) as unknown as Chain;
  }
  return defineChain({
    id: args.chainId,
    name: `Tempo ${args.chainId}`,
    nativeCurrency: { name: "USD", symbol: "USD", decimals: 6 },
    rpcUrls: { default: { http: [args.rpcUrl] } },
    blockExplorers: args.explorer
      ? { default: { name: "Tempo Explorer", url: args.explorer } }
      : undefined,
  });
}

export function createTempoClients(args: {
  rpcUrl: string;
  privateKey: Hex;
  chainId: number;
  feeToken: Address;
}) {
  const account = privateKeyToAccount(args.privateKey);
  const chain = tempoChainFor(args);
  const publicClient = createPublicClient({ chain, transport: http(args.rpcUrl) });
  const walletClient = createWalletClient({ account, chain, transport: http(args.rpcUrl) });
  return { account, chain, publicClient, walletClient };
}

export async function readFeeTokenBalance(args: {
  publicClient: { readContract: (a: never) => Promise<unknown> };
  feeToken: Address;
  address: Address;
}): Promise<bigint> {
  const read = args.publicClient.readContract as unknown as (a: {
    address: Address;
    abi: typeof tip20ReadAbi;
    functionName: "balanceOf";
    args: [Address];
  }) => Promise<bigint>;
  return read({
    address: args.feeToken,
    abi: tip20ReadAbi,
    functionName: "balanceOf",
    args: [args.address],
  });
}

export function lowFeeBalanceError(balance: bigint, min: bigint, symbol: string) {
  return Object.assign(
    new Error(
      `Recorder Tempo fee balance ${balance.toString()} (${symbol}, 6-dec) is below the ${min.toString()} threshold; refusing to write. Retry after the recorder is topped up.`,
    ),
    { status: 503, code: "LOW_GAS_BALANCE" },
  );
}
