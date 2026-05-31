/**
 * LIVE TESTNET TEST — Hedera account-id inputs end to end.
 *
 * Proves the address-or-id layer: deploy a security (resolve its diamond by id is not
 * possible until it exists, so we use the returned EVM there), then issue to the operator
 * by its 0.0.X ACCOUNT ID, and confirm:
 *   - issuing by account id mints to the same holder as the operator EVM address, and
 *   - the cap table reports that holder with both its EVM address and its account id.
 *
 * No mocks — real on-chain calls. Cost: a few HBAR of testnet gas.
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

describeLive('account-id inputs (live testnet)', () => {
  let diamondAddress: string;
  const operatorId = process.env.HEDERA_OPERATOR_ID as string;
  let operatorEvm: string;

  beforeAll(async () => {
    if (process.env.HEDERA_NETWORK !== 'testnet') {
      throw new Error('refusing to run live tests outside testnet');
    }
    operatorEvm = getLocalSigner().evmAddress.toLowerCase();

    const deploy = tool('ats_deploy_security');
    const out = await deploy.execute(fakeClient, {}, deploy.parameters.parse({
      type: 'EQUITY',
      name: `AcctIdTest-${Date.now()}`,
      symbol: 'AID',
      isin: 'US0378331005',
      maxSupply: 1000,
      currency: 'USD',
      countries: 'US,MA',
      countryListIsAllowList: true,
      votingRight: true,
      dividendRight: 'PREFERRED',
      info: 'account-id live test',
    }));
    diamondAddress = out.diamondAddress as string;
  }, 90_000);

  it('issues to an investor given as a 0.0.X account id', async () => {
    const issue = tool('ats_issue_to_investor');
    // investor is the operator account, addressed by its Hedera ID, not 0x.
    const out = await issue.execute(fakeClient, {}, {
      diamondAddress,
      investor: operatorId,
      amount: 120,
    });

    expect(out.amount).toBe('120');
    expect(out.investorAccountId).toBe(operatorId);
    // resolved EVM holder must equal the operator's EVM address
    expect(out.investor.toLowerCase()).toBe(operatorEvm);
    expect(out.txHash).toMatch(/^0x[0-9a-fA-F]{64}$/);
    expect(out.network).toBe('testnet');
  }, 90_000);

  it('reports the holder with both EVM address and account id in the cap table', async () => {
    // Allow the mirror node to index the issue log.
    await new Promise((r) => setTimeout(r, 8000));
    const capTool = tool('ats_get_cap_table');
    const out = await capTool.execute(fakeClient, {}, { diamondAddress });

    const holder = out.holders.find(
      (h: { address: string }) => h.address.toLowerCase() === operatorEvm,
    );
    expect(holder).toBeDefined();
    expect(holder.balance).toBe('120');
    expect(holder.accountId).toBe(operatorId);
  }, 60_000);
});
