# `@hebx/hak-ats-plugin` — agent harness

*Hedera Agent Kit v4 plugin for Asset Tokenization Studio (ERC-1400-style securities). Public README for install/API.*

## Role

Expose **ATS tools** to HAK agents: deploy security, register investor, issue, compliant transfer, dividend, cap table queries. **Testnet only** unless policies explicitly expanded.

**Bounty context:** Hedera ecosystem week-2 lane (enterprise tokenization). Guardian (`hak-guardian-plugin`) was Plan A — deferred; **this repo is ATS (Plan B), shipped May 2026.**

## Tooling

- Node 20+, TypeScript, Vitest
- **Live testnet tests** — no mocks; funded `.env` operator required
- `npm run typecheck` · `npm test:run` · `npm run build`

## Codebase map

See **`docs/CODEBASE.md`** before broad navigation.

## Harness rules

- **Policies first:** `src/policies/` — mainnet-deny, max-supply, jurisdiction allowlist
- **Contracts:** typed ethers wrappers from `@hashgraph/asset-tokenization-contracts`
- **Signing:** `src/adapters/local-key-signer.ts` (ECDSA env key → Hashio)
- **Verify before done** — typecheck + test output; include mirror node / tx ids for on-chain claims
- **No mainnet** without explicit operator approval

## Configuration

Copy `.env.example` → `.env`. Operator must be **ECDSA EVM-aliased** (see README).

## Learned

*(Append one-line bullets when corrected.)*
