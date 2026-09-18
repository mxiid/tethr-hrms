/* global console, process */
// The Redis integration suite is opt-in so the default `npm test` stays
// infrastructure-free. This guard makes the explicit integration command fail
// loudly (instead of silently skipping its specs) when it is unconfigured:
//   REDIS_INTEGRATION=1 npm run test:integration -w @hrms/worker
if (process.env.REDIS_INTEGRATION !== '1') {
  console.error(
    'REDIS_INTEGRATION is not set. Start Redis, then run ' +
      '`REDIS_INTEGRATION=1 npm run test:integration -w @hrms/worker` ' +
      '(Redis is read from REDIS_HOST/REDIS_PORT; see packages/worker/.env.example).',
  );
  process.exit(1);
}
