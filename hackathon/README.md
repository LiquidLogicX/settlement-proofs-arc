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

1. Review and merge the Tempo PR, then deploy web (Vercel) so `proofs.liquidlogicx.com/?network=tempo` shows the three Tempo proofs. Check that `NEXT_PUBLIC_TEMPO_SETTLEMENT_PROOFS_ADDRESS` on Vercel is either unset or `0x2ec4CF47e6964b33FEd3718f07885ed44aF52c0b`. If it's still the old `0x35d7…ce51`, the Tempo tab will keep showing the old synthetic record.
2. Optional: enable the Tempo rail on the Render recorder so new Tempo proofs can be recorded live (env vars in [`../docs/tempo-testnet.md`](../docs/tempo-testnet.md)). The demo works without it, because the three proofs are already on-chain.
3. Fill in the `[MILES: …]` placeholders in `submission-answers.md` (team, location, background, the go-to-market numbers).
4. Record both videos (see `pitch.md` and `demo-script.md`), upload them unlisted (YouTube or Loom), and paste the links into the form.
5. Optional but recommended by Colosseum: weekly 1-minute update videos.

## Key links

- Verifier: https://proofs.liquidlogicx.com/?network=tempo
- Repo (public): https://github.com/LiquidLogicX/settlement-proofs-arc
- Tempo registry (Moderato): https://explore.testnet.tempo.xyz/address/0x2ec4CF47e6964b33FEd3718f07885ed44aF52c0b
- Arc registry (mainnet): https://explorer.arc.io/address/0x1de52cbc4490a7873ef007e51cb91a5b374facb1
- Hackathon: https://colosseum.com/worldsfair
