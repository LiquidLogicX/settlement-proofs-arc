# HANDOFF NOTE — settlement-proofs / Arc

> **Canonical repo:** `LiquidLogicX/settlement-proofs-arc`.
> Never pasted into the web editor — pasting long markdown there has silently
> truncated a file in this project before and emptied it.
> Do **not** push to superseded `LiquidLogicX/settlement-proofs`.

> **HOW TO READ THIS.** Every section below is tagged **FOR MILES** or
> **FOR BOTS**. Only do the sections tagged for you. This note overrides
> `ARC-SPEC.md` wherever the two disagree.

---

# PART 1 — **FOR MILES** — decide before anything is built

Two open decisions. **Nothing in Part 4 starts until both are answered.**

### Decision 1 — What is Arc actually for?

- [x] **1A — Notarization.** Payment on Base, record on Arc. Locked for this repo.
- [ ] **1B — Settlement on Arc.** Later upgrade on `liquid-logic-agent` after
      mainnet acceptance — **out of scope** here (no Circle x402 rail in this repo).

### Decision 2 — Confidentiality

The confidential-payee claim does not survive either option above. Money
moves on a public chain either way. What the commit scheme actually buys is
*not linking* the Arc record to that transfer — and `srcTxHash` is that
link, published in cleartext today. Anyone reading the ledger is one tap
from the payee on BaseScan.

- [ ] **2A — Real confidentiality.** Out of scope.
- [x] **2B — Real verifiability.** Keep `srcTxHash` public. Delete the
      confidentiality claim and the commit machinery with it.

**Recommendation: 2B now.** A grant reviewer must be able to verify
something — that is the submission. And the commit scheme currently carries
HMAC salts, key rotation, archived key IDs and an address-guess oracle
endpoint in service of a property it does not deliver. 2A is the right build
when a real desk asks for non-disclosure and Arc's privacy ships. Not before.

**ANSWERS (LOCKED):** Decision 1 = **1A** (notarize: Base pay → Arc registry)   Decision 2 = **2B** (public `srcTxHash`; delete confidentiality claim)

Recorded 2026-09-18 by Miles as 1B+2B; **re-locked 2026-09-19 to 1A+2B**. 1B (Arc settlement / Circle x402) is a later upgrade on `liquid-logic-agent` after mainnet acceptance — **out of scope** for `settlement-proofs-arc`.

---

# PART 2 — **FOR BOTS** — run these now

Safe regardless of how Part 1 lands. Do these first, report, then stop.

1. **Secret scan of full git history** — not the working tree. Paste raw
   output, not a summary:
   ```
   npx -y @trufflesecurity/trufflehog git file://. --only-verified
   ```
   Specifically hunting: recorder private key, `RECORDER_API_KEY`,
   `VIEW_SALT_KEY`, any real value in `render.yaml`.

2. **RPC reachability.** Can `https://rpc.mainnet.arc.io` be reached from
   the Render and Vercel environments? Arc's own reference still labels the
   listed mainnet endpoints as permissioned. The deploy script points there.
   If blocked, say so — do not provision anything, that is a spend decision
   for Miles.

3. **Explorer check.** Is `https://explorer.arc.io` publicly readable? If
   not, the public ledger page is the only thing a reviewer can open.

4. **Decimals, verified empirically.** Native gas USDC = 18 decimals.
   ERC-20 USDC = 6 decimals. Same asset, same chain, two representations.
   Published third-party docs contradict each other on this and one provider
   page lists Arc's gas token as ETH, which is wrong. Check against a wallet
   with a known balance. Record the result in the repo. Do not take it from
   any doc, **including this note**.

5. **Facilitator check.** Confirm `eip155:5042` appears in
   `GET https://gateway-api.circle.com/v1/x402/supported` with the `exact`
   scheme.

Report all five. Do not proceed past this list without an answer to Part 1.

---

# PART 3 — **FOR BOTS** — cut this regardless of Part 1

**`ALLOW_UNVERIFIED_AMOUNT` — remove it.** A registry whose entire claim is
"this is proof" must not ship a flag that records unproven claims.
Default-off and badged is a good instinct, but on a first public deployment
that a grant reviewer will read, the presence of a bypass costs more than
the feature is worth.

