import { Global, Module } from '@nestjs/common';

import { MessageQueueService } from './message-queue.service';

// Global like the other platform modules, so producers (events consumers, CV
// uploads) enqueue without importing queue plumbing.
@Global()
@Module({
  providers: [MessageQueueService],
  exports: [MessageQueueService],
})
export class QueueModule {}
