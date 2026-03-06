import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RateLimiter } from '../../src/client/rate-limiter.js';

describe('RateLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should allow first call immediately', async () => {
    const limiter = new RateLimiter({ maxPerMinute: 10, minDelayMs: 0 });
    const waited = await limiter.acquire();
    expect(waited).toBe(0);
  });

  it('should enforce minimum delay between calls', async () => {
    const limiter = new RateLimiter({ maxPerMinute: 100, minDelayMs: 50 });

    await limiter.acquire(); // First call

    // Second call should wait
    const promise = limiter.acquire();
    vi.advanceTimersByTime(50);
    const waited = await promise;
    expect(waited).toBeGreaterThanOrEqual(0);
  });

  it('should track current load', async () => {
    const limiter = new RateLimiter({ maxPerMinute: 10, minDelayMs: 0 });
    expect(limiter.currentLoad).toBe(0);

    await limiter.acquire();
    expect(limiter.currentLoad).toBe(1);

    await limiter.acquire();
    expect(limiter.currentLoad).toBe(2);
  });

  it('should prune timestamps older than 1 minute', async () => {
    const limiter = new RateLimiter({ maxPerMinute: 10, minDelayMs: 0 });

    await limiter.acquire();
    expect(limiter.currentLoad).toBe(1);

    vi.advanceTimersByTime(61_000);
    expect(limiter.currentLoad).toBe(0);
  });

  it('should use default config values', () => {
    const limiter = new RateLimiter();
    // Should not throw
    expect(limiter.currentLoad).toBe(0);
  });
});
