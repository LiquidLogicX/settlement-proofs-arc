# Public settlement ledger

Read-only Next.js app. It talks to Arc RPC and the `SettlementProofs` contract. There is no wallet connect.

The ledger shows **cleartext payee** and public **srcTxHash** (Arc settlement tx), with explorer links to `https://explorer.arc.io`. There is no confidentiality claim.

```bash
cp .env.example .env.local
# set NEXT_PUBLIC_SETTLEMENT_PROOFS_ADDRESS (after redeploy)
npm install
npm run dev
```

## Vercel

Import the `web` directory as the root of a Next.js project (or set Root Directory to `web` in a monorepo). Copy the `NEXT_PUBLIC_*` variables from `.env.example`.

Rebuild after changing public env vars — they are inlined at build time.

**Note:** contract ABI changed under Decisions 1B+2B. Point at a redeployed registry; older confidential-payee deployments are obsolete.
