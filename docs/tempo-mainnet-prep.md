# Tempo mainnet — SettlementProofs deploy prep

**Status: PREP ONLY. Do not broadcast. Do not fund from this workflow. Do not set `TEMPO_ALLOW_MAINNET=true` until Miles has approved and funded.**

Tempo mainnet has been live since 2026-03-18. This doc is the checklist Miles runs (or explicitly asks the crew to run) when he is ready.

## Network

| Property | Value |
| --- | --- |
| Network | Tempo Mainnet |
| Chain ID | `4217` |
| HTTP RPC | `https://rpc.tempo.xyz` |
| WebSocket | `wss://rpc.tempo.xyz` |
| Explorer | `https://explore.tempo.xyz` |
| Fee token | pathUSD `0x20c0000000000000000000000000000000000000` (6 decimals; production asset — not Moderato faucet pathUSD) |
| Docs | https://tempo.xyz/developers/docs/quickstart/connection-details |

## Roles (fill before broadcast)

| Role | Who | Address | Notes |
| --- | --- | --- | --- |
| **DEFAULT_ADMIN_ROLE** (deployer / owner) | **Miles's own wallet** | `[MILES: paste your Tempo mainnet admin address here]` | **Must be Miles.** Do not invent, guess, or reuse Moderato crew keys (`0x559D…1A38`, `0xe4b6…ad07`, etc.). Same policy as Arc admin. |
| **RECORDER_ROLE** | New hot wallet (mainnet-only) | `[MILES: paste new recorder address]` | Create a **fresh** key Miles controls. Fund with pathUSD for fees only — no treasury. Must differ from the Arc recorder (`0xfB1B…53C7`) and from every Moderato testnet key. |
| Deployer key used in `PRIVATE_KEY` | Same as admin | (Miles holds the key) | Becomes owner at deploy time (`new SettlementProofs(deployer)`). |

Crew boxes must not hold Miles's mainnet admin key.

## Contract / script

Same audited bytecode path used on Arc and Moderato:

- Source: `contracts/src/SettlementProofs.sol`
- Script: `contracts/script/Deploy.s.sol:DeploySettlementProofs`
- Behavior: deploys registry with deployer as `DEFAULT_ADMIN_ROLE`, grants `RECORDER_ROLE` to `RECORDER_ADDRESS`, asserts deployer does **not** also hold `RECORDER_ROLE`.

## Estimated cost (from Moderato deploy gas; mainnet prices can differ)

Moderato v2 deploy + `grantRole` (2026-10-05 PT broadcast):

| Step | Gas used |
| --- | --- |
| `SettlementProofs` create | ~5.21M |
| `grantRole(RECORDER_ROLE)` | ~0.28M |
| **Total** | **~5.50M gas** |

On Tempo, fees are paid in pathUSD and are typically **sub-cent** per transfer; a ~5.5M-gas deploy on Moderato cost on the order of **~$0.01 or less**. Mainnet fee markets can move — treat that as a floor, not a quote.

### What Miles must fund (before any broadcast)

| Wallet | Asset | Suggested amount | Why |
| --- | --- | --- | --- |
| Admin / deployer | pathUSD on **Tempo mainnet** | **≥ 1 pathUSD** | Deploy + grantRole with large headroom; leftover stays in Miles's wallet. |
| Recorder hot wallet | pathUSD on **Tempo mainnet** | **≥ 5 pathUSD** | Ongoing `recordPayment` fees (each write is small; buffer for demos + ops). Top up later as needed. |

How Miles funds (Miles does this himself):

1. Acquire production pathUSD (Bridge / Tempo-supported on-ramp — not the Moderato faucet).
2. Send pathUSD to the **admin address** and the **recorder address** on chain `4217`.
3. Confirm balances on https://explore.tempo.xyz (or `cast` against `https://rpc.tempo.xyz`).

## Exact commands — dry-run first, broadcast only after Miles OK

From `contracts/` with Foundry installed. **Replace placeholders. Do not paste private keys into chat or the repo.**

```bash
cd contracts

# --- Miles fills these locally (never commit) ---
export PRIVATE_KEY=0x...   # Miles admin key ONLY
export RECORDER_ADDRESS=0x...  # Miles's new mainnet recorder address

# Sanity: chain id must be 4217
cast chain-id --rpc-url https://rpc.tempo.xyz
# expect: 4217

# Dry-run (no --broadcast): simulate deploy
forge script script/Deploy.s.sol:DeploySettlementProofs \
  --sig "run()" \
  --rpc-url https://rpc.tempo.xyz \
  --private-key "$PRIVATE_KEY" \
  --tempo.fee-token pathUSD
```

**STOP.** Review console output (predicted address, gas). Get Miles's explicit OK to broadcast.

```bash
# ONLY after Miles OK — this spends pathUSD and creates the live registry
forge script script/Deploy.s.sol:DeploySettlementProofs \
  --sig "run()" \
  --rpc-url https://rpc.tempo.xyz \
  --broadcast --slow \
  --private-key "$PRIVATE_KEY" \
  --tempo.fee-token pathUSD
```

After a successful broadcast:

1. Record the new `SettlementProofs` address + deploy tx in this file and in [`deployments.md`](deployments.md).
2. Point recorder: `TEMPO_SETTLEMENT_PROOFS_ADDRESS=<new>`, `TEMPO_RPC_URL=https://rpc.tempo.xyz`, `TEMPO_EXPLORER=https://explore.tempo.xyz`, `TEMPO_ALLOW_MAINNET=true`, and a **mainnet** `TEMPO_RECORDER_PRIVATE_KEY` (Render Environment tab — Miles pastes).
3. Point verifier: `NEXT_PUBLIC_TEMPO_*` to mainnet values (or add a separate mainnet network entry) — product decision for Miles; until then keep the public Tempo tab on Moderato testnet for the hackathon.
4. Never reuse Moderato faucet keys on mainnet.

## Hackathon copy rule

Until the mainnet registry exists and is wired, all public / Colosseum claims say **"Tempo testnet" (Moderato)**, not Tempo mainnet.

