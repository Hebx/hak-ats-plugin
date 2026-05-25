# `@hebx/hak-ats-plugin`

A [Hedera Agent Kit](https://github.com/hashgraph/hedera-agent-kit-js) v4 plugin that lets an AI agent issue and manage tokenized securities on Hedera using the [Asset Tokenization Studio](https://github.com/hashgraph/asset-tokenization-studio) reference contracts.

## Status

🚧 **Pre-release.** Public testnet only. API will move before `v1.0.0`.

## What this is

A typed plugin that exposes high-level AI tools for working with ERC-1400-style security tokens on Hedera. Calls go directly to the deployed Asset Tokenization Studio diamond contracts via JSON-RPC — the plugin uses the official `@hashgraph/asset-tokenization-contracts` typechain artifacts, no browser wallet or custodial provider required.

| Tool | Type |
|---|---|
| `ats_deploy_security` | tx — deploys an Equity diamond from the public testnet factory |
| `ats_register_investor` | tx — adds an account to a security's identity registry |
| `ats_issue_to_investor` | tx — mints security units to a registered investor |
| `ats_compliant_transfer` | tx — transfers between registered investors via the compliance modules |
| `ats_pay_dividend` | tx — records a dividend on chain and fans out HBAR to the cap table |
| `ats_get_security_info` | query — name, symbol, supply, paused state |
| `ats_get_cap_table` | query — investor balances via the mirror node |

## Install

```bash
npm install @hebx/hak-ats-plugin @hashgraph/hedera-agent-kit
```

Peer deps: `@hashgraph/hedera-agent-kit@^4.0.0`, `@hiero-ledger/sdk@^2.81.0`.

## Quick start

```ts
import { atsPlugin } from '@hebx/hak-ats-plugin';
import { HederaLangchainToolkit, AgentMode } from '@hashgraph/hedera-agent-kit';
import { Client } from '@hiero-ledger/sdk';
import { ChatOpenAI } from '@langchain/openai';

const client = Client.forTestnet().setOperator(
  process.env.HEDERA_OPERATOR_ID!,
  process.env.HEDERA_OPERATOR_KEY!
);

const toolkit = new HederaLangchainToolkit({
  client,
  configuration: {
    mode: AgentMode.AUTONOMOUS,
    plugins: [atsPlugin],
  },
});

const llm = new ChatOpenAI({ model: 'gpt-4o-mini' });
// wire up your preferred ReAct / tool-calling agent…
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

MAX_SUPPLY_CAP=1000000
JURISDICTION_ALLOWLIST=US,GB,DE,FR,MA,AE,SG,JP
```

The operator account must be **ECDSA** and EVM-address-aliased (created via `TransferTransaction` to its EVM address, not `AccountCreateTransaction.setKey`).

## Development

```bash
npm install
npm run typecheck
npm run test:run        # tests run against Hedera testnet
npm run build
```

Tests hit live testnet — there are no mocks. You need a funded testnet operator in `.env` before running the suite.

## Architecture

- Each tool is a `BaseTool` subclass with Zod params and a `coreAction`.
- `src/contracts/` instantiates typed `ethers.Contract` wrappers from `@hashgraph/asset-tokenization-contracts`.
- `src/adapters/local-key-signer.ts` builds an `ethers.Wallet` from the env ECDSA key against Hashio.
- `src/policies/` implements the Agent Kit hook lifecycle (mainnet deny, max-supply cap, jurisdiction allow-list).
- `src/adapters/mirror-node.ts` reads holder balances for the cap table tool.

## Safety

- Testnet only by default. The `mainnet-deny` policy hard-fails any tool call when `HEDERA_NETWORK !== 'testnet'`.
- Max supply per deploy is capped via `MAX_SUPPLY_CAP`.
- Country list filtering enforces `JURISDICTION_ALLOWLIST`.

## License

Apache-2.0
