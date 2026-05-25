/**
 * LIVE TESTNET TEST \u2014 exercises the @hebx/hak-ats-plugin tool through its public surface.
 * Deploys a real Equity contract using only the inputs an LLM would supply.
 */
import 'dotenv/config';
import { describe, it, expect } from 'vitest';
import type { Client } from '@hiero-ledger/sdk';
import { atsPlugin } from '../../src/index.js';
import { getLocalSigner } from '../../src/adapters/local-key-signer.js';

describe('ats_deploy_security plugin tool (live testnet)', () => {
  it('deploys an Equity through the BaseTool execute path', async () => {
    if (process.env.HEDERA_NETWORK !== 'testnet') {
      throw new Error('refusing to run live tests outside testnet');
    }

    const tools = atsPlugin.tools({});
    const tool = tools.find((t) => t.method === 'ats_deploy_security');
    expect(tool).toBeDefined();
    if (!tool) return;

    const stamp = Date.now();
    const params = tool.parameters.parse({
      type: 'EQUITY',
      name: `ToolEquity-${stamp}`,
      symbol: 'TEQ',
      isin: 'US0378331005',
      maxSupply: 500,
      currency: 'USD',
      countries: 'US,MA',
      countryListIsAllowList: true,
      votingRight: true,
      dividendRight: 'PREFERRED',
      info: 'plugin tool live test',
    });

    // The toolkit normally injects a Client; the ATS path doesn't use it.
    const fakeClient = {} as Client;
    const out = await tool.execute(fakeClient, {}, params);

    expect(out.diamondAddress).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(out.txHash).toMatch(/^0x[0-9a-fA-F]{64}$/);
    expect(out.blockNumber).toBeGreaterThan(0);
    expect(out.network).toBe('testnet');

    const signer = getLocalSigner();
    expect(out.diamondAddress.toLowerCase()).not.toBe(signer.evmAddress.toLowerCase());

    const code = await signer.provider.getCode(out.diamondAddress);
    expect(code.length).toBeGreaterThan(2);

    // eslint-disable-next-line no-console
    console.log('Plugin-tool deploy:', out);
  }, 90_000);

  it('rejects maxSupply above the configured cap', async () => {
    const tool = atsPlugin
      .tools({})
      .find((t) => t.method === 'ats_deploy_security');
    if (!tool) throw new Error('tool missing');

    const params = tool.parameters.parse({
      type: 'EQUITY',
      name: 'OverCap',
      symbol: 'OVC',
      isin: 'US0378331005',
      maxSupply: 999_999_999,
      currency: 'USD',
      countries: '',
      countryListIsAllowList: true,
      votingRight: false,
      dividendRight: 'NONE',
      info: '',
    });

    await expect(tool.execute({} as Client, {}, params)).rejects.toThrow(/MAX_SUPPLY_CAP/);
  });

  it('rejects countries outside the JURISDICTION_ALLOWLIST', async () => {
    const tool = atsPlugin
      .tools({})
      .find((t) => t.method === 'ats_deploy_security');
    if (!tool) throw new Error('tool missing');

    const params = tool.parameters.parse({
      type: 'EQUITY',
      name: 'BadJur',
      symbol: 'BAD',
      isin: 'US0378331005',
      maxSupply: 100,
      currency: 'USD',
      countries: 'KP', // not in default allowlist
      countryListIsAllowList: true,
      votingRight: false,
      dividendRight: 'NONE',
      info: '',
    });

    await expect(tool.execute({} as Client, {}, params)).rejects.toThrow(
      /JURISDICTION_ALLOWLIST/,
    );
  });
});
