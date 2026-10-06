# Render — Tempo rail env vars for `arc-settlement-recorder`

Enable live Tempo payment → Tempo proof writes on the existing Render web service **`arc-settlement-recorder`**.

**Miles pastes secret values himself.** Never put private keys, API keys, or funded mainnet keys in chat, the bridge, git, or screenshots.

## Where to set

Render Dashboard → workspace that owns **`arc-settlement-recorder`** → service **`arc-settlement-recorder`** → **Environment** tab → Add / Edit → Save → redeploy (or wait for auto-redeploy).

Blueprint stubs (names only, `sync: false`) are also listed in [`../render.yaml`](../render.yaml).

## Required to enable the Tempo rail

| Env var name | What Miles pastes | Notes |
| --- | --- | --- |
| `TEMPO_SETTLEMENT_PROOFS_ADDRESS` | `0x2ec4CF47e6964b33FEd3718f07885ed44aF52c0b` | Moderato v2 registry (public). |
| `TEMPO_RECORDER_PRIVATE_KEY` | *(secret — Miles only)* | Hex key for the wallet that already holds `RECORDER_ROLE` on v2 (`0xc300c1092b949bCE55E7d0B0d86Cb733d03fA114` on Moderato). Must **differ** from `SETTLEMENT_RECORDER_PRIVATE_KEY` (Arc). Testnet faucet funds only; never reuse on Tempo mainnet. |

Without both, the Tempo rail stays disabled; Arc continues to work. The three demo proofs are already on-chain, so the verifier demo does not require these.

## Recommended / optional

| Env var name | Suggested value | Notes |
| --- | --- | --- |
| `TEMPO_RPC_URL` | `https://rpc.moderato.tempo.xyz` | Default if unset. |
| `TEMPO_EXPLORER` | `https://explore.testnet.tempo.xyz` | Default if unset. |
| `TEMPO_MIN_CONFIRMATIONS` | `1` | Tempo finality is deterministic. |
| `TEMPO_FEE_TOKEN` | `0x20c0000000000000000000000000000000000000` | pathUSD (default). |
| `TEMPO_ALLOWED_TOKENS` | *(omit for default four Moderato stablecoins)* | Comma-separated TIP-20 addresses if tightening the allowlist. |
| `TEMPO_MIN_RECORDER_FEE_BALANCE` | `50000` | 0.05 pathUSD (6-dec units); below this → `503 LOW_GAS_BALANCE`. |
| `PUBLIC_VERIFIER_URL` | `https://proofs.liquidlogicx.com` | Used in `verifyUrl` responses. |

## `TEMPO_ALLOW_MAINNET`

Leave unset while the rail is on Moderato. Set it to `true` only as part of the mainnet switch-over below: if `TEMPO_RPC_URL` returns chain `4217` without it, the recorder refuses to start.

## Already present (Arc rail — leave alone)

`BASE_RPC_URL`, `ARC_RPC_URL`, `SETTLEMENT_PROOFS_ADDRESS`, `SETTLEMENT_RECORDER_PRIVATE_KEY`, `RECORDER_API_KEY`, `MIN_CONFIRMATIONS`, `HOST`.

## Smoke check after Miles saves env

1. `GET https://<recorder-host>/health` → `rails.tempo` present / open.
2. Optional: `npm run demo:tempo` from `recorder/` against that host (testnet payer keys on the crew box only).
3. Confirm a new proof appears at `https://proofs.liquidlogicx.com/?network=tempo`.

## Tempo mainnet switch-over

Miles approved going live on Tempo mainnet (2026-10-05 PT). The recorder runs **one** Tempo rail, so this replaces the Moderato rail: new testnet writes stop, and the 3 testnet proofs stay on-chain and stay visible on the verifier's **Tempo testnet** tab.

