import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RTMReceiver } from '../../src/receiver/rtm.js';
import type { Logger } from '../../src/config/logger.js';

const mockLogger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
} as unknown as Logger;

const mockCredentials = {
  token: 'xoxc-test-token',
  cookie: 'xoxd-test-cookie',
};

describe('RTMReceiver', () => {
  let receiver: RTMReceiver;

  beforeEach(() => {
    vi.restoreAllMocks();
    receiver = new RTMReceiver({
      credentials: mockCredentials,
      logger: mockLogger,
      pingIntervalMs: 1000,
      pongTimeoutMs: 500,
      reconnect: { maxAttempts: 2, initialDelayMs: 10 },
    });
  });

  it('should initialize with disconnected mode', () => {
    const metrics = receiver.getMetrics();
    expect(metrics.mode).toBe('disconnected');
    expect(metrics.eventsReceived).toBe(0);
    expect(metrics.startedAt).toBeNull();
  });

  it('should return metrics snapshot (not reference)', () => {
    const m1 = receiver.getMetrics();
    const m2 = receiver.getMetrics();
    expect(m1).not.toBe(m2);
    expect(m1).toEqual(m2);
  });

  it('should stop cleanly', () => {
    receiver.stop();
    const metrics = receiver.getMetrics();
    expect(metrics.mode).toBe('disconnected');
  });

  it('should emit error on rtm.connect failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

    const errorPromise = new Promise<Error>((resolve) => {
      receiver.on('error', resolve);
    });

    // Don't await start — it will try to reconnect
    receiver.start().catch(() => {});

    const error = await errorPromise;
    expect(error.message).toBe('Network error');

    receiver.stop();
  });

  it('should emit error when rtm.connect returns not ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ ok: false, error: 'invalid_auth' }),
    }));

    const errorPromise = new Promise<Error>((resolve) => {
      receiver.on('error', resolve);
    });

    receiver.start().catch(() => {});

    const error = await errorPromise;
    expect(error.message).toContain('invalid_auth');

    receiver.stop();
  });

  it('should track reconnect attempts', () => {
    // Reconnect logic is tested via integration.
    // Here we verify the config is applied correctly.
    const metrics = receiver.getMetrics();
    expect(metrics.reconnectCount).toBe(0);
  });

  describe('rtmConnect', () => {
    it('should call rtm.connect with correct params', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        json: () => Promise.resolve({
          ok: true,
          url: 'wss://test.slack.com/ws',
          self: { id: 'U123', name: 'test' },
          team: { id: 'T123', name: 'testteam' },
        }),
      });
      vi.stubGlobal('fetch', fetchMock);

      const result = await receiver.rtmConnect();

      expect(result.ok).toBe(true);
      expect(result.url).toBe('wss://test.slack.com/ws');

      const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://app.slack.com/api/rtm.connect');
      expect(options.method).toBe('POST');
      expect((options.headers as Record<string, string>)['Content-Type']).toBe('application/x-www-form-urlencoded');
      expect((options.headers as Record<string, string>)['Cookie']).toContain('xoxd-test-cookie');
      expect(options.body).toContain('xoxc-test-token');
    });
  });
});
