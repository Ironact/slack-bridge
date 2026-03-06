import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { createBridgeServer } from '../../src/bridge/server.js';
import type { SlackOperations } from '../../src/bridge/server.js';
import type { Logger } from '../../src/config/logger.js';
import type { Env } from '../../src/config/env.js';

const mockLogger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
} as unknown as Logger;

const mockEnv = {
  PORT: 0, // Random port
  HOST: '127.0.0.1',
  NODE_ENV: 'test',
  LOG_LEVEL: 'info',
  SESSION_DIR: './data/sessions',
  RATE_LIMIT_MESSAGES_PER_SEC: 1,
  RATE_LIMIT_API_PER_MIN: 40,
  AUTH_VALIDATION_INTERVAL_MS: 300000,
  BROWSER_HEADLESS: true,
  BROWSER_TIMEOUT_MS: 60000,
  WEBHOOK_SECRET: 'test-secret-1234567',
} as Env;

const mockSlack: SlackOperations = {
  sendMessage: vi.fn().mockResolvedValue({ ok: true, data: { ts: '123.456' } }),
  updateMessage: vi.fn().mockResolvedValue({ ok: true }),
  deleteMessage: vi.fn().mockResolvedValue({ ok: true }),
  getHistory: vi.fn().mockResolvedValue({ ok: true, data: { messages: [] } }),
  getThread: vi.fn().mockResolvedValue({ ok: true, data: { messages: [] } }),
  addReaction: vi.fn().mockResolvedValue({ ok: true }),
  removeReaction: vi.fn().mockResolvedValue({ ok: true }),
};

const app = createBridgeServer({ env: mockEnv, logger: mockLogger, slack: mockSlack });

beforeAll(async () => {
  await app.listen({ port: 0 });
});

afterAll(async () => {
  await app.close();
});

function getBaseUrl(): string {
  const address = app.server.address();
  if (typeof address === 'string') return address;
  return `http://127.0.0.1:${address?.port}`;
}

function authHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${mockEnv.WEBHOOK_SECRET}`,
  };
}

describe('Bridge Server', () => {
  describe('GET /api/v1/health', () => {
    it('should return health without auth', async () => {
      const res = await fetch(`${getBaseUrl()}/api/v1/health`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe('healthy');
      expect(typeof body.uptime).toBe('number');
      expect(body.eventsProcessed).toBe(0);
    });
  });

  describe('Auth middleware', () => {
    it('should reject requests without auth header', async () => {
      const res = await fetch(`${getBaseUrl()}/api/v1/messages/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: 'C123', text: 'hi' }),
      });
      expect(res.status).toBe(401);
    });

    it('should reject requests with invalid token', async () => {
      const res = await fetch(`${getBaseUrl()}/api/v1/messages/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer wrong-token',
        },
        body: JSON.stringify({ channel: 'C123', text: 'hi' }),
      });
      expect(res.status).toBe(403);
    });
  });

  describe('POST /api/v1/messages/send', () => {
    it('should send a message', async () => {
      const res = await fetch(`${getBaseUrl()}/api/v1/messages/send`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ channel: 'C123', text: 'Hello!' }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(mockSlack.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ channel: 'C123', text: 'Hello!' }),
      );
    });

    it('should reject invalid payload', async () => {
      const res = await fetch(`${getBaseUrl()}/api/v1/messages/send`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ channel: '' }),
      });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/v1/messages/update', () => {
    it('should update a message', async () => {
      const res = await fetch(`${getBaseUrl()}/api/v1/messages/update`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ channel: 'C123', ts: '123.456', text: 'Updated' }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
    });
  });

  describe('POST /api/v1/messages/delete', () => {
    it('should delete a message', async () => {
      const res = await fetch(`${getBaseUrl()}/api/v1/messages/delete`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ channel: 'C123', ts: '123.456' }),
      });
      expect(res.status).toBe(200);
    });
  });

  describe('GET /api/v1/messages/history', () => {
    it('should get channel history', async () => {
      const res = await fetch(
        `${getBaseUrl()}/api/v1/messages/history?channel=C123&limit=10`,
        { headers: authHeaders() },
      );
      expect(res.status).toBe(200);
      expect(mockSlack.getHistory).toHaveBeenCalled();
    });

    it('should reject missing channel', async () => {
      const res = await fetch(
        `${getBaseUrl()}/api/v1/messages/history?limit=10`,
        { headers: authHeaders() },
      );
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/v1/messages/thread', () => {
    it('should get thread replies', async () => {
      const res = await fetch(
        `${getBaseUrl()}/api/v1/messages/thread?channel=C123&ts=123.456`,
        { headers: authHeaders() },
      );
      expect(res.status).toBe(200);
      expect(mockSlack.getThread).toHaveBeenCalled();
    });
  });

  describe('POST /api/v1/reactions/add', () => {
    it('should add a reaction', async () => {
      const res = await fetch(`${getBaseUrl()}/api/v1/reactions/add`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ channel: 'C123', ts: '123.456', emoji: 'thumbsup' }),
      });
      expect(res.status).toBe(200);
      expect(mockSlack.addReaction).toHaveBeenCalled();
    });
  });

  describe('POST /api/v1/reactions/remove', () => {
    it('should remove a reaction', async () => {
      const res = await fetch(`${getBaseUrl()}/api/v1/reactions/remove`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ channel: 'C123', ts: '123.456', emoji: 'thumbsup' }),
      });
      expect(res.status).toBe(200);
      expect(mockSlack.removeReaction).toHaveBeenCalled();
    });
  });
});

describe('Bridge Server without Slack client', () => {
  it('should return 503 when slack is not connected', async () => {
    const noSlackApp = createBridgeServer({ env: mockEnv, logger: mockLogger });
    await noSlackApp.listen({ port: 0 });

    const address = noSlackApp.server.address();
    const port = typeof address === 'string' ? 0 : address?.port;
    const res = await fetch(`http://127.0.0.1:${port}/api/v1/messages/send`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ channel: 'C123', text: 'Hello' }),
    });

    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toContain('not connected');

    await noSlackApp.close();
  });
});
