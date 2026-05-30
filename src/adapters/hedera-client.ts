import { Client, AccountId, PrivateKey } from '@hiero-ledger/sdk';
import { loadEnv } from '../env.js';

let cached: Client | undefined;

/**
 * Native Hedera SDK client for HSCS-adjacent operations that the JSON-RPC relay does
 * not cover — notably HBAR TransferTransaction for the manual dividend fan-out.
 *
 * The operator key is ECDSA (same key as the ethers signer); the SDK signs HBAR
 * transfers with it. Testnet only, asserted by env validation.
 */
export function getHederaClient(): Client {
  if (cached) return cached;
  const env = loadEnv();
  if (env.HEDERA_NETWORK !== 'testnet') {
    throw new Error('Hedera client is restricted to testnet');
  }
  cached = Client.forTestnet().setOperator(
    AccountId.fromString(env.HEDERA_OPERATOR_ID),
    PrivateKey.fromStringECDSA(env.HEDERA_OPERATOR_KEY),
  );
  return cached;
}

export function closeHederaClient(): void {
  cached?.close();
  cached = undefined;
}
