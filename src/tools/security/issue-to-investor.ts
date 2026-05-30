import { z } from 'zod';
import type { Client } from '@hiero-ledger/sdk';
import type { Context, Tool } from '@hashgraph/hedera-agent-kit';
import { SecurityClient } from '../../contracts/security-client.js';
import { loadEnv, type HederaNetwork } from '../../env.js';
import { defaultPolicies, enforcePreToolPolicies } from '../../policies/index.js';

export const ATS_ISSUE_TO_INVESTOR_TOOL = 'ats_issue_to_investor';

const issueToInvestorParameters = z.object({
  diamondAddress: z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/, 'must be a 0x-prefixed EVM address')
    .describe('EVM address of the deployed security diamond (from ats_deploy_security).'),
  investor: z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/, 'must be a 0x-prefixed EVM address')
    .describe('EVM address of the investor receiving the newly issued units.'),
  amount: z
    .number()
    .int()
    .min(1)
    .describe('Number of security units to mint to the investor.'),
});

export type IssueToInvestorParams = z.infer<typeof issueToInvestorParameters>;

interface IssueToInvestorResult {
  diamondAddress: string;
  investor: string;
  amount: string;
  txHash: string;
  blockNumber: number;
  network: HederaNetwork;
}

/**
 * Build the tool that issues (mints) security units to an investor.
 *
 * Ensures the operator holds ISSUER_ROLE on the diamond, then calls ERC-1594 issue().
 * Confirmed on testnet: under the default deploy config no separate KYC/registration
 * step is required before issuance.
 */
export const atsIssueToInvestorTool = (_context: Context): Tool => ({
  method: ATS_ISSUE_TO_INVESTOR_TOOL,
  name: 'Issue Security To Investor',
  description:
    'Issues (mints) units of an existing tokenized security to an investor on the configured Hedera network. Grants the issuer role to the operator if needed, then issues via ERC-1594. Returns the transaction hash and block number.',
  parameters: issueToInvestorParameters,
  execute: async (
    client: Client,
    ctx: Context,
    params: IssueToInvestorParams,
  ): Promise<IssueToInvestorResult> => {
    await enforcePreToolPolicies(defaultPolicies(), ATS_ISSUE_TO_INVESTOR_TOOL, params, ctx, client);

    const security = new SecurityClient(params.diamondAddress);
    const result = await security.issue(params.investor, BigInt(params.amount));

    return {
      diamondAddress: result.diamondAddress,
      investor: result.investor,
      amount: result.amount,
      txHash: result.txHash,
      blockNumber: result.blockNumber,
      network: loadEnv().HEDERA_NETWORK,
    };
  },
  outputParser: (rawOutput: string) => {
    try {
      const parsed = JSON.parse(rawOutput) as IssueToInvestorResult;
      return {
        raw: parsed,
        humanMessage: `Issued ${parsed.amount} units to ${parsed.investor} on diamond ${parsed.diamondAddress} \u2014 tx ${parsed.txHash}, block ${parsed.blockNumber} (${parsed.network}).`,
      };
    } catch {
      return { raw: rawOutput, humanMessage: rawOutput };
    }
  },
});
