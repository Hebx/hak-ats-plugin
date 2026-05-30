/**
 * LIVE TESTNET TEST — exercises the HCS registry tool surface end-to-end:
 *   ats_registry_anchor (security + corporate_action), ats_kyc_register_investor,
 *   ats_anchor_document, ats_registry_resolve, ats_registry_list.
 *
 * Anchors a handful of records to a fresh HCS topic, waits for mirror-node indexing,
 * then resolves a security by symbol and reads the audit trail back. No mocks.
 * Cost: HCS topic-create + message-submit fees (small) on testnet.
 */
import 'dotenv/config';
import { createHash } from 'node:crypto';
import { it, expect, beforeAll } from 'vitest';
import type { Client } from '@hiero-ledger/sdk';
import { atsPlugin } from '../../src/index.js';
import { resetRegistryTopicCache } from '../../src/adapters/hcs-registry.js';
import { resetEnvCache } from '../../src/env.js';
import { describeLive } from '../helpers/live.js';

const fakeClient = {} as Client;

function tool(method: string) {
  const t = atsPlugin.tools({}).find((x) => x.method === method);
  if (!t) throw new Error(`tool ${method} not registered`);
  return t;
}

// A throwaway diamond address for record contents — registry writes don't touch the EVM.
const FAKE_DIAMOND = '0x00000000000000000000000000000000000000aa';
const FAKE_INVESTOR = '0x00000000000000000000000000000000000000bb';

