/**
 * Direct ABI client for the deployed Asset Tokenization Studio factory on Hedera testnet.
 *
 * We bypass the @hashgraph/asset-tokenization-sdk runtime (which is browser/custodial-first)
 * and call the factory + diamond contracts via ethers directly using the typechain
 * artifacts shipped in @hashgraph/asset-tokenization-contracts.
 *
 * The struct shapes and gas constants here mirror what the upstream SDK produces in
 * RPCTransactionAdapter#createSecurity. Keep them in sync if you bump the contracts package.
 */
import { Factory__factory, IFactory__factory } from '@hashgraph/asset-tokenization-contracts';
import { getLocalSigner } from '../adapters/local-key-signer.js';
import { loadEnv } from '../env.js';
import { resolveContractEvmAddress } from '../adapters/mirror-node.js';

/** keccak256("DEFAULT_ADMIN_ROLE") in solidity is 0x00…00 — bytes32 zero. */
export const DEFAULT_ADMIN_ROLE =
  '0x0000000000000000000000000000000000000000000000000000000000000000';

/** Gas limits copied from @hashgraph/asset-tokenization-sdk Constants. */
export const GAS = {
  CREATE_EQUITY: 15_000_000,
  CREATE_BOND: 15_000_000,
  ISSUE: 1_000_000,
  TRANSFER: 1_000_000,
  SET_IDENTITY_REGISTRY: 700_000,
} as const;

/**
 * Convert a Hedera id like "0.0.7512002" to its long-zero EVM address (0x prefix, 20 bytes).
 * Used for contracts that were deployed by Hedera-native tooling and have no aliased address.
 */
export function hederaIdToEvm(id: string): string {
  const parts = id.split('.');
  if (parts.length !== 3) throw new Error(`invalid Hedera id: ${id}`);
  const num = BigInt(parts[2]);
  const hex = num.toString(16).padStart(40, '0');
  return `0x${hex}`;
}

export interface SecurityCommonInfo {
  /** Display name on chain. */
  name: string;
  /** Ticker (3-5 chars). */
  symbol: string;
  /** ISIN string (may be empty for testnet demos). */
  isin: string;
  /** ERC-20 decimals. Equity typically 0, bond depends. */
  decimals: number;
  /** Cap on issuance. 0 means uncapped. */
  maxSupply: bigint;
  /** Issuer ECDSA EVM address that becomes DEFAULT_ADMIN_ROLE on the diamond. */
  diamondOwnerEvm: string;
  /** Country list — applied with countriesControlListType (true = whitelist). */
  countries: string;
  /** True = whitelist, false = blocklist. */
  isCountryControlListWhiteList: boolean;
  /** Free-text info field (small). */
  info: string;
}

export interface EquityRights {
  votingRight: boolean;
  informationRight: boolean;
  liquidationRight: boolean;
  subscriptionRight: boolean;
  conversionRight: boolean;
  redemptionRight: boolean;
  putRight: boolean;
  /** 0 = NONE, 1 = PREFERRED — see DividendType in contracts. */
  dividendRight: number;
  /** ISO 4217 currency hex (e.g. 0x555344 for USD). */
  currency: string;
  nominalValue: bigint;
  nominalValueDecimals: number;
}

export interface DeployEquityResult {
  /** EVM address (0x…) of the new diamond. */
  diamondAddress: string;
  /** Transaction hash on JSON-RPC. */
  txHash: string;
  /** Block number containing the deployment. */
  blockNumber: number;
}

export class FactoryClient {
  private readonly env = loadEnv();
  private readonly signer = getLocalSigner();
  private factoryEvm?: string;
  private resolverEvm?: string;

  /**
   * Resolve the factory + resolver EVM addresses via the mirror node. Hedera contracts
   * created with HSCS have an aliased EVM address that does NOT match the long-zero form.
   * We must use the mirror-node-reported address or the factory rejects the resolver as
   * mismatched.
   */
  async ensureAddresses(): Promise<{ factoryEvm: string; resolverEvm: string }> {
    if (!this.factoryEvm) {
      this.factoryEvm = await resolveContractEvmAddress(
        this.env.ATS_FACTORY_ADDRESS,
        this.env.HEDERA_MIRROR_NODE_URL,
      );
    }
    if (!this.resolverEvm) {
      this.resolverEvm = await resolveContractEvmAddress(
        this.env.ATS_RESOLVER_ADDRESS,
        this.env.HEDERA_MIRROR_NODE_URL,
      );
    }
    return { factoryEvm: this.factoryEvm, resolverEvm: this.resolverEvm };
  }

