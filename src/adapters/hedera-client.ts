import { Client, AccountId, PrivateKey } from '@hiero-ledger/sdk';
import { loadEnv } from '../env.js';

let cached: Client | undefined;

/**
 * Native Hedera SDK client for HSCS-adjacent operations that the JSON-RPC relay does
 * not cover — notably HBAR TransferTransaction for the manual dividend fan-out and
 * TopicCreate/TopicMessageSubmit for the HCS registry.
 *
 * The operator key is ECDSA (same key as the ethers signer); the SDK signs with it.
 * Network is chosen by HEDERA_NETWORK (opt-in): testnet -> Client.forTestnet(),
 * mainnet -> Client.forMainnet(). At your own risk on mainnet.
 */
export function getHederaClient(): Client {
  if (cached) return cached;
  const env = loadEnv();
  const client =
    env.HEDERA_NETWORK === 'mainnet' ? Client.forMainnet() : Client.forTestnet();
  cached = client.setOperator(
    AccountId.fromString(env.HEDERA_OPERATOR_ID),
    PrivateKey.fromStringECDSA(env.HEDERA_OPERATOR_KEY),
  );
  return cached;
}

export function closeHederaClient(): void {
  cached?.close();
  cached = undefined;
}
