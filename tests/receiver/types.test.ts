import { describe, it, expect, vi, afterEach } from 'vitest';
import { getReconnectDelay, DEFAULT_RECONNECT_CONFIG } from '../../src/receiver/types.js';

describe('getReconnectDelay', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return base delay + jitter for attempt 0', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const delay = getReconnectDelay(0, DEFAULT_RECONNECT_CONFIG);
    expect(delay).toBe(DEFAULT_RECONNECT_CONFIG.initialDelayMs);
  });

  it('should increase delay exponentially', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const delay0 = getReconnectDelay(0, DEFAULT_RECONNECT_CONFIG);
    const delay1 = getReconnectDelay(1, DEFAULT_RECONNECT_CONFIG);
    const delay2 = getReconnectDelay(2, DEFAULT_RECONNECT_CONFIG);
    expect(delay1).toBeGreaterThan(delay0);
    expect(delay2).toBeGreaterThan(delay1);
  });

  it('should not exceed maxDelayMs', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const delay = getReconnectDelay(100, DEFAULT_RECONNECT_CONFIG);
    expect(delay).toBeLessThanOrEqual(
      DEFAULT_RECONNECT_CONFIG.maxDelayMs + DEFAULT_RECONNECT_CONFIG.jitterMs,
    );
  });

  it('should add jitter', () => {
    vi.spyOn(Math, 'random').mockReturnValue(1);
    const delay = getReconnectDelay(0, DEFAULT_RECONNECT_CONFIG);
    expect(delay).toBe(
      DEFAULT_RECONNECT_CONFIG.initialDelayMs + DEFAULT_RECONNECT_CONFIG.jitterMs,
    );
  });

  it('should work with custom config', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const delay = getReconnectDelay(0, {
      initialDelayMs: 500,
      maxDelayMs: 5000,
      backoffMultiplier: 3,
      jitterMs: 0,
      maxAttempts: 5,
    });
    expect(delay).toBe(500);
  });
});
