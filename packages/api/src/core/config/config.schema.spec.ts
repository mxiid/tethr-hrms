import { loadConfig } from './config.schema';

const validEnv = {
  DATABASE_HOST: 'localhost',
  DATABASE_USER: 'hrms',
  DATABASE_PASSWORD: 'hrms',
  DATABASE_NAME: 'hrms',
  JWT_SECRET: 'a'.repeat(32),
};

describe('loadConfig', () => {
  it('parses a valid environment and applies defaults', () => {
    const config = loadConfig(validEnv as NodeJS.ProcessEnv);
    expect(config.PORT).toBe(3000);
    expect(config.NODE_ENV).toBe('development');
    expect(config.DATABASE_PORT).toBe(5432);
  });

  it('fails fast when a required variable is missing', () => {
    const { JWT_SECRET: _jwtSecret, ...withoutSecret } = validEnv;
    expect(() => loadConfig(withoutSecret as NodeJS.ProcessEnv)).toThrow(
      /Invalid environment configuration/,
    );
  });

  it('rejects a too-short JWT secret', () => {
    expect(() => loadConfig({ ...validEnv, JWT_SECRET: 'short' } as NodeJS.ProcessEnv)).toThrow(
      /JWT_SECRET/,
    );
  });

  it("parses booleans correctly — 'false' is false, not truthy", () => {
    const config = loadConfig({
      ...validEnv,
      DATABASE_SYNCHRONIZE: 'false',
      DATABASE_LOGGING: 'true',
    } as NodeJS.ProcessEnv);
    expect(config.DATABASE_SYNCHRONIZE).toBe(false);
    expect(config.DATABASE_LOGGING).toBe(true);
  });

  it('requires explicit CORS origins in production', () => {
    const productionEnv = {
      ...validEnv,
      NODE_ENV: 'production',
      STORAGE_DRIVER: 'supabase',
      SUPABASE_URL: 'https://project.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
    };
    expect(() => loadConfig(productionEnv as NodeJS.ProcessEnv)).toThrow(/CORS_ORIGINS/);

    const config = loadConfig({
      ...productionEnv,
      CORS_ORIGINS: 'https://app.example.com',
    } as NodeJS.ProcessEnv);
    expect(config.CORS_ORIGINS).toBe('https://app.example.com');
  });

  it('defaults introspection off', () => {
    const config = loadConfig(validEnv as NodeJS.ProcessEnv);
    expect(config.GRAPHQL_INTROSPECTION).toBe(false);
    expect(config.GRAPHQL_PLAYGROUND).toBe(false);
  });
});
