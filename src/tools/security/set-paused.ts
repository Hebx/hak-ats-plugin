import { z } from 'zod';
import type { Client } from '@hiero-ledger/sdk';
import type { Context, Tool } from '@hashgraph/hedera-agent-kit';
import { SecurityClient } from '../../contracts/security-client.js';
import { loadEnv, type HederaNetwork } from '../../env.js';
import { defaultPolicies, enforcePreToolPolicies } from '../../policies/index.js';

export const ATS_SET_PAUSED_TOOL = 'ats_set_paused';

const setPausedParameters = z.object({
  diamondAddress: z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/, 'must be a 0x-prefixed EVM address')
    .describe('EVM address of the deployed security diamond to pause or unpause.'),
  paused: z
    .boolean()
    .describe('true to pause all transfers (emergency stop), false to resume.'),
});

export type SetPausedParams = z.infer<typeof setPausedParameters>;

interface SetPausedResult {
  diamondAddress: string;
  paused: boolean;
  txHash: string;
  blockNumber: number;
  network: HederaNetwork;
}

/**
 * Build the tool that pauses or unpauses all transfers on a security (ERC-1400 pause
 * facet). The operator is granted PAUSER_ROLE if needed. This is the regulatory
 * "freeze" control a treasury operator uses to halt activity on a security.
 */
export const atsSetPausedTool = (_context: Context): Tool => ({
  method: ATS_SET_PAUSED_TOOL,
  name: 'Pause / Unpause Security',
  description:
    'Pauses or unpauses all transfers on a tokenized security (ERC-1400 pause facet) on the configured Hedera network. Grants the pauser role to the operator if needed. Returns the transaction hash and block number.',
  parameters: setPausedParameters,
  execute: async (client: Client, ctx: Context, params: SetPausedParams): Promise<SetPausedResult> => {
    await enforcePreToolPolicies(defaultPolicies(), ATS_SET_PAUSED_TOOL, params, ctx, client);

    const security = new SecurityClient(params.diamondAddress);
    const result = await security.setPaused(params.paused);

    return {
      diamondAddress: result.diamondAddress,
      paused: result.paused,
      txHash: result.txHash,
      blockNumber: result.blockNumber,
      network: loadEnv().HEDERA_NETWORK,
    };
  },
  outputParser: (rawOutput: string) => {
    try {
      const parsed = JSON.parse(rawOutput) as SetPausedResult;
      return {
        raw: parsed,
        humanMessage: `${parsed.paused ? 'Paused' : 'Unpaused'} ${parsed.diamondAddress} \u2014 tx ${parsed.txHash}, block ${parsed.blockNumber} (${parsed.network}).`,
      };
    } catch {
      return { raw: rawOutput, humanMessage: rawOutput };
    }
  },
});
