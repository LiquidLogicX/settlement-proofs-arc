# SettlementProofs (Foundry)

Append-only settlement-proof registry targeting **Arc mainnet**.

Payees are **public**: on-chain storage is cleartext `address payee` plus public `bytes32 srcTxHash` (the Arc settlement tx). Confidentiality / payee-commit / `viewSaltKeyId` were removed under Decision 2B.

| Network | chainId | RPC | Explorer |
| --- | --- | --- | --- |
| Arc mainnet | `5042` | `https://rpc.mainnet.arc.io` | `https://explorer.arc.io` |
| Arc testnet | `5042002` | `$ARC_TESTNET_RPC_URL` | set via your testnet explorer |

## Setup

```bash
git submodule update --init --recursive
cd contracts
forge test
```

`lib/` is not vendored in git — only submodule pointers. Do not commit `out/`, `cache/`, or `broadcast/`.

## Deploy / redeploy

**ABI and storage changed** (1B+2B). Any previously deployed mainnet address is **obsolete**. Do not point recorder/web at an old address. Redeploy only when Miles has funded an Arc gas wallet and provided `PRIVATE_KEY` / `RECORDER_ADDRESS`. Leave `SETTLEMENT_PROOFS_ADDRESS` as TBD until then.

```bash
cp .env.example .env
# fill PRIVATE_KEY and RECORDER_ADDRESS

source .env
forge script script/Deploy.s.sol:DeploySettlementProofs \
  --rpc-url https://rpc.mainnet.arc.io \
  --broadcast --slow \
  --private-key "$PRIVATE_KEY"
```

The script grants `RECORDER_ROLE` to `RECORDER_ADDRESS`. The owner **cannot** call `recordPayment`.
