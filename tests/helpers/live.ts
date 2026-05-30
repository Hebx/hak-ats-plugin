import 'dotenv/config';
import { describe } from 'vitest';

/**
 * Live testnet suites need a funded ECDSA operator in the environment. In CI (no secrets)
 * we skip them rather than fail the build; locally, with a populated `.env`, they run for
 * real against Hedera testnet and spend HBAR.
 *
 * Use `describeLive(...)` in place of `describe(...)` for any suite that makes on-chain calls.
 */
export const liveEnvReady =
  process.env.HEDERA_NETWORK === 'testnet' &&
  !!process.env.HEDERA_OPERATOR_ID &&
  !!process.env.HEDERA_OPERATOR_KEY;

export const describeLive = liveEnvReady ? describe : describe.skip;
