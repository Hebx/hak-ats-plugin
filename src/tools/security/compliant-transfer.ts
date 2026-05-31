import { z } from 'zod';
import type { Client } from '@hiero-ledger/sdk';
import type { Context, Tool } from '@hashgraph/hedera-agent-kit';
import { SecurityClient } from '../../contracts/security-client.js';
import { loadEnv, type HederaNetwork } from '../../env.js';
import { defaultPolicies, enforcePreToolPolicies } from '../../policies/index.js';
import { addressOrId, toEvmAddress } from '../../adapters/address.js';

export const ATS_COMPLIANT_TRANSFER_TOOL = 'ats_compliant_transfer';

const compliantTransferParameters = z.object({
  diamondAddress: addressOrId.describe(
    'EVM address (0x…) or Hedera id (0.0.X) of the deployed security diamond.',
  ),
  from: addressOrId.describe(
    'EVM address (0x…) or Hedera id (0.0.X) currently holding the units to move.',
  ),
  to: addressOrId.describe(
    'EVM address (0x…) or Hedera id (0.0.X) of the recipient investor.',
  ),
  amount: z
    .number()
    .int()
    .min(1)
    .describe('Number of security units to transfer.'),
});

export type CompliantTransferParams = z.infer<typeof compliantTransferParameters>;

interface CompliantTransferResult {
  diamondAddress: string;
  from: string;
  to: string;
  amount: string;
  txHash: string;
  blockNumber: number;
  network: HederaNetwork;
}

/**
 * Build the tool that moves security units between holders through the security's
 * compliance modules.
 *
 * Uses the ERC-1644 controller transfer path (operator holds CONTROLLER_ROLE), which
 * is the agent-operated move-between-investors flow for controllable securities.
 * Confirmed on testnet. Before sending, it checks the source holder has sufficient
 * balance and surfaces a clear error if not.
 */
export const atsCompliantTransferTool = (_context: Context): Tool => ({
  method: ATS_COMPLIANT_TRANSFER_TOOL,
  name: 'Compliant Transfer',
  description:
    'Transfers units of a tokenized security between holders on the configured Hedera network, routed through the security compliance modules via the ERC-1644 controller path. Verifies the source holder has sufficient balance, then transfers. Returns the transaction hash and block number.',
  parameters: compliantTransferParameters,
  execute: async (
    client: Client,
    ctx: Context,
    params: CompliantTransferParams,
  ): Promise<CompliantTransferResult> => {
    await enforcePreToolPolicies(defaultPolicies(), ATS_COMPLIANT_TRANSFER_TOOL, params, ctx, client);

    const env = loadEnv();
    const diamondAddress = await toEvmAddress(params.diamondAddress, 'contract', env.HEDERA_MIRROR_NODE_URL);
    const from = await toEvmAddress(params.from, 'account', env.HEDERA_MIRROR_NODE_URL);
    const to = await toEvmAddress(params.to, 'account', env.HEDERA_MIRROR_NODE_URL);

    const security = new SecurityClient(diamondAddress);
    const amount = BigInt(params.amount);

    // Preflight: the ERC-1594 canTransfer view models a msg.sender-initiated transfer,
    // so it cannot validate a controller (from -> to) move. Instead, verify the source
    // holder actually has the units, which surfaces the common failure cheaply before gas.
    const fromBalance = await security.balanceOf(from);
    if (fromBalance < amount) {
      throw new Error(
        `insufficient balance: ${from} holds ${fromBalance.toString()} units, cannot transfer ${params.amount}`,
      );
    }

    const result = await security.controllerTransfer(from, to, amount);

    return {
      diamondAddress: result.diamondAddress,
      from: result.from,
      to: result.to,
      amount: result.amount,
      txHash: result.txHash,
      blockNumber: result.blockNumber,
      network: env.HEDERA_NETWORK,
    };
  },
  outputParser: (rawOutput: string) => {
    try {
      const parsed = JSON.parse(rawOutput) as CompliantTransferResult;
      return {
        raw: parsed,
        humanMessage: `Transferred ${parsed.amount} units ${parsed.from} \u2192 ${parsed.to} on diamond ${parsed.diamondAddress} \u2014 tx ${parsed.txHash}, block ${parsed.blockNumber} (${parsed.network}).`,
      };
    } catch {
      return { raw: rawOutput, humanMessage: rawOutput };
    }
  },
});
