import { z } from 'zod';

/**
 * Network the plugin operates against. Opt-in by configuration: set HEDERA_NETWORK
 * and you get that network — testnet gets testnet, mainnet gets mainnet, at your own
 * risk (same contract as any other Hedera package). There is no extra flag and no
 * deny policy; the operator is responsible for funding and for the factory/resolver
 * addresses matching the chosen network.
 */
export const HEDERA_NETWORKS = ['testnet', 'mainnet'] as const;
export type HederaNetwork = (typeof HEDERA_NETWORKS)[number];

const NETWORK_DEFAULTS: Record<HederaNetwork, { rpc: string; mirror: string }> = {
  testnet: {
    rpc: 'https://testnet.hashio.io/api',
    mirror: 'https://testnet.mirrornode.hedera.com',
  },
  mainnet: {
    rpc: 'https://mainnet.hashio.io/api',
    mirror: 'https://mainnet-public.mirrornode.hedera.com',
  },
};

const envSchema = z.object({
  HEDERA_NETWORK: z.enum(HEDERA_NETWORKS).default('testnet'),
  HEDERA_OPERATOR_ID: z
    .string()
    .regex(/^0\.0\.\d+$/, 'must be Hedera id like 0.0.X'),
  HEDERA_OPERATOR_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, 'must be 64-char ECDSA hex private key'),
  HEDERA_OPERATOR_KEY_TYPE: z.literal('ECDSA'),
  HEDERA_OPERATOR_PUBLIC_KEY: z.string().optional(),
  HEDERA_OPERATOR_EVM_ADDRESS: z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/, 'must be 0x-prefixed EVM address'),

  ATS_FACTORY_ADDRESS: z.string().regex(/^0\.0\.\d+$/),
  ATS_RESOLVER_ADDRESS: z.string().regex(/^0\.0\.\d+$/),
  ATS_EQUITY_CONFIG_ID: z
    .string()
    .regex(/^0x[0-9a-fA-F]{64}$/, 'must be 32-byte hex')
    .default('0x0000000000000000000000000000000000000000000000000000000000000001'),
  ATS_BOND_CONFIG_ID: z
    .string()
    .regex(/^0x[0-9a-fA-F]{64}$/)
    .default('0x0000000000000000000000000000000000000000000000000000000000000002'),
  ATS_CONFIG_VERSION: z.coerce.number().int().nonnegative().default(0),

  // Optional: per-network defaults applied in loadEnv() when omitted.
  HEDERA_MIRROR_NODE_URL: z.string().url().optional(),
  HEDERA_RPC_URL: z.string().url().optional(),

  // Optional: reuse an existing HCS registry topic. When unset, the registry tools
  // create a topic on first anchor and report the id for the operator to persist.
  HCS_REGISTRY_TOPIC_ID: z.string().regex(/^0\.0\.\d+$/).optional(),

  MAX_SUPPLY_CAP: z.coerce.number().int().positive().default(1_000_000),
  JURISDICTION_ALLOWLIST: z.string().default('US,GB,DE,FR,MA,AE,SG,JP'),
});

export type Env = z.infer<typeof envSchema> & {
  HEDERA_MIRROR_NODE_URL: string;
  HEDERA_RPC_URL: string;
};

let cached: Env | undefined;

export function loadEnv(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  const data = parsed.data;
  const defaults = NETWORK_DEFAULTS[data.HEDERA_NETWORK];

  cached = {
    ...data,
    HEDERA_RPC_URL: data.HEDERA_RPC_URL ?? defaults.rpc,
    HEDERA_MIRROR_NODE_URL: data.HEDERA_MIRROR_NODE_URL ?? defaults.mirror,
  };
  return cached;
}

export function resetEnvCache(): void {
  cached = undefined;
}
