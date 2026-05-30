/**
 * HCS securities registry.
 *
 * A single Hedera Consensus Service topic acts as a tamper-evident, independently
 * queryable system-of-record that sits alongside the ATS contracts. It carries four
 * record kinds:
 *   - security.registered.v1  : a deployed security mapped to its diamond address
 *                               (the name/symbol/ISIN -> address resolver source).
 *   - corporate.action.v1     : issue / transfer / dividend / pause events, with tx hash.
 *   - kyc.attestation.v1      : an off-chain KYC attestation for an investor address.
 *   - document.anchor.v1      : a SHA-256 digest of an off-chain document (term sheet,
 *                               prospectus) anchored as the document-of-record.
 *
 * Writes go through the native Hedera SDK (TopicCreate / TopicMessageSubmit); reads
 * come from the mirror node. Same approach across testnet and mainnet — the client and
 * mirror URL follow HEDERA_NETWORK.
 */
import { TopicCreateTransaction, TopicMessageSubmitTransaction } from '@hiero-ledger/sdk';
import { getHederaClient } from './hedera-client.js';
import { loadEnv, type HederaNetwork } from '../env.js';

export const REGISTRY_TOPIC_MEMO = 'HAK-ATS registry v1';

export type RegistryRecord =
  | SecurityRegisteredRecord
  | CorporateActionRecord
  | KycAttestationRecord
  | DocumentAnchorRecord;

interface BaseRecord {
  network: HederaNetwork;
  createdAt: string;
}

export interface SecurityRegisteredRecord extends BaseRecord {
  kind: 'security.registered.v1';
  securityType: 'EQUITY' | 'BOND';
  name: string;
  symbol: string;
  isin: string;
  diamondAddress: string;
  issuer: string;
}

export interface CorporateActionRecord extends BaseRecord {
  kind: 'corporate.action.v1';
  action: 'issue' | 'transfer' | 'dividend' | 'pause' | 'unpause' | 'force_transfer';
  diamondAddress: string;
  txHash?: string;
  detail: string;
}

export interface KycAttestationRecord extends BaseRecord {
  kind: 'kyc.attestation.v1';
  investor: string;
  status: 'GRANTED' | 'REVOKED';
  jurisdiction?: string;
  reference?: string;
}

export interface DocumentAnchorRecord extends BaseRecord {
  kind: 'document.anchor.v1';
  diamondAddress?: string;
  title: string;
  sha256: string;
  uri?: string;
}

export interface AnchorReceipt {
  topicId: string;
  sequenceNumber?: number;
  transactionId?: string;
}

let cachedTopicId: string | undefined;

/**
 * Resolve the registry topic id: prefer HCS_REGISTRY_TOPIC_ID, then a process cache,
 * otherwise create a new topic and cache it. The created id is surfaced in the anchor
 * result so the operator can persist it back into env for reuse.
 */
export async function ensureRegistryTopic(): Promise<string> {
  const env = loadEnv();
  if (env.HCS_REGISTRY_TOPIC_ID) return env.HCS_REGISTRY_TOPIC_ID;
  if (cachedTopicId) return cachedTopicId;

  const client = getHederaClient();
  const resp = await new TopicCreateTransaction().setTopicMemo(REGISTRY_TOPIC_MEMO).execute(client);
  const receipt = await resp.getReceipt(client);
  const topicId = receipt.topicId?.toString();
  if (!topicId) throw new Error('HCS registry topic creation returned no topic id');
  cachedTopicId = topicId;
  return topicId;
}

/** Submit a single registry record as a JSON HCS message. Creates the topic if needed. */
export async function anchorRecord(record: RegistryRecord): Promise<AnchorReceipt> {
  const topicId = await ensureRegistryTopic();
  const client = getHederaClient();
  const resp = await new TopicMessageSubmitTransaction()
    .setTopicId(topicId)
    .setMessage(JSON.stringify(record))
    .execute(client);
  const receipt = await resp.getReceipt(client);
  return {
    topicId,
    sequenceNumber: receipt.topicSequenceNumber?.toNumber(),
    transactionId: resp.transactionId?.toString(),
  };
}