  /** Build the SecurityDataStruct payload required by IFactory.deployEquity. */
  buildSecurityData(common: SecurityCommonInfo, resolverEvm: string): {
    arePartitionsProtected: boolean;
    isMultiPartition: boolean;
    resolver: string;
    resolverProxyConfiguration: { key: string; version: number };
    rbacs: Array<{ role: string; members: string[] }>;
    isControllable: boolean;
    isWhiteList: boolean;
    erc20VotesActivated: boolean;
    maxSupply: bigint;
    erc20MetadataInfo: { name: string; symbol: string; isin: string; decimals: number };
    clearingActive: boolean;
    internalKycActivated: boolean;
    externalPauses: string[];
    externalControlLists: string[];
    externalKycLists: string[];
    compliance: string;
    identityRegistry: string;
  } {
    return {
      arePartitionsProtected: false,
      isMultiPartition: false,
      resolver: resolverEvm,
      resolverProxyConfiguration: {
        key: this.env.ATS_EQUITY_CONFIG_ID,
        version: this.env.ATS_CONFIG_VERSION,
      },
      rbacs: [{ role: DEFAULT_ADMIN_ROLE, members: [common.diamondOwnerEvm] }],
      isControllable: true,
      isWhiteList: false,
      erc20VotesActivated: false,
      maxSupply: common.maxSupply,
      erc20MetadataInfo: {
        name: common.name,
        symbol: common.symbol,
        isin: common.isin,
        decimals: common.decimals,
      },
      clearingActive: false,
      internalKycActivated: false,
      externalPauses: [],
      externalControlLists: [],
      externalKycLists: [],
      // Compliance + IdentityRegistry are wired post-deploy via setIdentityRegistry/setCompliance
      compliance: '0x0000000000000000000000000000000000000000',
      identityRegistry: '0x0000000000000000000000000000000000000000',
    };
  }

  /**
   * Build the FactoryRegulationDataStruct.
   *
   * The factory rejects (NONE, NONE) — only REG_S/NONE or REG_D/(506_B|506_C) are accepted.
   * REG_S is the most permissive option (offshore offerings, no accreditation/verification).
   * For unregulated demos, callers can override.
   */
  buildRegulationData(common: SecurityCommonInfo): {
    regulationType: number;
    regulationSubType: number;
    additionalSecurityData: {
      countriesControlListType: boolean;
      listOfCountries: string;
      info: string;
    };
  } {
    return {
      regulationType: 1, // REG_S
      regulationSubType: 0, // NONE
      additionalSecurityData: {
        countriesControlListType: common.isCountryControlListWhiteList,
        listOfCountries: common.countries,
        info: common.info,
      },
    };
  }

  /**
   * Deploy a new Equity diamond. Returns the diamond address, tx hash, and block number.
   *
   * Throws if the receipt is missing the EquityDeployed event or the transaction reverts.
   */
  async deployEquity(
    common: SecurityCommonInfo,
    rights: EquityRights,
  ): Promise<DeployEquityResult> {
    const { factoryEvm, resolverEvm } = await this.ensureAddresses();
    const factory = IFactory__factory.connect(
      factoryEvm,
      this.signer.wallet as unknown as Parameters<typeof IFactory__factory.connect>[1],
    );

    const securityData = this.buildSecurityData(common, resolverEvm);
    const regulationData = this.buildRegulationData(common);

    const equityData = {
      security: securityData,
      equityDetails: {
        votingRight: rights.votingRight,
        informationRight: rights.informationRight,
        liquidationRight: rights.liquidationRight,
        subscriptionRight: rights.subscriptionRight,
        conversionRight: rights.conversionRight,
        redemptionRight: rights.redemptionRight,
        putRight: rights.putRight,
        dividendRight: rights.dividendRight,
        currency: rights.currency,
        nominalValue: rights.nominalValue,
        nominalValueDecimals: rights.nominalValueDecimals,
      },
    };

    // The typechain factory was generated against ethers' CJS build, while this package
    // resolves the ESM build. The runtime objects are interchangeable but TS sees them as
    // distinct. We treat the response shape structurally rather than nominally.
    const tx = await factory.deployEquity(equityData, regulationData, {
      gasLimit: GAS.CREATE_EQUITY,
    });
    const receipt = await tx.wait();
    if (!receipt) throw new Error(`deployEquity tx ${tx.hash} produced no receipt`);

    const diamondAddress = this.parseEquityDeployedEvent(receipt);
    return {
      diamondAddress,
      txHash: tx.hash,
      blockNumber: receipt.blockNumber,
    };
  }

  /** Find the EquityDeployed event in a receipt and return the deployed diamond address. */
  private parseEquityDeployedEvent(receipt: {
    logs: ReadonlyArray<{ topics: ReadonlyArray<string>; data: string; address: string }>;
  }): string {
    const factoryIface = Factory__factory.createInterface();

    for (const log of receipt.logs) {
      try {
        const parsed = factoryIface.parseLog({
          topics: [...log.topics],
          data: log.data,
        });
        if (parsed?.name === 'EquityDeployed') {
          // EquityDeployed(address indexed deployer, address equityAddress, …)
          // args[0] is the deployer; args[1] is the new diamond.
          const addr =
            (parsed.args.equityAddress as string | undefined) ??
            (parsed.args[1] as string | undefined);
          if (typeof addr === 'string' && addr.startsWith('0x')) return addr;
        }
      } catch {
        // not a Factory event — skip
      }
    }
    throw new Error('EquityDeployed event not found in receipt logs');
  }
}
