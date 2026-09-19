// Parses the CORS_ORIGINS env list into an allowlist. Pure so it can be unit
// tested without booting the app.
//
// - unset/empty in development: the Vite dev/preview origins (localhost:5173,
//   127.0.0.1:5173, localhost:4173) so the SPA keeps working out of the box;
// - unset/empty in production: an empty list — the config schema refuses to
//   boot production without explicit origins, so this is unreachable in prod;
// - set: the comma-separated origins, trimmed, empty entries dropped.
export const DEV_CORS_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
] as const;

export const parseCorsOrigins = (
  value: string | undefined,
  nodeEnv: 'development' | 'test' | 'production',
): string[] => {
  const origins = (value ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
  if (origins.length > 0) {
    return origins;
  }
  return nodeEnv === 'production' ? [] : [...DEV_CORS_ORIGINS];
};
