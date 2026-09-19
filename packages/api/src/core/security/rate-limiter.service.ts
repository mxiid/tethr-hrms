import { Injectable } from '@nestjs/common';

import { RateLimitedError } from '../../common/errors';

// Per-key sliding window shared by every surface that needs abuse protection
// (anonymous forms, login, signup). In-memory, so it guards a single API
// instance — enough for blunt abuse protection, and swappable behind this
// class when a shared store is warranted. Keys are evicted once the map exceeds
// the cap, so a stream of distinct IPs cannot grow it without bound.
const MAX_TRACKED_KEYS = 5000;

@Injectable()
export class RateLimiterService {
  private readonly hits = new Map<string, number[]>();

  consume(key: string, limit: number, windowMs: number, message?: string): void {
    const now = Date.now();
    const recent = (this.hits.get(key) ?? []).filter((timestamp) => now - timestamp < windowMs);
    if (recent.length >= limit) {
      throw new RateLimitedError(message);
    }
    recent.push(now);
    // Re-insert so the key moves to the end of the insertion order.
    this.hits.delete(key);
    this.hits.set(key, recent);
    if (this.hits.size > MAX_TRACKED_KEYS) {
      this.evict(now, windowMs);
    }
  }

  private evict(now: number, windowMs: number): void {
    for (const [trackedKey, timestamps] of this.hits) {
      const last = timestamps[timestamps.length - 1];
      if (last === undefined || now - last >= windowMs) {
        this.hits.delete(trackedKey);
      }
    }
    while (this.hits.size > MAX_TRACKED_KEYS) {
      const oldest = this.hits.keys().next().value;
      if (oldest === undefined) break;
      this.hits.delete(oldest);
    }
  }
}
