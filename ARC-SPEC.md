# ARC-SPEC.md — status given Decisions 1A + 2B (2026-09-19)

> **Status header (Part 5).** Canonical repo is `LiquidLogicX/settlement-proofs-arc`.
> Foundry `SettlementProofs` contract is kept as an Arc **notarization** registry.
> Under **1A**, payment stays on **Base**; proofs verify Base USDC Transfers and
> write to Arc. The x402-on-Arc rail (§5) is **out of scope** here (later on
> `liquid-logic-agent`). Under **2B**, confidentiality / payee-commit language
> is **dead** — public `srcTxHash` + cleartext payee. Still in force: §4 decimals
> (typed in recorder), §8 separation, §9 preflight (RPC only — never
> `explorer.arc.io/api`), §10 acceptance, §11 microgrant. Do not invent
> requirements beyond HANDOFF-NOTE + the still-living sections below.

---

**Settlement Proofs — Arc mainnet rail + settlement attestation**

Status: draft for crew execution (updated 2026-09-19 for Decisions 1A + 2B)
Target repo: `LiquidLogicX/settlement-proofs-arc`
Deadline driver: Arc Microgrants submission closes **Oct 14 2026, 23:59 ET**

---

## 0. Read this first — the honest scope

The institutional direction is "settlement proofs." The **confidential**
version of that (verifier learns yes/no, never the balance) exists only on
the Zama/FHE track, on Sepolia. **Arc has no live FHE and no live privacy** —
Arc's opt-in privacy is roadmap, not shipped.

Therefore, on Arc, this is **not** a privacy product and must never be
described as one. What ships on Arc is a **signed settlement attestation**:

> A verifier asks whether an address can settle a given amount in USDC on
> Arc, right now. It gets back a signed yes/no with the evidence to check it
> independently, in under a second, paid per call.

The value on Arc is **speed, signature and auditability**, not secrecy.
Privacy stays on the Zama roadmap and is described as roadmap.

Any copy, README line, endpoint description or listing blurb that implies
the balance is hidden on Arc is wrong and must be rejected in review.

---

## 1. Objective

Two things, one deploy:

1. Bring the USDC payment rail to Arc mainnet, registered alongside the
   existing Base rail (not replacing it).
2. Ship one paid endpoint and one public proof page that a stranger can
   open and verify without paying.

---

## 2. Non-goals

- No FHE, no Zama, no encrypted balances on Arc.
- No token mechanics. `$LLX` does not appear in this deployment.
- No new contract if an attestation can be served without one. Prefer
  read + sign over deploy.
- Not a mixer, not a shielded pool, not a balance-hiding feature.

---

## 3. Chain configuration

| Item | Value |
|---|---|
| Network | Arc mainnet |
| Chain ID | `5042` (`0x13b2`) |
| CAIP-2 | `eip155:5042` |
| RPC | `https://rpc.mainnet.arc.io` (see §9 — may be permissioned) |
| Explorer | `https://explorer.arc.io` human root only — **not** `/api` (see §9) |
| Native gas asset | USDC |
| USDC ERC-20 predeploy | `0x3600000000000000000000000000000000000000` |
| Token name / version | `USDC` / `2` |
| Batched GatewayWallet | `0x77777777Dcc4d5A8B6E418Fd04D8997ef11000eE` |

Testnet, for rehearsal only: chain ID `5042002`, faucet at `faucet.circle.com`.

EVM-compatible. Hardhat, Foundry, ethers, viem and web3.py work unmodified.

---

## 4. The decimals rule — read twice

Arc's **native gas** USDC carries **18 decimals**.
Arc's **USDC ERC-20 interface** carries **6 decimals**.

Same asset. Two representations. On the same chain.

- Gas balances, `eth_getBalance`, tx `value` → `formatEther` / 18 decimals.
- Token amounts via the ERC-20 predeploy → `formatUnits(x, 6)`.

Getting this backwards is a **10^12** error. Published third-party docs
state it both ways, and at least one provider page lists Arc's gas token as
ETH, which is simply wrong.

**Required:** before any amount is displayed or compared, verify empirically
against a wallet with a known balance and record the result in the repo.
Do not take the decimals from any doc, including this one, without checking.

---

## 5. Settlement

> **§5 OUT OF SCOPE under 1A** for this repo. Kept for historical context.
> Arc settlement / Circle x402 lands later on `liquid-logic-agent`.

Use **Circle's official x402 facilitator**, live on Arc since Sep 16 2026.
It verifies the buyer's EIP-3009 authorization, sponsors gas, and runs
sanctions screening. Needs a Circle API key; a keyless trial exists.

Preflight: `GET https://gateway-api.circle.com/v1/x402/supported` must list
`eip155:5042` with the `exact` scheme. If it does not, stop and report.

Do **not** build a custom client-broadcast settlement path. Community
packages exist for this because no facilitator served Arc a week ago. That
is no longer true and the workaround is now unnecessary risk.

