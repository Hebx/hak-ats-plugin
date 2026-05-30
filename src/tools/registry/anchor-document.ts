import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { Client } from '@hiero-ledger/sdk';
import type { Context, Tool } from '@hashgraph/hedera-agent-kit';
import { loadEnv } from '../../env.js';
import { anchorRecord, type DocumentAnchorRecord } from '../../adapters/hcs-registry.js';

export const ATS_ANCHOR_DOCUMENT_TOOL = 'ats_anchor_document';

const anchorDocumentParameters = z.object({
    title: z.string().min(1).max(128).describe('Document title, e.g. "Series A Term Sheet".'),
    sha256: z
      .string()
      .regex(/^[0-9a-fA-F]{64}$/)
      .optional()
      .describe('Precomputed SHA-256 hex digest of the document. Provide this OR content.'),
    content: z
      .string()
      .optional()
      .describe('Raw document text to hash with SHA-256 on the fly. Provide this OR sha256.'),
    diamondAddress: z
      .string()
      .regex(/^0x[0-9a-fA-F]{40}$/, 'must be a 0x-prefixed EVM address')
      .optional()
      .describe('Optional security diamond address this document relates to.'),
    uri: z
      .string()
      .max(256)
      .optional()
      .describe('Optional off-chain location of the document (IPFS/HTTPS); only the hash is the record.'),
  });

export type AnchorDocumentParams = z.infer<typeof anchorDocumentParameters>;

interface AnchorDocumentResult {
  title: string;
  sha256: string;
  topicId: string;
  sequenceNumber?: number;
}

/**
 * Build the document-anchoring tool: hash a document (term sheet, prospectus, board
 * resolution) and write its SHA-256 digest to the HCS registry as the document-of-record.
 * The bytes stay off-chain; the on-chain digest proves the document existed and is
 * unaltered. Accepts a precomputed digest or raw content to hash here.
 */
export const atsAnchorDocumentTool = (_context: Context): Tool => ({
  method: ATS_ANCHOR_DOCUMENT_TOOL,
  name: 'Anchor Document',
  description:
    'Anchors an off-chain DOCUMENT (term sheet, prospectus, board resolution) to the HCS securities registry by its SHA-256 digest, as a tamper-evident document-of-record. Use THIS tool whenever the request is to anchor, attach, or record a document/term sheet/prospectus. Accepts a precomputed sha256 or raw content to hash. Returns the topic id and sequence number.',
  parameters: anchorDocumentParameters,
  execute: async (_client: Client, _ctx: Context, params: AnchorDocumentParams): Promise<AnchorDocumentResult> => {
    const env = loadEnv();
    if (!params.sha256 && !params.content) {
      throw new Error('provide either sha256 or content');
    }
    const sha256 = params.sha256
      ? params.sha256.toLowerCase()
      : createHash('sha256').update(params.content ?? '', 'utf8').digest('hex');

    const record: DocumentAnchorRecord = {
      kind: 'document.anchor.v1',
      network: env.HEDERA_NETWORK,
      createdAt: new Date().toISOString(),
      diamondAddress: params.diamondAddress?.toLowerCase(),
      title: params.title,
      sha256,
      uri: params.uri,
    };
    const receipt = await anchorRecord(record);
    return {
      title: params.title,
      sha256,
      topicId: receipt.topicId,
      sequenceNumber: receipt.sequenceNumber,
    };
  },
  outputParser: (rawOutput: string) => {
    try {
      const parsed = JSON.parse(rawOutput) as AnchorDocumentResult;
      return {
        raw: parsed,
        humanMessage: `Anchored "${parsed.title}" (sha256 ${parsed.sha256.slice(0, 18)}…) to registry topic ${parsed.topicId} (seq ${parsed.sequenceNumber ?? '?'}).`,
      };
    } catch {
      return { raw: rawOutput, humanMessage: rawOutput };
    }
  },
});
