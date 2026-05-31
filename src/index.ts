import type { Plugin, Tool, Context } from '@hashgraph/hedera-agent-kit';
import {
  atsDeploySecurityTool,
  ATS_DEPLOY_SECURITY_TOOL,
} from './tools/security/deploy-security.js';
import {
  atsDeployBondTool,
  ATS_DEPLOY_BOND_TOOL,
} from './tools/security/deploy-bond.js';
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
  atsForceTransferTool,
  ATS_FORCE_TRANSFER_TOOL,
} from './tools/security/force-transfer.js';
import {
  atsSetPausedTool,
  ATS_SET_PAUSED_TOOL,
} from './tools/security/set-paused.js';
import {
  atsGetCapTableTool,
  ATS_GET_CAP_TABLE_TOOL,
} from './tools/query/get-cap-table.js';
import {
  atsPayDividendManualTool,
  ATS_PAY_DIVIDEND_MANUAL_TOOL,
} from './tools/payout/pay-dividend-manual.js';
import {
  atsRegistryAnchorTool,
  ATS_REGISTRY_ANCHOR_TOOL,
} from './tools/registry/registry-anchor.js';
import {
  atsRegistryResolveTool,
  ATS_REGISTRY_RESOLVE_TOOL,
} from './tools/registry/registry-resolve.js';
import {
  atsRegistryListTool,
  ATS_REGISTRY_LIST_TOOL,
} from './tools/registry/registry-list.js';
import {
  atsKycAttestTool,
  ATS_KYC_ATTEST_TOOL,
} from './tools/registry/kyc-attest.js';
import {
  atsAnchorDocumentTool,
  ATS_ANCHOR_DOCUMENT_TOOL,
} from './tools/registry/anchor-document.js';

export {
  ATS_DEPLOY_SECURITY_TOOL,
  ATS_DEPLOY_BOND_TOOL,
  ATS_ISSUE_TO_INVESTOR_TOOL,
  ATS_GET_SECURITY_INFO_TOOL,
  ATS_COMPLIANT_TRANSFER_TOOL,
  ATS_FORCE_TRANSFER_TOOL,
  ATS_SET_PAUSED_TOOL,
  ATS_GET_CAP_TABLE_TOOL,
  ATS_PAY_DIVIDEND_MANUAL_TOOL,
  ATS_REGISTRY_ANCHOR_TOOL,
  ATS_REGISTRY_RESOLVE_TOOL,
  ATS_REGISTRY_LIST_TOOL,
  ATS_KYC_ATTEST_TOOL,
  ATS_ANCHOR_DOCUMENT_TOOL,
};

export {
  MaxSupplyCapPolicy,
  JurisdictionAllowlistPolicy,
  defaultPolicies,
  ALL_ATS_TOOLS,
} from './policies/index.js';

export type { HederaNetwork } from './env.js';

/**
 * Hedera Agent Kit v4 plugin exposing AI tools for the Asset Tokenization Studio.
 *
 * Network is opt-in via HEDERA_NETWORK (testnet or mainnet) — set it and you get that
 * network, at your own risk. There is no mainnet deny.
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
  version: '0.4.2',
  description:
    'Tokenized securities (ERC-1400 / ERC-3643 / Asset Tokenization Studio) on Hedera. Deploy equity and bonds, issue, compliant + forced transfers, pause, dividends, plus an HCS registry for name resolution, corporate-action audit trail, KYC attestations, and document anchoring.',
  tools: (context: Context): Tool[] => [
    atsDeploySecurityTool(context),
    atsDeployBondTool(context),
    atsIssueToInvestorTool(context),
    atsGetSecurityInfoTool(context),
    atsCompliantTransferTool(context),
    atsForceTransferTool(context),
    atsSetPausedTool(context),
    atsGetCapTableTool(context),
    atsPayDividendManualTool(context),
    atsRegistryAnchorTool(context),
    atsRegistryResolveTool(context),
    atsRegistryListTool(context),
    atsKycAttestTool(context),
    atsAnchorDocumentTool(context),
  ],
};

export default atsPlugin;
