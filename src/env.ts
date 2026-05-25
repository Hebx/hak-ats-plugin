import { z } from 'zod';

const envSchema = z.object({
  HEDERA_NETWORK: z.literal('testnet'),
  HEDERA_OPERATOR_ID: z
    .string()
    .regex(/^0\.0\.\d+$/, 'must be Hedera id like 0.0.X'),
  HEDERA_OPERATOR_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, 'must be 64-char ECDSA hex private key'),
  HEDERA_OPERATOR_KEY_TYPE: z.literal('ECDSA'),
  HEDERA_OPERATOR_PUBLIC_KEY: z.string(),
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

  HEDERA_MIRROR_NODE_URL: z.string().url(),
  HEDERA_RPC_URL: z.string().url(),

  MAX_SUPPLY_CAP: z.coerce.number().int().positive().default(1_000_000),
  JURISDICTION_ALLOWLIST: z.string().default('US,GB,DE,FR,MA,AE,SG,JP'),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

export function loadEnv(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

export function resetEnvCache(): void {
  cached = undefined;
}