**Open question, needs a written answer:** proofs are immutable and cannot
be overridden by anyone, including the admin. What happens the first time an
operator posts a wrong amount? It is permanent and public. Append-only
systems normally need a superseding-record mechanism. Is there one?

**Also answer:** what is `contracts/` for, given the spec recommended
read-and-sign with no contract? It was scaffolded before the spec landed.

---

# PART 4 — **FOR BOTS** — UNBLOCKED (1A+2B locked) — notarize + public verifiability

Part 1 answers (**1A + 2B**) are locked for `LiquidLogicX/settlement-proofs-arc` only.

- Contract: cleartext `payee`; public Base `srcTxHash`; amount = 6-dec ERC-20 units; no payee-commit / viewSalt / TxOnly.
- Recorder: verifies **Base** USDC Transfer for `srcTxHash` before write; notarizes on Arc; no `/open`; no `ALLOW_UNVERIFIED_AMOUNT`; startup rejects confidentiality / bypass env; typed decimals (`Erc20UsdcAmount` vs `NativeUsdcWei`).
- Web: public ledger via Arc **RPC** only; BaseScan links for `srcTxHash`; Arc explorer **root** links for proof tx; no `explorer.arc.io/api`.
- Docs: README / recorder / contracts / this note / ARC-SPEC status header updated for 1A+2B.
- 1B (Circle x402 / Arc settlement) stays out of this repo.

**Still blocked on Miles (do not spend / do not redeploy from bots):**

- Arc USDC gas for deployer + recorder wallets
- Render / Vercel egress check to `https://rpc.mainnet.arc.io` (Cursor box can reach it; hosting egress unverified — do not buy a provider)
- Contract mainnet deploy + wire address into recorder/web
- Merge PR after review
- Flip repo public (only Miles, after secret scan clean)
- Do **not** flip any repo public from bots; do **not** touch `LiquidLogicX/settlement-proofs` (superseded)

---

# PART 5 — **FOR BOTS** — ARC-SPEC.md: what is dead, what stands

Superseded — the crew made different calls before the spec landed:

- Earlier draft target repo name → superseded; canonical repo is `LiquidLogicX/settlement-proofs-arc`
- "Prefer read-and-sign, no contract" → overridden, Foundry contract exists
- §6 endpoint design → replaced by `POST /v1/proofs`
- §5 x402-on-Arc rail → **out of scope under 1A** (later on `liquid-logic-agent`).

Still in force:

- §4 decimals (see Part 2.4)
- §8 separation rules (see Part 6)
- §9 preflight (see Part 2)
- §10 acceptance criteria
- §11 microgrant requirements

---

# PART 6 — **FOR BOTS** — hard rules. No decision changes these.

- **`LiquidLogicX/*` only.** Nothing is created, read from, or pushed to any
  other account or organisation. No other project's name appears anywhere —
  code, comments, commit messages, branch names, env var names, error
  strings, user-agent strings, README, LICENSE, `package.json`, or listing
  metadata.
- **Check the executor, not just the connector.** The known failure mode is
  a cloud agent carrying the wrong identity while the connector is scoped
  correctly. Confirm which machine and which account runs a task before it
  runs.
- If a task cannot be done without touching another account: **stop and
  escalate.** Do not work around it.
- Never commit real secrets. Placeholders in `.env.example` only.

---

# PART 7 — **FOR MILES** — deadline and submission

Arc Microgrants submission closes **Oct 14 2026, 23:59 ET**. Rolling review,
decisions by Oct 21. Earlier submissions get earlier answers.

Eligibility, all required:
live deployment on Arc **mainnet** (testnet-only is disqualified) · a link a
reviewer can open · **public** repo · short description of what it does and
what it uses Arc for · public builder profile · not already funded by a
Circle or Arc program.

**Repo must be flipped to public** before submission — and only after Part
2.1 comes back clean. Public is irreversible in practice. Miles does this,
not the bots.

Unconfirmed: whether the submission form requires a demo video. Check early.
