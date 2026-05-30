# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html). Pre-1.0: minor versions may
introduce breaking changes.

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
