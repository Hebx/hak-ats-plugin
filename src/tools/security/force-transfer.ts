import { z } from 'zod';
import type { Client } from '@hiero-ledger/sdk';
import type { Context, Tool } from '@hashgraph/hedera-agent-kit';
import { SecurityClient } from '../../contracts/security-client.js';
import { loadEnv, type HederaNetwork } from '../../env.js';
import { defaultPolicies, enforcePreToolPolicies } from '../../policies/index.js';

export const ATS_FORCE_TRANSFER_TOOL = 'ats_force_transfer';

const forceTransferParameters = z.object({
  diamondAddress: z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/, 'must be a 0x-prefixed EVM address')
    .describe('EVM address of the deployed security diamond.'),
  from: z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/, 'must be a 0x-prefixed EVM address')
    .describe('EVM address the units are clawed back from (no consent required).'),
  to: z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/, 'must be a 0x-prefixed EVM address')
    .describe('EVM address that receives the clawed-back units (e.g. treasury or a court-ordered recipient).'),
  amount: z.number().int().min(1).describe('Number of security units to force-transfer.'),
  reason: z
    .string()
    .max(256)
    .default('')
    .describe('Free-text justification recorded for the audit trail (not written on-chain).'),
});

export type ForceTransferParams = z.infer<typeof forceTransferParameters>;

interface ForceTransferResult {
  diamondAddress: string;
  from: string;
  to: string;
  amount: string;
  reason: string;
  txHash: string;
  blockNumber: number;
  network: HederaNetwork;
}

/**
 * Build the regulatory force-transfer (clawback) tool.
 *
 * Uses the same ERC-1644 controllerTransfer primitive as a compliant transfer, but is a
 * distinct, clearly-named tool: it is the controller's authority to move units WITHOUT
 * the holder's consent (lost-key recovery, court order, sanctions enforcement). It
 * deliberately does not balance-preflight beyond the contract's own checks, since the
 * target holder may be non-cooperative; the diamond reverts if `from` lacks the units.
 */
export const atsForceTransferTool = (_context: Context): Tool => ({
  method: ATS_FORCE_TRANSFER_TOOL,
  name: 'Force Transfer (regulatory clawback)',
  description:
    'Force-transfers (claws back) units of a tokenized security from one holder to another WITHOUT the source holder consent, via the ERC-1644 controller authority, on the configured Hedera network. For lost-key recovery, court orders, or sanctions enforcement. Returns the transaction hash and block number.',
  parameters: forceTransferParameters,
  execute: async (client: Client, ctx: Context, params: ForceTransferParams): Promise<ForceTransferResult> => {
    await enforcePreToolPolicies(defaultPolicies(), ATS_FORCE_TRANSFER_TOOL, params, ctx, client);

    const security = new SecurityClient(params.diamondAddress);
    const result = await security.controllerTransfer(params.from, params.to, BigInt(params.amount));

    return {
      diamondAddress: result.diamondAddress,
      from: result.from,
      to: result.to,
      amount: result.amount,
      reason: params.reason,
      txHash: result.txHash,
      blockNumber: result.blockNumber,
      network: loadEnv().HEDERA_NETWORK,
    };
  },
  outputParser: (rawOutput: string) => {
    try {
      const parsed = JSON.parse(rawOutput) as ForceTransferResult;
      const why = parsed.reason ? ` [${parsed.reason}]` : '';
      return {
        raw: parsed,
        humanMessage: `Force-transferred ${parsed.amount} units ${parsed.from} \u2192 ${parsed.to} on ${parsed.diamondAddress}${why} \u2014 tx ${parsed.txHash}, block ${parsed.blockNumber} (${parsed.network}).`,
      };
    } catch {
      return { raw: rawOutput, humanMessage: rawOutput };
    }
  },
});
