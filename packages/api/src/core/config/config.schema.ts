import { z } from 'zod';

// Parse a boolean from an env string. Plain `z.coerce.boolean()` is a trap —
// it treats the string 'false' as truthy. This only accepts a literal 'true'.
const envBoolean = (defaultValue: boolean) =>
  z.preprocess((value) => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') return value.trim().toLowerCase() === 'true';
    return defaultValue;
  }, z.boolean());

// Optional keys are declared as empty placeholders in .env.example (so their
// shape is visible); copying that file must not fail validation. An empty or
// whitespace-only value is treated as unset before the inner schema runs.
const envOptional = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    schema,
  );

// The single source of truth for environment shape. Validated once at startup;
// a missing or malformed variable stops boot rather than failing at runtime
// (architecture.md §12).
const configObjectSchema = z.object({
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

  // How often the API delivers pending outbox messages to the in-process
  // consumers. 0 disables the loop (tests run with NODE_ENV=test, also disabled).
  OUTBOX_RELAY_INTERVAL_MS: z.coerce.number().int().nonnegative().default(5000),

  // Notification delivery. Both optional: without credentials the logger
  // transport records the intent instead of sending (the dev default).
  RESEND_API_KEY: envOptional(z.string().min(1).optional()),
  EMAIL_FROM: envOptional(z.string().email().optional()),
  SLACK_WEBHOOK_URL: envOptional(z.string().url().optional()),

  // A weak JWT secret is a security hole; require real entropy.
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.coerce.number().int().positive().default(3600),

  // Public form links are bearer credentials for anonymous candidates — long
  // enough to run a hiring cycle, short enough to expire on their own.
  FORM_LINK_TTL_DAYS: z.coerce.number().int().positive().default(30),
  // Sliding-window limits for the anonymous form surface (per form + IP, ten
  // minutes). Deliberately blunt abuse protection, tunable per environment.
  FORM_SUBMIT_LIMIT_PER_10_MIN: z.coerce.number().int().positive().default(10),
  FORM_UPLOAD_LIMIT_PER_10_MIN: z.coerce.number().int().positive().default(30),

  // Auth boundary throttles (ten-minute windows): login per email+IP and
  // signup per IP. The login limiter also bounds the scrypt work an attacker
  // can demand; the per-request candidate cap bounds it further.
  AUTH_LOGIN_LIMIT_PER_10_MIN: z.coerce.number().int().positive().default(10),
  AUTH_SIGNUP_LIMIT_PER_10_MIN: z.coerce.number().int().positive().default(5),

  GRAPHQL_PLAYGROUND: envBoolean(false),
  // Introspection defaults to the playground's visibility: on in development
  // (where the playground is a tool), off in production unless explicitly
  // enabled. Tools like GraphQL Codegen can still run against dev.
  GRAPHQL_INTROSPECTION: envBoolean(false),

  // Browser origins allowed to call the API. Comma-separated; unset keeps the
  // Vite dev origins in development and refuses to boot in production.
  CORS_ORIGINS: envOptional(z.string().optional()),

  // Object storage. 'supabase' is the real driver; 'local' writes to disk under
  // the API's working directory and exists so development can exercise the real
  // upload/download flow without a bucket — it is refused in production.
  STORAGE_DRIVER: z.enum(['local', 'supabase']).default('local'),
  SUPABASE_URL: envOptional(z.string().url().optional()),
  SUPABASE_SERVICE_ROLE_KEY: envOptional(z.string().min(1).optional()),
  SUPABASE_STORAGE_BUCKET: z.string().min(1).default('hrms-documents'),
  STORAGE_SIGNED_URL_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  // Absolute base the browser can reach the API on; needed by the local
  // storage driver to mint links. Falls back to http://localhost:${PORT}.
  PUBLIC_API_URL: envOptional(z.string().url().optional()),

  // Employer identity printed on generated payslip PDFs.
  PDF_EMPLOYER_NAME: z.string().min(1).default('Tethr Pvt. Ltd.'),
  PDF_EMPLOYER_LOCATION: z.string().min(1).default('Islamabad, Pakistan'),
});

const requireSupabaseStorage = (
  config: z.infer<typeof configObjectSchema>,
  context: z.RefinementCtx,
) => {
  if (config.STORAGE_DRIVER === 'local' && config.NODE_ENV === 'production') {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['STORAGE_DRIVER'],
      message: 'local storage is development-only; set STORAGE_DRIVER=supabase in production',
    });
  }
  if (config.STORAGE_DRIVER === 'supabase') {
    for (const key of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'] as const) {
      if (!config[key]) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `${key} is required when STORAGE_DRIVER=supabase`,
        });
      }
    }
  }
  // Production must state its browser origins explicitly: reflecting any
  // origin with credentials is a session-hijack surface (TET-215).
  if (
    config.NODE_ENV === 'production' &&
    (config.CORS_ORIGINS === undefined || config.CORS_ORIGINS.trim().length === 0)
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['CORS_ORIGINS'],
      message: 'CORS_ORIGINS is required in production (comma-separated allowed origins)',
    });
  }
};

const configSchema = configObjectSchema.superRefine(requireSupabaseStorage);

export type AppConfig = z.infer<typeof configObjectSchema>;

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
