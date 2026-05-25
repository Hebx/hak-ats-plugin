import type { Plugin, Context } from '@hashgraph/hedera-agent-kit';

export const atsPlugin: Plugin = {
  name: 'hak-ats-plugin',
  version: '0.1.0',
  description:
    'Asset Tokenization Studio plugin — equity issuance, investor KYC, compliant transfers, and dividend payouts on Hedera testnet',
  tools: (_context: Context) => [],
};

export default atsPlugin;
