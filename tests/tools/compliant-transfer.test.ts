/**
 * LIVE TESTNET TEST — exercises ats_compliant_transfer through the plugin surface.
 *
 * deploy → issue 400 to investor → transfer 150 investor->operator via the controller
 * path → assert both balances. No mocks; real on-chain calls.
 */
import 'dotenv/config';
import { it, expect, beforeAll } from 'vitest';
import type { Client } from '@hiero-ledger/sdk';
import { atsPlugin } from '../../src/index.js';
import { SecurityClient } from '../../src/contracts/security-client.js';
import { getLocalSigner } from '../../src/adapters/local-key-signer.js';
import { describeLive } from '../helpers/live.js';

const fakeClient = {} as Client;

function tool(method: string) {
  const t = atsPlugin.tools({}).find((x) => x.method === method);
  if (!t) throw new Error(`tool ${method} not registered`);
  return t;
}

describeLive('ats_compliant_transfer (live testnet)', () => {
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
    const params = deploy.parameters.parse({
      type: 'EQUITY',
      name: `XferTest-${Date.now()}`,
      symbol: 'XFR',
      isin: 'US0378331005',
      maxSupply: 1000,
      currency: 'USD',
      countries: 'US,MA',
      countryListIsAllowList: true,
      votingRight: true,
      dividendRight: 'PREFERRED',
      info: 'compliant transfer live test',
    });
    const out = await deploy.execute(fakeClient, {}, params);
    diamondAddress = out.diamondAddress as string;

    // Seed the investor with units to transfer.
    const issue = tool('ats_issue_to_investor');
    await issue.execute(fakeClient, {}, { diamondAddress, investor, amount: 400 });
  }, 120_000);

  it('transfers units between holders and updates balances', async () => {
    const transfer = tool('ats_compliant_transfer');
    const out = await transfer.execute(fakeClient, {}, {
      diamondAddress,
      from: investor,
      to: operator,
      amount: 150,
    });

    expect(out.amount).toBe('150');
    expect(out.from.toLowerCase()).toBe(investor.toLowerCase());
    expect(out.to.toLowerCase()).toBe(operator.toLowerCase());
    expect(out.txHash).toMatch(/^0x[0-9a-fA-F]{64}$/);
    expect(out.blockNumber).toBeGreaterThan(0);
    expect(out.network).toBe('testnet');

    const sec = new SecurityClient(diamondAddress);
    expect((await sec.balanceOf(investor)).toString()).toBe('250');
    expect((await sec.balanceOf(operator)).toString()).toBe('150');
  }, 90_000);

  it('rejects a transfer when the source holder has insufficient balance', async () => {
    const transfer = tool('ats_compliant_transfer');
    await expect(
      transfer.execute(fakeClient, {}, {
        diamondAddress,
        from: operator,
        to: investor,
        amount: 999_999,
      }),
    ).rejects.toThrow(/insufficient balance/);
  }, 60_000);

  it('rejects malformed addresses via zod', async () => {
    const transfer = tool('ats_compliant_transfer');
    expect(() =>
      transfer.parameters.parse({ diamondAddress, from: 'x', to: investor, amount: 1 }),
    ).toThrow();
  });
});
