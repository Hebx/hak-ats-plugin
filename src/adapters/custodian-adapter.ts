/**
 * Custodian adapter interface (interface-only for v1).
 *
 * The default signer in this plugin is {@link ../local-key-signer.ts | LocalKeySigner},
 * which holds a raw ECDSA key in env — fine for testnet and demos, unacceptable for a
 * production treasury. The Asset Tokenization SDK ships custody integrations (Dfns,
 * Fireblocks, AWS KMS) under `@hashgraph/hedera-custodians-integration`; this interface
 * defines the seam a production deployment would implement to route signing through one
 * of them instead, without touching tool code.
 *
 * Deliberately not wired into any tool yet — shipping a half-working custody path would
 * be worse than an honest "bring your own custodian" extension point. See
 * docs/ARCHITECTURE.md for the intended integration shape.
 */
export interface CustodianAdapter {
  /** Stable identifier for the custody backend, e.g. "dfns" | "fireblocks" | "aws-kms". */
  readonly provider: string;

  /** EVM address (0x...) this custodian signs for. Must match the on-chain operator. */
  getEvmAddress(): Promise<string>;

  /** Hedera account id (0.0.x) bound to the signing key. */
  getHederaAccountId(): Promise<string>;

  /**
   * Sign a prepared EVM transaction and return the raw signed payload (0x-hex), ready
   * to broadcast via the JSON-RPC relay. The adapter never exposes private key material.
   */
  signEvmTransaction(tx: CustodianEvmTx): Promise<string>;

  /**
   * Sign an arbitrary 32-byte digest (0x-hex). Used by native Hedera SDK transactions
   * (e.g. the dividend HBAR fan-out) that sign outside the EVM transaction envelope.
   */
  signDigest(digestHex: string): Promise<string>;
}

/** Minimal shape of an EVM transaction handed to a custodian for signing. */
export interface CustodianEvmTx {
  to: string;
  data: string;
  value?: bigint;
  gasLimit?: bigint;
  nonce?: number;
  chainId: number;
}

/**
 * Placeholder factory. Throws until a concrete custody backend is implemented.
 * Present so callers can depend on the seam today and swap in a real adapter later.
 */
export function createCustodianAdapter(): CustodianAdapter {
  throw new Error(
    'No custodian adapter configured. v1 ships LocalKeySigner only; implement CustodianAdapter (Dfns/Fireblocks/AWS KMS via @hashgraph/hedera-custodians-integration) for production custody.',
  );
}
