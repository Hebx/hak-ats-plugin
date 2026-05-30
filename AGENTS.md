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
- Issuance needs only `grantRole(_ISSUER_ROLE)` + `IERC1594.issue()` under the default deploy config (blocklist, internal KYC off) — no separate register/KYC step. Confirmed on testnet.
- `ats_compliant_transfer` uses ERC-1644 `controllerTransfer` (operator holds `_CONTROLLER_ROLE`). Do NOT preflight with `IERC1594.canTransfer`: it models a msg.sender-initiated transfer, so it checks the operator's balance (zero) and falsely rejects valid controller transfers with code 0x54. Use a source-holder balance check instead.
- On-chain dividends are BLOCKED on the public testnet factory: `setDividend` reverts `FunctionNotFound(0xe7686a05)` — the DividendFacet is not in equity config id 0x..01 v0. Use a manual HBAR fan-out (cap table + TransferTransaction) for `ats_pay_dividend`, as the design doc anticipated.
