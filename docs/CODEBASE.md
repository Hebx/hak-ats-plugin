# `@hebx/hak-ats-plugin` — codebase map

## Layout

```
hak-ats-plugin/
├── src/
│   ├── index.ts                    # atsPlugin export
│   ├── env.ts                        # Env validation
│   ├── tools/security/
│   │   └── deploy-security.ts        # ats_deploy_security (+ siblings)
│   ├── contracts/
│   │   └── factory-client.ts         # ATS factory diamond calls
│   ├── adapters/
│   │   ├── local-key-signer.ts       # ethers Wallet from env ECDSA
│   │   └── mirror-node.ts            # Cap table / balances
│   └── policies/                     # HAK hook lifecycle guards
├── tests/                            # Vitest against live testnet
└── scripts/                          # Dev helpers
```

## Tool → file mapping

| Tool | Kind | Area |
|------|------|------|
| `ats_deploy_security` | tx | `tools/security/deploy-security.ts` |
| `ats_register_investor` | tx | tools/security/* |
| `ats_issue_to_investor` | tx | tools/security/* |
| `ats_compliant_transfer` | tx | tools/security/* |
| `ats_pay_dividend` | tx | tools/security/* |
| `ats_get_security_info` | query | tools + mirror |
| `ats_get_cap_table` | query | mirror-node adapter |

Each tool: `BaseTool` subclass, Zod params, `coreAction`.

## Architecture edges

```
Agent (LangChain/HAK) → atsPlugin tools
  → policies/ (mainnet-deny, caps, jurisdiction)
  → contracts/ (factory + diamond ABIs)
  → local-key-signer → Hashio JSON-RPC
  → mirror-node (read-only queries)
```

## Commands

```bash
npm install
npm run typecheck
npm run test:run    # requires funded testnet .env
npm run build
```

## Local plans (operator)

`.local-plans/` — design notes; not shipped in npm tarball.

## Related

- **HashTrail:** `~/projects/hashtrail-hedera-agent` (receipt CLI, bounty 1)
- **Hedron:** `~/projects/Hedron` (commerce SDK)
- **Guardian (future):** Plan A in `clawd/memory/2026-05-25-main-unknown-unknown.md` — not this repo

## Agent notes

- Hedera + EVM aliasing quirks — read README before debugging account errors
- Typechain artifacts from `@hashgraph/asset-tokenization-contracts` — do not hand-roll ABIs
