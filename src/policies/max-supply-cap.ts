import { AbstractPolicy } from '@hashgraph/hedera-agent-kit';
import type { PreToolExecutionParams } from '@hashgraph/hedera-agent-kit';
import { loadEnv } from '../env.js';

/**
 * Block a deploy whose requested maxSupply exceeds MAX_SUPPLY_CAP (default 1,000,000).
 *
 * A guardrail against fat-fingered or adversarial issuance sizes. Only relevant to
 * ats_deploy_security; an uncapped deploy (maxSupply = 0) is allowed through, since
 * the cap targets oversized fixed supplies, not the explicit "uncapped" choice.
 */
export class MaxSupplyCapPolicy extends AbstractPolicy {
  name = 'max_supply_cap';
  description = 'Blocks deploys whose maxSupply exceeds MAX_SUPPLY_CAP';
  relevantTools = ['ats_deploy_security'];

  protected shouldBlockPreToolExecution(params: PreToolExecutionParams): boolean {
    const env = loadEnv();
    const raw = params.rawParams as { maxSupply?: unknown } | undefined;
    const maxSupply = Number(raw?.maxSupply ?? 0);
    if (!Number.isFinite(maxSupply) || maxSupply <= 0) return false;
    return maxSupply > env.MAX_SUPPLY_CAP;
  }
}
