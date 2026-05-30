/**
 * LIVE TESTNET TEST — exercises ats_set_paused and ats_force_transfer through the
 * plugin's public tool surface.
 *
 * deploy → issue to investor → pause/unpause → force-transfer (clawback) investor→operator.
 * No mocks. Cost: several HBAR of testnet gas per run.
 */
import 'dotenv/config';
import { it, expect, beforeAll } from 'vitest';
import type { Client } from '@hiero-ledger/sdk';
import { atsPlugin } from '../../src/index.js';
import { getLocalSigner } from '../../src/adapters/local-key-signer.js';
import { describeLive } from '../helpers/live.js';

const fakeClient = {} as Client;

function tool(method: string) {
  const t = atsPlugin.tools({}).find((x) => x.method === method);
  if (!t) throw new Error(`tool ${method} not registered`);
  return t;
}

describeLive('ats_set_paused + ats_force_transfer (live testnet)', () => {
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
      name: `CtrlTest-${Date.now()}`,
      symbol: 'CTL',
      isin: 'US0378331005',
      maxSupply: 1000,
      currency: 'USD',
      countries: 'US,MA',
      countryListIsAllowList: true,
      votingRight: true,
      dividendRight: 'PREFERRED',
      info: 'pause + force-transfer live test',
    }));
    diamondAddress = out.diamondAddress as string;

    const issue = tool('ats_issue_to_investor');
    await issue.execute(fakeClient, {}, { diamondAddress, investor, amount: 200 });
  }, 150_000);

  it('pauses then unpauses all transfers', async () => {
    const setPaused = tool('ats_set_paused');
    const info = tool('ats_get_security_info');

    const paused = await setPaused.execute(fakeClient, {}, { diamondAddress, paused: true });
    expect(paused.paused).toBe(true);
    expect(paused.txHash).toMatch(/^0x[0-9a-fA-F]{64}$/);
    expect(paused.blockNumber).toBeGreaterThan(0);
    expect(paused.network).toBe('testnet');

    const whilePaused = await info.execute(fakeClient, {}, { diamondAddress });
    expect(whilePaused.paused).toBe(true);

    const resumed = await setPaused.execute(fakeClient, {}, { diamondAddress, paused: false });
    expect(resumed.paused).toBe(false);

    const afterResume = await info.execute(fakeClient, {}, { diamondAddress });
    expect(afterResume.paused).toBe(false);
  }, 120_000);

  it('force-transfers (claws back) units from the investor without consent', async () => {
    const force = tool('ats_force_transfer');
    const out = await force.execute(fakeClient, {}, {
      diamondAddress,
      from: investor,
      to: operator,
      amount: 75,
      reason: 'sanctions enforcement (live test)',
    });

    expect(out.amount).toBe('75');
    expect(out.from.toLowerCase()).toBe(investor.toLowerCase());
    expect(out.to.toLowerCase()).toBe(operator.toLowerCase());
    expect(out.reason).toMatch(/sanctions/);
    expect(out.txHash).toMatch(/^0x[0-9a-fA-F]{64}$/);
    expect(out.blockNumber).toBeGreaterThan(0);
    expect(out.network).toBe('testnet');
  }, 120_000);

  it('rejects a non-address target via zod before any tx', async () => {
    const force = tool('ats_force_transfer');
    expect(() =>
      force.parameters.parse({ diamondAddress, from: investor, to: 'nope', amount: 1 }),
    ).toThrow();
  });

  it('rejects a non-positive force-transfer amount via zod', async () => {
    const force = tool('ats_force_transfer');
    expect(() =>
      force.parameters.parse({ diamondAddress, from: investor, to: operator, amount: 0 }),
    ).toThrow();
  });
});
