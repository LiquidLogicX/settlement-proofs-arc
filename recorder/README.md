# Settlement recorder

Hono + viem service that verifies a **Base** USDC payment and appends an immutable **notarization** on **Arc** (Decision **1A+2B**).

Payees are **public** (Decision 2B): cleartext `payee` is accepted in the authenticated write body and stored on-chain. `srcTxHash` is the **Base** payment transaction hash and stays public. There is no confidentiality claim, no `/open`, no HMAC / `VIEW_SALT_*`.

Amounts are typed: proof `amountUSDC` is `Erc20UsdcAmount` (**6** decimals). Arc recorder gas balance is `NativeUsdcWei` (**18** decimals). See `src/decimals.ts`.

The recorder wallet must **not** hold treasury funds. Fund it with Arc gas only (native USDC on Arc). It cannot move the treasurer's USDC; it only calls `recordPayment` on `SettlementProofs`.

Programmatic chain access uses JSON-RPC only (`BASE_RPC_URL`, `ARC_RPC_URL=https://rpc.mainnet.arc.io`). It does **not** call `explorer.arc.io/api`.

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` | RPC reachability, recorder address, Arc gas balance (open, no auth) |
| `POST` | `/v1/proofs` | Verify Base USDC tx and record a proof (**requires API key**) |

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

### Base USDC check (strict — no bypass)

The service requires the Base tx to be **mined**, **successful**, and to have at least `MIN_CONFIRMATIONS` (**default 12**) confirmations.

It then **requires** a matching `Transfer` from [USDC on Base](https://basescan.org/token/0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913) to cleartext `payee` for `amountUSDC`. If the Transfer does not match, the request is **rejected with HTTP 400**. Nothing is written. There is **no** `ALLOW_UNVERIFIED_AMOUNT` / TxOnly path — Part 3 removed it for good.

Startup **rejects** env vars `ALLOW_UNVERIFIED_AMOUNT`, `VIEW_SALT_KEY`, `VIEW_SALT_KEY_ID`, and `VIEW_SALT_KEY_<id>`.

## Run locally

```bash
cp .env.example .env
# fill BASE_RPC_URL, ARC_RPC_URL, SETTLEMENT_PROOFS_ADDRESS, SETTLEMENT_RECORDER_PRIVATE_KEY, RECORDER_API_KEY
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
- Health check path: `/health`

Environment variables (sync: false / secret in the dashboard):

- `BASE_RPC_URL`
- `ARC_RPC_URL`
- `SETTLEMENT_PROOFS_ADDRESS`
- `SETTLEMENT_RECORDER_PRIVATE_KEY`
- `RECORDER_API_KEY`

Optional: `MIN_CONFIRMATIONS` (default `12`), `HOST`.

Do not put private keys or API keys in the image, Blueprint values, or git.
