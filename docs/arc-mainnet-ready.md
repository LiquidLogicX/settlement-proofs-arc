# Job 3 — Arc mainnet registry readiness (dry-run only)

**No broadcast. No funds moved.** Simulated 2026-09-21 against `https://rpc.mainnet.arc.io` (chainId `5042` / `0x13b2`).

## Design (locked)

Base USDC payment → `SettlementProofs.recordPayment` on Arc `eip155:5042`. Public cleartext `payee` + public `srcTxHash`. No commitment / confidentiality.

## Deploy script

`contracts/script/Deploy.s.sol:DeploySettlementProofs`

Dry-run command (throwaway Anvil key — **never** fund or broadcast with it):

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
| Simulated create gas (trace) | 848240 |
| grantRole gas (trace) | 29519 |
| Forge estimated total gas | **1335618** |
| `eth_gasPrice` (live) | `0x4a817cbe8` ≈ 20.000001 gwei |
| Cost at live gasPrice | **≈ 0.0267 USDC** (native 18-dec) |
| Forge “amount required” (max-fee path) | **≈ 0.0561 USDC** |

Use **~0.06 USDC** as a conservative deploy budget on Arc (gas = USDC).

Artifact: `contracts/broadcast/Deploy.s.sol/5042/dry-run/run-latest.json` (local only; do not treat simulated address as deployed).

## Verification plan (from Circle / Arcscan docs — not guessed)

1. Official deploy docs: [Deploy on Arc](https://docs.arc.io/integrate/deploy-on-arc) — Foundry + Blockscout verifier example for **testnet**:
   `forge verify-contract … --verifier blockscout --verifier-url https://testnet.arcscan.app/api/`
2. Mainnet Arcscan (`chainId` 5042): [Verify & Publish](https://docs.arc-scan.org/verifyContract) — **Sourcify does not list 5042 yet**; UI path is Verify & Publish with Solidity standard-JSON.
3. Known issue: [testnet.arcscan.app API rejects standard Blockscout formats](https://github.com/circlefin/arc-node/issues/210) — browser UI is the reliable path until API is fixed.
4. Do **not** use Cloudflare-gated `explorer.arc.io/api` for CI verify (see `foundry.toml` comment). Humans open explorer pages in a browser.

**Miles step after real deploy:** verify via Arcscan UI (standard-JSON) first; retry `forge verify-contract` against Arcscan API only if API accepts submissions.

## Recorder dry-run (no broadcast)

Source payment from `LiquidLogicX/liquid-logic-agent` `data/ledger.jsonl`:

```json
{"type":"payment","timestamp":"2026-09-15T20:38:56.825Z","amountUsdc":"0.001","network":"eip155:8453","txHash":"0x93a15735c5b82fb8c9fdc0f7db5d56916a14f6ee4ef343000a29fd55c4bcaf4c","walletAddress":"0xEA24bafbBAF6d7Ba58bE860EE906f0Fe533d167D","reason":"self-test"}
```

Expected registry call shape (`recordPayment`):

| Arg | Value |
|-----|--------|
| `refId` | `keccak256(abi.encodePacked(srcTxHash, payee, amountUSDC))` (recorder-derived) |
| `payee` | **cleartext** ERC-20 `Transfer` `to` on Base (must match receipt) |
| `amountUSDC` | `1000` (0.001 × 10^6) |
| `paidAt` | Base block timestamp for `srcTxHash` |
| `srcTxHash` | `0x93a15735c5b82fb8c9fdc0f7db5d56916a14f6ee4ef343000a29fd55c4bcaf4c` |
| `memo` | optional string from request |

**Blocker:** public Base RPCs from this host returned 403/limit; could not decode the Transfer `to` tonight. Miles should run `cast receipt $TX --rpc-url $BASE_RPC_URL` with a working Base RPC and fill `payee` before any Arc write.

## Out of scope tonight

- Mainnet `--broadcast`
- Production `ENABLE_X402_ARC`
- Secrets in repo