describeLive('HCS registry tools (live testnet)', () => {
  let topicId: string;
  const stamp = Date.now();
  const symbol = `RG${String(stamp).slice(-4)}`;
  const docContent = `Series A Term Sheet ${stamp}`;
  const expectedSha = createHash('sha256').update(docContent, 'utf8').digest('hex');

  beforeAll(async () => {
    if (process.env.HEDERA_NETWORK !== 'testnet') {
      throw new Error('refusing to run live tests outside testnet');
    }
    // Force a brand-new topic for this run so assertions aren't polluted by prior records,
    // unless the operator has pinned HCS_REGISTRY_TOPIC_ID.
    if (!process.env.HCS_REGISTRY_TOPIC_ID) resetRegistryTopicCache();

    const anchor = tool('ats_registry_anchor');

    // 1) Register a security (the resolver source).
    const reg = await anchor.execute(fakeClient, {}, {
      recordType: 'security',
      securityType: 'EQUITY',
      name: `Registry Test ${stamp}`,
      symbol,
      isin: 'US0378331005',
      diamondAddress: FAKE_DIAMOND,
    });
    topicId = reg.topicId;
    expect(topicId).toMatch(/^0\.0\.\d+$/);

    // 2) Log a corporate action against the same topic.
    await anchor.execute(fakeClient, {}, {
      recordType: 'corporate_action',
      diamondAddress: FAKE_DIAMOND,
      action: 'issue',
      txHash: '0x' + 'ab'.repeat(32),
      detail: 'issued 100 units (live test)',
    });

    // 3) Attest investor KYC.
    await tool('ats_kyc_register_investor').execute(fakeClient, {}, {
      investor: FAKE_INVESTOR,
      status: 'GRANTED',
      jurisdiction: 'US',
      reference: `case-${stamp}`,
    });

    // 4) Anchor a document by raw content (tool hashes it).
    await tool('ats_anchor_document').execute(fakeClient, {}, {
      title: `Term Sheet ${stamp}`,
      content: docContent,
      diamondAddress: FAKE_DIAMOND,
    });

    // Let the mirror node index the topic messages.
    await new Promise((r) => setTimeout(r, 9000));
  }, 150_000);

  it('resolves the registered security by symbol to its diamond address', async () => {
    const resolve = tool('ats_registry_resolve');
    const out = await resolve.execute(fakeClient, {}, { query: symbol, topicId });
    expect(out.found).toBe(true);
    expect(out.security?.diamondAddress).toBe(FAKE_DIAMOND.toLowerCase());
    expect(out.security?.symbol).toBe(symbol);
    expect(out.security?.securityType).toBe('EQUITY');
  }, 60_000);

  it('returns found=false for an unknown query', async () => {
    const resolve = tool('ats_registry_resolve');
    const out = await resolve.execute(fakeClient, {}, { query: 'NOPE-NOT-REAL', topicId });
    expect(out.found).toBe(false);
    expect(out.security).toBeUndefined();
  }, 60_000);

  it('lists the full audit trail (all four record kinds present)', async () => {
    const list = tool('ats_registry_list');
    const out = await list.execute(fakeClient, {}, { topicId, kind: 'all' });
    expect(out.count).toBeGreaterThanOrEqual(4);
    const kinds = new Set(out.records.map((r: { kind: string }) => r.kind));
    expect(kinds.has('security.registered.v1')).toBe(true);
    expect(kinds.has('corporate.action.v1')).toBe(true);
    expect(kinds.has('kyc.attestation.v1')).toBe(true);
    expect(kinds.has('document.anchor.v1')).toBe(true);
  }, 60_000);

  it('filters the audit trail by kind=document and matches the anchored digest', async () => {
    const list = tool('ats_registry_list');
    const out = await list.execute(fakeClient, {}, { topicId, kind: 'document' });
    expect(out.count).toBeGreaterThanOrEqual(1);
    const docs = out.records as Array<{ kind: string; sha256: string }>;
    expect(docs.every((r) => r.kind === 'document.anchor.v1')).toBe(true);
    expect(docs.some((r) => r.sha256 === expectedSha)).toBe(true);
  }, 60_000);

  it('resolves using the session topic cache when no topicId or env var is set', async () => {
    // Regression for the bug the live e2e demo surfaced: a write auto-creates the topic,
    // and a later read in the SAME session must find it without the operator pinning
    // HCS_REGISTRY_TOPIC_ID. The read tools fall back to getKnownRegistryTopic().
    const resolve = tool('ats_registry_resolve');
    const saved = process.env.HCS_REGISTRY_TOPIC_ID;
    delete process.env.HCS_REGISTRY_TOPIC_ID;
    resetEnvCache(); // drop env override; the session cache (set during beforeAll writes) remains
    try {
      const out = await resolve.execute(fakeClient, {}, { query: symbol }); // no topicId passed
      expect(out.found).toBe(true);
      expect(out.topicId).toBe(topicId);
      expect(out.security?.symbol).toBe(symbol);
    } finally {
      if (saved !== undefined) process.env.HCS_REGISTRY_TOPIC_ID = saved;
      resetEnvCache();
    }
  }, 60_000);

  it('rejects a resolve with no topic id, no env fallback, and no session cache', async () => {
    const resolve = tool('ats_registry_resolve');
    const saved = process.env.HCS_REGISTRY_TOPIC_ID;
    delete process.env.HCS_REGISTRY_TOPIC_ID;
    resetEnvCache(); // loadEnv() is memoized — force a re-read of the cleared var
    resetRegistryTopicCache(); // clear the session cache so the fallback truly has nothing
    try {
      await expect(
        resolve.execute(fakeClient, {}, { query: symbol }),
      ).rejects.toThrow(/no registry topic/);
    } finally {
      if (saved !== undefined) process.env.HCS_REGISTRY_TOPIC_ID = saved;
      resetEnvCache();
    }
  });

  it('rejects a malformed topic id via zod', async () => {
    const list = tool('ats_registry_list');
    expect(() => list.parameters.parse({ topicId: 'not-a-topic' })).toThrow();
  });

  it('rejects a document anchor with neither sha256 nor content', async () => {
    const doc = tool('ats_anchor_document');
    await expect(
      doc.execute(fakeClient, {}, { title: 'empty' }),
    ).rejects.toThrow(/sha256 or content/);
  });
});
