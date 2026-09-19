// Integration-only Jest config: runs the Redis-gated specs that the default
// infrastructure-free suite skips. Driven by `npm run test:integration`, whose
// pretest guard fails when REDIS_INTEGRATION is not set.
const base = require('./jest.config');

module.exports = {
  ...base,
  testMatch: ['**/*.integration.spec.ts'],
};
