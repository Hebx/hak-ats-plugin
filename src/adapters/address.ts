import { z } from 'zod';
import {
  resolveAccountIdToEvm,
  resolveContractEvmAddress,
} from '../adapters/mirror-node.js';

/**
 * Address inputs across the ATS tools accept EITHER form:
 *   - a 0x-prefixed EVM address (`0xabc…`, 40 hex chars), or
 *   - a Hedera entity id (`0.0.X`).
 *
 * Hedera ids are resolved to their canonical EVM address via the mirror node before any
 * contract call, so everything downstream stays EVM-only. Resolution is cached in the
 * mirror adapter, so repeated ids in one session cost a single round-trip.
 */

const EVM_RE = /^0x[0-9a-fA-F]{40}$/;
const HEDERA_ID_RE = /^0\.0\.\d+$/;

/**
 * Zod schema for an address-or-id input. Validates shape only; resolution happens in
 * `toEvmAddress` at execute time (zod cannot do the async mirror-node lookup).
 */
export const addressOrId = z
  .string()
  .refine((v) => EVM_RE.test(v) || HEDERA_ID_RE.test(v), {
    message: 'must be a 0x-prefixed EVM address or a Hedera id like 0.0.X',
  });

/** True for a Hedera entity id (`0.0.X`). */
export function isHederaId(value: string): boolean {
  return HEDERA_ID_RE.test(value);
}

/** True for a 0x-prefixed EVM address. */
export function isEvmAddress(value: string): boolean {
  return EVM_RE.test(value);
}

/**
 * Normalize an address-or-id to a 0x EVM address.
 *
 * - A 0x EVM address is returned unchanged.
 * - A Hedera id is resolved via the mirror node. `kind` selects the endpoint:
 *   `contract` for deployed diamonds (HSCS-aliased), `account` for investors/holders.
 *
 * Throws on an unrecognized shape or a failed lookup.
 */
export async function toEvmAddress(
  value: string,
  kind: 'account' | 'contract',
  mirrorBaseUrl: string,
): Promise<string> {
  if (EVM_RE.test(value)) return value;
  if (!HEDERA_ID_RE.test(value)) {
    throw new Error(`invalid address or Hedera id: ${value}`);
  }
  return kind === 'contract'
    ? resolveContractEvmAddress(value, mirrorBaseUrl)
    : resolveAccountIdToEvm(value, mirrorBaseUrl);
}
