# Tempo Moderato testnet — SettlementProofs

Public Tempo testnet (**Moderato**) deploy of the same append-only `SettlementProofs` registry used on Arc. No mainnet. Fees are paid in TIP-20 **pathUSD** (Tempo has no native gas token).

## Network

| Property | Value |
| --- | --- |
| Network | Tempo Testnet (Moderato) |
| Chain ID | `42431` |
| HTTP RPC | `https://rpc.moderato.tempo.xyz` |
| WebSocket | `wss://rpc.moderato.tempo.xyz` |
| Explorer | `https://explore.testnet.tempo.xyz` |
| Fee token | pathUSD `0x20c0000000000000000000000000000000000000` |
| Faucet (cast) | `cast rpc tempo_fundAddress <addr> --rpc-url https://rpc.moderato.tempo.xyz` |
| Faucet (HTTP) | `POST https://tempo.xyz/developers/api/faucet` `{"address":"<lowercase>"}` |
| Docs | https://docs.tempo.xyz |

EVM-compatible: Foundry `forge script` / `cast send` with `--tempo.fee-token pathUSD` works against the existing `SettlementProofs` contract (no ABI changes).

## Deployed registry (2026-09-23 PT)

| Item | Value |
| --- | --- |
| SettlementProofs | `0x35d7ec9B87A173774F18182c087bE3296efCce51` |
| Deploy tx | `0x43724d26545b93bba63ea0f994e706a536c6111964acc0823220d5d41408c13f` |
| RECORDER_ROLE (Tempo) | `0x7BdF3A4351d66215755f21222AAB0AFa0e8E87ed` — separate crew hot wallet for this Moderato deploy (pathUSD gas only). **Not** the Arc OKX recorder. |
| Owner / DEFAULT_ADMIN_ROLE (Tempo) | `0xe4b6b5fb5f228ccd431affaa05f3f21760ebad07` — throwaway crew key for testnet only. **Not** Miles’s OKX Arc admin. |

### Wallet separation (do not conflate)

| Role | Network | Address | Notes |
| --- | --- | --- | --- |
| Arc recorder (OKX “LLX Arc recorder”) | Arc mainnet | `0xfB1B8960B90944882813F09A0f537075C76253C7` | Live Render `arc-settlement-recorder` hot wallet; Arc gas only |
| Tempo recorder | Tempo Moderato | `0x7BdF3A4351d66215755f21222AAB0AFa0e8E87ed` | Distinct key granted `RECORDER_ROLE` on this testnet deploy |
| Tempo admin | Tempo Moderato | `0xe4b6b5fb5f228ccd431affaa05f3f21760ebad07` | Ephemeral crew deployer; fine for testnet. Any future Tempo **mainnet** admin must be Miles’s own wallet (as on Arc). **No Tempo mainnet from this workflow.** |

## Self-test proof (one live record)

| Item | Value |
| --- | --- |
| refId | `0xc1de754b33b29c17b260d90a39a357d2ce656ffeea8ef786d218f685401ed624` |
| amountUSDC | `1000` (0.001 USDC, 6-dec) |
| memo | `llx-self-test-0.001` |
| recordPayment tx | `0x800e271d417813aa726f8dcc66e709e7819f1b987480585326235bd3f38e59f7` |
| Explorer | https://explore.testnet.tempo.xyz/tx/0x800e271d417813aa726f8dcc66e709e7819f1b987480585326235bd3f38e59f7 |
| Verifier (after web deploy) | https://proofs.liquidlogicx.com/proofs?network=tempo&q=0xc1de754b33b29c17b260d90a39a357d2ce656ffeea8ef786d218f685401ed624 |

Note: the self-test `srcTxHash` is a **synthetic** bytes32 for Moderato demo (not a live Base transfer). The public verifier labels this Tempo proof as a synthetic demo — not a real payment. Production recorder still verifies a real Base USDC `Transfer` before writing.

## Foundry deploy recipe

```bash
cd contracts
export PRIVATE_KEY=...          # deployer / DEFAULT_ADMIN_ROLE (must NOT equal recorder)
export RECORDER_ADDRESS=0x...   # RECORDER_ROLE wallet
cast rpc tempo_fundAddress $(cast wallet address --private-key "$PRIVATE_KEY") \
  --rpc-url https://rpc.moderato.tempo.xyz

forge script script/Deploy.s.sol:DeploySettlementProofs \
  --sig "run()" \
  --rpc-url https://rpc.moderato.tempo.xyz \
  --broadcast --slow \
  --private-key "$PRIVATE_KEY" \
  --tempo.fee-token pathUSD
```

Do **not** deploy or fund Tempo **mainnet** (`4217` / `https://rpc.tempo.xyz`) from this workflow.
