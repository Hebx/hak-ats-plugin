/**
 * LIVE TESTNET TEST — deploys a real Equity contract on Hedera testnet.
 *
 * Prerequisites:
 *   - .env populated with funded ECDSA EVM-aliased operator account
 *   - operator has at least ~5 HBAR for the deploy gas
 *
 * Cost per run: ~3-4 HBAR of testnet gas. Idempotent: each run deploys a new diamond.
 */
import 'dotenv/config';
import { describe, it, expect, beforeAll } from 'vitest';
import { FactoryClient, type EquityRights, type SecurityCommonInfo } from '../../src/contracts/factory-client.js';
import { getLocalSigner } from '../../src/adapters/local-key-signer.js';

describe('FactoryClient.deployEquity (live testnet)', () => {
  let client: FactoryClient;

  beforeAll(() => {
    if (process.env.HEDERA_NETWORK !== 'testnet') {
      throw new Error('refusing to run live tests outside testnet');
    }
    client = new FactoryClient();
  });

  it('deploys an Equity diamond and returns the new contract address', async () => {
    const signer = getLocalSigner();
    const stamp = Date.now();
    const common: SecurityCommonInfo = {
      name: `TestEquity-${stamp}`,
      symbol: 'TST',
      isin: 'US0378331005', // Apple Inc — valid ISIN with correct checksum, used for testnet only
      decimals: 0,
      maxSupply: 1000n,
      diamondOwnerEvm: signer.evmAddress,
      countries: 'US,MA',
      isCountryControlListWhiteList: true,
      info: 'hak-ats-plugin live test',
    };

    const rights: EquityRights = {
      votingRight: true,
      informationRight: false,
      liquidationRight: false,
      subscriptionRight: false,
      conversionRight: false,
      redemptionRight: false,
      putRight: false,
      dividendRight: 1, // PREFERRED
      currency: '0x555344', // bytes3, USD ASCII
      nominalValue: 1n,
      nominalValueDecimals: 0,
    };

    const result = await client.deployEquity(common, rights);

    expect(result.diamondAddress).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(result.txHash).toMatch(/^0x[0-9a-fA-F]{64}$/);
    expect(result.blockNumber).toBeGreaterThan(0);
    // The diamond MUST be a different address than the deployer.
    expect(result.diamondAddress.toLowerCase()).not.toBe(signer.evmAddress.toLowerCase());

    // Confirm the deployed contract exists by reading bytecode through the JSON-RPC provider.
    const code = await signer.provider.getCode(result.diamondAddress);
    expect(code).not.toBe('0x');
    expect(code.length).toBeGreaterThan(2);

    console.log('Deployed Equity:', result);
  }, 90_000);
});
