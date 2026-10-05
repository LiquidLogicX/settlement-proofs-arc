# Product demo video — script (≤ 3 min, phone screen recording)

Goal: show the technical "how". A real stablecoin payment on Tempo becomes a proof on Tempo that anyone can check, plus the same thing on Arc mainnet. Target length **2:30**. Colosseum's limit for the demo video is 3 minutes.

## Setup (before you hit record)

- **Prerequisite:** the Tempo PR is merged and the web app is deployed. Open https://proofs.liquidlogicx.com/?network=tempo and make sure you see **3 proofs** and a **262.92 USD** total. If you see 1 proof with a "synthetic" note, Vercel is still on the old registry (see `README.md` step 1).
- Phone: Do Not Disturb on, brightness up, portrait. Close other tabs.
- Safari (or Chrome) with these tabs open, in this order:
  1. `https://proofs.liquidlogicx.com/?network=tempo`
  2. `https://explore.testnet.tempo.xyz/tx/0xcffea545574a85398d0536fd90dbe06ee3a9a68d489194a278f70bd9b87527e5`
- Copy this payment hash to the clipboard (you'll paste it at 1:05):
  `0xcffea545574a85398d0536fd90dbe06ee3a9a68d489194a278f70bd9b87527e5`
- Start the screen recording with the microphone **on** (iOS: long-press the record button in Control Center → Microphone On).

## Script

| Time | Do this (exact taps) | Say this |
| --- | --- | --- |
| 0:00–0:15 | Start on tab 1 (Tempo ledger). Don't scroll yet. | "This is LLX Settlement Proofs. Every row here is a real stablecoin payment on Tempo's testnet, and a permanent proof of it, also on Tempo. Anyone can check it. No wallet, no login." |
| 0:15–0:35 | Slowly scroll down to the **Total settled 262.92 USD** and **Proofs 3** cards, then the three rows. | "Three payments: a design retainer in AlphaUSD, agent API usage in pathUSD, and a contractor payout in BetaUSD. Each row shows the chain and token, who paid, who got paid, the amount, and two links: the payment and the proof." |
| 0:35–0:50 | Tap the memo **Contractor payout #7** on the 250 BetaUSD row. The proof detail page opens. | "Here's one proof. Two hundred fifty BetaUSD, payer, payee, paid at, recorded at." |
| 0:50–1:05 | Point at the green **Payment re-checked on-chain** badge. | "This green badge matters. The page didn't take our recorder's word for it. It just fetched the payment receipt from Tempo itself and found the matching transfer: right token, right payee, right amount." |
| 1:05–1:25 | Tap **Proofs** in the top bar. In the **Look up a settlement proof** box, tap the input, paste the hash, tap **Verify**. | "Say you only have the payment hash, from an invoice or an agent's log. Paste it, tap Verify." |
| 1:25–1:40 | Result shows **Found · Matched as payment transaction (srcTxHash)**. Scroll a little to show payer, payee, and the two tx hashes. | "Found. The payment hash alone is enough to find the proof and check it." |
| 1:40–1:55 | Tap **Tempo payment tx**. The Tempo explorer opens (or switch to tab 2). Show the BetaUSD transfer and the `PAYOUT-0007` memo if it's visible. | "Same payment on Tempo's explorer. The invoice reference rides along in Tempo's built-in transfer memo, and our recorder keeps it in the proof." |
| 1:55–2:10 | Go back. Tap **Tempo proof tx**. | "And this is the proof write itself: one call to our SettlementProofs contract on Tempo. It's append-only. There's no edit, no delete, and each payment can be recorded once." |
| 2:10–2:25 | Go back to tab 1. At the top, tap **Arc** in the network selector. The Arc ledger loads. | "The same contract also runs on Arc mainnet, proving USDC payments made on Base. Same API, same verifier." |
| 2:25–2:40 | Stay on the Arc ledger. | "Under the hood it's one API call: payment hash in, proof and public link out. We also offer it as a paid x402 API on Base, so an AI agent can buy a proof per call. On Tempo, the proof is final a couple of seconds after the payment." |

End the recording. Trim the start and end, and keep it under 3:00.

## Optional 20-second insert: recording a proof live (laptop)

Only if the Tempo rail is enabled on the recorder (Render env, needs Miles's OK) or a local recorder is running. Record the laptop screen:

```bash
cd recorder
npm run demo:tempo -- --amount 4.20 --token AlphaUSD --memo "INV-2026-1002" --note "Live demo"
```

The script prints the payment tx, the recorder response (`201`), and the `verifyUrl`. Open the URL on screen to show the new proof. Say: *"Pay on Tempo, post the hash, proof written and verifiable, in a couple of seconds."* (The demo payer/payee testnet keys are on the crew box; ask the crew to run it, or to hand over a fresh testnet payer key.)

## If something goes wrong

- **The ledger is slow to load (~5–10 s):** it reads straight from public RPC. Wait, or tap **Refresh**.
- **The badge says "Payment check unavailable":** the RPC rate-limited a request. Reload the page.
- **The Tempo explorer won't load:** skip that beat and say the explorer link is on every row.
