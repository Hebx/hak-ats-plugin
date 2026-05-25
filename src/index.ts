import type { Plugin, Tool, Context } from '@hashgraph/hedera-agent-kit';
import {
  atsDeploySecurityTool,
  ATS_DEPLOY_SECURITY_TOOL,
} from './tools/security/deploy-security.js';

export { ATS_DEPLOY_SECURITY_TOOL };

/**
 * Hedera Agent Kit v4 plugin exposing AI tools for the Asset Tokenization Studio.
 *
 * Wire it into a HederaLangchainToolkit:
 *
 *   import { atsPlugin } from '@hebx/hak-ats-plugin';
 *   const toolkit = new HederaLangchainToolkit({
 *     client,
 *     configuration: { plugins: [atsPlugin] },
 *   });
 */
export const atsPlugin: Plugin = {
  name: 'hak-ats-plugin',
  version: '0.1.0',
  description:
    'Tokenized securities (ERC-1400 / Asset Tokenization Studio) on Hedera. Deploy, manage, and query Equity and Bond instruments.',
  tools: (context: Context): Tool[] => [atsDeploySecurityTool(context)],
};

export default atsPlugin;
