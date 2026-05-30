/**
 * Example: a LangChain tool-calling agent that uses the ATS plugin to deploy a
 * tokenized equity on Hedera testnet from a natural-language instruction.
 *
 * This mirrors the upstream Hedera Agent Kit LangChain example: build a Hedera Client,
 * register the plugin via HederaLangchainToolkit, hand the tools to a ReAct agent, and
 * let the LLM decide which tool to call.
 *
 * Run:
 *   1. cp .env.example .env   # fill in testnet operator + OPENAI_API_KEY
 *   2. npx tsx examples/plugin-tool-calling-agent.ts
 *
 * Safety: every ATS tool is gated by the mainnet_deny policy, so this refuses to run
 * against anything but testnet regardless of what the prompt asks for.
 */
import 'dotenv/config';
import { Client, AccountId, PrivateKey } from '@hiero-ledger/sdk';
import { ChatOpenAI } from '@langchain/openai';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { HumanMessage } from '@langchain/core/messages';
import { HederaLangchainToolkit } from '@hashgraph/hedera-agent-kit-langchain';
import { atsPlugin } from '../src/index.js';

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`missing required env var ${key}`);
  return value;
}

async function main(): Promise<void> {
  if ((process.env.HEDERA_NETWORK ?? 'testnet') !== 'testnet') {
    throw new Error('this example runs on Hedera testnet only');
  }

  // Native Hedera client for the operator. ATS tools sign EVM calls via the local
  // ECDSA signer internally; this client satisfies the toolkit's constructor and
  // backs native operations (e.g. the dividend HBAR fan-out).
  const client = Client.forTestnet().setOperator(
    AccountId.fromString(requireEnv('HEDERA_OPERATOR_ID')),
    PrivateKey.fromStringECDSA(requireEnv('HEDERA_OPERATOR_KEY')),
  );

  const toolkit = new HederaLangchainToolkit({
    client,
    configuration: { plugins: [atsPlugin] },
  });

  const llm = new ChatOpenAI({
    model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
    temperature: 0,
    apiKey: requireEnv('OPENAI_API_KEY'),
  });

  const agent = createReactAgent({ llm, tools: toolkit.getTools() });

  const instruction =
    'Deploy a new equity security named "Acme Series A" with symbol ACME, ISIN ' +
    'US0378331005, max supply 1000000, currency USD, allowed country US, voting ' +
    'rights enabled, preferred dividend. Report the diamond address and HashScan-' +
    'ready transaction hash.';

  console.log(`\n> ${instruction}\n`);

  const response = await agent.invoke({ messages: [new HumanMessage(instruction)] });
  const last = response.messages[response.messages.length - 1];
  console.log('Agent:', typeof last.content === 'string' ? last.content : JSON.stringify(last.content));

  client.close();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
