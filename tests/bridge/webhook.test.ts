import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateSignature, verifySignature, deliverWebhook } from '../../src/bridge/webhook.js';
import type { BridgeEvent } from '../../src/bridge/types.js';
import type { Logger } from '../../src/config/logger.js';

const mockLogger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
} as unknown as Logger;

const mockEvent: BridgeEvent = {
  id: 'test-event-001',
  type: 'message',
  timestamp: new Date().toISOString(),
  workspace: { id: 'T123', name: 'test-workspace' },
  channel: { id: 'C123', name: 'general', type: 'channel' },
  user: { id: 'U123', name: 'testuser', displayName: 'Test User', isBot: false },
  message: { ts: '1234567890.000000', text: 'Hello world' },
  raw: {},
};

describe('generateSignature', () => {
  it('should generate a sha256 HMAC signature', () => {
    const sig = generateSignature('my-secret', '1234567890', '{"test":true}');
    expect(sig).toMatch(/^sha256=[a-f0-9]{64}$/);
  });

  it('should generate consistent signatures for same input', () => {
    const sig1 = generateSignature('secret', '123', 'body');
    const sig2 = generateSignature('secret', '123', 'body');
    expect(sig1).toBe(sig2);
  });

  it('should generate different signatures for different secrets', () => {
    const sig1 = generateSignature('secret1', '123', 'body');
    const sig2 = generateSignature('secret2', '123', 'body');
    expect(sig1).not.toBe(sig2);
  });

  it('should generate different signatures for different timestamps', () => {
    const sig1 = generateSignature('secret', '111', 'body');
    const sig2 = generateSignature('secret', '222', 'body');
    expect(sig1).not.toBe(sig2);
  });

  it('should generate different signatures for different bodies', () => {
    const sig1 = generateSignature('secret', '123', 'body1');
    const sig2 = generateSignature('secret', '123', 'body2');
    expect(sig1).not.toBe(sig2);
  });
});

describe('verifySignature', () => {
  it('should return true for valid signature', () => {
    const sig = generateSignature('secret', '123', 'body');
    expect(verifySignature('secret', '123', 'body', sig)).toBe(true);
  });

  it('should return false for invalid signature', () => {
    expect(verifySignature('secret', '123', 'body', 'sha256=invalid')).toBe(false);
  });

  it('should return false for wrong secret', () => {
    const sig = generateSignature('secret1', '123', 'body');
    expect(verifySignature('secret2', '123', 'body', sig)).toBe(false);
  });

  it('should return false for tampered body', () => {
    const sig = generateSignature('secret', '123', 'original');
    expect(verifySignature('secret', '123', 'tampered', sig)).toBe(false);
  });

  it('should return false for different length signatures', () => {
    expect(verifySignature('secret', '123', 'body', 'sha256=short')).toBe(false);
  });
});

describe('deliverWebhook', () => {
  const config = {
    url: 'https://example.com/webhook',
    secret: 'test-secret-key-1234',
    maxRetries: 3,
    retryBaseDelayMs: 10, // Fast for tests
    timeoutMs: 1000,
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should deliver successfully on 200', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
    }));

    const result = await deliverWebhook(config, mockEvent, mockLogger);
    expect(result.success).toBe(true);
    expect(result.statusCode).toBe(200);
    expect(result.attempts).toBe(1);
  });

  it('should retry on 500 and eventually succeed', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({ ok: true, status: 200 });

    vi.stubGlobal('fetch', fetchMock);

    const result = await deliverWebhook(config, mockEvent, mockLogger);
    expect(result.success).toBe(true);
    expect(result.attempts).toBe(2);
  });

  it('should not retry on 400', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
    }));

    const result = await deliverWebhook(config, mockEvent, mockLogger);
    expect(result.success).toBe(false);
    expect(result.statusCode).toBe(400);
    expect(result.attempts).toBe(1);
  });

  it('should fail after max retries on persistent 500', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    }));

    const result = await deliverWebhook(config, mockEvent, mockLogger);
    expect(result.success).toBe(false);
    expect(result.attempts).toBe(3);
    expect(result.error).toContain('500');
  });

  it('should handle network errors with retries', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

    const result = await deliverWebhook(config, mockEvent, mockLogger);
    expect(result.success).toBe(false);
    expect(result.attempts).toBe(3);
    expect(result.error).toBe('Network error');
  });

  it('should include correct headers in request', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);

    await deliverWebhook(config, mockEvent, mockLogger);

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(config.url);
    expect((options.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    expect((options.headers as Record<string, string>)['X-Bridge-Event']).toBe('message');
    expect((options.headers as Record<string, string>)['X-Bridge-Signature']).toMatch(/^sha256=/);
    expect((options.headers as Record<string, string>)['X-Bridge-Timestamp']).toBeDefined();
  });
});
