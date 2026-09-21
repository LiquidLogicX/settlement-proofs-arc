# Arc Settlement Proofs (notarize)

Append-only settlement-proof registry for an **AI treasurer**.

USDC **payment stays on Base**. This repo verifies the Base USDC transfer for a claimed payment tx, records an immutable **notarization** on Arc with **cleartext payee** and public `srcTxHash`, then shows a public ledger. There is **no confidentiality claim** and **no** Circle x402 / Arc settlement rail in this repository (that is a later **1B** upgrade on `liquid-logic-agent` after mainnet acceptance — out of scope here). Recorded proofs cannot be edited, deleted, or overridden by an admin.

```
Base USDC transfer  →  recorder service  →  SettlementProofs on Arc  →  public ledger
   (srcTxHash)         RECORDER_ROLE         cleartext payee           (public payee + srcTxHash)
```

| Path | Role |
| --- | --- |
| [`contracts/`](contracts/) | Foundry contract, tests, deploy script |
| [`recorder/`](recorder/) | TypeScript service: verify Base USDC tx, write Arc proof |
| [`web/`](web/) | Next.js public ledger (read-only, Arc RPC) |

## Product decisions (locked)

- **1A — Notarization.** Payment on Base; write record to `SettlementProofs` on Arc. No Arc settlement / Circle x402 rail in this repo.
- **2B — Public verifiability.** Keep `srcTxHash` public. Confidentiality claim and payee-commit / HMAC / `VIEW_SALT_*` / open-oracle machinery removed. Public verifiability is the product claim.

## Arc chain config

| Network | chainId | RPC (programmatic) | Explorer (human UI) | Gas |
| --- | --- | --- | --- | --- |
| Arc mainnet | `5042` | `https://rpc.mainnet.arc.io` | `https://explorer.arc.io` root pages | Native USDC (**18**-decimal gas accounting) |
| Arc testnet | `5042002` | `https://rpc.testnet.arc.io` | testnet explorer | Testnet USDC |

`srcTxHash` is the **Base** payment transaction hash (where USDC moved).

### Decimals (typed — critical)

| Representation | Address / path | Decimals | Type in recorder |
| --- | --- | --- | --- |
| Arc ERC-20 USDC | `0x3600000000000000000000000000000000000000` | **6** | `Erc20UsdcAmount` |
| Arc native gas USDC | `eth_getBalance` / tx `value` | **18** | `NativeUsdcWei` |
| Base USDC (payment) | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` | **6** | `Erc20UsdcAmount` |

Proof `amountUSDC` is always **6-decimal ERC-20 units**. Treating Arc native wei as a proof amount (or the reverse) mis-settles by **10^12**. See [`docs/decimals-empirical.md`](docs/decimals-empirical.md) and `recorder/src/decimals.ts`.

### Verify path

- **Programmatic:** `https://rpc.mainnet.arc.io` only (`eth_call`, receipts, logs). Base verify uses Base JSON-RPC.
- **Human reviewers:** open `https://explorer.arc.io` **root pages** in a browser.
- **Do not** call `explorer.arc.io/api` (Cloudflare). The ledger and recorder never depend on that API.

## Architecture

1. Treasurer (or agent) pays USDC on **Base**.
2. Operator (or agent) `POST /v1/proofs` with the Base `txHash`, cleartext `payee`, `amountUSDC` (6-dec), and optional `memo` / `refId` / `paidAt`. Requests require `Authorization: Bearer <RECORDER_API_KEY>` or `X-Api-Key`.
3. Recorder checks the Base tx is confirmed (default **12** confirmations) and successful, then **requires** a matching Base USDC `Transfer` to `payee` for `amountUSDC`. A mismatch is **rejected (400)**. There is **no** `ALLOW_UNVERIFIED_AMOUNT` / TxOnly path.
4. Recorder derives `refId` if needed and calls `recordPayment` on Arc with cleartext `payee` and public `srcTxHash`. Only `RECORDER_ROLE` can write. The owner (`DEFAULT_ADMIN_ROLE`) can grant/revoke that role and **cannot** write proofs.
5. The public site reads the registry via Arc RPC and shows cleartext payee + BaseScan links for `srcTxHash` + Arc explorer links for the proof tx.

