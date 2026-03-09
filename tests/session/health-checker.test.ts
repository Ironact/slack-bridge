import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SessionHealthChecker } from '../../src/session/health-checker.js';
import type { SessionStatus } from '../../src/session/health-checker.js';
import type { Credentials } from '../../src/auth/types.js';
import pino from 'pino';

const logger = pino({ level: 'silent' });

const credentials: Credentials = {
  token: 'xoxc-test-token',
  cookie: 'xoxd-test-cookie',
};

function createChecker(opts: {
  validateFn?: (creds: Credentials) => Promise<boolean>;
  intervalMs?: number;
  timeoutMs?: number;
  deadThreshold?: number;
} = {}) {
  return new SessionHealthChecker({
    validateFn: opts.validateFn ?? vi.fn().mockResolvedValue(true),
    credentials,
    logger,
    intervalMs: opts.intervalMs ?? 60_000,
    timeoutMs: opts.timeoutMs ?? 5_000,
    deadThreshold: opts.deadThreshold ?? 3,
  });
}

describe('SessionHealthChecker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('getState', () => {
    it('should return unknown status before first check', () => {
      const checker = createChecker();
      const state = checker.getState();
      expect(state.status).toBe('unknown');
      expect(state.lastCheck).toBeNull();
      expect(state.consecutiveFailures).toBe(0);
    });
  });

  describe('check', () => {
    it('should set status to healthy on successful validation', async () => {
      const checker = createChecker();
      const state = await checker.check();
      expect(state.status).toBe('healthy');
      expect(state.consecutiveFailures).toBe(0);
      expect(state.lastCheck).not.toBeNull();
      expect(state.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('should set status to degraded on first failure', async () => {
      const checker = createChecker({
        validateFn: vi.fn().mockResolvedValue(false),
      });

      const state = await checker.check();
      expect(state.status).toBe('degraded');
      expect(state.consecutiveFailures).toBe(1);
    });

    it('should stay degraded on second failure', async () => {
      const checker = createChecker({
        validateFn: vi.fn().mockResolvedValue(false),
      });

      await checker.check();
      const state = await checker.check();
      expect(state.status).toBe('degraded');
      expect(state.consecutiveFailures).toBe(2);
    });

    it('should transition to dead after reaching threshold', async () => {
      const checker = createChecker({
        validateFn: vi.fn().mockResolvedValue(false),
        deadThreshold: 3,
      });

      await checker.check();
      await checker.check();
      const state = await checker.check();
      expect(state.status).toBe('dead');
      expect(state.consecutiveFailures).toBe(3);
    });

    it('should reset to healthy after recovery', async () => {
      const validateFn = vi.fn()
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true);

      const checker = createChecker({ validateFn });

      await checker.check(); // degraded
      await checker.check(); // degraded
      const state = await checker.check(); // healthy
      expect(state.status).toBe('healthy');
      expect(state.consecutiveFailures).toBe(0);
    });

    it('should handle validation exceptions as failures', async () => {
      const checker = createChecker({
        validateFn: vi.fn().mockRejectedValue(new Error('network error')),
      });

      const state = await checker.check();
      expect(state.status).toBe('degraded');
      expect(state.consecutiveFailures).toBe(1);
    });

    it('should handle timeout', async () => {
      const checker = createChecker({
        validateFn: () => new Promise(() => {}), // never resolves
        timeoutMs: 100,
      });

      vi.useRealTimers(); // need real timers for timeout
      const state = await checker.check();
      expect(state.status).toBe('degraded');
      expect(state.consecutiveFailures).toBe(1);
    });
  });

  describe('events', () => {
    it('should emit healthy event on successful check', async () => {
      const checker = createChecker();
      const handler = vi.fn();
      checker.on('healthy', handler);

      await checker.check();
      expect(handler).toHaveBeenCalledOnce();
      expect(handler.mock.calls[0]![0]).toMatchObject({
        status: 'healthy',
        consecutiveFailures: 0,
      });
    });

    it('should emit degraded event on failure', async () => {
      const checker = createChecker({
        validateFn: vi.fn().mockResolvedValue(false),
      });
      const handler = vi.fn();
      checker.on('degraded', handler);

      await checker.check();
      expect(handler).toHaveBeenCalledOnce();
    });

    it('should emit dead event after threshold failures', async () => {
      const checker = createChecker({
        validateFn: vi.fn().mockResolvedValue(false),
        deadThreshold: 2,
      });
      const deadHandler = vi.fn();
      checker.on('dead', deadHandler);

      await checker.check(); // degraded
      await checker.check(); // dead
      expect(deadHandler).toHaveBeenCalledOnce();
    });

    it('should emit transition event on state changes', async () => {
      const validateFn = vi.fn()
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true);

      const checker = createChecker({ validateFn });
      const transitionHandler = vi.fn();
      checker.on('transition', transitionHandler);

      await checker.check(); // unknown -> degraded
      await checker.check(); // degraded -> healthy (recovered)

      expect(transitionHandler).toHaveBeenCalledTimes(2);

      const [degradedCall, recoveredCall] = transitionHandler.mock.calls as Array<[{ event: string; status: SessionStatus }]>;
      expect(degradedCall![0].event).toBe('degraded');
      expect(recoveredCall![0].event).toBe('recovered');
    });

    it('should not emit transition when status stays the same', async () => {
      const checker = createChecker({
        validateFn: vi.fn().mockResolvedValue(false),
      });
      const transitionHandler = vi.fn();
      checker.on('transition', transitionHandler);

      await checker.check(); // unknown -> degraded (transition)
      await checker.check(); // degraded -> degraded (no transition)

      expect(transitionHandler).toHaveBeenCalledOnce();
    });
  });

  describe('start/stop', () => {
    it('should run check immediately on start', async () => {
      vi.useRealTimers();
      const validateFn = vi.fn().mockResolvedValue(true);
      const checker = createChecker({ validateFn, intervalMs: 60_000 });

      checker.start();
      // Wait for the immediate async check to complete
      await new Promise((r) => setTimeout(r, 50));

      expect(validateFn).toHaveBeenCalledOnce();
      checker.stop();
    });

    it('should not start twice', () => {
      const checker = createChecker();
      checker.start();
      checker.start(); // no-op
      checker.stop();
    });

    it('should stop cleanly', () => {
      const checker = createChecker();
      checker.start();
      checker.stop();
      checker.stop(); // no-op
    });
  });
});
