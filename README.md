# `@hebx/hak-ats-plugin`

A [Hedera Agent Kit](https://github.com/hashgraph/hedera-agent-kit-js) v4 plugin that lets an AI agent deploy and manage tokenized securities (equity and bonds) on Hedera using the [Asset Tokenization Studio](https://github.com/hashgraph/asset-tokenization-studio) (ATS) reference contracts, with an HCS-backed registry and audit trail.

## Status

**Pre-release (`0.4.2`).** The tool surface is exercised against live testnet, but the API may change before `1.0.0`. Network is **opt-in**: set `HEDERA_NETWORK=testnet` (default) or `HEDERA_NETWORK=mainnet` and you operate on that network, at your own risk. There is no mainnet deny. The max-supply-cap and jurisdiction-allowlist policies stay enforced on every network.

## What this is

A typed plugin that exposes high-level AI tools for ERC-1400 / ERC-3643 security tokens on Hedera. Calls go straight to the deployed ATS diamond contracts over JSON-RPC (Hashio) using the official typechain artifacts — no browser wallet or custodial provider required. A Hedera Consensus Service topic provides an independent registry and audit trail.

| Tool | Kind | What it does |
|---|---|---|
| `ats_deploy_security` | tx | Deploys an Equity diamond from the ATS factory |
| `ats_deploy_bond` | tx | Deploys a Bond diamond with par value + start/maturity schedule |
| `ats_issue_to_investor` | tx | Mints security units to an investor (grants `ISSUER_ROLE`, then `issue()`) |
| `ats_compliant_transfer` | tx | Controller transfer between holders via the ERC-1644 controller path |
| `ats_force_transfer` | tx | Regulatory clawback: force-move units without holder consent (ERC-1644) |
| `ats_set_paused` | tx | Pause / unpause all transfers on a security (ERC-1400 pause facet) |
| `ats_pay_dividend_manual` | tx | Reads the cap table and fans out HBAR to holders pro-rata |
| `ats_get_security_info` | query | Name, symbol, supply, paused state |
| `ats_get_cap_table` | query | Holder balances, read from the mirror node |
| `ats_registry_anchor` | hcs | Register a security or log a corporate action to the HCS registry |
| `ats_registry_resolve` | hcs | Resolve a security by name / symbol / ISIN to its diamond address |
| `ats_registry_list` | hcs | Read back the registry audit trail from the mirror node |
| `ats_kyc_register_investor` | hcs | Anchor a tamper-evident investor KYC attestation (GRANTED / REVOKED) |
| `ats_anchor_document` | hcs | Anchor a SHA-256 digest of an off-chain document as the document-of-record |

Notes on behavior, confirmed on testnet:
- **Issuance needs no separate register/KYC step** under the default deploy config (blocklist mode, internal KYC off). `ats_issue_to_investor` handles the role grant and mint in one path.
- **KYC is an HCS attestation, not on-chain enforcement.** The default deploy config ships with internal KYC deactivated and the ERC-3643 identity-registry path requires issuer/role setup that is out of scope for the baseline. `ats_kyc_register_investor` records an auditable attestation; binding to the on-chain identity registry to gate transfers is a roadmap item.
- **Dividends are an off-chain HBAR fan-out, by design.** The reference factory's equity config does not include the on-chain `DividendFacet`, so `ats_pay_dividend_manual` builds the cap table from mirror-node transfers and distributes HBAR pro-rata via a `TransferTransaction`.
- **Bonds deploy the core instrument.** `ats_deploy_bond` sets currency, par value, and start/maturity dates; coupon-rate facets are a roadmap item.
- **The registry topic is discovered within a session.** The first registry write (`ats_registry_anchor` / `ats_kyc_register_investor` / `ats_anchor_document`) creates an HCS topic and returns its id. Read tools (`ats_registry_resolve`, `ats_registry_list`) reuse that topic automatically for the rest of the process, so a deploy-register-then-resolve flow works without configuration. Set `HCS_REGISTRY_TOPIC_ID` to pin the **same** registry across separate processes.
- **Symbols are capped at 8 characters** (an ATS contract constraint); longer symbols are rejected at deploy time.
- **Addresses accept either form.** Every address input — the security `diamondAddress`, and any `investor` / `from` / `to` — takes a `0x` EVM address **or** a Hedera id (`0.0.X`). Ids are resolved to their canonical EVM address via the mirror node before any contract call (cached per process), so the two forms are interchangeable. Diamonds resolve through the contract endpoint, accounts through the account endpoint; an account with an ECDSA key resolves to its key alias, one without to the long-zero form. Reads echo both: `ats_get_cap_table` reports each holder's `accountId` alongside its EVM `address`, and `ats_issue_to_investor` returns the `investorAccountId` when you addressed the investor by id.

## Install

```bash
npm install @hebx/hak-ats-plugin @hashgraph/hedera-agent-kit
```

Peer deps: `@hashgraph/hedera-agent-kit@^4.0.0`, `@hiero-ledger/sdk@^2.81.0`.

## Quick start

```ts
import 'dotenv/config';
import { atsPlugin } from '@hebx/hak-ats-plugin';
import { HederaLangchainToolkit } from '@hashgraph/hedera-agent-kit-langchain';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { HumanMessage } from '@langchain/core/messages';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { Client } from '@hiero-ledger/sdk';

const client = Client.forTestnet().setOperator(
  process.env.HEDERA_OPERATOR_ID!,
  process.env.HEDERA_OPERATOR_KEY!,
);

const toolkit = new HederaLangchainToolkit({
  client,
  configuration: { plugins: [atsPlugin] },
});

const llm = new ChatGoogleGenerativeAI({
  model: 'gemini-2.5-flash',
  temperature: 0,
  apiKey: process.env.GEMINI_API_KEY!,
});

const agent = createReactAgent({ llm, tools: toolkit.getTools() });

const res = await agent.invoke(
  { messages: [new HumanMessage('Deploy an equity "Acme Series A" (ACME), max supply 1000000, USD, US only.')] },
  { recursionLimit: 8 },
);
console.log(res.messages.at(-1)?.content);
```

A complete, runnable version is in [`examples/plugin-tool-calling-agent.ts`](examples/plugin-tool-calling-agent.ts). It defaults to Google Gemini; set `LLM_PROVIDER=openai` with `OPENAI_API_KEY` to use OpenAI instead.

```bash
cp .env.example .env   # fill in testnet operator + GEMINI_API_KEY
npx tsx examples/plugin-tool-calling-agent.ts
```

## Configuration

Copy `.env.example` to `.env` and fill in:

```
HEDERA_NETWORK=testnet
HEDERA_OPERATOR_ID=0.0.XXXX
HEDERA_OPERATOR_KEY=<64-char ECDSA hex>
HEDERA_OPERATOR_KEY_TYPE=ECDSA
HEDERA_OPERATOR_EVM_ADDRESS=0x…

ATS_FACTORY_ADDRESS=0.0.7512002
ATS_RESOLVER_ADDRESS=0.0.7511642

HEDERA_RPC_URL=https://testnet.hashio.io/api
HEDERA_MIRROR_NODE_URL=https://testnet.mirrornode.hedera.com

# LLM provider for the example agent
LLM_PROVIDER=google            # or: openai
LLM_MODEL=gemini-2.5-flash
GEMINI_API_KEY=                # or OPENAI_API_KEY when LLM_PROVIDER=openai

# Safety policies
MAX_SUPPLY_CAP=1000000
JURISDICTION_ALLOWLIST=US,GB,DE,FR,MA,AE,SG,JP
```

The operator account must be **ECDSA** and EVM-address-aliased — created by sending HBAR to its EVM address via `TransferTransaction`, not `AccountCreateTransaction.setKey`. Hashio (the JSON-RPC relay) only resolves accounts that have an EVM alias.

## Development

```bash
npm install
npm run typecheck
npm run build
npm run lint
npm run test:run        # ⚠️ live testnet — see below
```

`npm run test:run` runs the **entire suite against live Hedera testnet with no mocks** — every deploy spends real testnet HBAR (a full run is ~20+ contract deploys plus HCS topic/message fees, several HBAR). The registry suite (`tests/registry/`) only writes HCS messages, so it is the cheapest to run. Run a single file while iterating:

```bash
npx vitest run tests/<file>.test.ts
```

Keep a funded testnet operator in `.env` and top it up before a full suite run.

## Architecture

- **Tools** (`src/tools/`) — each is a `BaseTool` with Zod params and a `coreAction`.
- **Contracts** (`src/contracts/`) — typed `ethers.Contract` wrappers over the ATS typechain artifacts; `GAS` limits are tuned to measured testnet usage (see `factory-client.ts`).
- **Signing** (`src/adapters/local-key-signer.ts`) — builds an `ethers.Wallet` from the env ECDSA key against Hashio.
- **Policies** (`src/policies/`) — Agent Kit hook lifecycle: max-supply cap, jurisdiction allow-list (enforced on every network).
- **Registry** (`src/adapters/hcs-registry.ts`) — HCS topic create + JSON message submit + mirror-node read, backing security registration, name resolution, corporate-action trail, KYC attestations, and document anchoring.
- **Mirror node** (`src/adapters/mirror-node.ts`) — resolves EVM/contract addresses and reads holder balances for the cap table.

## Safety

- **Network is opt-in.** `HEDERA_NETWORK` selects testnet (default) or mainnet. Mainnet moves real value and is irreversible; there is no separate flag and no deny — setting the network is the deliberate choice.
- **Supply cap.** Per-deploy issuance is bounded by `MAX_SUPPLY_CAP`.
- **Jurisdiction filter.** Country handling is enforced against `JURISDICTION_ALLOWLIST`.
- **No secrets in the repo.** Operator keys live only in `.env` (git-ignored). Run `npm run secrets:scan` (gitleaks) before publishing.

## License

Apache-2.0
