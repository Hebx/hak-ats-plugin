/**
 * LIVE TESTNET TEST — exercises ats_pay_dividend_manual through the plugin surface.
 *
 * deploy → issue to investor + operator → pay 1 HBAR pro-rata → assert the per-holder
 * plan, balanced distribution, and SUCCESS receipt. No mocks; real HBAR moves.
 */
import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Client } from '@hiero-ledger/sdk';
import { atsPlugin } from '../../src/index.js';
import { getLocalSigner } from '../../src/adapters/local-key-signer.js';
import { closeHederaClient } from '../../src/adapters/hedera-client.js';

const fakeClient = {} as Client;

function tool(method: string) {
  const t = atsPlugin.tools({}).find((x) => x.method === method);
  if (!t) throw new Error(`tool ${method} not registered`);
  return t;
}

describe('ats_pay_dividend_manual (live testnet)', () => {
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
      name: `DivPayTest-${Date.now()}`,
      symbol: 'DPT',
      isin: 'US0378331005',
      maxSupply: 1000,
      currency: 'USD',
      countries: 'US,MA',
      countryListIsAllowList: true,
      votingRight: true,
      dividendRight: 'PREFERRED',
      info: 'dividend payout live test',
    }));
    diamondAddress = out.diamondAddress as string;

    const issue = tool('ats_issue_to_investor');
    await issue.execute(fakeClient, {}, { diamondAddress, investor, amount: 300 });
    await issue.execute(fakeClient, {}, { diamondAddress, investor: operator, amount: 100 });

    // Allow the mirror node to index the mint logs.
    await new Promise((r) => setTimeout(r, 8000));
  }, 150_000);

  afterAll(() => closeHederaClient());

  it('distributes HBAR pro-rata, excluding treasury by default', async () => {
    const pay = tool('ats_pay_dividend_manual');
    const out = await pay.execute(fakeClient, {}, {
      diamondAddress,
      totalAmountHbar: 1,
    });

    expect(out.network).toBe('testnet');
    expect(out.status).toBe('SUCCESS');
    expect(out.totalSupply).toBe('400');
    // Treasury (operator, 100 units) excluded → only the investor (300) is eligible.
    expect(out.eligibleSupply).toBe('300');
    expect(out.payments).toHaveLength(1);
    expect(out.payments[0].address.toLowerCase()).toBe(investor.toLowerCase());
    // Sole eligible holder receives the full 1 HBAR (100_000_000 tinybar).
    expect(out.payments[0].tinybar).toBe('100000000');
    expect(out.totalDistributedTinybar).toBe('100000000');
    expect(out.transactionId).toMatch(/^0\.0\.\d+@\d+\.\d+$/);
  }, 90_000);

  it('includes treasury when excludeTreasury is false', async () => {
    const pay = tool('ats_pay_dividend_manual');
    const out = await pay.execute(fakeClient, {}, {
      diamondAddress,
      totalAmountHbar: 1,
      excludeTreasury: false,
    });

    expect(out.status).toBe('SUCCESS');
    expect(out.eligibleSupply).toBe('400');
    expect(out.payments).toHaveLength(2);
    const byAddr = Object.fromEntries(
      out.payments.map((p: { address: string; tinybar: string }) => [p.address.toLowerCase(), p.tinybar]),
    );
    // 300/400 = 75_000_000 tinybar; 100/400 = 25_000_000 tinybar.
    expect(byAddr[investor.toLowerCase()]).toBe('75000000');
    expect(byAddr[operator.toLowerCase()]).toBe('25000000');
    expect(out.totalDistributedTinybar).toBe('100000000');
  }, 90_000);

  it('rejects a non-positive amount via zod', async () => {
    const pay = tool('ats_pay_dividend_manual');
    expect(() => pay.parameters.parse({ diamondAddress, totalAmountHbar: 0 })).toThrow();
  });
});
