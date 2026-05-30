import { z } from 'zod';
import type { Client } from '@hiero-ledger/sdk';
import type { Context, Tool } from '@hashgraph/hedera-agent-kit';
import { readRegistry, getKnownRegistryTopic, type RegistryRecord } from '../../adapters/hcs-registry.js';

export const ATS_REGISTRY_LIST_TOOL = 'ats_registry_list';

const registryListParameters = z.object({
  topicId: z
    .string()
    .regex(/^0\.0\.\d+$/, 'must be a Hedera topic id like 0.0.X')
    .optional()
    .describe('Registry topic id. Defaults to HCS_REGISTRY_TOPIC_ID from the environment.'),
  kind: z
    .enum(['all', 'security', 'corporate_action', 'kyc', 'document'])
    .default('all')
    .describe('Filter by record kind. Default "all".'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(500)
    .default(100)
    .describe('Maximum number of records to return (most recent kept).'),
});

export type RegistryListParams = z.infer<typeof registryListParameters>;

interface RegistryListResult {
  topicId: string;
  count: number;
  records: RegistryRecord[];
}

const KIND_MAP: Record<string, RegistryRecord['kind']> = {
  security: 'security.registered.v1',
  corporate_action: 'corporate.action.v1',
  kyc: 'kyc.attestation.v1',
  document: 'document.anchor.v1',
};

/**
 * Build the tool that reads the HCS securities registry back as an audit view. Returns
 * the registry records (optionally filtered by kind), most recent last — an independent,
 * mirror-node-sourced audit trail of everything the agent has registered or logged.
 */
export const atsRegistryListTool = (_context: Context): Tool => ({
  method: ATS_REGISTRY_LIST_TOOL,
  name: 'List Registry Records',
  description:
    'Reads the HCS securities registry audit trail from the mirror node: registered securities, corporate actions, KYC attestations, and document anchors. Optionally filtered by kind. Read-only.',
  parameters: registryListParameters,
  execute: async (_client: Client, _ctx: Context, params: RegistryListParams): Promise<RegistryListResult> => {
    const topicId = params.topicId ?? getKnownRegistryTopic();
    if (!topicId) {
      throw new Error(
        'no registry topic: pass topicId, set HCS_REGISTRY_TOPIC_ID, or register/anchor a record first this session',
      );
    }
    const all = await readRegistry(topicId, params.limit);
    const records =
      params.kind === 'all' ? all : all.filter((r) => r.kind === KIND_MAP[params.kind]);
    return { topicId, count: records.length, records };
  },
  outputParser: (rawOutput: string) => {
    try {
      const parsed = JSON.parse(rawOutput) as RegistryListResult;
      const lines = parsed.records
        .map((r) => {
          if (r.kind === 'security.registered.v1') {
            return `  [security] ${r.symbol} (${r.securityType}) ${r.diamondAddress}`;
          }
          if (r.kind === 'corporate.action.v1') {
            return `  [action] ${r.action} ${r.diamondAddress}${r.txHash ? ` tx ${r.txHash}` : ''}`;
          }
          if (r.kind === 'kyc.attestation.v1') {
            return `  [kyc] ${r.investor} ${r.status}`;
          }
          return `  [document] ${r.title} ${r.sha256.slice(0, 18)}…`;
        })
        .join('\n');
      return {
        raw: parsed,
        humanMessage: `Registry ${parsed.topicId} — ${parsed.count} record(s):\n${lines}`,
      };
    } catch {
      return { raw: rawOutput, humanMessage: rawOutput };
    }
  },
});
