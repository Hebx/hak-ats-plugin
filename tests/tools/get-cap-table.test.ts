/**
 * LIVE TESTNET TEST — exercises ats_get_cap_table through the plugin surface.
 *
 * deploy → issue to investor + operator → transfer between them → read the cap table
 * from the mirror node and assert it matches on-chain balances. No mocks.
 */
import 'dotenv/config';
import { describe, it, expect, beforeAll } from 'vitest';
import type { Client } from '@hiero-ledger/sdk';
import { atsPlugin } from '../../src/index.js';
import { getLocalSigner } from '../../src/adapters/local-key-signer.js';

const fakeClient = {} as Client;

function tool(method: string) {
  const t = atsPlugin.tools({}).find((x) => x.method === method);
  if (!t) throw new Error(`tool ${method} not registered`);
  return t;
}

describe('ats_get_cap_table (live testnet)', () => {
  let diamondAddress: string;
  const investor = process.env.INVESTOR_EVM_ADDRESS as string;
  let operator: string;

  beforeAll(async () => {
    if (process.env.HEDERA_NETWORK !== 'testnet') {
      throw new Error('refusing to run live tests outside testnet');
    }
    if (!investor) throw new Error('INVESTOR_EVM_ADDRESS not set in .env');
    operator = getLocalSigner().evmAddress;

    const deploy = tool('ats_deploy_security');
    const out = await deploy.execute(fakeClient, {}, deploy.parameters.parse({
      type: 'EQUITY',
      name: `CapTest-${Date.now()}`,
      symbol: 'CAP',
      isin: 'US0378331005',
      maxSupply: 1000,
      currency: 'USD',
      countries: 'US,MA',
      countryListIsAllowList: true,
      votingRight: true,
      dividendRight: 'PREFERRED',
      info: 'cap table live test',
    }));
    diamondAddress = out.diamondAddress as string;

    const issue = tool('ats_issue_to_investor');
    await issue.execute(fakeClient, {}, { diamondAddress, investor, amount: 250 });
    await issue.execute(fakeClient, {}, { diamondAddress, investor: operator, amount: 100 });

    const transfer = tool('ats_compliant_transfer');
    await transfer.execute(fakeClient, {}, { diamondAddress, from: investor, to: operator, amount: 50 });

    // Allow the mirror node to index the logs.
    await new Promise((r) => setTimeout(r, 8000));
  }, 150_000);

  it('returns holders and balances matching on-chain state', async () => {
    const capTool = tool('ats_get_cap_table');
    const out = await capTool.execute(fakeClient, {}, { diamondAddress });

    expect(out.network).toBe('testnet');
    expect(out.totalSupply).toBe('350');
    expect(out.holderCount).toBe(2);

    const byAddr = Object.fromEntries(
      out.holders.map((h: { address: string; balance: string }) => [h.address.toLowerCase(), h.balance]),
    );
    expect(byAddr[investor.toLowerCase()]).toBe('200');
    expect(byAddr[operator.toLowerCase()]).toBe('150');
  }, 60_000);

  it('rejects a malformed diamond address via zod', async () => {
    const capTool = tool('ats_get_cap_table');
    expect(() => capTool.parameters.parse({ diamondAddress: 'nope' })).toThrow();
  });
});
