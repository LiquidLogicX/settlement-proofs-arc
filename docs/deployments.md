# Deployments — SettlementProofs registries

Public addresses the verifier and recorder may point at. **Verifier production must use the current Tempo Moderato registry (v2).** The legacy Tempo v1 address is documented here only; it is not shown in the UI unless someone deliberately overrides the env var.

## Current

| Network | Role | Contract | Address | Notes |
| --- | --- | --- | --- | --- |
| Arc mainnet (`5042`) | registry | SettlementProofs | [`0x1de52cbc4490a7873ef007e51cb91a5b374facb1`](https://explorer.arc.io/address/0x1de52cbc4490a7873ef007e51cb91a5b374facb1) | Live. USDC payments verified on Base. |
| Tempo Moderato (`42431`) | registry | SettlementProofs **v2** | [`0x2ec4CF47e6964b33FEd3718f07885ed44aF52c0b`](https://explore.testnet.tempo.xyz/address/0x2ec4CF47e6964b33FEd3718f07885ed44aF52c0b) | **Current.** Deploy block `38311217`. Three real TIP-20 proofs. |
| Tempo mainnet (`4217`) | registry | — | *not deployed* | See [`tempo-mainnet-prep.md`](tempo-mainnet-prep.md). No broadcast without Miles OK. |

### Verifier (Vercel project `settlement-proofs-arc`)

| Env var | Required value (production) |
| --- | --- |
| `NEXT_PUBLIC_TEMPO_SETTLEMENT_PROOFS_ADDRESS` | `0x2ec4CF47e6964b33FEd3718f07885ed44aF52c0b` |
| `NEXT_PUBLIC_TEMPO_REGISTRY_FROM_BLOCK` | `38311217` |
| `NEXT_PUBLIC_TEMPO_RPC_URL` | `https://rpc.moderato.tempo.xyz` |
| `NEXT_PUBLIC_TEMPO_EXPLORER` | `https://explore.testnet.tempo.xyz` |
| `NEXT_PUBLIC_TEMPO_CHAIN_ID` | `42431` |

If `NEXT_PUBLIC_TEMPO_SETTLEMENT_PROOFS_ADDRESS` is **unset**, the web app already defaults to the v2 address above (`web/src/lib/config.ts`). Setting the vars locks production to v2 explicitly. **Do not** set the address to the legacy v1 value.

Where to set: Vercel → team **liquid-logic-x** → project **settlement-proofs-arc** → Settings → Environment Variables → Production (and Preview if desired) → Redeploy.

### Recorder (Render service `arc-settlement-recorder`)

See [`render-tempo-env.md`](render-tempo-env.md) for the exact Tempo env var **names** (values/keys pasted by Miles only).

## Superseded

| Network | Contract | Address | Status |
| --- | --- | --- | --- |
| Tempo Moderato (`42431`) | SettlementProofs **v1** | `0x35d7ec9B87A173774F18182c087bE3296efCce51` | **Superseded 2026-10-05 PT.** One synthetic self-test record only. Still readable on-chain; **hidden from the verifier UI** (not the code default; do not set as `NEXT_PUBLIC_TEMPO_SETTLEMENT_PROOFS_ADDRESS` on production). Details: [`tempo-testnet.md`](tempo-testnet.md#legacy-registry-v1-2026-09-23-pt). |

