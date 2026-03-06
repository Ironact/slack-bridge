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
  const gatewayUrl = 'https://openclaw.example.com';
  const gatewayToken = 'test-token-123';
  const botUserId = 'U_BOT';
  let logger: ReturnType<typeof createLogger>;
  let connector: OpenClawConnector;

  beforeEach(() => {
    logger = createLogger();
    connector = new OpenClawConnector({ gatewayUrl, gatewayToken, botUserId, logger });
    vi.restoreAllMocks();
  });

  it('should forward DM messages to OpenClaw gateway', async () => {
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
    expect(url).toBe(`${gatewayUrl}/api/v1/gateway/system-event`);
    expect(opts?.method).toBe('POST');
    expect(opts?.headers).toMatchObject({
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${gatewayToken}`,
    });

    const body = JSON.parse(opts?.body as string);
    expect(body.type).toBe('system_event');
    expect(body.data.channel).toBe('D12345');
    expect(body.data.channelType).toBe('dm');
    expect(body.data.text).toBe('hello bot');
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
    expect(body.data.channelType).toBe('channel');
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

  it('should log error when fetch throws', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network error'));

    const event: SlackRTMEvent = {
      type: 'message',
      channel: 'D12345',
      user: 'U_USER',
      text: 'hello',
      ts: '123',
    };

    await connector.forwardEvent(event);

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'network error' }),
      'Failed to forward event to OpenClaw',
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
    expect(body.data.threadTs).toBe('1234567890.000001');
  });
});
