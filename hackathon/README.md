# Crypto World's Fair — submission pack (Tempo track)

**Product:** LLX Settlement Proofs — receipts for stablecoin payments that anyone can check.
**Track:** Tempo ($100k across 10 products that integrate with Tempo).
**Deadline:** Oct 12, 2026, 11:59 pm PT (submit by Fri Oct 10 to leave buffer).

| File | What it's for |
| --- | --- |
| [`pitch.md`](pitch.md) | Pitch narrative plus a word-for-word script for the 2–3 min **presentation video** |
| [`demo-script.md`](demo-script.md) | Tap-by-tap script for the ≤3 min **product demo video** (phone screen recording) |
| [`submission-answers.md`](submission-answers.md) | Draft answers for every Colosseum portal field, including the required pre-existing-work disclosure |
| [`screenshots/`](screenshots/) | Verifier screenshots (Tempo ledger, Tempo proof detail, mobile, Arc ledger) for the logo/graphic field or the deck |

## Before recording / submitting (Miles)

1. **PR #10 is merged** (2026-10-05 PT); Vercel auto-deployed. Confirm `https://proofs.liquidlogicx.com/?network=tempo` shows **3 proofs**. Explicitly set Vercel env (team **liquid-logic-x** → project **settlement-proofs-arc**) per [`../docs/deployments.md`](../docs/deployments.md): `NEXT_PUBLIC_TEMPO_SETTLEMENT_PROOFS_ADDRESS=0x2ec4CF47e6964b33FEd3718f07885ed44aF52c0b` (+ RPC/explorer/chain/from-block). Crew MCP write returned 403 on this scope — Miles must paste in the Vercel UI if the vars are still missing. Code already defaults to v2 when unset.
2. Optional: enable the Tempo rail on Render `arc-settlement-recorder` so new Tempo proofs can be recorded live. Exact var **names**: [`../docs/render-tempo-env.md`](../docs/render-tempo-env.md). Miles pastes keys in the Render Environment tab only. Demo works without this (three proofs already on-chain).
3. Fill in the `[MILES: …]` placeholders in `submission-answers.md` (team, location, background, traction numbers, video URLs).
4. Record both videos (see `pitch.md` and `demo-script.md`), upload unlisted (YouTube or Loom), paste into the **Media and code** tab answers in `submission-answers.md`.
5. Tempo **mainnet**: the `SettlementProofs` registry is **deployed and source-verified on Tempo mainnet** (`0x9940a8fE88f8BE0bB8E05686631Fd638DC1DfE6A`, chain 4217, Sourcify exact_match, admin = Miles's wallet). See [`../docs/tempo-mainnet-prep.md`](../docs/tempo-mainnet-prep.md). **No mainnet proofs yet**, so proof claims stay on Tempo testnet until the first real mainnet proof is recorded (Render switch-over: [`../docs/render-tempo-env.md`](../docs/render-tempo-env.md#tempo-mainnet-switch-over)). The verifier gets a separate "Tempo mainnet" tab (`?network=tempo-mainnet`); `?network=tempo` stays the testnet demo.
6. Optional but recommended by Colosseum: weekly 1-minute update videos.

## Key links

- Verifier: https://proofs.liquidlogicx.com/?network=tempo
- Repo (public): https://github.com/LiquidLogicX/settlement-proofs-arc
- Tempo registry (Moderato testnet, 3 demo proofs): https://explore.testnet.tempo.xyz/address/0x2ec4CF47e6964b33FEd3718f07885ed44aF52c0b
- Tempo registry (mainnet, deployed + source-verified, no proofs yet): https://explore.tempo.xyz/address/0x9940a8fE88f8BE0bB8E05686631Fd638DC1DfE6A
- Arc registry (mainnet): https://explorer.arc.io/address/0x1de52cbc4490a7873ef007e51cb91a5b374facb1
- Hackathon: https://colosseum.com/worldsfair
