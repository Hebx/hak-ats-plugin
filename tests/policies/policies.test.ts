/**
 * Policy unit tests — no network. Exercise the gating logic by manipulating env and
 * asserting the policy's public preToolExecutionHook throws (block) or passes (allow).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Client } from '@hiero-ledger/sdk';
import { MaxSupplyCapPolicy } from '../../src/policies/max-supply-cap.js';
import { JurisdictionAllowlistPolicy } from '../../src/policies/jurisdiction-allowlist.js';
import { loadEnv, resetEnvCache } from '../../src/env.js';

const fakeClient = {} as Client;
const ctx = {};

function preParams(rawParams: unknown) {
  return { context: ctx, rawParams, client: fakeClient };
}

// A complete, valid env so loadEnv() succeeds; individual tests override single keys.
const BASE_ENV: Record<string, string> = {
  HEDERA_NETWORK: 'testnet',
  HEDERA_OPERATOR_ID: '0.0.1234',
  HEDERA_OPERATOR_KEY: 'a'.repeat(64),
  HEDERA_OPERATOR_KEY_TYPE: 'ECDSA',
  HEDERA_OPERATOR_PUBLIC_KEY: '02abcdef',
  HEDERA_OPERATOR_EVM_ADDRESS: '0x0000000000000000000000000000000000000001',
  ATS_FACTORY_ADDRESS: '0.0.7512002',
  ATS_RESOLVER_ADDRESS: '0.0.7511642',
  HEDERA_MIRROR_NODE_URL: 'https://testnet.mirrornode.hedera.com/api/v1',
  HEDERA_RPC_URL: 'https://testnet.hashio.io/api',
  MAX_SUPPLY_CAP: '1000000',
  JURISDICTION_ALLOWLIST: 'US,GB,DE,FR,MA',
};

let saved: NodeJS.ProcessEnv;

beforeEach(() => {
  saved = { ...process.env };
  for (const [k, v] of Object.entries(BASE_ENV)) process.env[k] = v;
  resetEnvCache();
});

afterEach(() => {
  process.env = saved;
  resetEnvCache();
});

describe('network selection (opt-in, no deny)', () => {
  it('defaults to testnet when HEDERA_NETWORK is unset', async () => {
    delete process.env.HEDERA_NETWORK;
    resetEnvCache();
    expect(loadEnv().HEDERA_NETWORK).toBe('testnet');
  });

  it('accepts mainnet when explicitly set (opt-in at your own risk)', async () => {
    process.env.HEDERA_NETWORK = 'mainnet';
    resetEnvCache();
    expect(loadEnv().HEDERA_NETWORK).toBe('mainnet');
  });

  it('rejects an unknown network', async () => {
    process.env.HEDERA_NETWORK = 'devnet';
    resetEnvCache();
    expect(() => loadEnv()).toThrow();
  });
});

describe('MaxSupplyCapPolicy', () => {
  it('allows a deploy under the cap', async () => {
    const p = new MaxSupplyCapPolicy();
    await expect(
      p.preToolExecutionHook(preParams({ maxSupply: 500_000 }), 'ats_deploy_security'),
    ).resolves.toBeUndefined();
  });

  it('allows an uncapped deploy (maxSupply = 0)', async () => {
    const p = new MaxSupplyCapPolicy();
    await expect(
      p.preToolExecutionHook(preParams({ maxSupply: 0 }), 'ats_deploy_security'),
    ).resolves.toBeUndefined();
  });

  it('blocks a deploy above the cap', async () => {
    const p = new MaxSupplyCapPolicy();
    await expect(
      p.preToolExecutionHook(preParams({ maxSupply: 2_000_000 }), 'ats_deploy_security'),
    ).rejects.toThrow(/max_supply_cap/);
  });

  it('respects a lowered MAX_SUPPLY_CAP', async () => {
    process.env.MAX_SUPPLY_CAP = '100';
    resetEnvCache();
    const p = new MaxSupplyCapPolicy();
    await expect(
      p.preToolExecutionHook(preParams({ maxSupply: 101 }), 'ats_deploy_security'),
    ).rejects.toThrow(/max_supply_cap/);
  });
});

describe('JurisdictionAllowlistPolicy', () => {
  it('allows countries within the allowlist', async () => {
    const p = new JurisdictionAllowlistPolicy();
    await expect(
      p.preToolExecutionHook(preParams({ countries: 'US,MA' }), 'ats_deploy_security'),
    ).resolves.toBeUndefined();
  });

  it('allows an empty country list (no restriction)', async () => {
    const p = new JurisdictionAllowlistPolicy();
    await expect(
      p.preToolExecutionHook(preParams({ countries: '' }), 'ats_deploy_security'),
    ).resolves.toBeUndefined();
  });

  it('blocks a country outside the allowlist', async () => {
    const p = new JurisdictionAllowlistPolicy();
    await expect(
      p.preToolExecutionHook(preParams({ countries: 'US,KP' }), 'ats_deploy_security'),
    ).rejects.toThrow(/jurisdiction_allowlist/);
  });

  it('is case- and whitespace-insensitive', async () => {
    const p = new JurisdictionAllowlistPolicy();
    await expect(
      p.preToolExecutionHook(preParams({ countries: ' us , ma ' }), 'ats_deploy_security'),
    ).resolves.toBeUndefined();
  });
});
