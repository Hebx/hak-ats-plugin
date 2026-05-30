import { z } from 'zod';
import type { Client } from '@hiero-ledger/sdk';
import type { Context, Tool } from '@hashgraph/hedera-agent-kit';
import { resolveSecurity, getKnownRegistryTopic, type ResolvedSecurity } from '../../adapters/hcs-registry.js';

export const ATS_REGISTRY_RESOLVE_TOOL = 'ats_registry_resolve';

const registryResolveParameters = z.object({
  query: z
    .string()
    .min(1)
    .describe('Name, symbol, ISIN, or diamond address of the security to resolve.'),
  topicId: z
    .string()
    .regex(/^0\.0\.\d+$/, 'must be a Hedera topic id like 0.0.X')
    .optional()
    .describe('Registry topic id. Defaults to HCS_REGISTRY_TOPIC_ID from the environment.'),
});

export type RegistryResolveParams = z.infer<typeof registryResolveParameters>;

interface RegistryResolveResult {
  query: string;
  found: boolean;
  security?: ResolvedSecurity;
  topicId: string;
}

/**
 * Build the tool that resolves a security by name / symbol / ISIN to its diamond
 * address, reading the HCS registry topic. This is the on-chain name->address lookup:
 * users (and the agent) can refer to a security as "ACME" or its ISIN instead of a
 * 0x diamond address.
 */
export const atsRegistryResolveTool = (_context: Context): Tool => ({
  method: ATS_REGISTRY_RESOLVE_TOOL,
  name: 'Resolve Security From Registry',
  description:
    'Resolves a security by name, symbol, or ISIN to its diamond EVM address using the HCS securities registry. Returns the registered security details or found=false. Read-only.',
  parameters: registryResolveParameters,
  execute: async (_client: Client, _ctx: Context, params: RegistryResolveParams): Promise<RegistryResolveResult> => {
    const topicId = params.topicId ?? getKnownRegistryTopic();
    if (!topicId) {
      throw new Error(
        'no registry topic: pass topicId, set HCS_REGISTRY_TOPIC_ID, or register/anchor a record first this session',
      );
    }
    const security = await resolveSecurity(params.query, topicId);
    return {
      query: params.query,
      found: security !== null,
      security: security ?? undefined,
      topicId,
    };
  },
  outputParser: (rawOutput: string) => {
    try {
      const parsed = JSON.parse(rawOutput) as RegistryResolveResult;
      if (!parsed.found || !parsed.security) {
        return { raw: parsed, humanMessage: `No security matching "${parsed.query}" found in registry ${parsed.topicId}.` };
      }
      const s = parsed.security;
      return {
        raw: parsed,
        humanMessage: `${s.name} (${s.symbol}, ${s.securityType}, ISIN ${s.isin}) -> ${s.diamondAddress}`,
      };
    } catch {
      return { raw: rawOutput, humanMessage: rawOutput };
    }
  },
});
