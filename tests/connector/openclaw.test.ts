import type { Logger } from '../../src/config/logger.js';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OpenClawConnector } from '../../src/connector/openclaw.js';
import type { SlackRTMEvent } from '../../src/receiver/types.js';

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

describe('OpenClawConnector', () => {
  const gatewayUrl = 'wss://openclaw.example.com';
  const gatewayToken = 'test-token-123';
  const bridgeToken = 'bridge-token-456';
  const botUserId = 'U_BOT';
  let logger: ReturnType<typeof createLogger>;
  let connector: OpenClawConnector;

  beforeEach(() => {
    logger = createLogger();
    connector = new OpenClawConnector({
      gatewayUrl,
      gatewayToken,
      botUserId,
      logger,
      bridgeToken,
      webhookPath: '/webhook/slack-bridge',
    });
    vi.restoreAllMocks();
  });

  it('should forward DM messages to OpenClaw gateway webhook', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );

    const event: SlackRTMEvent = {
      type: 'message',
      channel: 'D12345',
      user: 'U_USER',
      text: 'hello bot',
      ts: '1234567890.123456',
    };

    await connector.forwardEvent(event);

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, opts] = fetchSpy.mock.calls[0]!;
    // ws:// should be converted to http://, wss:// to https://
    expect(url).toBe('https://openclaw.example.com/webhook/slack-bridge');
    expect(opts?.method).toBe('POST');
    expect(opts?.headers).toMatchObject({
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${bridgeToken}`,
    });

    const body = JSON.parse(opts?.body as string);
    expect(body.type).toBe('message');
    expect(body.channel).toEqual({ id: 'D12345' });
    expect(body.user).toEqual({ id: 'U_USER' });
    expect(body.message.text).toBe('hello bot');
    expect(body.isDM).toBe(true);
    expect(body.mentioned).toBe(false);
    expect(logger.info).toHaveBeenCalled();
  });

  it('should forward messages where bot is @mentioned', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );

    const event: SlackRTMEvent = {
      type: 'message',
      channel: 'C12345',
      user: 'U_USER',
      text: `Hey <@${botUserId}> what's up?`,
      ts: '1234567890.123456',
    };

    await connector.forwardEvent(event);

    expect(fetchSpy).toHaveBeenCalledOnce();
    const body = JSON.parse(fetchSpy.mock.calls[0]![1]?.body as string);
    expect(body.isDM).toBe(false);
    expect(body.mentioned).toBe(true);
  });

  it('should ignore messages in channels without @mention', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('', { status: 200 }),
    );

    const event: SlackRTMEvent = {
      type: 'message',
      channel: 'C12345',
      user: 'U_USER',
      text: 'just chatting',
      ts: '1234567890.123456',
    };

    await connector.forwardEvent(event);

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('should ignore non-message events', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('', { status: 200 }),
    );

    const event: SlackRTMEvent = {
      type: 'reaction_added',
      user: 'U_USER',
      reaction: 'thumbsup',
      item: { type: 'message', channel: 'C12345', ts: '123' },
      event_ts: '123',
    };

    await connector.forwardEvent(event);

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('should ignore message subtypes', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('', { status: 200 }),
    );

    const event: SlackRTMEvent = {
      type: 'message',
      subtype: 'message_changed',
      channel: 'D12345',
      user: 'U_USER',
      text: 'edited',
      ts: '123',
    };

    await connector.forwardEvent(event);

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('should log error when gateway returns non-ok status', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('bad request', { status: 400 }),
    );

    const event: SlackRTMEvent = {
      type: 'message',
      channel: 'D12345',
      user: 'U_USER',
      text: 'hello',
      ts: '123',
    };

    await connector.forwardEvent(event);

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ status: 400 }),
      'OpenClaw gateway rejected event',
    );
  });

  it('should log error when fetch throws (with retries)', async () => {
    vi.useFakeTimers();
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network error'));

    const event: SlackRTMEvent = {
      type: 'message',
      channel: 'D12345',
      user: 'U_USER',
      text: 'hello',
      ts: '123',
    };

    const promise = connector.forwardEvent(event);
    // Fast-forward through retry delays
    await vi.advanceTimersByTimeAsync(10_000);
    await promise;

    vi.useRealTimers();

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'network error' }),
      'Failed to forward event to OpenClaw (all retries exhausted)',
    );
  });

  it('should include threadTs in payload when present', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );

    const event: SlackRTMEvent = {
      type: 'message',
      channel: 'D12345',
      user: 'U_USER',
      text: 'reply in thread',
      ts: '1234567890.123456',
      threadTs: '1234567890.000001',
    };

    await connector.forwardEvent(event);

    const body = JSON.parse(fetchSpy.mock.calls[0]![1]?.body as string);
    expect(body.message.threadTs).toBe('1234567890.000001');
  });

  it('should convert ws:// to http:// in gateway URL', async () => {
    const wsConnector = new OpenClawConnector({
      gatewayUrl: 'ws://127.0.0.1:18789',
      gatewayToken: 'token',
      botUserId: 'U_BOT',
      logger,
    });

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );

    await wsConnector.forwardEvent({
      type: 'message',
      channel: 'D12345',
      user: 'U_USER',
      text: 'test',
      ts: '123',
    });

    const [url] = fetchSpy.mock.calls[0]!;
    expect(url).toBe('http://127.0.0.1:18789/webhook/slack-bridge');
  });

  it('should fall back to gatewayToken when bridgeToken not provided', async () => {
    const fallbackConnector = new OpenClawConnector({
      gatewayUrl: 'ws://127.0.0.1:18789',
      gatewayToken: 'my-gateway-token',
      botUserId: 'U_BOT',
      logger,
    });

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );

    await fallbackConnector.forwardEvent({
      type: 'message',
      channel: 'D12345',
      user: 'U_USER',
      text: 'test',
      ts: '123',
    });

    const [, opts] = fetchSpy.mock.calls[0]!;
    expect(opts?.headers).toMatchObject({
      'Authorization': 'Bearer my-gateway-token',
    });
  });
});
