# Arc mainnet decimals — empirical check (Part 2.4)

Checked **2026-09-18** against live `https://rpc.mainnet.arc.io` (chainId `0x13b2` = **5042**).
Do not treat docs (including ARC-SPEC / HANDOFF-NOTE) as the source of truth for this file.

## ERC-20 USDC (`0x3600000000000000000000000000000000000000`)

`eth_call` `decimals()` (`0x313ce567`) →

```json
{"jsonrpc":"2.0","id":1,"result":"0x0000000000000000000000000000000000000000000000000000000000000006"}
```

**Result: 6 decimals.**

## Native gas balance (same face amount cross-check)

Wallet used (Circle Gateway / verifying contract from facilitator):
`0x77777777dcc4d5a8b6e418fd04d8997ef11000ee`

| Call | Raw hex | Integer |
|------|---------|---------|
| `eth_getBalance` | `0xbc65d52280963c7d6000` | `889683377910000000000000` |
| ERC-20 `balanceOf` | `0xcf2542fef6` | `889683377910` |

Interpretations:

| Representation | Formula | Human amount |
|----------------|---------|--------------|
| Native ÷ 10¹⁸ | `889683377910000000000000 / 10**18` | **889683.37791** |
| Native ÷ 10⁶ | `… / 10**6` | ~8.9×10¹⁷ (absurd) |
| ERC-20 ÷ 10⁶ | `889683377910 / 10**6` | **889683.37791** |
| ERC-20 ÷ 10¹⁸ | `… / 10**18` | ~8.9×10⁻⁷ (absurd) |

Native ÷ 10¹⁸ matches ERC-20 ÷ 10⁶ to the same face value on this funded address.
That is the empirical cross-check (no private “known wallet” was available; this public gateway balance was used instead).

**Result: native gas accounting = 18 decimals; ERC-20 USDC = 6 decimals.**

## Not used as evidence

- Third-party docs, ARC-SPEC §4, HANDOFF-NOTE wording, Circle facilitator `decimals: 6` field (facilitator matches ERC-20 but was not the check).
