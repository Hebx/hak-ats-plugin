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

/** Canonical ERC-20 Transfer(address,address,uint256) event topic. */
const TRANSFER_TOPIC =
  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

interface MirrorLog {
  address: string;
  data: string;
  topics: string[];
}
interface MirrorLogsResponse {
  logs: MirrorLog[];
  links?: { next?: string | null };
}

export interface CapTableEntry {
  /** Holder EVM address (0x, lowercase). */
  address: string;
  /** Balance as a decimal string (token base units). */
  balance: string;
}

export interface CapTable {
  diamondAddress: string;
  totalSupply: string;
  holders: CapTableEntry[];
}

/** Decode a 32-byte topic word into a 0x-prefixed 20-byte address (lowercase). */
function topicToAddress(topic: string): string {
  return `0x${topic.slice(-40)}`.toLowerCase();
}

/**
 * Reconstruct a security's cap table by replaying ERC-20 Transfer events from the
 * mirror node. Mints (from = 0x0) credit a holder; burns (to = 0x0) debit. The result
 * is the set of holders with positive balances plus the derived total supply.
 *
 * This avoids any off-chain indexer: the mirror node already stores contract logs.
 * Confirmed on testnet to match on-chain balanceOf for issue + controller transfers.
 */
export async function readCapTable(
  diamondAddress: string,
  mirrorBaseUrl: string,
): Promise<CapTable> {
  if (!/^0x[0-9a-fA-F]{40}$/.test(diamondAddress)) {
    throw new Error(`invalid diamond address: ${diamondAddress}`);
  }
  const base = mirrorBaseUrl.replace(/\/+$/, '');
  const root = base.endsWith('/api/v1') ? base : `${base}/api/v1`;

  const balances = new Map<string, bigint>();
  let totalSupply = 0n;

  let next: string | null = `${root}/contracts/${diamondAddress}/results/logs?limit=100&order=asc`;
  // Mirror node `links.next` is an absolute path; resolve against the host once.
  const origin = new URL(root).origin;

  while (next) {
    const res = await fetch(next.startsWith('http') ? next : `${origin}${next}`);
    if (!res.ok) {
      throw new Error(`mirror node returned ${res.status} for ${next}`);
    }
    const body = (await res.json()) as MirrorLogsResponse;
    for (const log of body.logs ?? []) {
      if (log.topics?.[0]?.toLowerCase() !== TRANSFER_TOPIC) continue;
      // Transfer is indexed(from, to); value is in data.
      if (log.topics.length < 3) continue;
      const from = topicToAddress(log.topics[1]);
      const to = topicToAddress(log.topics[2]);
      const value = BigInt(log.data && log.data !== '0x' ? log.data : '0x0');
      if (value === 0n) continue;

      if (from === ZERO_ADDRESS) {
        totalSupply += value;
      } else {
        balances.set(from, (balances.get(from) ?? 0n) - value);
      }
      if (to === ZERO_ADDRESS) {
        totalSupply -= value;
      } else {
        balances.set(to, (balances.get(to) ?? 0n) + value);
      }
    }
    next = body.links?.next ?? null;
  }

  const holders: CapTableEntry[] = [...balances.entries()]
    .filter(([, bal]) => bal > 0n)
    .sort((a, b) => (b[1] > a[1] ? 1 : b[1] < a[1] ? -1 : 0))
    .map(([address, bal]) => ({ address, balance: bal.toString() }));

  return {
    diamondAddress: diamondAddress.toLowerCase(),
    totalSupply: totalSupply.toString(),
    holders,
  };
}
