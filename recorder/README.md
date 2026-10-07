# Settlement recorder

Hono + viem service that verifies a stablecoin payment on-chain and appends an immutable proof to a `SettlementProofs` registry. It runs one or both **rails**:

| Rail | Payment verified on | Proof written on | Enabled by |
| --- | --- | --- | --- |
| `arc` | Base USDC (`eip155:8453`) | Arc (`eip155:5042`) | `SETTLEMENT_PROOFS_ADDRESS` + `SETTLEMENT_RECORDER_PRIVATE_KEY` |
| `tempo` | Tempo TIP-20 stablecoin (`eip155:42431`) | Tempo (same chain) | `TEMPO_SETTLEMENT_PROOFS_ADDRESS` + `TEMPO_RECORDER_PRIVATE_KEY` |

At least one rail must be configured. The Arc rail below is unchanged (Decision **1A+2B**); the Tempo rail is described in [Tempo rail](#tempo-rail) and [`../docs/tempo-testnet.md`](../docs/tempo-testnet.md).

Payees are **public** (Decision 2B): cleartext `payee` is accepted in the authenticated write body and stored on-chain. `srcTxHash` is the **Base** payment transaction hash and stays public. There is no confidentiality claim, no `/open`, no HMAC / `VIEW_SALT_*`.

Amounts are typed: proof `amountUSDC` is `Erc20UsdcAmount` (**6** decimals). Arc recorder gas balance is `NativeUsdcWei` (**18** decimals). See `src/decimals.ts`.

The recorder wallet must **not** hold treasury funds. Fund it with Arc gas only (native USDC on Arc). It cannot move the treasurer's USDC; it only calls `recordPayment` on `SettlementProofs`.

Programmatic chain access uses JSON-RPC only (`BASE_RPC_URL`, `ARC_RPC_URL=https://rpc.mainnet.arc.io`). It does **not** call `explorer.arc.io/api`.

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Always answers fast (Render probe). Recorder address and gas balance from a cached chain check (refreshed in the background every ~15 s, each RPC check capped at 4 s); `rails` lists each configured rail, `chain` shows `checkedAt`, `stale` and any refresh `errors` (open, no auth) |
| `POST` | `/v1/proofs` | Verify the payment and record a proof (**requires API key**). Optional `chain`: `"base"`/`"arc"` (default when Arc is configured), `"tempo"`, or a CAIP-2 id |
| `POST` | `/v1/tempo/proofs` | Same as `/v1/proofs` with `chain: "tempo"` |
| `GET` | `/v1/proofs/lookup` | Read-only: is this proof already recorded? Returns `proofId` + Arc `proofTxHash` (**requires API key**) |

### Auth

`POST /v1/proofs` requires `RECORDER_API_KEY` via either:

- `Authorization: Bearer <key>`, or
- `X-Api-Key: <key>`

Missing or wrong key → **401**. `/health` stays open.

Rate limit on write: **30**/IP/minute → **429**.

### `POST /v1/proofs`

```json
{
  "refId": "0x…",
  "txHash": "0x…",
  "payee": "0x…",
  "amountUSDC": "1250000",
  "memo": "invoice-42",
  "paidAt": 1700000000
}
```

- `txHash` — Base payment transaction (required). Stored on-chain as `srcTxHash`.
- `payee` — cleartext recipient (required). Verified against Base USDC `Transfer` and stored on-chain.
- `amountUSDC` — **integer** with **6** decimals (`1 USDC = 1000000`). Not Arc native 18-dec wei.
- `memo` — optional string.
- `paidAt` — optional unix seconds. If omitted, the Base block timestamp is used.
- `refId` — optional `bytes32`. If omitted, derived as Solidity `keccak256(abi.encodePacked(srcTxHash, payee, amountUSDC))`.

Sample **201** response:

```json
{
  "idempotent": false,
  "proofTxHash": "0x…",
  "proof": {
    "refId": "0x…",
    "payee": "0x…",
    "amountUSDC": "1250000",
    "paidAt": 1700000000,
    "srcTxHash": "0x…",
    "memo": "invoice-42",
    "recordedAt": 1700000100
  }
}
```

Idempotent on `refId`: a retry of the same id returns **200** with the existing proof and does not send a second Arc transaction.

Both 201 and idempotent 200 responses also carry (additive, best-effort — `null` if the Arc RPC read fails):

- `proofId` — 1-based position in the registry (`getProofAt(proofId - 1)`). Proof #1 is index 0.
- `proofTxHash` — Arc tx that emitted `PaymentRecorded` for the `refId` (on idempotent 200 it is found via `eth_getLogs` by indexed `refId`).

### Tempo rail

```http
POST /v1/tempo/proofs
Authorization: Bearer <RECORDER_API_KEY>
Content-Type: application/json

{ "txHash": "0x592d…eb71", "payee": "0xfd68…45c7", "amountUSDC": "12500000", "memo": "Design retainer, Oct" }
```

- `txHash` is the **Tempo** payment transaction. The receipt must be successful, have `TEMPO_MIN_CONFIRMATIONS` (default 1; Tempo finality is deterministic), and contain a `Transfer(from, to=payee, value=amountUSDC)` log emitted by an allowlisted TIP-20 stablecoin (`TEMPO_ALLOWED_TOKENS`, default pathUSD/AlphaUSD/BetaUSD/ThetaUSD). Otherwise `400 TIP20_AMOUNT_UNVERIFIED` and nothing is written.
- `amountUSDC` is in the token's 6-decimal units (all TIP-20 tokens use 6 decimals).
- The on-chain memo becomes `eip155:42431/<TokenSymbol> <note>` (note capped at 128 chars). `note` = request `memo`, else the payer's TIP-20 `transferWithMemo` text, else empty. The Arc rail rejects memos that start with an `eip155:` tag, so a Base proof can't pose as a Tempo one.
- Fees are paid in pathUSD. Before writing, the recorder requires `TEMPO_MIN_RECORDER_FEE_BALANCE` (default 0.05 pathUSD) or returns `503 LOW_GAS_BALANCE`.
- Chain `4217` (Tempo mainnet) is refused at startup unless `TEMPO_ALLOW_MAINNET=true`. The Tempo key must differ from the Arc recorder key.

Response (`201` new, `200` idempotent):

```json
{
  "idempotent": true,
  "proofId": 1,
  "proofTxHash": "0xa74d…2dda",
  "proof": { "refId": "0x064a…c14c", "payee": "0xfd68…45c7", "amountUSDC": "12500000",
             "paidAt": 1791223316, "srcTxHash": "0x592d…eb71",
             "memo": "eip155:42431/AlphaUSD Design retainer, Oct", "recordedAt": 1791223318 },
  "rail": "tempo",
  "payment": { "chain": "eip155:42431", "payer": "0x5eA5…1f49", "payee": "0xfd68…45c7",
               "amountUSDC": "12500000", "token": "0x20C0…0001", "tokenSymbol": "AlphaUSD",
               "transferMemo": "INV-2026-1001", "explorerUrl": "https://explore.testnet.tempo.xyz/tx/0x592d…", "verified": true },
  "registry": { "chain": "eip155:42431", "contract": "0x2ec4…2c0b", "txHash": "0xa74d…2dda",
                "explorerUrl": "https://explore.testnet.tempo.xyz/tx/0xa74d…" },
  "verifyUrl": "https://proofs.liquidlogicx.com/proofs/0x064a…c14c?network=tempo"
}
```

Arc-rail responses keep every existing field and add the same `rail`, `payment`, `registry` and `verifyUrl` blocks. `GET /v1/proofs/lookup` takes `chain=tempo` too.

Demo client: `npm run demo:tempo -- --amount 1.25 --token AlphaUSD --memo "INV-1001" --note "…"` (pays with `transferWithMemo` on Moderato, then posts to `RECORDER_URL`).

### Low gas guard

Before any Arc write the recorder reads its native gas balance. Below `MIN_RECORDER_GAS_WEI` (default `50000000000000000` = 0.05 native USDC, 18 decimals) it logs a warning and returns **503** `{ "code": "LOW_GAS_BALANCE" }` without writing. The idempotent path (proof already exists) still answers. `/health` exposes `minRecorderGasWei` and `lowGas`.

### `GET /v1/proofs/lookup`

Used by `audit.liquidlogicx.com/api/prove` for idempotency before it asks for a write.

- `?refId=0x…`, or
- `?txHash=0x…&payee=0x…&amountUSDC=1000` (refId derived exactly as for `POST`).

`200 { "found": true, "proofId": 1, "proofTxHash": "0x…", "proof": { … } }` or `404 { "found": false, "refId": "0x…" }`. Arc RPC error → `503 ARC_READ_FAILED`. Rate limit 120/IP/minute.

### Base USDC check (strict — no bypass)

The service requires the Base tx to be **mined**, **successful**, and to have at least `MIN_CONFIRMATIONS` (**default 12**) confirmations.

It then **requires** a matching `Transfer` from [USDC on Base](https://basescan.org/token/0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913) to cleartext `payee` for `amountUSDC`. If the Transfer does not match, the request is **rejected with HTTP 400**. Nothing is written. There is **no** `ALLOW_UNVERIFIED_AMOUNT` / TxOnly path — Part 3 removed it for good.

Startup **rejects** env vars `ALLOW_UNVERIFIED_AMOUNT`, `VIEW_SALT_KEY`, `VIEW_SALT_KEY_ID`, and `VIEW_SALT_KEY_<id>`.

## Run locally

```bash
cp .env.example .env
# Arc rail: BASE_RPC_URL, ARC_RPC_URL, SETTLEMENT_PROOFS_ADDRESS, SETTLEMENT_RECORDER_PRIVATE_KEY
# Tempo rail: TEMPO_SETTLEMENT_PROOFS_ADDRESS, TEMPO_RECORDER_PRIVATE_KEY
# Both: RECORDER_API_KEY
npm install
npm run typecheck
npm test
npm run build
npm start
```

Dev: `npm run dev`

## Render

Use the root `render.yaml` or create a **Web Service**:

- Runtime: Docker
- Dockerfile path: `recorder/Dockerfile`
- Docker context: `recorder`
- Health check path: `/health`. It never waits on Arc/Tempo RPC (only the very first request after boot waits, at most 2 s), so a slow public RPC can't fail Render's 5 s probe and restart the instance. Writes still check gas live.

Environment variables (sync: false / secret in the dashboard):

- `BASE_RPC_URL`
- `ARC_RPC_URL`
- `SETTLEMENT_PROOFS_ADDRESS`
- `SETTLEMENT_RECORDER_PRIVATE_KEY`
- `RECORDER_API_KEY`

Optional: `MIN_CONFIRMATIONS` (default `12`), `MIN_RECORDER_GAS_WEI` (default 0.05 native USDC in 18-dec wei), `HOST`.

To enable the Tempo rail on the same service, add `TEMPO_SETTLEMENT_PROOFS_ADDRESS` and `TEMPO_RECORDER_PRIVATE_KEY` (secret), plus any optional `TEMPO_*` overrides from `.env.example`. Without them the service runs Arc-only, exactly as before. `render.yaml` is intentionally unchanged so a Blueprint sync can't alter the live service; add the Tempo vars by hand in the dashboard when approved.

Do not put private keys or API keys in the image, Blueprint values, or git.
