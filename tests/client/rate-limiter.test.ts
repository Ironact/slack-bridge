import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RateLimiter, DEFAULT_RATE_LIMIT_CONFIG } from '../../src/client/rate-limiter.js';
import pino from 'pino';

const logger = pino({ level: 'silent' });

describe('RateLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should enforce minimum delay between calls', async () => {
    const limiter = new RateLimiter({ minDelayMs: 100 }, logger);

    await limiter.waitForSlot('test.method');
    const start = Date.now();

    const promise = limiter.waitForSlot('test.method');
    vi.advanceTimersByTime(100);
    await promise;

    expect(Date.now() - start).toBeGreaterThanOrEqual(100);
  });

  it('should use default config values', () => {
    expect(DEFAULT_RATE_LIMIT_CONFIG.globalMaxPerMinute).toBe(40);
    expect(DEFAULT_RATE_LIMIT_CONFIG.minDelayMs).toBe(100);
    expect(DEFAULT_RATE_LIMIT_CONFIG.methodTiers['chat.postMessage']).toBe(60);
    expect(DEFAULT_RATE_LIMIT_CONFIG.methodTiers['users.info']).toBe(20);
  });

  it('should allow override of config', () => {
    const limiter = new RateLimiter(
      { globalMaxPerMinute: 10, minDelayMs: 50 },
      logger,
    );
    // Just verifying no errors during construction
    expect(limiter).toBeDefined();
  });

  it('should allow calls within rate limit', async () => {
    const limiter = new RateLimiter(
      { globalMaxPerMinute: 100, minDelayMs: 0 },
      logger,
    );

    // Should complete without blocking
    for (let i = 0; i < 5; i++) {
      await limiter.waitForSlot('test.method');
    }
  });

  it('should track per-method limits', async () => {
    const limiter = new RateLimiter(
      {
        globalMaxPerMinute: 1000,
        minDelayMs: 0,
        methodTiers: { 'test.method': 3 },
      },
      logger,
    );

    // First 3 should be fast
    await limiter.waitForSlot('test.method');
    await limiter.waitForSlot('test.method');
    await limiter.waitForSlot('test.method');

    // 4th should block
    const promise = limiter.waitForSlot('test.method');
    vi.advanceTimersByTime(60_100);
    await promise;
  });
});
