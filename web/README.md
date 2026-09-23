# Public settlement ledger

Read-only Next.js app. It talks to **Arc RPC** (`https://rpc.mainnet.arc.io`) and the `SettlementProofs` contract via `eth_call` / logs. There is no wallet connect and **no** `explorer.arc.io/api` dependency (Cloudflare blocks that API).

Under **1A+2B**: payment is on **Base**; the ledger notarizes cleartext **payee** and public **srcTxHash** (Base payment tx) on Arc. Human links use BaseScan for `srcTxHash` and the Arc explorer **root pages** for the registry proof tx. There is no confidentiality claim.

```bash
cp .env.example .env.local
# set NEXT_PUBLIC_SETTLEMENT_PROOFS_ADDRESS (after redeploy)
npm install
npm run dev
```

## Vercel

Import the `web` directory as the root of a Next.js project (or set Root Directory to `web` in a monorepo). Copy the `NEXT_PUBLIC_*` variables from `.env.example`.

Rebuild after changing public env vars — they are inlined at build time.

**Note:** Point at a registry deployed for cleartext payee + public `srcTxHash`. Older confidential-payee deployments are obsolete.

## Networks

The public site network switcher exposes **Arc** (registry), **Base** (payment), and **Tempo** Moderato testnet (registry). Set `NEXT_PUBLIC_TEMPO_*` vars (see `.env.example`). Lookup/ledger APIs accept `?network=arc|base|tempo`.
