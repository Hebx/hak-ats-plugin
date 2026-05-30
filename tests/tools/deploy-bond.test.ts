/**
 * LIVE TESTNET TEST — exercises ats_deploy_bond through the plugin's public tool surface.
 *
 * Deploys a real fixed-term Bond diamond using only the inputs an LLM would supply, then
 * reads it back via ats_get_security_info. No mocks. Cost: a few HBAR of testnet gas.
 */
import 'dotenv/config';
import { it, expect } from 'vitest';
import type { Client } from '@hiero-ledger/sdk';
import { atsPlugin } from '../../src/index.js';
import { describeLive } from '../helpers/live.js';

const fakeClient = {} as Client;

function tool(method: string) {
  const t = atsPlugin.tools({}).find((x) => x.method === method);
  if (!t) throw new Error(`tool ${method} not registered`);
  return t;
}

describeLive('ats_deploy_bond plugin tool (live testnet)', () => {
  it('deploys a Bond and reports its maturity through the BaseTool execute path', async () => {
    if (process.env.HEDERA_NETWORK !== 'testnet') {
      throw new Error('refusing to run live tests outside testnet');
    }

    const deploy = tool('ats_deploy_bond');
    const now = Math.floor(Date.now() / 1000);
    const startingDate = now + 3600; // 1h out
    const maturityDate = startingDate + 365 * 24 * 3600; // +1y

    const params = deploy.parameters.parse({
      name: `ToolBond-${now}`,
      symbol: 'TBD',
      isin: 'US0378331005',
      maxSupply: 1000,
      currency: 'EUR',
      nominalValue: 1000,
      startingDate,
      maturityDate,
      countries: 'US,MA',
      countryListIsAllowList: true,
      info: 'plugin bond live test',
    });

    const out = await deploy.execute(fakeClient, {}, params);

    expect(out.diamondAddress).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(out.txHash).toMatch(/^0x[0-9a-fA-F]{64}$/);
    expect(out.blockNumber).toBeGreaterThan(0);
    expect(out.maturityDate).toBe(maturityDate);
    expect(out.network).toBe('testnet');

    // Read it back: a freshly deployed bond carries its metadata and zero supply.
    const info = tool('ats_get_security_info');
    const meta = await info.execute(fakeClient, {}, { diamondAddress: out.diamondAddress });
    expect(meta.symbol).toBe('TBD');
    expect(meta.isin).toBe('US0378331005');
    expect(meta.totalSupply).toBe('0');
    expect(meta.paused).toBe(false);
  }, 150_000);

  it('refuses a maturity that is not after the start date (no tx sent)', async () => {
    const deploy = tool('ats_deploy_bond');
    const now = Math.floor(Date.now() / 1000);
    const params = deploy.parameters.parse({
      name: `BadBond-${now}`,
      symbol: 'BAD',
      isin: 'US0378331005',
      maxSupply: 100,
      currency: 'USD',
      nominalValue: 100,
      startingDate: now + 7200,
      maturityDate: now + 7200, // equal → invalid
      countries: 'US',
      countryListIsAllowList: true,
      info: '',
    });
    await expect(deploy.execute(fakeClient, {}, params)).rejects.toThrow(/maturityDate/);
  });

  it('rejects a malformed currency via zod before any tx', async () => {
    const deploy = tool('ats_deploy_bond');
    const now = Math.floor(Date.now() / 1000);
    expect(() =>
      deploy.parameters.parse({
        name: 'X',
        symbol: 'XB',
        isin: 'US0378331005',
        maxSupply: 100,
        currency: 'usd', // lowercase → fails /^[A-Z]{3}$/
        nominalValue: 100,
        startingDate: now,
        maturityDate: now + 1000,
      }),
    ).toThrow();
  });
});
