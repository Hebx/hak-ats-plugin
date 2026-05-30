import type { Plugin, Tool, Context } from '@hashgraph/hedera-agent-kit';
import {
  atsDeploySecurityTool,
  ATS_DEPLOY_SECURITY_TOOL,
} from './tools/security/deploy-security.js';
import {
  atsIssueToInvestorTool,
  ATS_ISSUE_TO_INVESTOR_TOOL,
} from './tools/security/issue-to-investor.js';
import {
  atsGetSecurityInfoTool,
  ATS_GET_SECURITY_INFO_TOOL,
} from './tools/security/get-security-info.js';
import {
  atsCompliantTransferTool,
  ATS_COMPLIANT_TRANSFER_TOOL,
} from './tools/security/compliant-transfer.js';
import {
  atsGetCapTableTool,
  ATS_GET_CAP_TABLE_TOOL,
} from './tools/query/get-cap-table.js';

export {
  ATS_DEPLOY_SECURITY_TOOL,
  ATS_ISSUE_TO_INVESTOR_TOOL,
  ATS_GET_SECURITY_INFO_TOOL,
  ATS_COMPLIANT_TRANSFER_TOOL,
  ATS_GET_CAP_TABLE_TOOL,
};

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
  tools: (context: Context): Tool[] => [
    atsDeploySecurityTool(context),
    atsIssueToInvestorTool(context),
    atsGetSecurityInfoTool(context),
    atsCompliantTransferTool(context),
    atsGetCapTableTool(context),
  ],
};

export default atsPlugin;
