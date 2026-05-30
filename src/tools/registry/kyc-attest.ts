import { z } from 'zod';
import type { Client } from '@hiero-ledger/sdk';
import type { Context, Tool } from '@hashgraph/hedera-agent-kit';
import { getLocalSigner } from '../../adapters/local-key-signer.js';
import { loadEnv } from '../../env.js';
import { anchorRecord, type KycAttestationRecord } from '../../adapters/hcs-registry.js';

export const ATS_KYC_ATTEST_TOOL = 'ats_kyc_register_investor';

const kycAttestParameters = z.object({
  investor: z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/, 'must be a 0x-prefixed EVM address')
    .describe('Investor EVM address being attested.'),
  status: z
    .enum(['GRANTED', 'REVOKED'])
    .default('GRANTED')
    .describe('KYC attestation status. GRANTED = cleared, REVOKED = withdrawn.'),
  jurisdiction: z
    .string()
    .regex(/^[A-Z]{2}$/)
    .optional()
    .describe('ISO 3166-1 alpha-2 country of the investor (optional).'),
  reference: z
    .string()
    .max(128)
    .optional()
    .describe('Off-chain KYC reference id (verifiable credential id, provider case id).'),
});

export type KycAttestParams = z.infer<typeof kycAttestParameters>;

interface KycAttestResult {
  investor: string;
  status: string;
  topicId: string;
  sequenceNumber?: number;
}

/**
 * Build the KYC attestation tool.
 *
 * Records an off-chain KYC decision for an investor as a tamper-evident HCS attestation
 * (issuer = the operator). This is intentionally an attestation layer rather than the
 * ATS internal-KYC facet: the default deploy config ships with internal KYC deactivated,
 * and the on-chain ERC-3643 identity registry path requires a listed issuer and KYC role
 * setup that is out of scope for the baseline. Binding to the on-chain identity registry
 * is a roadmap item; the attestation is the auditable record in the meantime.
 */
export const atsKycAttestTool = (_context: Context): Tool => ({
  method: ATS_KYC_ATTEST_TOOL,
  name: 'Attest Investor KYC',
  description:
    'Records a tamper-evident KYC attestation for an investor address on the HCS securities registry (GRANTED or REVOKED), with optional jurisdiction and off-chain reference. The auditable investor-eligibility record. Returns the topic id and sequence number.',
  parameters: kycAttestParameters,
  execute: async (_client: Client, _ctx: Context, params: KycAttestParams): Promise<KycAttestResult> => {
    const env = loadEnv();
    // Touch the signer so an invalid operator config fails here, consistent with other tools.
    getLocalSigner();

    const record: KycAttestationRecord = {
      kind: 'kyc.attestation.v1',
      network: env.HEDERA_NETWORK,
      createdAt: new Date().toISOString(),
      investor: params.investor.toLowerCase(),
      status: params.status,
      jurisdiction: params.jurisdiction,
      reference: params.reference,
    };
    const receipt = await anchorRecord(record);
    return {
      investor: record.investor,
      status: record.status,
      topicId: receipt.topicId,
      sequenceNumber: receipt.sequenceNumber,
    };
  },
  outputParser: (rawOutput: string) => {
    try {
      const parsed = JSON.parse(rawOutput) as KycAttestResult;
      return {
        raw: parsed,
        humanMessage: `KYC ${parsed.status} for ${parsed.investor}, anchored to registry topic ${parsed.topicId} (seq ${parsed.sequenceNumber ?? '?'}).`,
      };
    } catch {
      return { raw: rawOutput, humanMessage: rawOutput };
    }
  },
});
