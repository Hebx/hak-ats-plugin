/**
 * Hedera Mirror Node read client. Used to:
 *   - Resolve a Hedera contract id (0.0.X) to its canonical aliased EVM address.
 *   - Read account balances and token holders for cap-table queries.
 *
 * Lightweight: just `fetch` against the public testnet mirror node.
 */

interface MirrorContractResponse {
  contract_id: string;
  evm_address: string;
}

const evmAddressCache = new Map<string, string>();

/**
 * Resolve a Hedera contract id like "0.0.7512002" to its 0x-prefixed EVM address.
 *
 * Hedera contracts created via HSCS have an aliased EVM address that does NOT match
 * the long-zero form derived from the entity number. The factory rejects mismatched
 * resolver addresses, so we MUST use the mirror-node value.
 */
export async function resolveContractEvmAddress(
  hederaId: string,
  mirrorBaseUrl: string,
): Promise<string> {
  if (!/^0\.0\.\d+$/.test(hederaId)) {
    throw new Error(`invalid Hedera contract id: ${hederaId}`);
  }
  const cached = evmAddressCache.get(hederaId);
  if (cached) return cached;

  const base = mirrorBaseUrl.replace(/\/+$/, '');
  // Some env values include /api/v1 already; some don't.
  const url = base.endsWith('/api/v1')
    ? `${base}/contracts/${hederaId}`
    : `${base}/api/v1/contracts/${hederaId}`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`mirror node returned ${res.status} for ${url}`);
  }
  const body = (await res.json()) as MirrorContractResponse;
  if (!body.evm_address || !body.evm_address.startsWith('0x')) {
    throw new Error(`mirror node response missing evm_address for ${hederaId}`);
  }
  evmAddressCache.set(hederaId, body.evm_address);
  return body.evm_address;
}

export function resetMirrorCache(): void {
  evmAddressCache.clear();
}
