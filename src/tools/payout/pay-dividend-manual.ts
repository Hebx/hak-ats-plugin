import { z } from 'zod';
import type { Client as AgentClient } from '@hiero-ledger/sdk';
import { TransferTransaction, AccountId, Hbar, HbarUnit } from '@hiero-ledger/sdk';
import type { Context, Tool } from '@hashgraph/hedera-agent-kit';
import { readCapTable, resolveEvmToAccountId } from '../../adapters/mirror-node.js';
import { getHederaClient } from '../../adapters/hedera-client.js';
import { getLocalSigner } from '../../adapters/local-key-signer.js';
import { loadEnv } from '../../env.js';
import { defaultPolicies, enforcePreToolPolicies } from '../../policies/index.js';

export const ATS_PAY_DIVIDEND_MANUAL_TOOL = 'ats_pay_dividend_manual';

const payDividendParameters = z.object({
  diamondAddress: z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/, 'must be a 0x-prefixed EVM address')
    .describe('EVM address of the deployed security whose holders receive the dividend.'),
  totalAmountHbar: z
    .number()
    .refine((v) => v > 0, { message: 'totalAmountHbar must be greater than 0' })
    .describe('Total HBAR to distribute across all holders, pro-rata by balance.'),
  excludeTreasury: z
    .boolean()
    .default(true)
    .describe(
      'When true (default), the paying operator/treasury account is excluded from receiving its own dividend.',
    ),
});

export type PayDividendParams = z.infer<typeof payDividendParameters>;

interface DividendPayment {
  account: string;
  address: string;
  balance: string;
  tinybar: string;
}

interface PayDividendResult {
  diamondAddress: string;
  totalSupply: string;
  eligibleSupply: string;
  totalDistributedTinybar: string;
  totalDistributedHbar: string;
  payments: DividendPayment[];
  transactionId: string;
  status: string;
  network: 'testnet';
}

/**
 * Manual dividend fan-out.
 *
 * The ATS DividendFacet (`setDividend`) is NOT wired into the public testnet factory's
 * equity config — calling it reverts FunctionNotFound(0xe7686a05). So instead of
 * recording an on-chain corporate action, this tool reads the cap table from the mirror
 * node and distributes HBAR pro-rata in a single TransferTransaction.
 *
 * Shares are computed in integer tinybar with floor division; any rounding dust stays
 * with the operator (the debit equals the exact sum credited, so the transfer always
 * balances). Treasury is excluded from its own dividend by default.
 */
export const atsPayDividendManualTool = (_context: Context): Tool => ({
  method: ATS_PAY_DIVIDEND_MANUAL_TOOL,
  name: 'Pay Dividend (manual fan-out)',
  description:
    'Distributes HBAR pro-rata to the holders of a tokenized security on Hedera testnet, based on the mirror-node cap table. Used because on-chain dividend recording is unavailable on the testnet factory config. Returns the per-holder payment plan and the transaction id.',
  parameters: payDividendParameters,
  execute: async (
    agentClient: AgentClient,
    ctx: Context,
    params: PayDividendParams,
  ): Promise<PayDividendResult> => {
    await enforcePreToolPolicies(defaultPolicies(), ATS_PAY_DIVIDEND_MANUAL_TOOL, params, ctx, agentClient);
    const env = loadEnv();

    const operatorEvm = getLocalSigner().evmAddress.toLowerCase();
    const capTable = await readCapTable(params.diamondAddress, env.HEDERA_MIRROR_NODE_URL);

    // Default to excluding treasury even if the caller bypassed zod defaults.
    const excludeTreasury = params.excludeTreasury ?? true;
    const eligible = capTable.holders.filter(
      (h) => !(excludeTreasury && h.address.toLowerCase() === operatorEvm),
    );
    if (eligible.length === 0) {
      throw new Error('no eligible holders to pay (cap table empty or only treasury)');
    }

    const eligibleSupply = eligible.reduce((sum, h) => sum + BigInt(h.balance), 0n);
    if (eligibleSupply === 0n) {
      throw new Error('eligible supply is zero; nothing to distribute');
    }

    const totalTinybar = BigInt(Hbar.from(params.totalAmountHbar, HbarUnit.Hbar).toTinybars().toString());
    if (totalTinybar <= 0n) {
      throw new Error('totalAmountHbar resolves to zero tinybar');
    }

    const tx = new TransferTransaction();
    const payments: DividendPayment[] = [];
    let distributed = 0n;

    for (const holder of eligible) {
      const shareTinybar = (totalTinybar * BigInt(holder.balance)) / eligibleSupply;
      if (shareTinybar === 0n) continue;
      const accountId = await resolveEvmToAccountId(holder.address, env.HEDERA_MIRROR_NODE_URL);
      tx.addHbarTransfer(AccountId.fromString(accountId), Hbar.fromTinybars(shareTinybar.toString()));
      distributed += shareTinybar;
      payments.push({
        account: accountId,
        address: holder.address,
        balance: holder.balance,
        tinybar: shareTinybar.toString(),
      });
    }

    if (distributed === 0n) {
      throw new Error('every holder share floored to zero; increase totalAmountHbar');
    }

    // Debit the operator the exact amount credited so the transfer balances.
    const operatorAccount = AccountId.fromString(env.HEDERA_OPERATOR_ID);
    tx.addHbarTransfer(operatorAccount, Hbar.fromTinybars((-distributed).toString()));

    const client = getHederaClient();
    const resp = await tx.execute(client);
    const receipt = await resp.getReceipt(client);

    return {
      diamondAddress: capTable.diamondAddress,
      totalSupply: capTable.totalSupply,
      eligibleSupply: eligibleSupply.toString(),
      totalDistributedTinybar: distributed.toString(),
      totalDistributedHbar: Hbar.fromTinybars(distributed.toString()).toString(),
      payments,
      transactionId: resp.transactionId.toString(),
      status: receipt.status.toString(),
      network: 'testnet',
    };
  },
  outputParser: (rawOutput: string) => {
    try {
      const parsed = JSON.parse(rawOutput) as PayDividendResult;
      const lines = parsed.payments
        .map((p) => `  ${p.account} (${p.balance} units): ${Hbar.fromTinybars(p.tinybar).toString()}`)
        .join('\n');
      return {
        raw: parsed,
        humanMessage: `Paid ${parsed.totalDistributedHbar} across ${parsed.payments.length} holder(s) of ${parsed.diamondAddress} [${parsed.status}, tx ${parsed.transactionId}]:\n${lines}`,
      };
    } catch {
      return { raw: rawOutput, humanMessage: rawOutput };
    }
  },
});
