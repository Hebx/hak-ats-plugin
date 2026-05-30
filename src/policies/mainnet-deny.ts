import { AbstractPolicy } from '@hashgraph/hedera-agent-kit';
import { loadEnv } from '../env.js';

export const ALL_ATS_TOOLS = [
  'ats_deploy_security',
  'ats_issue_to_investor',
  'ats_get_security_info',
  'ats_compliant_transfer',
  'ats_get_cap_table',
  'ats_pay_dividend_manual',
] as const;

/**
 * Hard-deny every ATS tool call unless HEDERA_NETWORK is testnet.
 *
 * This release wraps the public testnet factory only and deliberately refuses to
 * touch mainnet — issuing real securities is out of scope and unsafe without the
 * full custody/compliance review the design doc defers. Blocks at the pre-tool
 * stage, before any signer or RPC call.
 */
export class MainnetDenyPolicy extends AbstractPolicy {
  name = 'mainnet_deny';
  description = 'Blocks all ATS tools unless HEDERA_NETWORK=testnet';
  relevantTools = [...ALL_ATS_TOOLS];

  protected shouldBlockPreToolExecution(): boolean {
    const env = loadEnv();
    return env.HEDERA_NETWORK !== 'testnet';
  }
}
