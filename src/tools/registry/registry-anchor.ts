import { z } from 'zod';
import type { Client } from '@hiero-ledger/sdk';
import type { Context, Tool } from '@hashgraph/hedera-agent-kit';
import { getLocalSigner } from '../../adapters/local-key-signer.js';
import { loadEnv } from '../../env.js';
import {
  anchorRecord,
  type SecurityRegisteredRecord,
  type CorporateActionRecord,
} from '../../adapters/hcs-registry.js';

export const ATS_REGISTRY_ANCHOR_TOOL = 'ats_registry_anchor';

const registryAnchorParameters = z.object({
  recordType: z
    .enum(['security', 'corporate_action'])
    .describe('"security" registers a deployed security; "corporate_action" logs an issue/transfer/dividend/pause event.'),
  // security fields
  securityType: z
    .enum(['EQUITY', 'BOND'])
    .optional()
    .describe('For recordType=security: EQUITY or BOND.'),
  name: z.string().optional().describe('For recordType=security: the security display name.'),
  symbol: z.string().optional().describe('For recordType=security: the ticker.'),
  isin: z.string().optional().describe('For recordType=security: the ISIN.'),
  diamondAddress: z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/, 'must be a 0x-prefixed EVM address')
    .describe('The security diamond EVM address this record refers to.'),
  // corporate action fields
  action: z
    .enum(['issue', 'transfer', 'dividend', 'pause', 'unpause', 'force_transfer'])
    .optional()
    .describe('For recordType=corporate_action: the action type.'),
  txHash: z.string().optional().describe('For recordType=corporate_action: the on-chain transaction hash.'),
  detail: z.string().max(512).optional().describe('For recordType=corporate_action: a human description.'),
});

export type RegistryAnchorParams = z.infer<typeof registryAnchorParameters>;

interface RegistryAnchorResult {
  topicId: string;
  sequenceNumber?: number;
  transactionId?: string;
  recordType: string;
}

/**
 * Build the tool that anchors a registry record to the HCS securities registry topic.
 *
 * Two record kinds: register a deployed security (the name/symbol/ISIN -> address source
 * for ats_registry_resolve), or log a corporate action with its tx hash. The topic is
 * created on first anchor and its id is returned so the operator can persist
 * HCS_REGISTRY_TOPIC_ID for reuse.
 */
export const atsRegistryAnchorTool = (_context: Context): Tool => ({
  method: ATS_REGISTRY_ANCHOR_TOOL,
  name: 'Anchor Registry Record',
  description:
    'Writes a tamper-evident record to the HCS securities registry on the configured Hedera network: either registering a deployed security (name, symbol, ISIN, diamond address) for later name->address resolution, or logging a corporate action (issue/transfer/dividend/pause) with its transaction hash. recordType is only "security" or "corporate_action". This tool does NOT anchor documents — use ats_anchor_document for term sheets/prospectuses/resolutions. Returns the topic id and sequence number.',
  parameters: registryAnchorParameters,
  execute: async (_client: Client, _ctx: Context, params: RegistryAnchorParams): Promise<RegistryAnchorResult> => {
    const env = loadEnv();
    const now = new Date().toISOString();

    if (params.recordType === 'security') {
      if (!params.securityType || !params.name || !params.symbol || !params.isin) {
        throw new Error('recordType=security requires securityType, name, symbol, and isin');
      }
      const record: SecurityRegisteredRecord = {
        kind: 'security.registered.v1',
        network: env.HEDERA_NETWORK,
        createdAt: now,
        securityType: params.securityType,
        name: params.name,
        symbol: params.symbol,
        isin: params.isin,
        diamondAddress: params.diamondAddress.toLowerCase(),
        issuer: getLocalSigner().evmAddress.toLowerCase(),
      };
      const receipt = await anchorRecord(record);
      return { ...receipt, recordType: params.recordType };
    }

    if (!params.action) {
      throw new Error('recordType=corporate_action requires action');
    }
    const record: CorporateActionRecord = {
      kind: 'corporate.action.v1',
      network: env.HEDERA_NETWORK,
      createdAt: now,
      action: params.action,
      diamondAddress: params.diamondAddress.toLowerCase(),
      txHash: params.txHash,
      detail: params.detail ?? '',
    };
    const receipt = await anchorRecord(record);
    return { ...receipt, recordType: params.recordType };
  },
  outputParser: (rawOutput: string) => {
    try {
      const parsed = JSON.parse(rawOutput) as RegistryAnchorResult;
      return {
        raw: parsed,
        humanMessage: `Anchored ${parsed.recordType} record to registry topic ${parsed.topicId} (seq ${parsed.sequenceNumber ?? '?'}). Set HCS_REGISTRY_TOPIC_ID=${parsed.topicId} to reuse this topic.`,
      };
    } catch {
      return { raw: rawOutput, humanMessage: rawOutput };
    }
  },
});
