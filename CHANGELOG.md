# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html). Pre-1.0: minor versions may
introduce breaking changes.

## [0.4.2] - 2026-05-31

### Fixed
- **Gemini function-calling regression introduced in `0.4.0`.** The `0.4.0` account-id
  work made `addressOrId` a single shared zod schema instance, reused across multiple
  address fields of the same tool (`issue` has 2, `compliant_transfer` and
  `force_transfer` have 3). `zod-to-json-schema` deduplicates repeated subschemas into
  `{"$ref":"#/properties/diamondAddress"}`, and Google's Generative Language API rejects
  `$ref`/`$defs` in `function_declarations` with `400 Bad Request` (`Unknown name
  "$ref"`). Every tool call through a Gemini-backed agent failed. `addressOrId` is now a
  **factory** (`addressOrId()`) that returns a fresh schema per field, so each address
  parameter is fully inlined and provider-agnostic. Verified: all 14 tool schemas emit
  zero `$ref`/`$defs`. No API or behavior change otherwise.
- Corrected the hardcoded `version` in the exported `Plugin` object (was stale at
  `0.3.0`) to track the package version.

## [0.4.1] - 2026-05-31

### Changed
- Docs-only republish. The `0.4.0` tarball shipped with a stale README Status line
  (`Pre-release (0.3.1)`) because the version reference was corrected after that publish;
  npm tarballs are immutable, so this patch carries the corrected README. No code or
  tool-surface changes from `0.4.0`.

## [0.4.0] - 2026-05-31

### Added
- **Hedera account / contract ids accepted everywhere an EVM address is.** Every address
  input across the tools — `diamondAddress`, `investor`, `from`, `to` — now takes either a
  `0x` EVM address or a Hedera id (`0.0.X`). Ids are resolved to their canonical EVM
  address through the mirror node before any contract call (diamonds via the contract
  endpoint, accounts via the account endpoint), with per-process caching.
- `ats_get_cap_table` now reports each holder's `accountId` (0.0.X) alongside the EVM
  `address`; `ats_issue_to_investor` returns `investorAccountId` when the investor was
  given by id.
- `resolveAccountIdToEvm` mirror-node helper and a shared `addressOrId` schema /
  `toEvmAddress` normalizer (`src/adapters/address.ts`).
- Unit tests for the normalizer (mocked fetch, no HBAR) and a live testnet suite that
  issues to and reads back a holder addressed by its `0.0.X` account id.

### Notes
- Backfill: 0.3.0 added the mainnet opt-in (removed mainnet-deny; kept max-supply +
  jurisdiction policies), the HCS registry/KYC/document tools, `ats_deploy_bond`,
  `ats_force_transfer`, and `ats_set_paused`. 0.3.1 added registry tooling polish and
  weaker-model schema robustness.

## [0.2.0] - 2026-05-30

First feature-complete testnet release. Expands the plugin from a single deploy tool to the
full security-token lifecycle, adds Agent Kit safety policies, and ships a runnable
tool-calling agent example.

### Added
- `ats_issue_to_investor` — grants `ISSUER_ROLE` and mints security units in one path
  (no separate register/KYC step under the default deploy config).
- `ats_get_security_info` — name, symbol, supply, and paused state.
- `ats_compliant_transfer` — controller transfer between holders via the ERC-1644 path.
- `ats_get_cap_table` — holder balances read from the mirror node.
- `ats_pay_dividend_manual` — off-chain HBAR fan-out pro-rata to the cap table (the public
  testnet factory's equity config has no on-chain `DividendFacet`).
- Safety policies (`src/policies/`): mainnet-deny, max-supply cap, jurisdiction allow-list,
  wired into the Agent Kit hook lifecycle.
- `examples/plugin-tool-calling-agent.ts` — runnable LangChain ReAct agent. Defaults to
  Google Gemini (`gemini-2.5-flash`); set `LLM_PROVIDER=openai` to use OpenAI. Bounded by
  `recursionLimit: 8`.

### Fixed
- **Gas:** `CREATE_EQUITY` / `CREATE_BOND` reduced 15M → 4M. The upstream 15M limit is ~11x
  real deploy cost (~1.32M gas used); ethers reserves `gasLimit × maxFeePerGas` as a
  pre-flight balance check, so a 15M limit under dynamic Hashio pricing could trip a false
  `INSUFFICIENT_FUNDS` while the tx itself only spends ~1 HBAR.
- **Schema compat:** replaced zod `.positive()` with `.min(1)` / `.refine()` on tool params
  so Gemini's function-calling schema conversion accepts them. No validation change.

### Changed
- README rewritten to match the shipped 6-tool surface, document no-KYC issuance and the
  off-chain dividend fan-out, switch the quick start to Gemini, and warn that `test:run`
  executes against live testnet.

### Verified
- End-to-end on Hedera testnet: the Gemini agent selected `ats_deploy_security` and deployed
  diamond `0.0.9096323` (`gas_limit` 4,000,000, `gas_used` 1,296,800, status SUCCESS).

## [0.1.0] - 2026-05

### Added
- Initial plugin scaffold and `ats_deploy_security` (deploys an Equity diamond from the
  public testnet ATS factory).

[0.2.0]: https://github.com/Hebx/hak-ats-plugin/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/Hebx/hak-ats-plugin/releases/tag/v0.1.0
