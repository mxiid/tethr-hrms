import { RateLimitedError } from '../../common/errors';

import { RateLimiterService } from './rate-limiter.service';

describe('RateLimiterService', () => {
  it('allows up to the limit inside the window and rejects the next hit', () => {
    const limiter = new RateLimiterService();
    for (let index = 0; index < 3; index += 1) {
      limiter.consume('key', 3, 60_000);
    }
    expect(() => limiter.consume('key', 3, 60_000)).toThrow(RateLimitedError);
  });

  it('tracks keys independently', () => {
    const limiter = new RateLimiterService();
    limiter.consume('key-a', 1, 60_000);
    expect(() => limiter.consume('key-b', 1, 60_000)).not.toThrow();
    expect(() => limiter.consume('key-a', 1, 60_000)).toThrow(RateLimitedError);
  });

  it('forgets hits once the window has passed', () => {
    jest.useFakeTimers();
    try {
      const limiter = new RateLimiterService();
      limiter.consume('key', 1, 60_000);
      jest.advanceTimersByTime(61_000);
      expect(() => limiter.consume('key', 1, 60_000)).not.toThrow();
    } finally {
      jest.useRealTimers();
    }
  });

  it('uses the provided message', () => {
    const limiter = new RateLimiterService();
    limiter.consume('key', 1, 60_000);
    expect(() => limiter.consume('key', 1, 60_000, 'Too many sign-in attempts')).toThrow(
      'Too many sign-in attempts',
    );
  });

  // The cap is a private constant; mirror it here so the flood tests exercise
  // the real boundary.
  const MAX_TRACKED_KEYS = 5000;

  it('never evicts an active key when a flood exhausts capacity', () => {
    const limiter = new RateLimiterService();
    // A target already part-way through its window.
    for (let index = 0; index < 3; index += 1) {
      limiter.consume('login:target', 5, 60_000);
    }
    // A flood of distinct keys up to (and past) capacity: the new keys that
    // cannot be tracked fail closed.
    for (let index = 0; index < MAX_TRACKED_KEYS; index += 1) {
      try {
        limiter.consume(`flood-${index}`, 5, 60_000);
      } catch (error) {
        expect(error).toBeInstanceOf(RateLimitedError);
      }
    }
    // The target's three earlier attempts still count: two more fit, the third
    // is rejected. An eviction would have reset the window and allowed all
    // five again.
    limiter.consume('login:target', 5, 60_000);
    limiter.consume('login:target', 5, 60_000);
    expect(() => limiter.consume('login:target', 5, 60_000)).toThrow(RateLimitedError);
  });

  it('frees capacity by pruning expired keys before failing closed', () => {
    jest.useFakeTimers();
    try {
      const limiter = new RateLimiterService();
      for (let index = 0; index < MAX_TRACKED_KEYS; index += 1) {
        limiter.consume(`flood-${index}`, 5, 60_000);
      }
      // Every tracked key's window has passed; a new key can be admitted.
      jest.advanceTimersByTime(61_000);
      expect(() => limiter.consume('fresh-key', 5, 60_000)).not.toThrow();
    } finally {
      jest.useRealTimers();
    }
  });
});
