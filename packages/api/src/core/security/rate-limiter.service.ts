import { Injectable } from '@nestjs/common';

import { RateLimitedError } from '../../common/errors';

// Per-key sliding window shared by every surface that needs abuse protection
// (anonymous forms, login, signup). In-memory, so it guards a single API
// instance — enough for blunt abuse protection, and swappable behind this
// class when a shared store is warranted.
//
// Capacity policy: expired keys are pruned when the map is full. If capacity is
// still exhausted, a NEW key is rejected (fail closed) — active keys are never
// evicted. Evicting the oldest key would let an attacker flood distinct keys to
// reset a live login window and resume guessing (CWE-307).
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
    if (!this.hits.has(key) && this.hits.size >= MAX_TRACKED_KEYS) {
      this.pruneExpired(now, windowMs);
      if (this.hits.size >= MAX_TRACKED_KEYS) {
        throw new RateLimitedError(message);
      }
    }
    recent.push(now);
    // Re-insert so the key moves to the end of the insertion order.
    this.hits.delete(key);
    this.hits.set(key, recent);
  }

  private pruneExpired(now: number, windowMs: number): void {
    for (const [trackedKey, timestamps] of this.hits) {
      const last = timestamps[timestamps.length - 1];
      if (last === undefined || now - last >= windowMs) {
        this.hits.delete(trackedKey);
      }
    }
  }
}
