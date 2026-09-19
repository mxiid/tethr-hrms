import { Global, Module } from '@nestjs/common';

import { RateLimiterService } from './rate-limiter.service';

// Global: the limiter is a platform primitive (core/), used by both the
// anonymous form surface and the auth/account boundary.
@Global()
@Module({
  providers: [RateLimiterService],
  exports: [RateLimiterService],
})
export class SecurityModule {}
