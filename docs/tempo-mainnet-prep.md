# Tempo mainnet — SettlementProofs deploy

**Status: DEPLOYED 2026-10-05 PT (Miles approved the broadcast).** Registry is live on Tempo mainnet with the admin handed off to Miles's wallet. **Not wired yet:** the public verifier and the Render recorder still point at Tempo Moderato testnet. Switching them is a separate Miles decision (see [Proposed switch-over](#proposed-switch-over-not-done)).

## Live registry

| Property | Value |
| --- | --- |
| Contract | `SettlementProofs` |
| Address | [`0x9940a8fE88f8BE0bB8E05686631Fd638DC1DfE6A`](https://explore.tempo.xyz/address/0x9940a8fE88f8BE0bB8E05686631Fd638DC1DfE6A) |
| Deploy block | `42806697` (2026-10-05 18:28:56 PDT) |
| Source verification | **exact_match** on Tempo's Sourcify verifier (`contracts.tempo.xyz`, chain 4217) |
| Fee token used | USDC.e `0x20C000000000000000000000b9537d11c60E8b50` |
| Total deploy + handoff fee | 0.003490 USDC.e (5,814,561 gas at 0.6 gwei) |

### Roles (verified on-chain after broadcast)

| Role | Address | Who | `hasRole` |
| --- | --- | --- | --- |
| `DEFAULT_ADMIN_ROLE` | `0x02326e16dc46df7400ab8e23d864c77a82ae6c4e` | Miles — "LLX Tempo admin" (own wallet; key never on crew boxes) | admin = **true**, recorder = false |
| `RECORDER_ROLE` | `0xea80a0db6bc7efb797d70a00d7bd2f57e5c06dac` | Miles — "LLX Tempo recorder" (mainnet-only hot wallet) | admin = false, recorder = **true** |
| Throwaway deployer | `0x1b542F71dA1C8951019ACc6a123D8bF35BA514e1` | crew box, mainnet-only, never reused | admin = **false**, recorder = **false** (no role) |

`RECORDER_ROLE`'s admin role is `DEFAULT_ADMIN_ROLE` (`0x00…00`), so only Miles's admin wallet can grant or revoke recorders from now on.

### Transactions

| # | Step | Tx | Gas used |
| --- | --- | --- | --- |
| 1 | `new SettlementProofs(deployer)` | [`0x72c35349…c370`](https://explore.tempo.xyz/tx/0x72c3534960a2fe69eecae1aa1218b3afdf2353db8eb855ba7ff714aa79ecc370) | 5,213,320 |
| 2 | `grantRole(RECORDER_ROLE, recorder)` | [`0x659d6eb4…f0ed`](https://explore.tempo.xyz/tx/0x659d6eb442fe861160817ddb8f88926c1c1afe65e0ed407f4bde5646cba3f0ed) | 283,651 |
| 3 | `grantRole(DEFAULT_ADMIN_ROLE, admin)` | [`0x4d2e51b1…c904`](https://explore.tempo.xyz/tx/0x4d2e51b122f5b4dd4eecea79502b27ccce61a61da055f7b88d8720da9c54c904) | 283,267 |
| 4 | `renounceRole(DEFAULT_ADMIN_ROLE, deployer)` | [`0x9582f25c…3a32`](https://explore.tempo.xyz/tx/0x9582f25c10438aec8c4341aa6f87dc5db04ab43242166f0357fec4b2a9343a32) | 34,323 |
| — | Sweep 5.996450 USDC.e deployer → recorder | [`0xffa2c746…3c19`](https://explore.tempo.xyz/tx/0xffa2c746ef42860631c8e798f0bb27d0c0e25426b2e6362c817e888b72513c19) | 31,130 |

A first sweep attempt ([`0xee909868…5841`](https://explore.tempo.xyz/tx/0xee9098683ddfd79010385aaa555665bb0fa94ba774591567932875b4073c5841)) reverted because the amount left no room for the up-front fee reservation (it rounds up); it cost 0.000015 USDC.e. The deployer keeps 0.000026 USDC.e of dust (too small to move after fees).

## Network

| Property | Value |
| --- | --- |
| Network | Tempo Mainnet |
| Chain ID | `4217` |
| HTTP RPC | `https://rpc.tempo.xyz` |
| Explorer | `https://explore.tempo.xyz` |
| Contract verifier | `https://contracts.tempo.xyz` (Sourcify API) |
| Fee token (used) | **USDC.e** `0x20C000000000000000000000b9537d11c60E8b50` — Stargate-bridged USDC, TIP-20, 6 decimals, `currency() = "USD"`. Accepted for fees via the Fee AMM ([docs](https://docs.tempo.xyz/protocol/fees)). |
| Alternative fee token | pathUSD `0x20c0000000000000000000000000000000000000` (not needed; Miles's wallets hold USDC.e) |

## How it was deployed (admin handoff)

Script: [`contracts/script/DeployTempoMainnetHandoff.s.sol`](../contracts/script/DeployTempoMainnetHandoff.s.sol). A fresh throwaway deployer key did all four steps in one run, so Miles's admin key never left his wallet. The script asserts on-chain that the admin holds `DEFAULT_ADMIN_ROLE`, the recorder holds `RECORDER_ROLE`, and the deployer holds no role.

```bash
cd contracts
export PRIVATE_KEY=0x...            # throwaway deployer ONLY (never commit, never post)
export ADMIN_ADDRESS=0x02326e16dc46df7400ab8e23d864c77a82ae6c4e
export RECORDER_ADDRESS=0xea80a0db6bc7efb797d70a00d7bd2f57e5c06dac

cast chain-id --rpc-url https://rpc.tempo.xyz   # expect 4217

# 1) Dry run — no --broadcast. Review predicted address, gas, fee. STOP for Miles OK.
forge script script/DeployTempoMainnetHandoff.s.sol:DeployTempoMainnetHandoff --sig "run()" \
  --rpc-url https://rpc.tempo.xyz \
  --private-key "$PRIVATE_KEY" \
  --tempo.fee-token 0x20C000000000000000000000b9537d11c60E8b50

# 2) Only after Miles OK:
forge script script/DeployTempoMainnetHandoff.s.sol:DeployTempoMainnetHandoff --sig "run()" \
  --rpc-url https://rpc.tempo.xyz \
  --private-key "$PRIVATE_KEY" \
  --tempo.fee-token 0x20C000000000000000000000b9537d11c60E8b50 \
  --broadcast --slow

# 3) Verify source (Tempo Sourcify)
forge verify-contract <ADDRESS> src/SettlementProofs.sol:SettlementProofs \
  --chain 4217 --verifier sourcify --verifier-url https://contracts.tempo.xyz/ \
  --constructor-args $(cast abi-encode "constructor(address)" <DEPLOYER>) --watch
```

The dry run on 2026-10-05 predicted `0x9940a8fE…DfE6A`, a 7.85M gas limit, and a max fee of 0.0094 USDC.e. The broadcast landed at the predicted address and used 5.81M gas (0.00349 USDC.e).

Sweeping leftover fee token: Tempo reserves `gasLimit × maxFeePerGas` up front (rounded **up** to the next 6-dec unit) from the fee-token balance, so a full-balance transfer reverts. Leave a few units of margin above that reservation (e.g. gas limit 60,000 at 600000001 wei → reserve 37 units; send `balance − 45`).

## Proposed switch-over (NOT done)

Nothing below has been changed. Miles decides when, and pastes any keys himself.

### Recorder (Render `arc-settlement-recorder`)

The recorder runs **one** Tempo rail, so switching it to mainnet stops new Moderato testnet writes (the 3 existing testnet proofs stay on-chain). Env changes Miles would make in the Render Environment tab:

| Env var | Mainnet value |
| --- | --- |
| `TEMPO_SETTLEMENT_PROOFS_ADDRESS` | `0x9940a8fE88f8BE0bB8E05686631Fd638DC1DfE6A` |
| `TEMPO_RECORDER_PRIVATE_KEY` | *(Miles pastes the key for `0xea80…6dac` — never via chat/bridge/git)* |
| `TEMPO_RPC_URL` | `https://rpc.tempo.xyz` |
| `TEMPO_EXPLORER` | `https://explore.tempo.xyz` |
| `TEMPO_ALLOW_MAINNET` | `true` |
| `TEMPO_FEE_TOKEN` | `0x20C000000000000000000000b9537d11c60E8b50` (USDC.e; the recorder wallet holds no pathUSD) |
| `TEMPO_ALLOWED_TOKENS` | `0x20C000000000000000000000b9537d11c60E8b50:USDC.e,0x20C0000000000000000000000000000000000000:pathUSD` (the default list is the Moderato faucet tokens) |
| `TEMPO_MIN_RECORDER_FEE_BALANCE` | `50000` (0.05 USDC.e; default) |

Recorder balance after the sweep: ~10.996 USDC.e. Each `recordPayment` costs well under a cent.

### Verifier (Vercel `settlement-proofs-arc`)

The web app has a single `tempo` network entry. Two options:

- **A (recommended for the hackathon):** add a separate `tempo-mainnet` network entry (small code PR) with `0x9940…DfE6A`, from block `42806697`, RPC `https://rpc.tempo.xyz`, explorer `https://explore.tempo.xyz`, chain `4217`. Keep the existing `tempo` entry on Moderato, relabelled "Tempo testnet", so the 3 demo proofs stay visible.
- **B (env-only):** repoint the existing `tempo` entry with `NEXT_PUBLIC_TEMPO_SETTLEMENT_PROOFS_ADDRESS=0x9940a8fE88f8BE0bB8E05686631Fd638DC1DfE6A`, `NEXT_PUBLIC_TEMPO_REGISTRY_FROM_BLOCK=42806697`, `NEXT_PUBLIC_TEMPO_RPC_URL=https://rpc.tempo.xyz`, `NEXT_PUBLIC_TEMPO_EXPLORER=https://explore.tempo.xyz`, `NEXT_PUBLIC_TEMPO_CHAIN_ID=4217`. This hides the testnet demo proofs, and mainnet stays empty until the recorder writes one.

## Hackathon copy rule

Until the verifier and recorder are switched and a real mainnet proof exists, public / Colosseum copy says the **proofs** are on **Tempo testnet (Moderato)**. It is accurate to say the SettlementProofs registry is **deployed and source-verified on Tempo mainnet** at `0x9940…DfE6A`.
