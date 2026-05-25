import { ethers, type Wallet, type JsonRpcProvider } from 'ethers';
import { loadEnv } from '../env.js';

export interface LocalSigner {
  wallet: Wallet;
  provider: JsonRpcProvider;
  evmAddress: string;
  hederaId: string;
}

let cached: LocalSigner | undefined;

/**
 * Build an ethers Wallet from the env ECDSA key against the configured
 * Hedera JSON-RPC relay. The wallet's address must match the configured
 * operator EVM address (asserted at boot).
 */
export function getLocalSigner(): LocalSigner {
  if (cached) return cached;
  const env = loadEnv();
  const provider = new ethers.JsonRpcProvider(env.HEDERA_RPC_URL);
  const wallet = new ethers.Wallet(`0x${env.HEDERA_OPERATOR_KEY}`, provider);

  if (wallet.address.toLowerCase() !== env.HEDERA_OPERATOR_EVM_ADDRESS.toLowerCase()) {
    throw new Error(
      `Wallet address mismatch — derived ${wallet.address} but env declares ${env.HEDERA_OPERATOR_EVM_ADDRESS}. The Hedera account must be EVM-aliased to its ECDSA-derived address.`,
    );
  }

  cached = {
    wallet,
    provider,
    evmAddress: wallet.address,
    hederaId: env.HEDERA_OPERATOR_ID,
  };
  return cached;
}

export function resetSignerCache(): void {
  cached = undefined;
}
