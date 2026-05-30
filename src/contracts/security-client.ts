/**
 * Direct ABI client for an already-deployed Asset Tokenization Studio security diamond.
 *
 * Where FactoryClient deploys new diamonds, SecurityClient operates on one: granting
 * roles, issuing units, compliant transfers, and reading on-chain state. All calls go
 * through the local ECDSA signer against the Hashio JSON-RPC relay — no SDK runtime.
 */
import {
  IAccessControl__factory,
  IERC1594__factory,
  IERC1410Read__factory,
  IERC1644__factory,
  ERC20__factory,
  IPause__factory,
} from '@hashgraph/asset-tokenization-contracts';
import { getLocalSigner, type LocalSigner } from '../adapters/local-key-signer.js';
import { GAS } from './factory-client.js';

/**
 * The typechain factories were generated against ethers' CJS build while this package
 * resolves the ESM build. The runtime runner objects are interchangeable but TS sees the
 * ContractRunner types as distinct. We cast through this alias at each connect site.
 */
type Runner = Parameters<typeof IERC1594__factory.connect>[1];

/**
 * Role identifiers used by the ATS diamonds. Values are the keccak256 role ids
 * baked into @hashgraph/asset-tokenization-contracts/contracts/constants/roles.sol.
 */
export const ROLES = {
  DEFAULT_ADMIN: '0x0000000000000000000000000000000000000000000000000000000000000000',
  ISSUER: '0x4be32e8849414d19186807008dabd451c1d87dae5f8e22f32f5ce94d486da842',
  CONTROL_LIST: '0xca537e1c88c9f52dc5692c96c482841c3bea25aafc5f3bfe96f645b5f800cac3',
  KYC: '0x6fbd421e041603fa367357d79ffc3b2f9fd37a6fc4eec661aa5537a9ae75f93d',
  CONTROLLER: '0xa72964c08512ad29f46841ce735cff038789243c2b506a89163cc99f76d06c0f',
  PAUSER: '0x6f65556918c1422809d0d567462eafeb371be30159d74b38ac958dc58864faeb',
} as const;

const EVM_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

export interface IssueResult {
  diamondAddress: string;
  investor: string;
  amount: string;
  txHash: string;
  blockNumber: number;
}

export interface TransferResult {
  diamondAddress: string;
  from: string;
  to: string;
  amount: string;
  txHash: string;
  blockNumber: number;
}

export interface PauseResult {
  diamondAddress: string;
  paused: boolean;
  txHash: string;
  blockNumber: number;
}

export interface SecurityInfo {
  name: string;
  symbol: string;
  isin: string;
  decimals: number;
  totalSupply: string;
  paused: boolean;
}

export class SecurityClient {
  private readonly signer: LocalSigner;

  constructor(private readonly diamondAddress: string) {
    if (!EVM_ADDRESS_RE.test(diamondAddress)) {
      throw new Error(`invalid diamond address: ${diamondAddress}`);
    }
    this.signer = getLocalSigner();
  }

  private get runner(): Runner {
    return this.signer.wallet as unknown as Runner;
  }

  private get reader(): Runner {
    return this.signer.provider as unknown as Runner;
  }

  /** True if `account` already holds `role` on this diamond. */
  async hasRole(role: string, account: string): Promise<boolean> {
    const ac = IAccessControl__factory.connect(this.diamondAddress, this.reader);
    return ac.hasRole(role, account);
  }

  /** Grant `role` to `account`. Idempotent — skips the tx if already held. */
  async ensureRole(role: string, account: string): Promise<void> {
    if (await this.hasRole(role, account)) return;
    const ac = IAccessControl__factory.connect(this.diamondAddress, this.runner);
    const tx = await ac.grantRole(role, account, { gasLimit: GAS.SET_IDENTITY_REGISTRY });
    const receipt = await tx.wait();
    if (!receipt) throw new Error(`grantRole tx ${tx.hash} produced no receipt`);
  }

  /**
   * Issue `amount` units to `investor`. Ensures the operator holds ISSUER_ROLE first.
   *
   * Under the default deploy config (blocklist control list, internal KYC off) this is
   * the only prerequisite — confirmed on testnet. If a diamond is later deployed with a
   * whitelist or internal KYC, the investor must be registered/kyc'd separately.
   */
  async issue(investor: string, amount: bigint, data = '0x'): Promise<IssueResult> {
    if (!EVM_ADDRESS_RE.test(investor)) {
      throw new Error(`invalid investor address: ${investor}`);
    }
    if (amount <= 0n) throw new Error('issue amount must be positive');

    await this.ensureRole(ROLES.ISSUER, this.signer.evmAddress);

    const erc1594 = IERC1594__factory.connect(this.diamondAddress, this.runner);
    const tx = await erc1594.issue(investor, amount, data, { gasLimit: GAS.ISSUE });
    const receipt = await tx.wait();
    if (!receipt) throw new Error(`issue tx ${tx.hash} produced no receipt`);

    return {
      diamondAddress: this.diamondAddress,
      investor,
      amount: amount.toString(),
      txHash: tx.hash,
      blockNumber: receipt.blockNumber,
    };
  }

