# Part 3 — written answers (HANDOFF-NOTE)

## Wrong amount on an immutable proof

There is **no superseding-record mechanism today**. Proofs are append-only and
admin cannot override an on-chain entry. If an operator posts a wrong amount,
that row stays permanent and public.

**Mitigation (shipped with 1A+2B):** refuse to post without a verified Base USDC
`Transfer` amount. `ALLOW_UNVERIFIED_AMOUNT` is **removed** from runtime and env
docs; startup rejects the env var if present. If a bad proof is ever recorded,
publish a **new** proof that references the bad `refId` / `srcTxHash` in
cleartext notes as a correction pointer — without mutating the original. Full
on-chain `supersedes` linkage is a follow-up if grant reviewers require it.

## What is `contracts/` for?

Scaffolded before ARC-SPEC landed. Spec preferred read-and-sign with no
contract; the crew kept a Foundry `SettlementProofs` registry for a public,
verifiable append-only ledger on Arc. Under Decision **1A**, the contract is the
on-chain **notarization** of Base payments (public `srcTxHash`). Under **2B**,
payee-commit / viewSalt fields and APIs are removed; cleartext payee + public
`srcTxHash` stay.