Set these on `arc-settlement-recorder` → **Environment**, **all in one save** (Render's "Add from .env" accepts these lines as they are). Values come from `recorder/src/config.ts` and `recorder/src/tempo.ts`:

```
TEMPO_SETTLEMENT_PROOFS_ADDRESS=0x9940a8fE88f8BE0bB8E05686631Fd638DC1DfE6A
TEMPO_RECORDER_PRIVATE_KEY=<SECRET: Miles pastes the key for recorder 0xea80a0db6bc7efb797d70a00d7bd2f57e5c06dac>
TEMPO_RPC_URL=https://rpc.tempo.xyz
TEMPO_EXPLORER=https://explore.tempo.xyz
TEMPO_ALLOW_MAINNET=true
TEMPO_FEE_TOKEN=0x20C000000000000000000000b9537d11c60E8b50
TEMPO_ALLOWED_TOKENS=0x20C000000000000000000000b9537d11c60E8b50:USDC.e,0x20C0000000000000000000000000000000000000:pathUSD
TEMPO_MIN_CONFIRMATIONS=1
TEMPO_MIN_RECORDER_FEE_BALANCE=50000
PUBLIC_VERIFIER_URL=https://proofs.liquidlogicx.com
```

Why each matters:

- `TEMPO_ALLOW_MAINNET=true` is required: chain `4217` is refused at startup otherwise.
- `TEMPO_FEE_TOKEN` must be USDC.e: the default is pathUSD, and the recorder wallet holds only USDC.e.
- `TEMPO_ALLOWED_TOKENS` must be set: the default allowlist is the four Moderato faucet tokens, so a USDC.e payment would be rejected (`TIP20_AMOUNT_UNVERIFIED`).
- `TEMPO_MIN_CONFIRMATIONS`, `TEMPO_MIN_RECORDER_FEE_BALANCE` and `PUBLIC_VERIFIER_URL` are the code defaults; setting them is optional.

**Arc is unaffected.** `loadArc()` reads only `BASE_RPC_URL`, `ARC_RPC_URL`, `SETTLEMENT_PROOFS_ADDRESS`, `SETTLEMENT_RECORDER_PRIVATE_KEY`, `MIN_CONFIRMATIONS`, `MIN_RECORDER_GAS_WEI`. No `TEMPO_*` var is read by the Arc rail (test: `Tempo mainnet env (Render switch-over) leaves the Arc rail config identical` in `recorder/test/app-tempo.test.ts`). Requests without a `chain` still go to Arc. Two cautions: the Tempo key must differ from the Arc key (it does, it's a new mainnet-only wallet), and if the Tempo rail fails at boot (for example a missing `TEMPO_ALLOW_MAINNET`), the process does not start. On a failed deploy Render keeps the previous deploy serving, so Arc stays up. Check the deploy log before you walk away.

### After the save: smoke check

1. `GET https://<recorder-host>/health` → `rails.tempo.tempoChainId` = `4217`, `settlementProofs` = `0x9940…DfE6A`, `recorder` = `0xea80…6dac`, `feeTokenSymbol` = `USDC.e`, `lowGas` = `false`. `rails.arc` unchanged.

### First mainnet proof

1. Send a small real payment on Tempo mainnet, for example **1 USDC.e** (`1000000` units) from the admin wallet to `0xea80a0db6bc7efb797d70a00d7bd2f57e5c06dac` (any payee works; it just has to match the request below). A `transferWithMemo` memo (such as an invoice id) is optional and gets carried into the proof.
2. Ask the recorder to prove it:

   ```bash
   curl -sS -X POST "https://<recorder-host>/v1/tempo/proofs" \
     -H "Authorization: Bearer $RECORDER_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{"txHash":"0x<payment tx hash>","payee":"0xea80a0db6bc7efb797d70a00d7bd2f57e5c06dac","amountUSDC":"1000000","memo":"First Tempo mainnet proof"}'
   ```

   - Auth: `RECORDER_API_KEY` as `Authorization: Bearer …` or `x-api-key: …` (the same key the Arc path uses).
   - `txHash`: the Tempo payment tx. `payee`: the transfer's recipient. `amountUSDC`: exact 6-dec units (1 USDC.e = `1000000`). `memo` is optional; when it's empty the on-chain TIP-20 memo is used. Optional fields are `refId` (default `keccak(txHash, payee, amount)`) and `paidAt` (default is the payment block time).
   - Equivalent: `POST /v1/proofs` with `"chain":"tempo"` (or `"eip155:4217"`). Without `chain`, `/v1/proofs` goes to Arc.
3. Expect `201` with `proof`, `proofTxHash`, `registry.explorerUrl` (`https://explore.tempo.xyz/tx/…`), payer/token (`USDC.e`) and `verifyUrl`. The on-chain memo reads `eip155:4217/USDC.e First Tempo mainnet proof`. Repeating the call returns `200 idempotent`. `400 TIP20_AMOUNT_UNVERIFIED` means the payee, amount or token did not match (nothing is written). `503 LOW_GAS_BALANCE` means the recorder holds less than 0.05 USDC.e.
4. Read-only re-check: `GET /v1/proofs/lookup?chain=tempo&txHash=0x…&payee=0xea80…6dac&amountUSDC=1000000` (same auth).
5. On the verifier, once the Option A web change is deployed, the proof shows on `https://proofs.liquidlogicx.com/?network=tempo-mainnet` and at `/proofs/<refId>?network=tempo-mainnet`. The verifier re-checks the USDC.e transfer on `rpc.tempo.xyz` on its own. With `NEXT_PUBLIC_TEMPO_DEFAULT_NETWORK` unset (`auto`), the Tempo mainnet tab moves ahead of Tempo testnet within about 60 s of the first proof, and the testnet tab links to it. `verifyUrl` uses `?network=tempo-mainnet` once the recorder runs this repo's code from the same change. An older recorder build returns `?network=tempo`; swap the param by hand.
