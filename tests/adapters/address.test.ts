/**
 * UNIT TEST — the shared address-or-id schema + normalizer. No network, no HBAR.
 *
 * `toEvmAddress` resolution for Hedera ids is exercised with a stubbed global fetch so
 * the mirror-node round-trip is deterministic and free. EVM passthrough needs no network.
 */
import { it, expect, describe, vi, beforeEach, afterEach } from 'vitest';
import { addressOrId, isEvmAddress, isHederaId, toEvmAddress } from '../../src/adapters/address.js';
import { resetMirrorCache } from '../../src/adapters/mirror-node.js';

const MIRROR = 'https://testnet.mirrornode.hedera.com/api/v1';
const EVM = '0x997f2c7a178b80d6496239a4725b20555c0f5b94';

describe('addressOrId schema', () => {
  it('accepts a 0x EVM address', () => {
    expect(addressOrId.safeParse(EVM).success).toBe(true);
  });
  it('accepts a Hedera id 0.0.X', () => {
    expect(addressOrId.safeParse('0.0.9050506').success).toBe(true);
  });
  it('rejects junk and partial forms', () => {
    for (const bad of ['nope', '0x123', '0.0', '0.0.x', '', '0xZZZ2c7a178b80d6496239a4725b20555c0f5b94']) {
      expect(addressOrId.safeParse(bad).success).toBe(false);
    }
  });
});

describe('isEvmAddress / isHederaId', () => {
  it('classifies both forms', () => {
    expect(isEvmAddress(EVM)).toBe(true);
    expect(isEvmAddress('0.0.5')).toBe(false);
    expect(isHederaId('0.0.5')).toBe(true);
    expect(isHederaId(EVM)).toBe(false);
  });
});

describe('toEvmAddress', () => {
  beforeEach(() => resetMirrorCache());
  afterEach(() => vi.restoreAllMocks());

  it('returns a 0x EVM address unchanged without any network call', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const out = await toEvmAddress(EVM, 'account', MIRROR);
    expect(out).toBe(EVM);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('resolves a Hedera account id via the /accounts endpoint', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ account: '0.0.9050506', evm_address: EVM }), { status: 200 }),
    );
    const out = await toEvmAddress('0.0.9050506', 'account', MIRROR);
    expect(out).toBe(EVM);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0][0])).toContain('/accounts/0.0.9050506');
  });

  it('resolves a Hedera contract id via the /contracts endpoint', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ contract_id: '0.0.7512002', evm_address: EVM }), { status: 200 }),
    );
    const out = await toEvmAddress('0.0.7512002', 'contract', MIRROR);
    expect(out).toBe(EVM);
    expect(String(fetchSpy.mock.calls[0][0])).toContain('/contracts/0.0.7512002');
  });

  it('caches a resolved id (one fetch for repeated lookups)', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ account: '0.0.42', evm_address: EVM }), { status: 200 }),
    );
    await toEvmAddress('0.0.42', 'account', MIRROR);
    await toEvmAddress('0.0.42', 'account', MIRROR);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('throws on an unrecognized input shape', async () => {
    await expect(toEvmAddress('not-an-address', 'account', MIRROR)).rejects.toThrow();
  });

  it('throws when the mirror node has no account for the id', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('not found', { status: 404 }));
    await expect(toEvmAddress('0.0.999999999', 'account', MIRROR)).rejects.toThrow();
  });
});
