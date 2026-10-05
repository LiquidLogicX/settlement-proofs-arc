# Tempo Moderato testnet — SettlementProofs

Public Tempo testnet (**Moderato**) deploy of the same append-only `SettlementProofs` registry used on Arc. On Tempo, both the **payment** (a TIP-20 stablecoin transfer) and the **proof** live on Tempo. No mainnet from this workflow. Fees are paid in TIP-20 **pathUSD** (Tempo has no native gas token).

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

## End-to-end flow (Tempo payment → Tempo proof)

1. Payer sends a TIP-20 stablecoin to the payee on Moderato, ideally with `transferWithMemo(to, amount, bytes32 memo)` so the invoice reference rides along.
2. Anyone with the recorder API key posts the payment tx hash: `POST /v1/tempo/proofs` `{ txHash, payee, amountUSDC, memo? }` (or `POST /v1/proofs` with `"chain": "tempo"`).
3. The recorder reads the receipt from Tempo RPC and requires a `Transfer(from, to=payee, amount)` log from an **allowlisted** stablecoin (default: pathUSD, AlphaUSD, BetaUSD, ThetaUSD). No match → `400 TIP20_AMOUNT_UNVERIFIED`, nothing is written.
4. The recorder checks its own pathUSD fee balance (`503 LOW_GAS_BALANCE` if low), then calls `recordPayment` on the Tempo registry. The proof memo is tagged `eip155:42431/<Token> <note>`, so readers know which chain and token `srcTxHash` belongs to. With no `memo` in the request, the payer's TIP-20 memo text becomes the note.
5. The response carries `proof`, `payment` (payer, token, TIP-20 memo, explorer link), `registry` (proof tx link) and `verifyUrl`. Retries return the same proof (idempotent on `refId`).
6. `proofs.liquidlogicx.com/?network=tempo` lists the proof and **independently re-fetches the payment receipt** from Tempo to show payer → payee and a "Payment re-checked on-chain" badge.

One-shot demo (pay + prove + print link): `cd recorder && npm run demo:tempo -- --amount 1.25 --token AlphaUSD --memo "INV-1001" --note "Design retainer"` with `TEMPO_PAYER_PRIVATE_KEY`, `TEMPO_PAYEE_ADDRESS`, `RECORDER_URL`, `RECORDER_API_KEY` set. Refuses to run against mainnet.

## Deployed registry v2 (2026-10-05 PT) — current

