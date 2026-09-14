import 'dotenv/config';

import { type ConnectionOptions } from 'bullmq';

import { startWorker } from './worker-runner';

// The worker's composition root. Reading connection settings from env directly is
// acceptable here (the entrypoint); business code never touches process.env.
const connection: ConnectionOptions = {
  host: process.env.REDIS_HOST ?? 'localhost',
  port: Number(process.env.REDIS_PORT ?? 6379),
  maxRetriesPerRequest: null,
};

const workers = startWorker(connection);
console.log('[worker] started; listening for jobs');

const shutdown = async (): Promise<void> => {
  await Promise.all(workers.map((worker) => worker.close()));
  process.exit(0);
};

process.on('SIGINT', () => {
  void shutdown();
});
process.on('SIGTERM', () => {
  void shutdown();
});
