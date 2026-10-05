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

## Do **not** set (until Miles explicitly enables mainnet)

| Env var name | Why |
| --- | --- |
| `TEMPO_ALLOW_MAINNET` | Must stay unset/`false`. If `true`, the process may talk to Tempo mainnet chain `4217`. Mainnet deploy is a separate Miles-approved step ([`tempo-mainnet-prep.md`](tempo-mainnet-prep.md)). |

## Already present (Arc rail — leave alone)

`BASE_RPC_URL`, `ARC_RPC_URL`, `SETTLEMENT_PROOFS_ADDRESS`, `SETTLEMENT_RECORDER_PRIVATE_KEY`, `RECORDER_API_KEY`, `MIN_CONFIRMATIONS`, `HOST`.

## Smoke check after Miles saves env

1. `GET https://<recorder-host>/health` → `rails.tempo` present / open.
2. Optional: `npm run demo:tempo` from `recorder/` against that host (testnet payer keys on the crew box only).
3. Confirm a new proof appears at `https://proofs.liquidlogicx.com/?network=tempo`.

