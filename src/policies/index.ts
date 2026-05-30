import type { AbstractHook } from '@hashgraph/hedera-agent-kit';
import { MainnetDenyPolicy } from './mainnet-deny.js';
import { MaxSupplyCapPolicy } from './max-supply-cap.js';
import { JurisdictionAllowlistPolicy } from './jurisdiction-allowlist.js';

export { MainnetDenyPolicy, ALL_ATS_TOOLS } from './mainnet-deny.js';
export { MaxSupplyCapPolicy } from './max-supply-cap.js';
export { JurisdictionAllowlistPolicy } from './jurisdiction-allowlist.js';
export { enforcePreToolPolicies } from './enforce.js';

/**
 * The default policy set enforced by every ATS tool. Ordered safety-first:
 * network gate, then issuance-size cap, then jurisdiction allowlist.
 */
export function defaultPolicies(): AbstractHook[] {
  return [new MainnetDenyPolicy(), new MaxSupplyCapPolicy(), new JurisdictionAllowlistPolicy()];
}
