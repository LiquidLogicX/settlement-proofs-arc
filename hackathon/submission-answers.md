# Colosseum Crypto World's Fair: draft submission answers

Field list is from Colosseum's public pages, read 2026-10-05: [colosseum.com/worldsfair](https://colosseum.com/worldsfair), [/worldsfair/resources](https://colosseum.com/worldsfair/resources), and the submission FAQ at [colosseum.com/hackathon](https://colosseum.com/hackathon). The portal itself needs a login, so the exact labels may differ slightly. Paste the matching answer into each field.

Placeholders marked **[MILES: …]** need your input. Everything else is ready to paste.

Key facts: submissions are due **Oct 12, 2026, 11:59 pm PT**. **Only work done during the submission window (opened Sept 14, 2026) is judged**, and pre-existing work must be disclosed. Tempo track: $100k across 10 products that integrate with Tempo.

---

## Product name

LLX Settlement Proofs

## Brief description (one line)

Receipts for stablecoin payments that anyone can check: send a payment tx hash, get a verified, append-only on-chain proof and a public link.

## Description (short paragraph)

LLX Settlement Proofs turns a stablecoin payment into a permanent receipt that anyone can verify. A business, platform, or AI agent posts a payment transaction hash to our API. The recorder reads the receipt from the chain and only writes a proof if it finds a matching stablecoin transfer (right token, right payee, exact amount). The proof goes into an append-only `SettlementProofs` contract with no edit or delete. Our public verifier at proofs.liquidlogicx.com lists every proof with chain, token, payer → payee, amount, payment tx, and proof tx, and re-checks the payment on-chain on its own. On Tempo, the TIP-20 payment and its proof sit on the same chain, and the payer's built-in transfer memo (such as an invoice number) is carried into the proof. It's live on Tempo testnet (3 real proofs) and on Arc mainnet for USDC paid on Base (2 proofs), and the `SettlementProofs` registry is deployed and source-verified on Tempo mainnet. It's also offered as a paid x402 API on Base.

## Track

Tempo

## Blockchains integrated

- **Tempo** (Moderato testnet, chain 42431): TIP-20 payments verified on Tempo; `SettlementProofs` registry deployed on Tempo; fees paid in pathUSD; `transferWithMemo` memos read into proofs.
- **Tempo** (mainnet, chain 4217): `SettlementProofs` registry deployed and source-verified (Sourcify exact_match), admin handed to an LLX-owned wallet, fees paid in USDC.e. Mainnet proofs are not recorded yet.
- **Arc** (mainnet, chain 5042): `SettlementProofs` registry for USDC payments made on Base.
- **Base** (mainnet, chain 8453): USDC payment verification for the Arc rail; paid x402 proof endpoint.

## Tools / tech used

Solidity + Foundry, OpenZeppelin Contracts v5 (`AccessControl`), viem (with its `tempoModerato` chain and Tempo fee-token support), TypeScript, Hono, Next.js, Tailwind/shadcn, x402 (Coinbase CDP facilitator) for the paid endpoint, Render (recorder), Vercel (verifier).

## Live product link

https://proofs.liquidlogicx.com/?network=tempo

## GitHub repository

https://github.com/LiquidLogicX/settlement-proofs-arc (public, MIT)

