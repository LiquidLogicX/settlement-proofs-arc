/**
 * Tempo Moderato demo: pay → prove → verify, end to end.
 *
 *   1. Payer sends a TIP-20 stablecoin to the payee with `transferWithMemo`
 *      (real testnet transaction on Tempo Moderato, chain 42431).
 *   2. POST the tx hash to the recorder (`/v1/tempo/proofs`) — the recorder
 *      verifies the Transfer on Tempo and writes the proof to SettlementProofs
 *      on Tempo.
 *   3. Print the public verifier link.
 *
 * Usage (from recorder/):
 *   TEMPO_PAYER_PRIVATE_KEY=0x… TEMPO_PAYEE_ADDRESS=0x… \
 *   RECORDER_URL=http://127.0.0.1:10000 RECORDER_API_KEY=… \
 *   npx tsx scripts/tempo-demo-pay.ts --amount 1.25 --token AlphaUSD --memo "INV-1001"
 *
 * Omit RECORDER_URL to only make the payment and print the tx hash.
 * Testnet only: refuses to run against Tempo mainnet (chain 4217).
 */
import { type Address, type Hex, createPublicClient, createWalletClient, http, parseUnits, stringToHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { tempoModerato } from "viem/chains";
import { TEMPO_MAINNET_CHAIN_ID, TEMPO_TESTNET_STABLECOINS } from "../src/tempo.js";

const transferWithMemoAbi = [
  {
    type: "function",
    name: "transferWithMemo",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "memo", type: "bytes32" },
    ],
    outputs: [],
  },
] as const;

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

function need(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Set ${name}`);
  return v;
}

const rpcUrl = process.env.TEMPO_RPC_URL?.trim() || "https://rpc.moderato.tempo.xyz";
const amountHuman = arg("amount", "1.00")!;
const tokenName = arg("token", "AlphaUSD")!;
const memoText = arg("memo", `llx-demo-${Date.now()}`)!;
const note = arg("note");

const tokenEntry = Object.entries(TEMPO_TESTNET_STABLECOINS).find(
  ([, symbol]) => symbol.toLowerCase() === tokenName.toLowerCase(),
);
if (!tokenEntry) throw new Error(`Unknown token ${tokenName}`);
const token = tokenEntry[0] as Address;

const payer = privateKeyToAccount(need("TEMPO_PAYER_PRIVATE_KEY") as Hex);
const payee = need("TEMPO_PAYEE_ADDRESS") as Address;

// Pay fees in the token being sent (Tempo default for TIP-20 calls).
const chain = tempoModerato.extend({ feeToken: token });
const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
const chainId = await publicClient.getChainId();
if (chainId === TEMPO_MAINNET_CHAIN_ID) throw new Error("Refusing to run on Tempo mainnet");

const amount = parseUnits(amountHuman, 6);
if (memoText.length > 32) throw new Error("TIP-20 memo is 32 bytes max");
const memo = stringToHex(memoText, { size: 32 });

const wallet = createWalletClient({ account: payer, chain, transport: http(rpcUrl) });
const txHash = await wallet.writeContract({
  address: token,
  abi: transferWithMemoAbi,
  functionName: "transferWithMemo",
  args: [payee, amount, memo],
});
const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
const payment = {
  step: "payment",
  chainId,
  token: `${tokenName}:${token}`,
  payer: payer.address,
  payee,
  amountUSDC: amount.toString(),
  memo: memoText,
  txHash,
  status: receipt.status,
  block: receipt.blockNumber.toString(),
  explorer: `https://explore.testnet.tempo.xyz/tx/${txHash}`,
};
console.log(JSON.stringify(payment, null, 2));
if (receipt.status !== "success") process.exit(1);

const recorderUrl = process.env.RECORDER_URL?.trim();
if (!recorderUrl) process.exit(0);

const res = await fetch(`${recorderUrl.replace(/\/+$/, "")}/v1/tempo/proofs`, {
  method: "POST",
  headers: { "content-type": "application/json", authorization: `Bearer ${need("RECORDER_API_KEY")}` },
  body: JSON.stringify({ txHash, payee, amountUSDC: amount.toString(), memo: note ?? "" }),
});
const body = await res.json();
console.log(JSON.stringify({ step: "proof", status: res.status, ...body }, null, 2));
if (!res.ok) process.exit(1);
