import { z } from 'zod';
import type { Client } from '@hiero-ledger/sdk';
import type { Context, Tool } from '@hashgraph/hedera-agent-kit';
import { FactoryClient, type EquityRights, type SecurityCommonInfo } from '../../contracts/factory-client.js';
import { getLocalSigner } from '../../adapters/local-key-signer.js';
import { loadEnv, type HederaNetwork } from '../../env.js';
import { defaultPolicies, enforcePreToolPolicies } from '../../policies/index.js';

export const ATS_DEPLOY_SECURITY_TOOL = 'ats_deploy_security';

/** Parameters exposed to the LLM. Kept narrow on purpose; advanced fields live in code. */
const deploySecurityParameters = z.object({
  type: z
    .enum(['EQUITY'])
    .default('EQUITY')
    .describe('Security type. This tool deploys EQUITY (the default); use ats_deploy_bond for bonds.'),
  name: z.string().min(1).max(64).describe('On-chain display name of the security.'),
  symbol: z
    .string()
    .min(2)
    .max(8)
    .describe('Trading ticker for the security (2-8 characters).'),
  isin: z
    .string()
    .length(12)
    .describe(
      'Valid ISO-6166 ISIN (12 characters with correct checksum). Use US0378331005 for testnet demos.',
    ),
  maxSupply: z
    .number()
    .int()
    .nonnegative()
    .describe('Hard cap on total issuance. Use 0 for uncapped.'),
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .describe('ISO 4217 currency code (3 uppercase letters), e.g. USD, EUR, GBP.'),
  countries: z
    .string()
    .default('')
    .describe(
      'Comma-separated ISO 3166-1 alpha-2 country codes, applied as the country control list.',
    ),
  countryListIsAllowList: z
    .boolean()
    .default(true)
    .describe('true = whitelist (only listed countries allowed), false = blocklist.'),
  votingRight: z.boolean().default(true).describe('Whether holders have voting rights.'),
  dividendRight: z
    .enum(['NONE', 'PREFERRED'])
    .default('PREFERRED')
    .describe('Dividend type. NONE = no dividends, PREFERRED = preferred dividend.'),
  info: z.string().max(256).default('').describe('Free-text descriptor (<=256 chars).'),
});

export type DeploySecurityParams = z.infer<typeof deploySecurityParameters>;

interface DeploySecurityResult {
  diamondAddress: string;
  txHash: string;
  blockNumber: number;
  network: HederaNetwork;
}

const DIVIDEND_RIGHT_CODE = { NONE: 0, PREFERRED: 1 } as const;

function currencyAsBytes3(code: string): string {
  const bytes = Buffer.from(code, 'ascii');
  if (bytes.length !== 3) {
    throw new Error(`currency must be exactly 3 ASCII characters, got "${code}"`);
  }
  return `0x${bytes.toString('hex')}`;
}

/**
 * Build the @hashgraph/hedera-agent-kit Tool that deploys a new security diamond.
 *
 * The Hedera Client passed to execute() is unused for ATS calls \u2014 those go via the
 * configured JSON-RPC relay using the local ECDSA signer. We accept the client only
 * for parity with the rest of the toolkit's surface.
 */
export const atsDeploySecurityTool = (_context: Context): Tool => ({
  method: ATS_DEPLOY_SECURITY_TOOL,
  name: 'Deploy Security',
  description:
    'Deploys a new tokenized EQUITY security (diamond) on the Asset Tokenization Studio factory for the configured Hedera network. Returns the diamond address, transaction hash, and block number.',
  parameters: deploySecurityParameters,
  execute: async (
    client: Client,
    ctx: Context,
    params: DeploySecurityParams,
  ): Promise<DeploySecurityResult> => {
    // Network gate, max-supply cap, and jurisdiction allowlist are enforced here as
    // reusable HAK policies (single source of truth, shared across tools).
    await enforcePreToolPolicies(defaultPolicies(), ATS_DEPLOY_SECURITY_TOOL, params, ctx, client);

    if (params.type !== 'EQUITY') {
      throw new Error(`only type=EQUITY is supported in this release; got ${params.type}`);
    }

    const signer = getLocalSigner();
    const factoryClient = new FactoryClient();

    const common: SecurityCommonInfo = {
      name: params.name,
      symbol: params.symbol,
      isin: params.isin,
      decimals: 0,
      maxSupply: BigInt(params.maxSupply),
      diamondOwnerEvm: signer.evmAddress,
      countries: params.countries,
      isCountryControlListWhiteList: params.countryListIsAllowList,
      info: params.info,
    };

    const rights: EquityRights = {
      votingRight: params.votingRight,
      informationRight: false,
      liquidationRight: false,
      subscriptionRight: false,
      conversionRight: false,
      redemptionRight: false,
      putRight: false,
      dividendRight: DIVIDEND_RIGHT_CODE[params.dividendRight],
      currency: currencyAsBytes3(params.currency),
      nominalValue: 1n,
      nominalValueDecimals: 0,
    };

    const result = await factoryClient.deployEquity(common, rights);

    return {
      diamondAddress: result.diamondAddress,
      txHash: result.txHash,
      blockNumber: result.blockNumber,
      network: loadEnv().HEDERA_NETWORK,
    };
  },
  outputParser: (rawOutput: string) => {
    try {
      const parsed = JSON.parse(rawOutput) as DeploySecurityResult;
      return {
        raw: parsed,
        humanMessage: `Deployed Equity \u2014 diamond ${parsed.diamondAddress}, tx ${parsed.txHash}, block ${parsed.blockNumber} (${parsed.network}).`,
      };
    } catch {
      return { raw: rawOutput, humanMessage: rawOutput };
    }
  },
});