interface MirrorTopicMessage {
  message?: string;
  sequence_number?: number;
  consensus_timestamp?: string;
}
interface MirrorTopicMessagesResponse {
  messages?: MirrorTopicMessage[];
  links?: { next?: string | null };
}

function decode(encoded: string | undefined): unknown | null {
  if (!encoded) return null;
  try {
    return JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

function isRegistryRecord(value: unknown): value is RegistryRecord {
  if (typeof value !== 'object' || value === null) return false;
  const kind = (value as { kind?: unknown }).kind;
  return (
    kind === 'security.registered.v1' ||
    kind === 'corporate.action.v1' ||
    kind === 'kyc.attestation.v1' ||
    kind === 'document.anchor.v1'
  );
}

/**
 * Read all registry records from the mirror node for a topic, oldest-first. Paginates
 * through `links.next`. `limit` caps total records returned (most recent are kept when
 * the cap is hit).
 */
export async function readRegistry(topicId: string, limit = 200): Promise<RegistryRecord[]> {
  if (!/^0\.0\.\d+$/.test(topicId)) throw new Error(`invalid topic id: ${topicId}`);
  const env = loadEnv();
  const base = env.HEDERA_MIRROR_NODE_URL.replace(/\/+$/, '');
  const root = base.endsWith('/api/v1') ? base : `${base}/api/v1`;
  const origin = new URL(root).origin;

  const records: RegistryRecord[] = [];
  let next: string | null = `${root}/topics/${topicId}/messages?limit=100&order=asc`;
  while (next && records.length < limit + 100) {
    const res = await fetch(next.startsWith('http') ? next : `${origin}${next}`);
    if (!res.ok) throw new Error(`mirror node returned ${res.status} reading topic ${topicId}`);
    const body = (await res.json()) as MirrorTopicMessagesResponse;
    for (const m of body.messages ?? []) {
      const decoded = decode(m.message);
      if (isRegistryRecord(decoded)) records.push(decoded);
    }
    next = body.links?.next ?? null;
  }
  return records.slice(-limit);
}

export interface ResolvedSecurity {
  name: string;
  symbol: string;
  isin: string;
  diamondAddress: string;
  securityType: 'EQUITY' | 'BOND';
}

/**
 * Resolve a security by name, symbol, or ISIN (case-insensitive) to its diamond
 * address, reading the registry topic. Returns the most recent matching registration.
 */
export async function resolveSecurity(query: string, topicId: string): Promise<ResolvedSecurity | null> {
  const needle = query.trim().toLowerCase();
  const records = await readRegistry(topicId);
  const matches = records.filter(
    (r): r is SecurityRegisteredRecord =>
      r.kind === 'security.registered.v1' &&
      (r.name.toLowerCase() === needle ||
        r.symbol.toLowerCase() === needle ||
        r.isin.toLowerCase() === needle ||
        r.diamondAddress.toLowerCase() === needle),
  );
  if (matches.length === 0) return null;
  const latest = matches[matches.length - 1];
  return {
    name: latest.name,
    symbol: latest.symbol,
    isin: latest.isin,
    diamondAddress: latest.diamondAddress,
    securityType: latest.securityType,
  };
}

export function resetRegistryTopicCache(): void {
  cachedTopicId = undefined;
}

/**
 * Return the registry topic that is already known to this process WITHOUT creating one:
 * the pinned HCS_REGISTRY_TOPIC_ID if set, otherwise the topic created earlier in this
 * session (cache). Read tools (resolve/list) use this so that, within a single agent
 * run, reads can find what writes just created even when the operator has not yet pinned
 * the topic id into the environment. Returns undefined when nothing has been written and
 * no topic is pinned.
 */
export function getKnownRegistryTopic(): string | undefined {
  const env = loadEnv();
  return env.HCS_REGISTRY_TOPIC_ID ?? cachedTopicId;
}
