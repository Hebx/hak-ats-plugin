import { z } from 'zod';
import type { Client } from '@hiero-ledger/sdk';
import type { Context, Tool } from '@hashgraph/hedera-agent-kit';
import { readCapTable, resolveEvmToAccountId } from '../../adapters/mirror-node.js';
import { loadEnv, type HederaNetwork } from '../../env.js';
import { addressOrId, toEvmAddress } from '../../adapters/address.js';

export const ATS_GET_CAP_TABLE_TOOL = 'ats_get_cap_table';

const getCapTableParameters = z.object({
  diamondAddress: addressOrId().describe(
    'EVM address (0x…) or Hedera id (0.0.X) of the deployed security diamond to read holders for.',
  ),
});

export type GetCapTableParams = z.infer<typeof getCapTableParameters>;

interface CapTableHolder {
  address: string;
  /** Hedera account id (0.0.X) for the holder, when one exists. null for contract-only addresses. */
  accountId: string | null;
  balance: string;
}

interface GetCapTableResult {
  diamondAddress: string;
  totalSupply: string;
  holderCount: number;
  holders: CapTableHolder[];
  network: HederaNetwork;
}

/**
 * Build the read-only tool that returns a security's cap table: every holder with a
 * positive balance plus the derived total supply. Reconstructed from ERC-20 Transfer
 * events via the mirror node — no off-chain indexer, no transaction.
 */
export const atsGetCapTableTool = (_context: Context): Tool => ({
  method: ATS_GET_CAP_TABLE_TOOL,
  name: 'Get Cap Table',
  description:
    'Reads the cap table (holders and balances) of a tokenized security on the configured Hedera network, reconstructed from on-chain Transfer events via the mirror node. Read-only — signs no transaction.',
  parameters: getCapTableParameters,
  execute: async (
    _client: Client,
    _ctx: Context,
    params: GetCapTableParams,
  ): Promise<GetCapTableResult> => {
    const env = loadEnv();

    const diamondAddress = await toEvmAddress(params.diamondAddress, 'contract', env.HEDERA_MIRROR_NODE_URL);
    const capTable = await readCapTable(diamondAddress, env.HEDERA_MIRROR_NODE_URL);

    // Enrich each holder with its Hedera account id alongside the EVM address. A
    // contract-only address (no associated account) resolves to null rather than failing.
    const holders: CapTableHolder[] = await Promise.all(
      capTable.holders.map(async (h) => {
        let accountId: string | null = null;
        try {
          accountId = await resolveEvmToAccountId(h.address, env.HEDERA_MIRROR_NODE_URL);
        } catch {
          accountId = null;
        }
        return { address: h.address, accountId, balance: h.balance };
      }),
    );

    return {
      diamondAddress: capTable.diamondAddress,
      totalSupply: capTable.totalSupply,
      holderCount: holders.length,
      holders,
      network: env.HEDERA_NETWORK,
    };
  },
  outputParser: (rawOutput: string) => {
    try {
      const parsed = JSON.parse(rawOutput) as GetCapTableResult;
      const lines = parsed.holders
        .map((h) => `  ${h.address}${h.accountId ? ` (${h.accountId})` : ''}: ${h.balance}`)
        .join('\n');
      return {
        raw: parsed,
        humanMessage: `Cap table for ${parsed.diamondAddress} \u2014 ${parsed.holderCount} holder(s), total supply ${parsed.totalSupply} (${parsed.network}):\n${lines}`,
      };
    } catch {
      return { raw: rawOutput, humanMessage: rawOutput };
    }
  },
});
