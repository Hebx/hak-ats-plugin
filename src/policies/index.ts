import type { AbstractHook } from '@hashgraph/hedera-agent-kit';
import { MaxSupplyCapPolicy } from './max-supply-cap.js';
import { JurisdictionAllowlistPolicy } from './jurisdiction-allowlist.js';

/**
 * Canonical list of every ATS tool method exposed by this plugin. Kept here (not in a
 * policy file) so it has a stable home independent of any single policy.
 */
export const ALL_ATS_TOOLS = [
  'ats_deploy_security',
  'ats_deploy_bond',
  'ats_issue_to_investor',
  'ats_get_security_info',
  'ats_compliant_transfer',
  'ats_force_transfer',
  'ats_set_paused',
  'ats_get_cap_table',
  'ats_pay_dividend_manual',
  'ats_kyc_register_investor',
  'ats_registry_anchor',
  'ats_registry_resolve',
  'ats_registry_list',
  'ats_anchor_document',
] as const;

export { MaxSupplyCapPolicy } from './max-supply-cap.js';
export { JurisdictionAllowlistPolicy } from './jurisdiction-allowlist.js';
export { enforcePreToolPolicies } from './enforce.js';

/**
 * The default policy set enforced by every ATS tool. There is no network gate:
 * network selection is opt-in via HEDERA_NETWORK (testnet or mainnet, at the
 * operator's own risk). The remaining guardrails are issuance-size cap and the
 * jurisdiction allowlist, both applied at deploy time.
 */
export function defaultPolicies(): AbstractHook[] {
  return [new MaxSupplyCapPolicy(), new JurisdictionAllowlistPolicy()];
}
