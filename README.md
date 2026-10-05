# LLX Settlement Proofs

**Receipts for stablecoin payments that anyone can check.**

Send a payment transaction hash. LLX Settlement Proofs confirms the transfer on-chain (right payee, right amount, right token), then writes a permanent, append-only proof record and gives you a public link. The link shows who paid, who got paid, how much, and both transactions. No account or wallet is needed to check it.

Live on two registries:

| Registry | Payment it proves | Status |
| --- | --- | --- |
| **Tempo** (Moderato testnet, `eip155:42431`) | TIP-20 stablecoins paid **on Tempo** (pathUSD, AlphaUSD, BetaUSD, ThetaUSD) | Live end-to-end, 3 real testnet proofs |
| **Arc** (mainnet, `eip155:5042`) | USDC paid **on Base** (`eip155:8453`) | Live, 2 mainnet proofs |

## Why it matters

Stablecoin payments settle in seconds, but the paperwork around them doesn't. A finance team, an auditor, or an AI agent's operator still has to prove that a specific payment happened: who paid, who received, how much, and when. Today that means screenshots, CSV exports, and "trust me" links to a block explorer that only shows raw logs.

A settlement proof is a small, permanent record tied to the real payment:

- **Verified before it's written.** The recorder refuses to record anything unless the payment tx contains a matching stablecoin `Transfer` to the payee for the exact amount. There is no override flag.
- **Append-only.** The contract has no edit or delete function. Only the recorder role can add a proof, and each payment can be recorded only once.
- **Independently checkable.** The public verifier re-reads the payment on its own chain over JSON-RPC, so it doesn't rely on the recorder being honest.
- **Built for agents and APIs.** One HTTP call: payment tx hash in, proof plus verify link out. The same proof flow is offered as a paid x402 API on Base.

## Try it in 2 minutes

1. Open the Tempo ledger: **https://proofs.liquidlogicx.com/?network=tempo**
   You'll see three real testnet payments, each with chain, token, payer → payee, amount, the Tempo payment tx, and the Tempo proof tx.
2. Click any memo (for example *Design retainer, Oct*) to open its proof page. The green **Payment re-checked on-chain** badge means the page just fetched the payment receipt from Tempo and found the matching transfer.
3. Paste a **payment** tx hash into the verifier: https://proofs.liquidlogicx.com/proofs?network=tempo — for example
   `0xcffea545574a85398d0536fd90dbe06ee3a9a68d489194a278f70bd9b87527e5` (250 BetaUSD contractor payout). The verifier finds the proof from the payment hash alone.
4. Open the same payment on the Tempo explorer and compare: https://explore.testnet.tempo.xyz/tx/0xcffea545574a85398d0536fd90dbe06ee3a9a68d489194a278f70bd9b87527e5
5. Switch the selector to **Arc** to see the mainnet registry (USDC paid on Base, proof on Arc).

> Until the web PR is deployed, the live site may still point its Tempo tab at the older Moderato registry. Run the web app locally (below) to see the Tempo proofs today.

Record your own (testnet, a few seconds end to end):

```bash
cd recorder && npm install
# 1) start a Tempo-only recorder (see recorder/README.md for env)
# 2) pay + prove + print the verify link:
TEMPO_PAYER_PRIVATE_KEY=0x… TEMPO_PAYEE_ADDRESS=0x… \
RECORDER_URL=http://127.0.0.1:10000 RECORDER_API_KEY=… \
npm run demo:tempo -- --amount 12.50 --token AlphaUSD --memo "INV-1001" --note "Design retainer"
```

## Live links and addresses

