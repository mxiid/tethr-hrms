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
});
