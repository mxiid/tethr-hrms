import { z } from 'zod';

// Parse a boolean from an env string. Plain `z.coerce.boolean()` is a trap —
// it treats the string 'false' as truthy. This only accepts a literal 'true'.
const envBoolean = (defaultValue: boolean) =>
  z.preprocess((value) => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') return value.trim().toLowerCase() === 'true';
    return defaultValue;
  }, z.boolean());

// The single source of truth for environment shape. Validated once at startup;
// a missing or malformed variable stops boot rather than failing at runtime
// (architecture.md §12).
const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),

  DATABASE_HOST: z.string().min(1),
  DATABASE_PORT: z.coerce.number().int().positive().default(5432),
  DATABASE_USER: z.string().min(1),
  DATABASE_PASSWORD: z.string(),
  DATABASE_NAME: z.string().min(1),
  DATABASE_SYNCHRONIZE: envBoolean(false),
  DATABASE_LOGGING: envBoolean(false),
  // Managed Postgres providers (Supabase, RDS, etc.) require TLS; local Docker
  // Postgres does not speak TLS at all, so this must stay opt-in per environment.
  DATABASE_SSL: envBoolean(false),

  REDIS_HOST: z.string().min(1).default('localhost'),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),

  // A weak JWT secret is a security hole; require real entropy.
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.coerce.number().int().positive().default(3600),

  GRAPHQL_PLAYGROUND: envBoolean(false),

  // Employer identity printed on generated payslip PDFs.
  PDF_EMPLOYER_NAME: z.string().min(1).default('Tethr Pvt. Ltd.'),
  PDF_EMPLOYER_LOCATION: z.string().min(1).default('Islamabad, Pakistan'),
});

export type AppConfig = z.infer<typeof configSchema>;

// Validate a raw environment. Throws a single, readable error listing every
// problem — call this exactly once, at startup.
export const loadConfig = (source: NodeJS.ProcessEnv = process.env): AppConfig => {
  const parsed = configSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
};