| What | Where |
| --- | --- |
| Public verifier | https://proofs.liquidlogicx.com (`?network=tempo` or `?network=arc`) |
| Tempo SettlementProofs (Moderato) | [`0x2ec4CF47e6964b33FEd3718f07885ed44aF52c0b`](https://explore.testnet.tempo.xyz/address/0x2ec4CF47e6964b33FEd3718f07885ed44aF52c0b) |
| Arc SettlementProofs (mainnet) | [`0x1de52cbc4490a7873ef007e51cb91a5b374facb1`](https://explorer.arc.io/address/0x1de52cbc4490a7873ef007e51cb91a5b374facb1) |
| Paid proof API (x402, Base) | `GET/POST https://audit.liquidlogicx.com/api/prove` (Base USDC tx in → Arc proof out) |
| Older Tempo registry (v1, one synthetic self-test) | [`0x35d7ec9B87A173774F18182c087bE3296efCce51`](https://explore.testnet.tempo.xyz/address/0x35d7ec9B87A173774F18182c087bE3296efCce51) |

### Real Tempo testnet proofs

| # | Payment (Tempo) | Amount | Proof record (Tempo) | Verify |
| --- | --- | --- | --- | --- |
| 1 | [`0x592d…eb71`](https://explore.testnet.tempo.xyz/tx/0x592d108234d07171b9dd3e43f0390ebbac989276bf53031522219e1ddfd8eb71) | 12.50 AlphaUSD · memo `INV-2026-1001` | [`0xa74d…2dda`](https://explore.testnet.tempo.xyz/tx/0xa74d1f33a90c39e7886dfdff5897081bf948b7315b38340f453bd9d742272dda) | [proof](https://proofs.liquidlogicx.com/proofs/0x064a33b196b10c9f249165de66419d9daafb21616633ea15085d53e06d9dc14c?network=tempo) |
| 2 | [`0x9a4f…a86d`](https://explore.testnet.tempo.xyz/tx/0x9a4f37aad10d4cb3d811ba09591afb4c9c626a62e855930655978bdb327ea86d) | 0.42 pathUSD · memo `API-CALLS-OCT-W1` | [`0x6650…f0e0`](https://explore.testnet.tempo.xyz/tx/0x66505dcfdfdbc70dc0e8ef25a46e8cdd8b594c8d6d494d28315a667c2dacf0e0) | [proof](https://proofs.liquidlogicx.com/proofs/0x202b7ae48f2bd001065450050106800b5a70763e762900dbe8247edd01786d86?network=tempo) |
| 3 | [`0xcffe…27e5`](https://explore.testnet.tempo.xyz/tx/0xcffea545574a85398d0536fd90dbe06ee3a9a68d489194a278f70bd9b87527e5) | 250 BetaUSD · memo `PAYOUT-0007` | [`0x1a22…e693`](https://explore.testnet.tempo.xyz/tx/0x1a22f3a51875286a8338e21aa74574acc46b31e03805eed50597262e8785e693) | [proof](https://proofs.liquidlogicx.com/proofs/0x3a667de23cf4dce787f79b2e14457964ff2b1935f949c3a294793ff389eef41f?network=tempo) |

All three were recorded on 2026-10-05 by the recorder in this repo (`POST /v1/tempo/proofs`), each one after it checked the payment on Tempo.

## How it works

```
Tempo rail   payer ──TIP-20 transferWithMemo──▶ payee        (Tempo)
                         │ tx hash
                         ▼
             recorder: receipt via Tempo RPC → Transfer(to=payee, amount) from an allowlisted stablecoin?
                         │ yes (no → 400, nothing written)
                         ▼
             SettlementProofs.recordPayment(refId, payee, amount, paidAt, srcTxHash, memo)   (Tempo)
                         ▼
             proofs.liquidlogicx.com: reads the registry + re-checks the payment receipt itself

Arc rail     same flow, but the payment is USDC on Base and the proof is written on Arc
```

- `refId = keccak256(abi.encodePacked(srcTxHash, payee, amountUSDC))`. Retrying the same payment returns the existing proof; the contract also rejects duplicates.
- Amounts are 6-decimal stablecoin units on both rails (TIP-20 tokens are always 6 decimals).
- Tempo proofs carry a memo tag like `eip155:42431/AlphaUSD Design retainer`, so any reader knows which chain and token the `srcTxHash` belongs to. The payer's 32-byte TIP-20 transfer memo (an invoice number, for example) is kept as the note when no note is given.
- Tempo fees are paid in pathUSD (Tempo has no native gas token). The recorder checks its pathUSD balance before every write and returns 503 if it's low, so a write never fails halfway.
- Tempo finality is deterministic (sub-second blocks), so one confirmation is final. Base payments wait for 12.

### Why Tempo

Tempo is a payments chain: stablecoin-native fees, sub-second deterministic finality, and TIP-20 tokens with built-in 32-byte transfer memos for reconciliation. That's exactly the data a settlement proof needs. Payment and proof sit on the same chain, a proof is final a couple of seconds after the payment, and the invoice reference rides along in the transfer itself.

## Repository

| Path | What |
| --- | --- |
| [`contracts/`](contracts/) | `SettlementProofs.sol` (Foundry, OpenZeppelin `AccessControl`), tests, deploy script. Same contract on Arc and Tempo. |
| [`recorder/`](recorder/) | TypeScript (Hono + viem) service. Verifies the payment, writes the proof. Rails: Base → Arc, Tempo → Tempo. |
| [`web/`](web/) | Next.js public verifier and ledger (read-only, JSON-RPC only). |
| [`hackathon/`](hackathon/) | Crypto World's Fair submission pack (pitch, demo script, form answers). |
| [`docs/`](docs/) | [`tempo-testnet.md`](docs/tempo-testnet.md), [`arc-operations.md`](docs/arc-operations.md), decimals check, design answers. |

## Run locally

```bash
git submodule update --init --recursive
cd contracts && forge test                     # 14 contract tests

cd ../recorder && npm install
npm run typecheck && npm test && npm run build # 59 tests (Tempo path, rails, config, Arc lookups)

cd ../web && npm install
npx tsc --noEmit -p tsconfig.json
NEXT_PUBLIC_SETTLEMENT_PROOFS_ADDRESS=0x1de52cbc4490a7873ef007e51cb91a5b374facb1 npm run dev
# → http://localhost:3000/?network=tempo
```

## Recorder API (short)

```http
POST /v1/tempo/proofs              # or POST /v1/proofs with "chain": "tempo" | "base"
Authorization: Bearer <RECORDER_API_KEY>
{ "txHash": "0x…", "payee": "0x…", "amountUSDC": "12500000", "memo": "optional note" }
```

Response (201, or 200 if already recorded): `proof`, `payment` (chain, payer, payee, token, amount, TIP-20 memo, explorer link), `registry` (contract, proof tx, explorer link), `verifyUrl`. Errors: `400 TIP20_AMOUNT_UNVERIFIED` / `USDC_AMOUNT_UNVERIFIED` (no match, nothing written), `400 TX_NOT_CONFIRMED`, `401`, `429`, `503 LOW_GAS_BALANCE`. Full reference: [`recorder/README.md`](recorder/README.md).

## Configuration

Real keys never go in git; placeholders live in `**/.env.example`.

- **Recorder, Tempo rail:** `TEMPO_SETTLEMENT_PROOFS_ADDRESS`, `TEMPO_RECORDER_PRIVATE_KEY` (testnet key, pathUSD for fees, must differ from the Arc key), optional `TEMPO_RPC_URL`, `TEMPO_ALLOWED_TOKENS`, `TEMPO_MIN_RECORDER_FEE_BALANCE`. Tempo mainnet (chain 4217) is refused unless `TEMPO_ALLOW_MAINNET=true`.
- **Recorder, Arc rail:** `BASE_RPC_URL`, `ARC_RPC_URL`, `SETTLEMENT_PROOFS_ADDRESS`, `SETTLEMENT_RECORDER_PRIVATE_KEY`, `MIN_CONFIRMATIONS` (default 12). Unchanged; see [`docs/arc-operations.md`](docs/arc-operations.md).
- **Both:** `RECORDER_API_KEY`, optional `PUBLIC_VERIFIER_URL`.
- **Web:** `NEXT_PUBLIC_SETTLEMENT_PROOFS_ADDRESS` (Arc), `NEXT_PUBLIC_TEMPO_SETTLEMENT_PROOFS_ADDRESS` (defaults to the Tempo registry above), optional `NEXT_PUBLIC_TEMPO_REGISTRY_FROM_BLOCK`, `NEXT_PUBLIC_BASE_RPC_URL`.

## Roadmap

- Tempo mainnet registry, once an LLX-owned admin wallet is funded (Tempo mainnet has been live since March 2026).
- Paid proof API for Tempo payments (same pay-per-proof model as the Base endpoint), including Tempo's Machine Payments Protocol for agent clients.
- Batch proofs and CSV export for month-end close.
- Superseding records: an append-only correction that points at an earlier proof (a wrong proof is never edited).
- Selective disclosure for payees who need it, once the underlying chains support it. This is roadmap only. Every proof today is fully public, by design.

## More

- [`hackathon/`](hackathon/) — pitch, 2–3 minute demo script, submission answers
- [`docs/tempo-testnet.md`](docs/tempo-testnet.md) — Tempo deploy, wallets, proofs, recipes
- [`HANDOFF-NOTE.md`](HANDOFF-NOTE.md), [`ARC-SPEC.md`](ARC-SPEC.md) — Arc design history (Decisions 1A + 2B)

## License

MIT