If `refId` is omitted, the recorder derives it as Solidity:

```solidity
keccak256(abi.encodePacked(srcTxHash, payee, amountUSDC))
```

Retries of the same `refId` return the existing proof (HTTP 200) without a second write. The contract also reverts on duplicate `refId`.

The recorder wallet holds **no treasury funds**. It only needs Arc gas (native USDC, 18-dec) to submit `recordPayment`.

## Deploy

### 1. Foundry — contract

Do **not** mainnet-redeploy until Miles funds an Arc gas wallet and provides keys. Leave addresses TBD.

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
| `BASE_RPC_URL` | Base JSON-RPC (verify payment) |
| `ARC_RPC_URL` | Arc JSON-RPC (write + health) — not explorer `/api` |
| `SETTLEMENT_PROOFS_ADDRESS` | Deployed contract (TBD) |
| `SETTLEMENT_RECORDER_PRIVATE_KEY` | Recorder key; **empty in git**. Fund with Arc gas only. |
| `RECORDER_API_KEY` | Bearer / X-Api-Key for `POST /v1/proofs` |
| `PORT` | Set by Render |

Optional: `MIN_CONFIRMATIONS` (default **`12`**), `HOST` (default `0.0.0.0`).

Do **not** set `ALLOW_UNVERIFIED_AMOUNT`, `VIEW_SALT_KEY`, or related confidentiality env vars — startup rejects them.

### 3. Vercel — public ledger

Root Directory `web`.

| Variable | Example |
| --- | --- |
| `NEXT_PUBLIC_ARC_RPC_URL` | `https://rpc.mainnet.arc.io` |
| `NEXT_PUBLIC_SETTLEMENT_PROOFS_ADDRESS` | TBD after deploy |
| `NEXT_PUBLIC_ARC_EXPLORER` | `https://explorer.arc.io` (human root pages) |
| `NEXT_PUBLIC_ARC_CHAIN_ID` | `5042` |
| `NEXT_PUBLIC_BASE_EXPLORER` | `https://basescan.org` |

## Environment variable table

| Name | Where | Secret? |
| --- | --- | --- |
| `PRIVATE_KEY` | Foundry deploy | yes — owner key |
| `RECORDER_ADDRESS` | Foundry deploy | no |
| `BASE_RPC_URL` | Recorder | no |
| `ARC_RPC_URL` | Recorder / Foundry | no |
| `SETTLEMENT_PROOFS_ADDRESS` | Recorder | no |
| `SETTLEMENT_RECORDER_PRIVATE_KEY` | Recorder | **yes** — never commit |
| `RECORDER_API_KEY` | Recorder | **yes** — never commit |
| `MIN_CONFIRMATIONS` | Recorder (optional, default `12`) | no |
| `PORT` | Recorder | no |
| `NEXT_PUBLIC_ARC_RPC_URL` | Web | no |
| `NEXT_PUBLIC_SETTLEMENT_PROOFS_ADDRESS` | Web | no |
| `NEXT_PUBLIC_ARC_EXPLORER` | Web | no |
| `NEXT_PUBLIC_BASE_EXPLORER` | Web | no |
| `NEXT_PUBLIC_ARC_CHAIN_ID` | Web (optional) | no |

Placeholders live in `**/.env.example`. Real `.env` files are gitignored.

## Local development

```bash
cd contracts && forge test

cd recorder && npm install && npm run typecheck && npm test && npm run build

cd web && npm install && npx tsc --noEmit -p tsconfig.json
```

Seed a local Anvil ledger:

```bash
anvil --chain-id 5042 --port 8545
cd contracts
forge script script/SeedLocal.s.sol:SeedLocal --rpc-url http://127.0.0.1:8545 --broadcast
```

## Docs

- [`HANDOFF-NOTE.md`](HANDOFF-NOTE.md) — Miles / bot handoff (Part 1 answers **1A+2B** locked)
- [`ARC-SPEC.md`](ARC-SPEC.md) — annotated status given 1A+2B
- [`docs/part3-answers.md`](docs/part3-answers.md) — Part 3 written answers
- [`docs/decimals-empirical.md`](docs/decimals-empirical.md) — Arc decimals empirical check

## License

MIT