  /** Read current unit balance for `holder`. */
  async balanceOf(holder: string): Promise<bigint> {
    const read = IERC1410Read__factory.connect(this.diamondAddress, this.reader);
    return read.balanceOf(holder);
  }

  /**
   * Pause or unpause all transfers on the security (ERC-1400 PAUSER path).
   * Ensures the operator holds PAUSER_ROLE first. Idempotent against current state:
   * a no-op (already in the requested state) returns without sending a transaction.
   */
  async setPaused(paused: boolean): Promise<PauseResult> {
    await this.ensureRole(ROLES.PAUSER, this.signer.evmAddress);
    const pause = IPause__factory.connect(this.diamondAddress, this.runner);
    const tx = paused
      ? await pause.pause({ gasLimit: GAS.PAUSE })
      : await pause.unpause({ gasLimit: GAS.PAUSE });
    const receipt = await tx.wait();
    if (!receipt) throw new Error(`${paused ? 'pause' : 'unpause'} tx ${tx.hash} produced no receipt`);
    return {
      diamondAddress: this.diamondAddress,
      paused,
      txHash: tx.hash,
      blockNumber: receipt.blockNumber,
    };
  }

  /**
   * Preflight an ERC-1594 transfer. Returns the compliance verdict without sending a tx:
   * `{ allowed, code, reason }`. Useful to surface why a transfer would fail.
   */
  async canTransfer(
    to: string,
    amount: bigint,
    data = '0x',
  ): Promise<{ allowed: boolean; code: string; reason: string }> {
    const erc1594 = IERC1594__factory.connect(this.diamondAddress, this.reader);
    const [allowed, code, reason] = await erc1594.canTransfer(to, amount, data);
    return { allowed, code, reason };
  }

  /**
   * Controller (forced) transfer of `amount` units from `from` to `to` via ERC-1644.
   * Ensures the operator holds CONTROLLER_ROLE first. Works on diamonds deployed with
   * isControllable:true — confirmed on testnet. This is the compliant move-between-holders
   * path a treasury agent uses; it routes through the security's compliance modules.
   */
  async controllerTransfer(
    from: string,
    to: string,
    amount: bigint,
    data = '0x',
    operatorData = '0x',
  ): Promise<TransferResult> {
    if (!EVM_ADDRESS_RE.test(from)) throw new Error(`invalid from address: ${from}`);
    if (!EVM_ADDRESS_RE.test(to)) throw new Error(`invalid to address: ${to}`);
    if (amount <= 0n) throw new Error('transfer amount must be positive');

    await this.ensureRole(ROLES.CONTROLLER, this.signer.evmAddress);

    const erc1644 = IERC1644__factory.connect(this.diamondAddress, this.runner);
    const tx = await erc1644.controllerTransfer(from, to, amount, data, operatorData, {
      gasLimit: GAS.TRANSFER,
    });
    const receipt = await tx.wait();
    if (!receipt) throw new Error(`controllerTransfer tx ${tx.hash} produced no receipt`);

    return {
      diamondAddress: this.diamondAddress,
      from,
      to,
      amount: amount.toString(),
      txHash: tx.hash,
      blockNumber: receipt.blockNumber,
    };
  }

  /** Read name, symbol, ISIN, decimals, total supply, and paused state. */
  async getInfo(): Promise<SecurityInfo> {
    const erc20 = ERC20__factory.connect(this.diamondAddress, this.reader);
    const read = IERC1410Read__factory.connect(this.diamondAddress, this.reader);
    const pause = IPause__factory.connect(this.diamondAddress, this.reader);

    const [meta, totalSupply, paused] = await Promise.all([
      erc20.getERC20Metadata(),
      read.totalSupply(),
      pause.isPaused(),
    ]);

    // getERC20Metadata returns a struct { info: { name, symbol, isin, decimals }, ... }
    const info = (meta as unknown as { info: { name: string; symbol: string; isin: string; decimals: bigint } }).info;
    return {
      name: info.name,
      symbol: info.symbol,
      isin: info.isin,
      decimals: Number(info.decimals),
      totalSupply: totalSupply.toString(),
      paused,
    };
  }
}
