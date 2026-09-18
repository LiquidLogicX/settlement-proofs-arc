# Part 3 — written answers (HANDOFF-NOTE)

## Wrong amount on an immutable proof

There is **no superseding-record mechanism today**. Proofs are append-only and
admin cannot override an on-chain entry. If an operator posts a wrong amount,
that row stays permanent and public.

**Intended mitigation (to implement with 1B/2B work, not a silent claim):**
document operator runbook = refuse to post without verified amount (Part 3
removes `ALLOW_UNVERIFIED_AMOUNT`), and if a bad proof is ever recorded, publish
a **new** proof that references the bad `refId` / `srcTxHash` in cleartext notes
as a correction pointer — without mutating the original. Full on-chain
`supersedes` linkage is a follow-up if grant reviewers require it.

## What is `contracts/` for?

Scaffolded before ARC-SPEC landed. Spec preferred read-and-sign with no
contract; the crew kept a Foundry `SettlementProofs` registry for a public,
verifiable append-only ledger on Arc. Under Decision **1B**, the contract
remains the on-chain registry of settlement proofs (now for Arc settlements +
public `srcTxHash`). Under **2B**, payee-commit / viewSalt fields and APIs are
removed; cleartext payee + public `srcTxHash` stay.
