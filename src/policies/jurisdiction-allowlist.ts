import { AbstractPolicy } from '@hashgraph/hedera-agent-kit';
import type { PreToolExecutionParams } from '@hashgraph/hedera-agent-kit';
import { loadEnv } from '../env.js';

/** Parse a CSV of ISO 3166-1 alpha-2 codes into a normalised, de-duped uppercase set. */
function parseCountries(csv: string): string[] {
  return csv
    .split(',')
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean);
}

/**
 * Reject a deploy whose country control list touches any jurisdiction outside the
 * configured JURISDICTION_ALLOWLIST.
 *
 * Only relevant to ats_deploy_security (the only tool that takes country codes). An
 * empty country list is allowed — it imposes no jurisdiction restriction and so can
 * violate nothing. The check is allowlist-membership, independent of whether the
 * deploy treats its list as a whitelist or blocklist: any referenced country must be
 * one the operator is permitted to handle at all.
 */
export class JurisdictionAllowlistPolicy extends AbstractPolicy {
  name = 'jurisdiction_allowlist';
  description = 'Blocks deploys referencing countries outside JURISDICTION_ALLOWLIST';
  relevantTools = ['ats_deploy_security'];

  protected shouldBlockPreToolExecution(params: PreToolExecutionParams): boolean {
    const env = loadEnv();
    const allowlist = parseCountries(env.JURISDICTION_ALLOWLIST);
    const raw = params.rawParams as { countries?: unknown } | undefined;
    const requested = parseCountries(typeof raw?.countries === 'string' ? raw.countries : '');
    return requested.some((c) => !allowlist.includes(c));
  }
}