| Item | Value |
| --- | --- |
| SettlementProofs | [`0x2ec4CF47e6964b33FEd3718f07885ed44aF52c0b`](https://explore.testnet.tempo.xyz/address/0x2ec4CF47e6964b33FEd3718f07885ed44aF52c0b) |
| Deploy tx | [`0x2b54108e…d407`](https://explore.testnet.tempo.xyz/tx/0x2b54108e528d1a3104a9f28cfabb11aee4516a833906b08776fadf308b8cd407) (block `38311217`, used as the web log-scan floor) |
| grantRole(RECORDER_ROLE) tx | [`0x192568da…c720`](https://explore.testnet.tempo.xyz/tx/0x192568daa5704461d1c8f6d4b0dd916197fe4618c365da4efde76b46cf28c720) |
| DEFAULT_ADMIN_ROLE | `0x559Dd64C490EB65165fC0844eA2f6880bf171A38` (crew testnet key) |
| RECORDER_ROLE | `0xc300c1092b949bCE55E7d0B0d86Cb733d03fA114` (crew testnet key, pathUSD fees only) |

Why a new deploy: the v1 registry's recorder/admin keys were not available to the crew for this sprint, and the v1 record is synthetic. v2 is the same contract bytecode source (`contracts/src/SettlementProofs.sol`). The web app defaults to v2 when `NEXT_PUBLIC_TEMPO_SETTLEMENT_PROOFS_ADDRESS` is unset.

Testnet keys live only on the crew box in a mode-600 secrets file outside the repo. They are testnet-only and hold faucet funds; they must never be reused on Tempo mainnet or Arc.

### Demo wallets (Moderato only)

| Role | Address |
| --- | --- |
| Payer (demo customer) | `0x5eA5bE7aDf358fB239037406c55016ac8aB01f49` |
| Payee (demo merchant) | `0xfd689a93346AA40D2F38dC2ab6Eb436A57AA45c7` |

### Real proofs (recorded 2026-10-05 PT via `POST /v1/tempo/proofs`)

| # | Payment tx (Tempo) | Amount / token | TIP-20 memo | Note | Proof tx (Tempo) | refId |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | [`0x592d1082…eb71`](https://explore.testnet.tempo.xyz/tx/0x592d108234d07171b9dd3e43f0390ebbac989276bf53031522219e1ddfd8eb71) | 12.50 AlphaUSD | `INV-2026-1001` | Design retainer, Oct | [`0xa74d1f33…2dda`](https://explore.testnet.tempo.xyz/tx/0xa74d1f33a90c39e7886dfdff5897081bf948b7315b38340f453bd9d742272dda) | [`0x064a33b1…c14c`](https://proofs.liquidlogicx.com/proofs/0x064a33b196b10c9f249165de66419d9daafb21616633ea15085d53e06d9dc14c?network=tempo) |
| 2 | [`0x9a4f37aa…a86d`](https://explore.testnet.tempo.xyz/tx/0x9a4f37aad10d4cb3d811ba09591afb4c9c626a62e855930655978bdb327ea86d) | 0.42 pathUSD | `API-CALLS-OCT-W1` | Agent API usage, week 1 | [`0x66505dcf…f0e0`](https://explore.testnet.tempo.xyz/tx/0x66505dcfdfdbc70dc0e8ef25a46e8cdd8b594c8d6d494d28315a667c2dacf0e0) | [`0x202b7ae4…6d86`](https://proofs.liquidlogicx.com/proofs/0x202b7ae48f2bd001065450050106800b5a70763e762900dbe8247edd01786d86?network=tempo) |
| 3 | [`0xcffea545…27e5`](https://explore.testnet.tempo.xyz/tx/0xcffea545574a85398d0536fd90dbe06ee3a9a68d489194a278f70bd9b87527e5) | 250.00 BetaUSD | `PAYOUT-0007` | Contractor payout #7 | [`0x1a22f3a5…e693`](https://explore.testnet.tempo.xyz/tx/0x1a22f3a51875286a8338e21aa74574acc46b31e03805eed50597262e8785e693) | [`0x3a667de2…f41f`](https://proofs.liquidlogicx.com/proofs/0x3a667de23cf4dce787f79b2e14457964ff2b1935f949c3a294793ff389eef41f?network=tempo) |

Negative checks run against the same local recorder: wrong amount → `400 TIP20_AMOUNT_UNVERIFIED`; wrong payee → `400`; same payment again → `200` with the existing proof (no second write); no bearer token → `401`.

### Recorder env (Tempo rail)

| Var | Required | Default / notes |
| --- | --- | --- |
| `TEMPO_SETTLEMENT_PROOFS_ADDRESS` | yes (enables the rail) | v2 address above |
| `TEMPO_RECORDER_PRIVATE_KEY` | yes | Wallet holding `RECORDER_ROLE`; pathUSD for fees. Startup refuses the Arc recorder key. |
| `TEMPO_RPC_URL` | no | `https://rpc.moderato.tempo.xyz` |
| `TEMPO_EXPLORER` | no | `https://explore.testnet.tempo.xyz` |
| `TEMPO_MIN_CONFIRMATIONS` | no | `1` (deterministic finality) |
| `TEMPO_FEE_TOKEN` | no | pathUSD |
| `TEMPO_ALLOWED_TOKENS` | no | comma list of TIP-20 addresses; default the four Moderato stablecoins |
| `TEMPO_MIN_RECORDER_FEE_BALANCE` | no | `50000` (0.05 pathUSD) |
| `TEMPO_ALLOW_MAINNET` | no | must be `true` to run against chain 4217; leave unset |
| `PUBLIC_VERIFIER_URL` | no | `https://proofs.liquidlogicx.com` |

The Arc rail (`SETTLEMENT_PROOFS_ADDRESS`, `SETTLEMENT_RECORDER_PRIVATE_KEY`, `BASE_RPC_URL`, `ARC_RPC_URL`) is independent; a recorder can run Arc only, Tempo only, or both.

### Web env

| Var | Default |
| --- | --- |
| `NEXT_PUBLIC_TEMPO_SETTLEMENT_PROOFS_ADDRESS` | v2 address above |
| `NEXT_PUBLIC_TEMPO_REGISTRY_FROM_BLOCK` | `38311217` when the address is v2; otherwise unset (time-estimated scan) |
| `NEXT_PUBLIC_TEMPO_RPC_URL` / `_EXPLORER` / `_CHAIN_ID` | Moderato values |

## Legacy registry v1 (2026-09-23 PT)

Superseded by v2 above. Kept for history; still readable on-chain. To show it in the verifier, set `NEXT_PUBLIC_TEMPO_SETTLEMENT_PROOFS_ADDRESS=0x35d7ec9B87A173774F18182c087bE3296efCce51`.

| Item | Value |
| --- | --- |
| SettlementProofs | `0x35d7ec9B87A173774F18182c087bE3296efCce51` |
| Deploy tx | `0x43724d26545b93bba63ea0f994e706a536c6111964acc0823220d5d41408c13f` |
| RECORDER_ROLE (Tempo) | `0x7BdF3A4351d66215755f21222AAB0AFa0e8E87ed` — separate crew hot wallet for this Moderato deploy (pathUSD gas only). **Not** the Arc OKX recorder. |
| Owner / DEFAULT_ADMIN_ROLE (Tempo) | `0xe4b6b5fb5f228ccd431affaa05f3f21760ebad07` — throwaway crew key for testnet only. **Not** Miles’s OKX Arc admin. |

### v1 wallet separation (do not conflate)

| Role | Network | Address | Notes |
| --- | --- | --- | --- |
| Arc recorder (OKX “LLX Arc recorder”) | Arc mainnet | `0xfB1B8960B90944882813F09A0f537075C76253C7` | Live Render `arc-settlement-recorder` hot wallet; Arc gas only |
| Tempo recorder (v1) | Tempo Moderato | `0x7BdF3A4351d66215755f21222AAB0AFa0e8E87ed` | Distinct key granted `RECORDER_ROLE` on this testnet deploy |
| Tempo admin (v1) | Tempo Moderato | `0xe4b6b5fb5f228ccd431affaa05f3f21760ebad07` | Ephemeral crew deployer; fine for testnet. Any future Tempo **mainnet** admin must be Miles’s own wallet (as on Arc). **No Tempo mainnet from this workflow.** |

### v1 self-test proof (one synthetic record)

| Item | Value |
| --- | --- |
| refId | `0xc1de754b33b29c17b260d90a39a357d2ce656ffeea8ef786d218f685401ed624` |
| amountUSDC | `1000` (0.001 USDC, 6-dec) |
| memo | `llx-self-test-0.001` |
| recordPayment tx | `0x800e271d417813aa726f8dcc66e709e7819f1b987480585326235bd3f38e59f7` |
| Explorer | https://explore.testnet.tempo.xyz/tx/0x800e271d417813aa726f8dcc66e709e7819f1b987480585326235bd3f38e59f7 |
| Verifier (after web deploy) | https://proofs.liquidlogicx.com/proofs?network=tempo&q=0xc1de754b33b29c17b260d90a39a357d2ce656ffeea8ef786d218f685401ed624 |

Note: the self-test `srcTxHash` is a **synthetic** bytes32 for Moderato demo (not a live Base transfer). The public verifier labels this Tempo proof as a synthetic demo — not a real payment. The recorder never writes without verifying a real transfer; this record predates the Tempo rail.

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

Do **not** deploy or fund Tempo **mainnet** (`4217` / `https://rpc.tempo.xyz`) from this workflow. Tempo mainnet has been live since 2026-03-18 (tempo.xyz/blog/mainnet); a mainnet registry needs Miles's own admin wallet and explicit OK.
