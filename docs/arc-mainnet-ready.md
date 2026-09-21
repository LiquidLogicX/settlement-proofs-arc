# Job 3 — Arc mainnet registry readiness (dry-run only)

**No broadcast. No funds moved.** Simulated against `https://rpc.mainnet.arc.io` (chainId `5042` / `0x13b2`).

## Design (locked)

Base USDC payment → `SettlementProofs.recordPayment` on Arc `eip155:5042`. Public cleartext `payee` + public `srcTxHash`. No commitment / confidentiality.

## Deploy script

`contracts/script/Deploy.s.sol:DeploySettlementProofs`

Dry-run (throwaway Anvil key #0 — **never fund or broadcast**):

```bash
export PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
export RECORDER_ADDRESS=0x70997970C51812dc3A010C7d01b50e0d17dc79C8
forge script script/Deploy.s.sol:DeploySettlementProofs --sig "run()" \
  --rpc-url https://rpc.mainnet.arc.io -vvvv
# do NOT add --broadcast until Miles funds a real Arc gas wallet
```

### Simulation result

| Item | Value |
|------|-------|
| Chain id | 5042 |
| Forge estimated total gas | **1335618** |
| `eth_gasPrice` (live) | ≈ 20.0 gwei |
| Cost at live gasPrice | **≈ 0.0267 USDC** (native 18-dec) |
| Forge max-fee estimate | **≈ 0.0561 USDC** |

Conservative deploy budget on Arc: **~0.06 USDC**.

## Verification plan (Circle / Arcscan docs)

1. [Deploy on Arc](https://docs.arc.io/integrate/deploy-on-arc) — Foundry Blockscout verifier example for **testnet** (`https://testnet.arcscan.app/api/`).
2. Mainnet Arcscan (`chainId` 5042): [Verify & Publish](https://docs.arc-scan.org/verifyContract) — **Sourcify does not list 5042 yet**; use UI + Solidity standard-JSON.
3. Known issue: [testnet Arcscan API rejects standard Blockscout formats](https://github.com/circlefin/arc-node/issues/210) — browser UI is reliable.
4. Do **not** use Cloudflare-gated `explorer.arc.io/api` for CI verify.

**Miles after real deploy:** Arcscan UI verify first; then try `forge verify-contract` if API accepts.

## Recorder dry-run (no broadcast)

Exact line from `LiquidLogicX/liquid-logic-agent` `data/ledger.jsonl`:

```json
{"type":"payment","timestamp":"2026-09-15T20:38:56.825Z","endpoint":"https://audit.liquidlogicx.com/api/allowance?wallet=0xEA24bafbBAF6d7Ba58bE860EE906f0Fe533d167D","amountUsdc":"0.001","asset":"USDC","network":"eip155:8453","txHash":"0x93a15735c5b82fb8c9fdc0f7db5d56916a14f6ee4ef343000a29fd55c4bcaf4c","basescanUrl":"https://basescan.org/tx/0x93a15735c5b82fb8c9fdc0f7db5d56916a14f6ee4ef343000a29fd55c4bcaf4c","walletAddress":"0xEA24bafbBAF6d7Ba58bE860EE906f0Fe533d167D","reason":"self-test"}
```

Expected `recordPayment` args:

| Arg | Value |
|-----|--------|
| `refId` | recorder-derived |
| `payee` | cleartext ERC-20 Transfer `to` on Base |
| `amountUSDC` | `1000` (0.001 × 10^6) |
| `paidAt` | Base block timestamp |
| `srcTxHash` | `0x93a15735c5b82fb8c9fdc0f7db5d56916a14f6ee4ef343000a29fd55c4bcaf4c` |
| `memo` | optional |

Payer wallet in ledger (not necessarily on-chain payee): `0xEA24bafbBAF6d7Ba58bE860EE906f0Fe533d167D`

**Blocker:** public Base RPCs from this host returned 403/limit; Transfer `to` not decoded. Miles: `cast receipt 0x93a15735c5b82fb8c9fdc0f7db5d56916a14f6ee4ef343000a29fd55c4bcaf4c --rpc-url $BASE_RPC_URL` then fill `payee`.

## Out of scope tonight

- Mainnet `--broadcast`
- Production `ENABLE_X402_ARC`
- Secrets in repo
