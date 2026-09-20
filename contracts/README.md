# SettlementProofs (Foundry)

Append-only **notarization** registry on **Arc mainnet** (Decision **1A+2B**).

Payment stays on **Base**. This contract stores cleartext `address payee`, `amountUSDC` (6-decimal ERC-20 units), and public `bytes32 srcTxHash` (the **Base** payment tx). Confidentiality / payee-commit / `viewSaltKeyId` / Arc x402 settlement rail are out of scope here.

| Network | chainId | RPC | Explorer (human UI) |
| --- | --- | --- | --- |
| Arc mainnet | `5042` | `https://rpc.mainnet.arc.io` | `https://explorer.arc.io` (root pages only — not `/api`) |
| Arc testnet | `5042002` | `$ARC_TESTNET_RPC_URL` | set via your testnet explorer |

**Decimals:** Arc native gas USDC = 18; Arc ERC-20 USDC @ `0x3600…0000` = 6. Proof amounts use the 6-dec unit (same as Base USDC). Mixing them mis-settles by 10^12.

## Setup

```bash
git submodule update --init --recursive
cd contracts
forge test
```

`lib/` is not vendored in git — only submodule pointers. Do not commit `out/`, `cache/`, or `broadcast/`.

## Deploy / redeploy

Do not mainnet-redeploy until Miles has funded an Arc gas wallet and provided `PRIVATE_KEY` / `RECORDER_ADDRESS`. Leave `SETTLEMENT_PROOFS_ADDRESS` as TBD until then.

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
