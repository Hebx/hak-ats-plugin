import { z } from 'zod';
import type { Client } from '@hiero-ledger/sdk';
import type { Context, Tool } from '@hashgraph/hedera-agent-kit';
import { FactoryClient, type BondDetails, type SecurityCommonInfo } from '../../contracts/factory-client.js';
import { getLocalSigner } from '../../adapters/local-key-signer.js';
import { loadEnv, type HederaNetwork } from '../../env.js';
import { defaultPolicies, enforcePreToolPolicies } from '../../policies/index.js';

export const ATS_DEPLOY_BOND_TOOL = 'ats_deploy_bond';

const deployBondParameters = z.object({
  name: z.string().min(1).max(64).describe('On-chain display name of the bond.'),
  symbol: z.string().min(2).max(8).describe('Trading ticker for the bond (2-8 characters).'),
  isin: z
    .string()
    .length(12)
    .describe('Valid ISO-6166 ISIN (12 characters with correct checksum).'),
  maxSupply: z
    .number()
    .int()
    .nonnegative()
    .describe('Hard cap on total issuance. Use 0 for uncapped.'),
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .describe('ISO 4217 currency code (3 uppercase letters), e.g. USD, EUR, GBP.'),
  nominalValue: z
    .number()
    .int()
    .min(1)
    .describe('Face (par) value per bond unit, in whole currency units.'),
  startingDate: z
    .number()
    .int()
    .describe('Bond issuance/start date as a Unix timestamp in seconds.'),
  maturityDate: z
    .number()
    .int()
    .describe('Bond maturity date as a Unix timestamp in seconds. Must be after startingDate.'),
  countries: z
    .string()
    .default('')
    .describe('Comma-separated ISO 3166-1 alpha-2 country codes for the control list.'),
  countryListIsAllowList: z
    .boolean()
    .default(true)
    .describe('true = whitelist (only listed countries allowed), false = blocklist.'),
  info: z.string().max(256).default('').describe('Free-text descriptor (<=256 chars).'),
});

export type DeployBondParams = z.infer<typeof deployBondParameters>;

interface DeployBondResult {
  diamondAddress: string;
  txHash: string;
  blockNumber: number;
  maturityDate: number;
  network: HederaNetwork;
}

function currencyAsBytes3(code: string): string {
  const bytes = Buffer.from(code, 'ascii');
  if (bytes.length !== 3) {
    throw new Error(`currency must be exactly 3 ASCII characters, got "${code}"`);
  }
  return `0x${bytes.toString('hex')}`;
}

/**
 * Build the tool that deploys a new fixed-term Bond diamond via IFactory.deployBond.
 *
 * The baseline bond carries currency, par value, and start/maturity dates. Coupon-rate
 * facets (fixed / KPI-linked) are a roadmap item — this deploys the core bond instrument
 * and records the maturity schedule on-chain.
 */
export const atsDeployBondTool = (_context: Context): Tool => ({
  method: ATS_DEPLOY_BOND_TOOL,
  name: 'Deploy Bond',
  description:
    'Deploys a new tokenized BOND security (diamond) on the Asset Tokenization Studio factory for the configured Hedera network, with a par value and start/maturity schedule. Returns the diamond address and transaction hash.',
  parameters: deployBondParameters,
  execute: async (client: Client, ctx: Context, params: DeployBondParams): Promise<DeployBondResult> => {
    await enforcePreToolPolicies(defaultPolicies(), ATS_DEPLOY_BOND_TOOL, params, ctx, client);

    if (params.maturityDate <= params.startingDate) {
      throw new Error('maturityDate must be strictly after startingDate');
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

    const details: BondDetails = {
      currency: currencyAsBytes3(params.currency),
      nominalValue: BigInt(params.nominalValue),
      nominalValueDecimals: 0,
      startingDate: params.startingDate,
      maturityDate: params.maturityDate,
    };

    const result = await factoryClient.deployBond(common, details);

    return {
      diamondAddress: result.diamondAddress,
      txHash: result.txHash,
      blockNumber: result.blockNumber,
      maturityDate: params.maturityDate,
      network: loadEnv().HEDERA_NETWORK,
    };
  },
  outputParser: (rawOutput: string) => {
    try {
      const parsed = JSON.parse(rawOutput) as DeployBondResult;
      const maturity = new Date(parsed.maturityDate * 1000).toISOString().slice(0, 10);
      return {
        raw: parsed,
        humanMessage: `Deployed Bond \u2014 diamond ${parsed.diamondAddress}, matures ${maturity}, tx ${parsed.txHash}, block ${parsed.blockNumber} (${parsed.network}).`,
      };
    } catch {
      return { raw: rawOutput, humanMessage: rawOutput };
    }
  },
});
