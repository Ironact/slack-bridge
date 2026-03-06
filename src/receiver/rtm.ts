import { EventEmitter } from 'node:events';
import WebSocket from 'ws';
import type { Logger } from '../config/logger.js';
import type { SlackCredentials } from '../client/types.js';
import type { SlackClientWrapper } from '../client/slack-client.js';
import type {
  SlackRTMEvent,
  ReceiverMetrics,
  ReconnectConfig,
} from './types.js';
import { DEFAULT_RECONNECT_CONFIG, getReconnectDelay } from './types.js';

export interface RTMReceiverConfig {
  credentials: SlackCredentials;
  client: SlackClientWrapper;
  logger: Logger;
  pingIntervalMs?: number;
  pongTimeoutMs?: number;
  reconnect?: Partial<ReconnectConfig>;
}

export interface RTMConnectResponse {
  ok: boolean;
  url?: string;
  self?: { id: string; name: string };
  team?: { id: string; name: string };
  error?: string;
}

/**
 * RTM WebSocket event receiver.
 *
 * Connects to Slack's RTM API, receives real-time events,
 * and emits them for the bridge to forward to AI agents.
 *
 * Events emitted:
 * - 'slack_event' (event: SlackRTMEvent) — all Slack events
 * - 'connected' () — WebSocket connected
 * - 'disconnected' (reason: string) — WebSocket disconnected
 * - 'error' (error: Error) — connection error
 * - 'fallback' () — max reconnect attempts reached
 */
export class RTMReceiver extends EventEmitter {
  private readonly logger: Logger;
  private readonly credentials: SlackCredentials;
  private readonly client: SlackClientWrapper;
  private readonly pingIntervalMs: number;
  private readonly pongTimeoutMs: number;
  private readonly reconnectConfig: ReconnectConfig;

  private ws: WebSocket | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private pongTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private stopped = false;

  private readonly metrics: ReceiverMetrics = {
    mode: 'disconnected',
    startedAt: null,
    eventsReceived: 0,
    lastEventAt: null,
    reconnectCount: 0,
    wsConnectedAt: null,
    lastPingAt: null,
    lastPongAt: null,
  };

  constructor(config: RTMReceiverConfig) {
    super();
    this.logger = config.logger;
    this.credentials = config.credentials;
    this.client = config.client;
    this.pingIntervalMs = config.pingIntervalMs ?? 30_000;
    this.pongTimeoutMs = config.pongTimeoutMs ?? 10_000;
    this.reconnectConfig = {
      ...DEFAULT_RECONNECT_CONFIG,
      ...config.reconnect,
    };
  }

  /**
   * Connect to Slack RTM and start receiving events.
   */
  async start(): Promise<void> {
    this.stopped = false;
    this.metrics.startedAt = new Date();
    await this.connect();
  }

  /**
   * Gracefully stop the receiver.
   */
  stop(): void {
    this.stopped = true;
    this.cleanup();
    this.metrics.mode = 'disconnected';
    this.logger.info('RTM receiver stopped');
  }

  getMetrics(): ReceiverMetrics {
    return { ...this.metrics };
  }

  /**
   * Call rtm.connect to get a WebSocket URL.
   */
  async rtmConnect(): Promise<RTMConnectResponse> {
    const result = await this.client.raw.apiCall('rtm.connect');
    return result as RTMConnectResponse;
  }

  private async connect(): Promise<void> {
    try {
      this.logger.info('Connecting to Slack RTM...');
      const data = await this.rtmConnect();

      if (!data.ok || !data.url) {
        throw new Error(`rtm.connect failed: ${data.error ?? 'no url'}`);
      }

      this.logger.info(
        { self: data.self?.name, team: data.team?.name },
        'RTM connect successful',
      );

      this.setupWebSocket(data.url);
    } catch (err) {
      this.logger.error({ error: err instanceof Error ? err.message : String(err) }, 'RTM connect error');
      this.emit('error', err instanceof Error ? err : new Error(String(err)));
      await this.scheduleReconnect();
    }
  }

  private setupWebSocket(url: string): void {
    this.ws = new WebSocket(url);

    this.ws.on('open', () => {
      this.logger.info('WebSocket connected');
      this.metrics.mode = 'rtm';
      this.metrics.wsConnectedAt = new Date();
      this.reconnectAttempt = 0;
      this.startPing();
      this.emit('connected');
    });

    this.ws.on('message', (raw: WebSocket.RawData) => {
      try {
        const event = JSON.parse(raw.toString()) as SlackRTMEvent;
        this.handleEvent(event);
      } catch (err) {
        this.logger.warn({ error: String(err) }, 'Failed to parse RTM event');
      }
    });

    this.ws.on('close', (code: number, reason: Buffer) => {
      const reasonStr = reason?.toString() ?? `code ${code}`;
      this.logger.warn({ code, reason: reasonStr }, 'WebSocket closed');
      this.cleanup();
      this.emit('disconnected', reasonStr);

      if (!this.stopped) {
        this.scheduleReconnect();
      }
    });

    this.ws.on('error', (err: Error) => {
      this.logger.error({ error: err.message }, 'WebSocket error');
      this.emit('error', err);
    });
  }

  private handleEvent(event: SlackRTMEvent): void {
    this.metrics.eventsReceived++;
    this.metrics.lastEventAt = new Date();

    switch (event.type) {
      case 'hello':
        this.logger.debug('Received hello from Slack');
        break;

      case 'pong':
        this.metrics.lastPongAt = new Date();
        this.clearPongTimeout();
        break;

      default:
        // Forward all other events
        this.emit('slack_event', event);
        break;
    }
  }

  private startPing(): void {
    this.stopPing();
    this.pingTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        const id = Date.now();
        this.ws.send(JSON.stringify({ type: 'ping', id }));
        this.metrics.lastPingAt = new Date();

        // Set pong timeout
        this.pongTimer = setTimeout(() => {
          this.logger.warn('Pong timeout — forcing reconnect');
          this.ws?.close();
        }, this.pongTimeoutMs);
      }
    }, this.pingIntervalMs);
  }

  private stopPing(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    this.clearPongTimeout();
  }

  private clearPongTimeout(): void {
    if (this.pongTimer) {
      clearTimeout(this.pongTimer);
      this.pongTimer = null;
    }
  }

  private async scheduleReconnect(): Promise<void> {
    if (this.stopped) return;

    if (this.reconnectAttempt >= this.reconnectConfig.maxAttempts) {
      this.logger.error('Max reconnect attempts reached — switching to fallback');
      this.metrics.mode = 'disconnected';
      this.emit('fallback');
      return;
    }

    const delay = getReconnectDelay(this.reconnectAttempt, this.reconnectConfig);
    this.reconnectAttempt++;
    this.metrics.reconnectCount++;

    this.logger.info(
      { attempt: this.reconnectAttempt, delayMs: Math.round(delay) },
      'Scheduling reconnect',
    );

    await new Promise((resolve) => setTimeout(resolve, delay));

    if (!this.stopped) {
      await this.connect();
    }
  }

  private cleanup(): void {
    this.stopPing();
    if (this.ws) {
      this.ws.removeAllListeners();
      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        this.ws.close();
      }
      this.ws = null;
    }
  }
}
