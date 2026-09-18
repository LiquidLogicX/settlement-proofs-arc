# Settlement recorder

Hono + viem service that verifies an **Arc** USDC settlement and appends an immutable proof on **Arc**.

Payees are **public** (Decision 2B): cleartext `payee` is accepted in the authenticated write body and stored on-chain. `srcTxHash` is the Arc payment / x402 settlement transaction hash and stays public.

The recorder wallet must **not** hold treasury funds. Fund it with Arc gas only (native USDC on Arc). It cannot move the treasurer's USDC; it only calls `recordPayment` on `SettlementProofs`.

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` | RPC reachability, recorder address, Arc gas balance (open, no auth) |
| `POST` | `/v1/proofs` | Verify Arc USDC tx and record a proof (**requires API key**) |

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

- `txHash` — Arc settlement transaction (required). Stored on-chain as `srcTxHash`.
- `payee` — cleartext recipient (required). Verified against Arc USDC `Transfer` and stored on-chain.
- `amountUSDC` — **integer** with 6 decimals (`1 USDC = 1000000`).
- `memo` — optional string.
- `paidAt` — optional unix seconds. If omitted, the Arc block timestamp is used.
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

### Arc USDC check (strict)

The service requires the Arc tx to be **mined**, **successful**, and to have at least `MIN_CONFIRMATIONS` (**default 6**) confirmations.

It then **requires** a matching `Transfer` from Arc USDC `0x3600000000000000000000000000000000000000` to cleartext `payee` for `amountUSDC`. If the Transfer does not match, the request is **rejected with HTTP 400**. Nothing is written. There is no `ALLOW_UNVERIFIED_AMOUNT` / TxOnly path.

## Run locally

```bash
cp .env.example .env
# fill SETTLEMENT_PROOFS_ADDRESS, SETTLEMENT_RECORDER_PRIVATE_KEY, RECORDER_API_KEY
npm install
npm run typecheck
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

- `ARC_RPC_URL`
- `SETTLEMENT_PROOFS_ADDRESS`
- `SETTLEMENT_RECORDER_PRIVATE_KEY`
- `RECORDER_API_KEY`

Optional: `MIN_CONFIRMATIONS` (default `6`), `HOST`.

Do not put private keys or API keys in the image, Blueprint values, or git.
