import type { Logger } from '../../src/config/logger.js';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { registerOutboundRoutes } from '../../src/connector/outbound.js';
import type { SlackOperations } from '../../src/bridge/server.js';

function createLogger() {
  return {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
    trace: vi.fn(),
    child: vi.fn(),
    level: 'info',
  } as unknown as Logger;
}

function createMockSlack(): SlackOperations {
  return {
    sendMessage: vi.fn().mockResolvedValue({ ok: true, data: { ts: '123' } }),
    updateMessage: vi.fn().mockResolvedValue({ ok: true }),
    deleteMessage: vi.fn().mockResolvedValue({ ok: true }),
    getHistory: vi.fn().mockResolvedValue({ ok: true }),
    getThread: vi.fn().mockResolvedValue({ ok: true }),
    addReaction: vi.fn().mockResolvedValue({ ok: true }),
    removeReaction: vi.fn().mockResolvedValue({ ok: true }),
  };
}

describe('outbound handler', () => {
  const token = 'test-openclaw-token';
  let app: FastifyInstance;
  let slack: SlackOperations;
  let logger: ReturnType<typeof createLogger>;

  beforeEach(async () => {
    logger = createLogger();
    slack = createMockSlack();
    app = Fastify({ logger: false });
    registerOutboundRoutes(app, { token, logger, slack });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('should send a message via Slack when valid request is received', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/openclaw/reply',
      headers: { authorization: `Bearer ${token}` },
      payload: { channel: 'C12345', text: 'Hello from OpenClaw' },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.ok).toBe(true);
    expect(slack.sendMessage).toHaveBeenCalledWith({
      channel: 'C12345',
      text: 'Hello from OpenClaw',
      threadTs: undefined,
    });
  });

  it('should pass threadTs when provided', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/openclaw/reply',
      headers: { authorization: `Bearer ${token}` },
      payload: { channel: 'C12345', text: 'Thread reply', threadTs: '123.456' },
    });

    expect(response.statusCode).toBe(200);
    expect(slack.sendMessage).toHaveBeenCalledWith({
      channel: 'C12345',
      text: 'Thread reply',
      threadTs: '123.456',
    });
  });

  it('should return 401 without authorization header', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/openclaw/reply',
      payload: { channel: 'C12345', text: 'Hello' },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().ok).toBe(false);
  });

  it('should return 403 with wrong token', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/openclaw/reply',
      headers: { authorization: 'Bearer wrong-token' },
      payload: { channel: 'C12345', text: 'Hello' },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().ok).toBe(false);
  });

  it('should return 400 with invalid body', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/openclaw/reply',
      headers: { authorization: `Bearer ${token}` },
      payload: { channel: '', text: '' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().ok).toBe(false);
  });

  it('should return 400 when body is missing required fields', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/openclaw/reply',
      headers: { authorization: `Bearer ${token}` },
      payload: {},
    });

    expect(response.statusCode).toBe(400);
  });
});