Registration is **per network**. Arc is added beside Base:

```
register("eip155:8453", ...)  // Base — unchanged, keep working
register("eip155:5042", ...)  // Arc — new
```

Existing Base behaviour must not regress. That is an acceptance criterion.

---

## 6. The paid endpoint

`GET /api/settle-check` on an Arc-registered x402 route.

Request params: `address`, `amount` (USDC), optional `asOf`.

Response (200, after payment):

- `canSettle`: boolean
- `address`, `amount`, `chainId: 5042`
- `blockNumber` and `blockHash` the answer was computed at
- `observedAt`: ISO timestamp
- `signature`: the attestation, signed by a published attestor key
- `attestorAddress`: so anyone can verify the signature independently
- `evidence`: the RPC call and block a third party can re-run

Price: match the existing Base endpoint unless there's a reason not to.

Design rules:

- The answer must be reproducible. A verifier who re-runs the stated call at
  the stated block must get the same result, or the attestation is worthless.
- Pin the block. Never answer "latest" without recording which block that was.
- Fail loudly on RPC error. Never return `canSettle: false` when the real
  answer is "could not determine" — that is a false negative that costs
  someone a trade.

---

## 7. The public proof page

This is the microgrant submission link. Treat it as the primary deliverable,
not documentation.

Requirements:

- **Readable without paying.** A reviewer opening it must see live evidence
  within seconds. No paywall, no connect-wallet gate, no empty state.
- Shows recent attestations: timestamp, block, result, and the tx hash of
  the payment that bought it.
- Shows the attestor address and how to verify a signature.
- Shows the chain config from §3 so the deployment is self-describing.
- Links to the repo.

If Arc's public explorer turns out to be permissioned (§9), this page is the
**only** thing a reviewer can open. Build it accordingly.

Reuse the existing ledger sync pattern. The known failure there was the
service disk not reaching the published file — do not reintroduce it.

---

## 8. Identity and separation rules

Non-negotiable, and the review gate for every PR in this work:

- Repo: `LiquidLogicX/*` only. Nothing is created, read from, or pushed to
  any other account or organisation.
- Commit author email: the LLX identity address only.
- Hosting: the LLX Vercel team and the LLX Render account only.
- No other project's name appears anywhere — not in code, comments, commit
  messages, branch names, `.env` variable names, error strings, user-agent
  strings, README, LICENSE, `package.json`, or listing metadata.
- **Check the executor, not just the connector.** The known failure mode is
  a cloud agent carrying the wrong identity while the connector is scoped
  correctly. Before any task runs, confirm which machine and which account
  will execute it.
- If a task cannot be completed without touching another account, stop and
  escalate. Do not work around it.

---

## 9. Preflight — resolve before building

Blockers. Report results before writing code.

1. **RPC access.** Can `https://rpc.mainnet.arc.io` be reached from the
   Render/Vercel environment? Arc's own reference labels the listed mainnet
   endpoints as permissioned. If blocked, provision a node provider
   (Alchemy, QuickNode, dRPC, Blockdaemon, Chainstack) under the LLX
   identity and record which.
2. **Explorer access.** Is `explorer.arc.io` publicly readable? Determines
   how much §7 has to carry alone.
3. **Facilitator.** Confirm `eip155:5042` in the supported list. Obtain a
   Circle API key under the LLX identity.
4. **Gas funding.** Arc gas is paid in USDC. Fund the deployer/attestor
   wallet with a small USDC balance on Arc and record the address.
5. **Decimals.** Verify §4 empirically. Record the result.

---

## 10. Acceptance criteria

- One paid call to `/api/settle-check` on Arc mainnet settles on-chain, with
  a tx hash recorded.
- The returned signature verifies against the published attestor address,
  checked by a tool that did not produce it.
- A third party re-running the stated RPC call at the stated block gets the
  same answer.
- The proof page loads and shows live data with no payment and no wallet.
- The existing Base rail still works, proven by a paid Base call after the
  Arc change.
- No string from §8 appears anywhere in the repo or the deployed responses.

---

## 11. Microgrant submission checklist

Eligibility is mechanical. Confirm each:

- [ ] Live deployment on Arc **mainnet** — testnet-only is disqualified
- [ ] A link a reviewer can open
- [ ] Public repo
- [ ] Short description: what it does, what it uses Arc for
- [ ] Public builder profile (GitHub / X)
- [ ] Not previously funded by a Circle or Arc program
- [ ] Submitted before Oct 14 2026, 23:59 ET — reviewed on a rolling basis,
      so earlier is genuinely better

Open question to confirm on the submission form before the deadline:
whether a demo video is a required field.

---

## 12. Sequence

1. §9 preflight, report back
2. Testnet rehearsal on 5042002
3. Endpoint on Arc mainnet, Base untouched
4. Proof page
5. Acceptance run (§10)
6. Submit
