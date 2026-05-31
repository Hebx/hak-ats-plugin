import { z } from 'zod';
import type { Client } from '@hiero-ledger/sdk';
import type { Context, Tool } from '@hashgraph/hedera-agent-kit';
import { SecurityClient } from '../../contracts/security-client.js';
import { loadEnv, type HederaNetwork } from '../../env.js';
import { addressOrId, toEvmAddress } from '../../adapters/address.js';

export const ATS_GET_SECURITY_INFO_TOOL = 'ats_get_security_info';

const getSecurityInfoParameters = z.object({
  diamondAddress: addressOrId().describe(
    'EVM address (0x…) or Hedera id (0.0.X) of the deployed security diamond to query.',
  ),
});

export type GetSecurityInfoParams = z.infer<typeof getSecurityInfoParameters>;

interface GetSecurityInfoResult {
  diamondAddress: string;
  name: string;
  symbol: string;
  isin: string;
  decimals: number;
  totalSupply: string;
  paused: boolean;
  network: HederaNetwork;
}

/**
 * Build the read-only tool that returns a security's name, symbol, ISIN, decimals,
 * total supply, and paused state. No transaction is signed.
 */
export const atsGetSecurityInfoTool = (_context: Context): Tool => ({
  method: ATS_GET_SECURITY_INFO_TOOL,
  name: 'Get Security Info',
  description:
    'Reads on-chain metadata for a tokenized security on the configured Hedera network: name, symbol, ISIN, decimals, total supply, and whether transfers are paused. Read-only — signs no transaction.',
  parameters: getSecurityInfoParameters,
  execute: async (
    _client: Client,
    _ctx: Context,
    params: GetSecurityInfoParams,
  ): Promise<GetSecurityInfoResult> => {
    const env = loadEnv();

    const diamondAddress = await toEvmAddress(params.diamondAddress, 'contract', env.HEDERA_MIRROR_NODE_URL);
    const security = new SecurityClient(diamondAddress);
    const info = await security.getInfo();

    return {
      diamondAddress,
      name: info.name,
      symbol: info.symbol,
      isin: info.isin,
      decimals: info.decimals,
      totalSupply: info.totalSupply,
      paused: info.paused,
      network: env.HEDERA_NETWORK,
    };
  },
  outputParser: (rawOutput: string) => {
    try {
      const parsed = JSON.parse(rawOutput) as GetSecurityInfoResult;
      return {
        raw: parsed,
        humanMessage: `${parsed.name} (${parsed.symbol}, ISIN ${parsed.isin}) \u2014 supply ${parsed.totalSupply}, decimals ${parsed.decimals}, ${parsed.paused ? 'PAUSED' : 'active'} (${parsed.network}).`,
      };
    } catch {
      return { raw: rawOutput, humanMessage: rawOutput };
    }
  },
});