Tempo work: [PR #10](https://github.com/LiquidLogicX/settlement-proofs-arc/pull/10) (merged 2026-10-05 PT). Key paths: `recorder/src/tempo.ts`, `recorder/src/rails.ts`, `web/src/lib/payments.ts`, `docs/tempo-testnet.md`.

## Contract addresses

| Network | Contract | Address |
| --- | --- | --- |
| Tempo mainnet | SettlementProofs (deployed + source-verified; no proofs yet) | `0x9940a8fE88f8BE0bB8E05686631Fd638DC1DfE6A` |
| Tempo Moderato | SettlementProofs (v2) | `0x2ec4CF47e6964b33FEd3718f07885ed44aF52c0b` |
| Arc mainnet | SettlementProofs | `0x1de52cbc4490a7873ef007e51cb91a5b374facb1` |

## Presentation video (2–3 min)

[MILES: video link, unlisted YouTube or Loom]. Script: [`pitch.md`](pitch.md#presentation-video-script-target-215-limit-300).

## Product demo video (≤ 3 min, technical)

[MILES: video link]. Script: [`demo-script.md`](demo-script.md).

## Logo / graphic

Use the LLX mark from the site header: `web/public/llx-logo.png` (the social card is `web/public/og.png`). For a product graphic, use `hackathon/screenshots/tempo-ledger.png` or `tempo-detail.png`. [MILES: confirm which logo file.]

## Team members and backgrounds

[MILES: names, roles, one-line backgrounds, links (X / GitHub / LinkedIn)].

Suggested framing: *"Miles: founder of Liquid Logic X; builds payment and agent tooling on stablecoin rails; shipped the Arc settlement registry, the x402 paid endpoints on Base, and the Tempo integration."* Edit to fit.

## Team location

[MILES: city, country]

## Go-to-market strategy

We start with the buyers who already need proof of payment and already pay in stablecoins:

1. **AI agent builders.** Agents paying for APIs need a record their operator can audit. We sell proofs per call over x402 (live on Base) and will add Tempo's Machine Payments Protocol, so an agent can buy a proof in the same HTTP request it pays in. We list on agent service directories (x402 Bazaar / Agentic Market, the mpp.dev directory) so agents discover us without a sales call.
2. **Stablecoin payout and payroll platforms on Tempo.** Every contractor payout or seller settlement gets a proof link the recipient can open. We integrate once at the platform level and earn per proof. Tempo's memo field makes this a natural fit for invoice-based flows.
3. **Finance and audit teams.** A shareable, permanent link per payment replaces screenshots in month-end close. Coming next: batch proofs and CSV export.

Pricing is a flat USDC fee per proof, with no accounts or subscriptions. Verification is always free.

## Demand validation

- Two real USDC payments on Base are notarized on Arc mainnet, with public proofs.
- Three real TIP-20 payments on Tempo testnet are proven end to end during the hackathon.
- The paid x402 proof endpoint on Base (`audit.liquidlogicx.com/api/prove`) is live alongside our other paid agent endpoints. [MILES: add paid-call count, unique payers, any inbound requests or conversations with teams that want proofs (names only with permission).]
- [MILES: any user quotes or interviews, e.g. a contractor or agent builder saying they'd use it.]

## Distribution plans

- Agent directories and protocols: x402 Bazaar / Agentic Market listing, the MPP service directory, MCP-friendly endpoint docs.
- Open-source SDK snippets ("prove this payment" in 5 lines of TypeScript) and a public verifier link on every proof, so each receipt that gets shared markets the product.
- Tempo ecosystem: apply to Tempo's partner and ecosystem programs; integrate with Tempo-based payout and wallet apps.
- Build in public on X with weekly update videos (Colosseum's optional weekly updates).

## Pre-existing work disclosure (required)

> Only work done during the submission window (from Sept 14, 2026) is judged. Here is everything that existed before, or that this submission builds on.

- **Before Sept 14, 2026:** Liquid Logic X's agent tooling (a USDC-on-Base agent that pays x402 endpoints, and the paid `/api/audit` and `/api/allowance` endpoints) was started before the window in a private repo. It was published publicly on Sept 28, 2026 (`LiquidLogicX/liquid-logic-agent`). [MILES: confirm the start date and what was live before Sept 14.]
- **During the window (Sept 18–23, 2026):** `SettlementProofs` contract, recorder (Base → Arc), and public verifier. This repo's first commit is Sept 18, 2026, and the 2 Arc mainnet proofs were recorded after that. A first Tempo Moderato deploy (v1, one synthetic self-test record) was made on Sept 23.
- **During the window (published Sept 28, 2026):** the paid x402 `/api/prove` endpoint on Base, which calls the recorder. [MILES: confirm.]
- **During the window (Oct 5–12, 2026), the Tempo track work in this submission:**
  - the Tempo rail in the recorder (TIP-20 payment verification on Tempo, token allowlist, memo convention, fee-token guard, mainnet safety switch, `POST /v1/tempo/proofs`)
  - the Tempo SettlementProofs v2 deploy and the 3 real Tempo proofs
  - the Tempo mainnet SettlementProofs deploy (Oct 5, 2026; source-verified, admin handed off to an LLX-owned wallet)
  - the verifier's chain selector, payment re-check, and payer/payee/token display
  - tests
  - this submission pack
- **Third-party code:** OpenZeppelin Contracts v5, viem, Hono, Next.js, shadcn/ui. All are open source and used as dependencies.

## Weekly update videos (optional)

[MILES: links, if recorded]. Suggested 1-min topics: (1) Tempo payment → proof working on testnet; (2) verifier chain selector + payment re-check; (3) final demo + what's next (Tempo mainnet).

---

## Media and code (Colosseum form tab — 4 fields)

Paste these into the portal's **Media and code** tab. Proof claims say **Tempo testnet** until the first real Tempo mainnet proof is recorded. It is accurate now to say the registry is **deployed and source-verified on Tempo mainnet** ([`../docs/tempo-mainnet-prep.md`](../docs/tempo-mainnet-prep.md)).

### 1. Demo video (product / technical, ≤ 3 min)

**Paste:** [MILES: unlisted YouTube or Loom URL after recording]

**Source script:** [`demo-script.md`](demo-script.md) (phone screen recording of `proofs.liquidlogicx.com/?network=tempo`).

**Recording checklist:** Do Not Disturb on; brightness up; confirm Tempo ledger shows **3 proofs** and **~262.92 USD** total (if you see 1 synthetic proof, Vercel is still on legacy — set `NEXT_PUBLIC_TEMPO_SETTLEMENT_PROOFS_ADDRESS` to v2 and redeploy); mic on; trim under 3:00.

### 2. Repository (code)

**Paste:** `https://github.com/LiquidLogicX/settlement-proofs-arc`

Public, MIT. Tempo rail + verifier: `recorder/src/tempo.ts`, `recorder/src/rails.ts`, `web/src/lib/payments.ts`, `docs/tempo-testnet.md`.

### 3. Live links (product)

**Paste (primary):** `https://proofs.liquidlogicx.com/?network=tempo`

Optional extras (if the form allows multiple / a notes field):

- Tempo Moderato registry: `https://explore.testnet.tempo.xyz/address/0x2ec4CF47e6964b33FEd3718f07885ed44aF52c0b`
- Tempo mainnet registry (deployed + source-verified): `https://explore.tempo.xyz/address/0x9940a8fE88f8BE0bB8E05686631Fd638DC1DfE6A`
- Example Tempo proof: `https://proofs.liquidlogicx.com/proofs/0x3a667de23cf4dce787f79b2e14457964ff2b1935f949c3a294793ff389eef41f?network=tempo`
- Arc mainnet ledger (same product, Base USDC rail): `https://proofs.liquidlogicx.com/?network=arc`

### 4. Presentation (pitch video, 2–3 min)

**Paste:** [MILES: unlisted YouTube or Loom URL after recording]

**Source script:** [`pitch.md`](pitch.md#presentation-video-script-target-215-limit-300).

Product-focused: receipts for stablecoin payments, Tempo testnet integration, public verifier. No $LLX / token-price talk. No live privacy/FHE claims.


---

## How this maps to the judging criteria (for our own check)

| Criterion (Colosseum rules / FAQ) | Where we show it |
| --- | --- |
| Functionality / code quality | Live verifier; 3 Tempo proofs; 14 contract tests + 62 recorder tests; negative checks (wrong amount, wrong payee, replay) |
| Potential impact / market size | Every stablecoin payout, payroll run, and agent API payment needs a receipt |
| Novelty / insight | Independent on-chain re-check by the verifier; TIP-20 memo carried into the proof; one registry across chains |
| UX | Paste a payment hash and get a proof; no wallet or login to verify; mobile-ready |
| Open source / composability | MIT; same contract and ABI on Arc and Tempo; simple HTTP API; x402 |
| Business plan / viability | Pay-per-proof over x402, with Tempo/MPP next; free verification |
| Traction | Arc mainnet proofs, Tempo testnet proofs, paid endpoint live |
| Founder-market fit | [MILES: your background in payments / agents] |
