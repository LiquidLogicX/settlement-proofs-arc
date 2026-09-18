# Arc Settlement Proofs

Append-only settlement-proof registry for an **AI treasurer**.

USDC settles on **Arc** (Circle x402 facilitator, `eip155:5042`, scheme `exact`). This repo verifies the Arc USDC transfer for a claimed settlement tx, records an immutable proof on Arc with **cleartext payee** and public `srcTxHash`, then shows a public ledger. There is **no confidentiality claim**. Recorded proofs cannot be edited, deleted, or overridden by an admin.

```
Arc USDC transfer  →  recorder service  →  SettlementProofs on Arc  →  public ledger
   (srcTxHash)         RECORDER_ROLE         cleartext payee           (public payee + srcTxHash)
```

| Path | Role |
| --- | --- |
| [`contracts/`](contracts/) | Foundry contract, tests, deploy script |
| [`recorder/`](recorder/) | TypeScript service: verify Arc USDC tx, write proof |
| [`web/`](web/) | Next.js public ledger (read-only) |

## Product decisions (locked)

- **1B — Settlement on Arc.** USDC moves on Arc via Circle's x402 facilitator. Not "pay on Base, notarize on Arc".
- **2B — Public verifiability.** Keep `srcTxHash` public. Confidentiality claim and payee-commit machinery removed.

## Arc chain config

| Network | chainId | RPC | Explorer | Gas |
| --- | --- | --- | --- | --- |
| Arc mainnet | `5042` | `https://rpc.mainnet.arc.io` | `https://explorer.arc.io` | Native USDC (18-decimal gas accounting) |
| Arc testnet | `5042002` | `https://rpc.testnet.arc.io` | testnet explorer | Testnet USDC |

`srcTxHash` is the **Arc** settlement / payment transaction hash (where USDC moved).

Arc ERC-20 USDC: `0x3600000000000000000000000000000000000000` (6 decimals). See [`docs/decimals-empirical.md`](docs/decimals-empirical.md).

## Architecture

1. Treasurer (or agent) settles USDC on Arc (x402 / ERC-20 Transfer).
2. Operator (or agent) `POST /v1/proofs` with the Arc `txHash`, cleartext `payee`, `amountUSDC`, and optional `memo` / `refId` / `paidAt`. Requests require `Authorization: Bearer <RECORDER_API_KEY>` or `X-Api-Key`.
3. Recorder checks the Arc tx is confirmed (default **6** confirmations) and successful, then **requires** a matching USDC `Transfer` to `payee` for `amountUSDC`. A mismatch is **rejected (400)**. There is no unverified / TxOnly path.
4. Recorder derives `refId` if needed and calls `recordPayment` on Arc with cleartext `payee` and public `srcTxHash`. Only `RECORDER_ROLE` can write. The owner (`DEFAULT_ADMIN_ROLE`) can grant/revoke that role and **cannot** write proofs.
5. The public site reads `totalSettled()`, `proofCount()`, and each proof (cleartext payee + Arc explorer links). No wallet connect.

If `refId` is omitted, the recorder derives it as Solidity:

```solidity
keccak256(abi.encodePacked(srcTxHash, payee, amountUSDC))
```

Retries of the same `refId` return the existing proof (HTTP 200) without a second write. The contract also reverts on duplicate `refId`.

The recorder wallet holds **no treasury funds**. It only needs Arc gas (native USDC) to submit `recordPayment`.

## Deploy

### 1. Foundry — contract

**Redeploy required.** The ABI/storage changed under 1B+2B (cleartext `payee`; no `viewSaltKeyId` / verification enum). Any prior mainnet address is obsolete. Do **not** mainnet-redeploy until Miles funds an Arc gas wallet and provides keys. Leave addresses TBD.

```bash
git submodule update --init --recursive
cd contracts
forge test
```

```bash
cd contracts
cp .env.example .env
# PRIVATE_KEY = owner / DEFAULT_ADMIN_ROLE (deployer) — never commit
# RECORDER_ADDRESS = recorder hot wallet (gas only, no treasury)
source .env
forge script script/Deploy.s.sol:DeploySettlementProofs \
  --rpc-url https://rpc.mainnet.arc.io \
  --broadcast --slow \
  --private-key "$PRIVATE_KEY"
```

### 2. Render — backend recorder

Blueprint: [`render.yaml`](render.yaml). Docker context `recorder`, health `/health`.

| Variable | Purpose |
| --- | --- |
| `ARC_RPC_URL` | Arc JSON-RPC (verify + write) |
| `SETTLEMENT_PROOFS_ADDRESS` | Redeployed contract (TBD) |
| `SETTLEMENT_RECORDER_PRIVATE_KEY` | Recorder key; **empty in git**. Fund with Arc gas only. |
| `RECORDER_API_KEY` | Bearer / X-Api-Key for `POST /v1/proofs` |
| `PORT` | Set by Render |

Optional: `MIN_CONFIRMATIONS` (default **`6`**), `HOST` (default `0.0.0.0`).

### 3. Vercel — public ledger

Root Directory `web`.

| Variable | Example |
| --- | --- |
| `NEXT_PUBLIC_ARC_RPC_URL` | `https://rpc.mainnet.arc.io` |
| `NEXT_PUBLIC_SETTLEMENT_PROOFS_ADDRESS` | TBD after redeploy |
| `NEXT_PUBLIC_ARC_EXPLORER` | `https://explorer.arc.io` |
| `NEXT_PUBLIC_ARC_CHAIN_ID` | `5042` |

## Environment variable table

| Name | Where | Secret? |
| --- | --- | --- |
| `PRIVATE_KEY` | Foundry deploy | yes — owner key |
| `RECORDER_ADDRESS` | Foundry deploy | no |
| `ARC_RPC_URL` | Recorder / Foundry | no |
| `SETTLEMENT_PROOFS_ADDRESS` | Recorder | no |
| `SETTLEMENT_RECORDER_PRIVATE_KEY` | Recorder | **yes** — never commit |
| `RECORDER_API_KEY` | Recorder | **yes** — never commit |
| `MIN_CONFIRMATIONS` | Recorder (optional, default `6`) | no |
| `PORT` | Recorder | no |
| `NEXT_PUBLIC_ARC_RPC_URL` | Web | no |
| `NEXT_PUBLIC_SETTLEMENT_PROOFS_ADDRESS` | Web | no |
| `NEXT_PUBLIC_ARC_EXPLORER` | Web | no |
| `NEXT_PUBLIC_ARC_CHAIN_ID` | Web (optional) | no |

Placeholders live in `**/.env.example`. Real `.env` files are gitignored.

## Local development

```bash
cd contracts && forge test

cd recorder && npm install && npm run typecheck && npm run build

cd web && npm install && npx tsc --noEmit -p tsconfig.json
```

Seed a local Anvil ledger:

```bash
anvil --chain-id 5042 --port 8545
cd contracts
forge script script/SeedLocal.s.sol:SeedLocal --rpc-url http://127.0.0.1:8545 --broadcast
```

## Docs

- [`HANDOFF-NOTE.md`](HANDOFF-NOTE.md) — Miles / bot handoff (Part 1 answers 1B+2B locked)
- [`ARC-SPEC.md`](ARC-SPEC.md) — annotated status given 1B+2B
- [`docs/part3-answers.md`](docs/part3-answers.md) — Part 3 written answers
- [`docs/decimals-empirical.md`](docs/decimals-empirical.md) — Arc decimals empirical check

## License

MIT
