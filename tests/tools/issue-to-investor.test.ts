/**
 * LIVE TESTNET TEST — exercises ats_issue_to_investor and ats_get_security_info
 * through the plugin's public tool surface.
 *
 * Deploys a fresh Equity, issues units to the investor account, then reads info back.
 * No mocks — real on-chain calls. Cost: a few HBAR of testnet gas per run.
 */
import 'dotenv/config';
import { it, expect, beforeAll } from 'vitest';
import type { Client } from '@hiero-ledger/sdk';
import { atsPlugin } from '../../src/index.js';
import { describeLive } from '../helpers/live.js';

const fakeClient = {} as Client;

function tool(method: string) {
  const t = atsPlugin.tools({}).find((x) => x.method === method);
  if (!t) throw new Error(`tool ${method} not registered`);
  return t;
}

async function deployFreshDiamond(): Promise<string> {
  const deploy = tool('ats_deploy_security');
  const params = deploy.parameters.parse({
    type: 'EQUITY',
    name: `IssueTest-${Date.now()}`,
    symbol: 'ITS',
    isin: 'US0378331005',
    maxSupply: 1000,
    currency: 'USD',
    countries: 'US,MA',
    countryListIsAllowList: true,
    votingRight: true,
    dividendRight: 'PREFERRED',
    info: 'issue+info live test',
  });
  const out = await deploy.execute(fakeClient, {}, params);
  return out.diamondAddress as string;
}

describeLive('ats_issue_to_investor + ats_get_security_info (live testnet)', () => {
  let diamondAddress: string;
  const investor = process.env.INVESTOR_EVM_ADDRESS as string;

  beforeAll(async () => {
    if (process.env.HEDERA_NETWORK !== 'testnet') {
      throw new Error('refusing to run live tests outside testnet');
    }
    if (!investor) throw new Error('INVESTOR_EVM_ADDRESS not set in .env');
    diamondAddress = await deployFreshDiamond();
  }, 90_000);

  it('reports zero supply on a freshly deployed security', async () => {
    const info = tool('ats_get_security_info');
    const out = await info.execute(fakeClient, {}, { diamondAddress });
    expect(out.symbol).toBe('ITS');
    expect(out.isin).toBe('US0378331005');
    expect(out.totalSupply).toBe('0');
    expect(out.paused).toBe(false);
    expect(out.network).toBe('testnet');
  }, 60_000);

  it('issues units to the investor and reflects them in total supply', async () => {
    const issue = tool('ats_issue_to_investor');
    const out = await issue.execute(fakeClient, {}, {
      diamondAddress,
      investor,
      amount: 300,
    });

    expect(out.amount).toBe('300');
    expect(out.investor.toLowerCase()).toBe(investor.toLowerCase());
    expect(out.txHash).toMatch(/^0x[0-9a-fA-F]{64}$/);
    expect(out.blockNumber).toBeGreaterThan(0);
    expect(out.network).toBe('testnet');

    const info = tool('ats_get_security_info');
    const after = await info.execute(fakeClient, {}, { diamondAddress });
    expect(after.totalSupply).toBe('300');
  }, 90_000);

  it('rejects a non-address investor via zod before any tx', async () => {
    const issue = tool('ats_issue_to_investor');
    expect(() =>
      issue.parameters.parse({ diamondAddress, investor: 'not-an-address', amount: 1 }),
    ).toThrow();
  });

  it('rejects a non-positive amount via zod', async () => {
    const issue = tool('ats_issue_to_investor');
    expect(() =>
      issue.parameters.parse({ diamondAddress, investor, amount: 0 }),
    ).toThrow();
  });
});
