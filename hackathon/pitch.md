# Pitch: LLX Settlement Proofs

*Receipts for stablecoin payments that anyone can check.*

## 1. Problem

Stablecoins move money in seconds, but proving that a payment happened is still manual.

- A business paying contractors, a marketplace paying sellers, or an AI agent paying for APIs has to answer the same questions for its customer, its auditor, or its own operator: *who paid whom, how much, in which token, and when?*
- Today the answer is a screenshot, a CSV export, or a block-explorer link that shows raw logs a non-engineer can't read and that doesn't say which invoice the payment was for.
- AI agents make this worse. They pay many small amounts, automatically, and the human responsible needs a record they can trust without reading transaction traces.

## 2. Product

**LLX Settlement Proofs** turns a stablecoin payment into a permanent, public, checkable receipt.

1. **API:** send the payment tx hash, the payee, and the amount. One authenticated call.
2. **Verification first:** the recorder reads the payment receipt from the chain and requires a matching stablecoin `Transfer` (right token, right payee, exact amount). No match, no proof. There is no override.
3. **Append-only record:** the proof is written to a `SettlementProofs` contract (OpenZeppelin `AccessControl`, no edit or delete function, one proof per payment).
4. **Public verifier:** `proofs.liquidlogicx.com` shows every proof (chain, token, payer → payee, amount, payment tx, proof tx). It **re-checks the payment on its own chain** over public RPC every time the page loads, so it doesn't rely on the recorder. Paste any payment hash to find its proof.

Live today:
- **Tempo** (Moderato testnet): TIP-20 payment on Tempo → proof on Tempo. Built during the hackathon; 3 real proofs.
- **Arc** (mainnet): USDC payment on Base → proof on Arc. 2 mainnet proofs.
- **Tempo mainnet:** the `SettlementProofs` registry is deployed and source-verified (`0x9940a8fE…DfE6A`, chain 4217), with the admin role on an LLX-owned wallet. First mainnet proofs are next.

## 3. Why Tempo

Tempo is built for payments, and a settlement proof is payment paperwork. The fit is direct:

- **Memos built in.** TIP-20 `transferWithMemo` carries a 32-byte reference (an invoice number, a payout ID) in the payment itself. Our recorder reads it and keeps it in the proof, so reconciliation needs no side channel.
- **Deterministic, sub-second finality.** One confirmation is final, so a proof can be written seconds after the payment with no reorg window. (On Base we wait 12 confirmations.)
- **Stablecoin-native fees.** The recorder pays its fees in a stablecoin (pathUSD on testnet, USDC.e on mainnet). There's no gas token to manage, and our cost per proof is a stable, predictable number.
- **Payment and proof on one chain.** On Tempo, the payment and its notarization sit side by side, readable over one RPC. That makes the independent check cheap and simple.
- **Multiple stablecoins.** One registry handles pathUSD, AlphaUSD, BetaUSD, ThetaUSD (allowlisted), and every proof shows which token moved.

## 4. Traction

- **Live mainnet proofs on Arc:** 2 real USDC payments on Base, notarized on Arc mainnet (`0x1de52cbc…4facb1`), with the public verifier live at proofs.liquidlogicx.com.
- **Live testnet proofs on Tempo:** 3 real TIP-20 payments (AlphaUSD, pathUSD, BetaUSD) proven through the production recorder code path on Tempo Moderato (`0x2ec4CF47…2c0b`).
- **Paid x402 endpoint on Base:** `audit.liquidlogicx.com/api/prove`. An AI agent pays per call in USDC over x402 and gets back a proof and a public verify link. It sits alongside our other paid agent endpoints (`/api/audit`, `/api/allowance`). [MILES: add the number of paid calls or unique payers to date, if any.]
- **Open source:** the contracts, recorder, and verifier are MIT licensed in a public repo, with 14 contract tests and 62 recorder tests.

## 5. Business model

- **Pay per proof (API):** a flat USDC fee per proof, paid per call over x402 (live on Base today, coming for Tempo payments). No account and no subscription, which suits agents and small teams.
- **Volume plans for platforms:** marketplaces, payroll, and payout providers that want a proof for every payout get batch endpoints and monthly invoicing.
- **Verification stays free:** anyone can check any proof at no cost. Free checking is what makes a proof worth paying for.
- **Unit economics:** our cost is one contract write per proof, paid in stablecoins on Tempo, so the margin per proof is predictable.

## 6. Roadmap

| When | What |
| --- | --- |
| Now (hackathon) | Tempo rail end to end on Moderato: recorder, verifier, chain selector, payment re-check, 3 live proofs. Registry deployed and source-verified on Tempo **mainnet** with an LLX-owned admin wallet |
| Next 30 days | First real proofs on Tempo mainnet; paid proof endpoint for Tempo payments |
| Next 90 days | Machine Payments Protocol support so agents on Tempo can buy proofs natively; batch proofs and CSV export for month-end close; webhooks |
| Later | Append-only corrections (a new proof that supersedes an old one); more stablecoin chains; selective disclosure for payees who need it, once the underlying chains support it. This is roadmap only. Every proof today is fully public, by design. |

---

## Presentation video script (target 2:15, limit 3:00)

Film yourself (selfie camera, landscape) or narrate over the screenshots in `screenshots/`. Speak plainly.

> **[0:00] Hook.** "Stablecoins settle in seconds. Proving that a payment happened still takes screenshots and spreadsheets. I'm Miles, and this is LLX Settlement Proofs: receipts for stablecoin payments that anyone can check."
>
> **[0:15] Problem.** "If you pay contractors, sellers, or APIs in stablecoins, someone always asks: did this exact payment happen? Who paid whom, how much, for which invoice? A block explorer shows raw logs. Nobody wants to read those. And AI agents now make thousands of small payments that a human has to answer for."
>
> **[0:40] Product.** "Our API takes a payment hash. Before writing anything, it checks the chain for the actual stablecoin transfer: right token, right payee, exact amount. Then it writes a permanent proof to an append-only contract and returns a public link. Anyone can open that link, and the page re-checks the payment on-chain by itself. You don't have to trust us."
>
> **[1:05] Why Tempo.** "Tempo is a payments chain, and this is payments paperwork. Tempo transfers carry a built-in memo, so the invoice number travels with the payment and lands in the proof. Finality is deterministic and fast, so the proof is final seconds after the payment. Fees are in stablecoins, so every proof costs a predictable amount. On Tempo, the payment and the proof live side by side."
>
> **[1:30] Traction.** "This is live. We have proofs on Arc mainnet for USDC paid on Base, three real proofs on Tempo's testnet, our registry deployed and verified on Tempo mainnet, and a paid x402 endpoint on Base where an agent buys a proof per call."
>
> **[1:45] Business.** "We charge a flat fee per proof, paid per call in USDC. No accounts, no subscriptions. Checking a proof is always free. Platforms that need a proof for every payout get volume plans."
>
> **[1:58] Ask / roadmap.** "Next, we're recording real payments on Tempo mainnet and letting agents buy proofs natively on Tempo. If your product moves stablecoins, every payment should come with a receipt anyone can check. That's LLX Settlement Proofs."
