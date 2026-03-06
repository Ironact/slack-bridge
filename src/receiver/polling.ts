import { EventEmitter } from 'node:events';
import type { Logger } from '../config/logger.js';
import type { SlackClientWrapper } from '../client/slack-client.js';
import type {
  SlackRTMEvent,
  SlackMessageEvent,
  ReceiverMetrics,
  ReconnectConfig,
} from './types.js';
import { DEFAULT_RECONNECT_CONFIG } from './types.js';

export interface PollingReceiverConfig {
  client: SlackClientWrapper;
  logger: Logger;
  pollIntervalMs?: number;
  channels?: string[]; // Optional list of channels to monitor
  reconnect?: Partial<ReconnectConfig>;
}

/**
 * Polling-based event receiver fallback.
 *
 * Uses conversations.history to poll for new messages when RTM is unavailable.
 * This is a minimal implementation that provides the same interface as RTMReceiver.
 *
 * Events emitted:
 * - 'slack_event' (event: SlackRTMEvent) — all Slack events
 * - 'connected' () — polling started
 * - 'disconnected' (reason: string) — polling stopped
 * - 'error' (error: Error) — polling error
 * - 'fallback' () — (not applicable for polling mode)
 */
export class PollingReceiver extends EventEmitter {
  private readonly logger: Logger;
  private readonly client: SlackClientWrapper;
  private readonly pollIntervalMs: number;
  private readonly channels: string[];
  private readonly reconnectConfig: ReconnectConfig;

  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private stopped = false;
  private lastMessageTimestamps = new Map<string, string>();

  private readonly metrics: ReceiverMetrics = {
    mode: 'polling',
    startedAt: null,
    eventsReceived: 0,
    lastEventAt: null,
    reconnectCount: 0,
    wsConnectedAt: null, // Not applicable for polling
    lastPingAt: null,    // Not applicable for polling
    lastPongAt: null,    // Not applicable for polling
  };

  constructor(config: PollingReceiverConfig) {
    super();
    this.logger = config.logger;
    this.client = config.client;
    this.pollIntervalMs = config.pollIntervalMs ?? 5_000; // Default 5 seconds
    this.channels = config.channels ?? [];
    this.reconnectConfig = {
      ...DEFAULT_RECONNECT_CONFIG,
      ...config.reconnect,
    };
  }

  /**
   * Start polling for events.
   */
  async start(): Promise<void> {
    this.stopped = false;
    this.metrics.startedAt = new Date();
    this.logger.info({ pollIntervalMs: this.pollIntervalMs }, 'Starting polling receiver');

    // Initialize last message timestamps for monitored channels
    await this.initializeChannels();

    this.pollTimer = setInterval(() => {
      void this.poll();
    }, this.pollIntervalMs);

    this.emit('connected');
  }

  /**
   * Stop polling.
   */
  stop(): void {
    this.stopped = true;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.metrics.mode = 'disconnected';
    this.logger.info('Polling receiver stopped');
    this.emit('disconnected', 'stopped');
  }

  getMetrics(): ReceiverMetrics {
    return { ...this.metrics };
  }

  /**
   * Add a channel to monitor.
   */
  addChannel(channelId: string): void {
    if (!this.channels.includes(channelId)) {
      this.channels.push(channelId);
      this.logger.debug({ channelId }, 'Added channel to polling list');
    }
  }

  /**
   * Remove a channel from monitoring.
   */
  removeChannel(channelId: string): void {
    const index = this.channels.indexOf(channelId);
    if (index > -1) {
      this.channels.splice(index, 1);
      this.lastMessageTimestamps.delete(channelId);
      this.logger.debug({ channelId }, 'Removed channel from polling list');
    }
  }

  private async initializeChannels(): Promise<void> {
    for (const channelId of this.channels) {
      try {
        // Get the most recent message timestamp for this channel
        const messages = await this.client.getHistory(channelId, 1);
        if (messages.length > 0) {
          const latestMessage = messages[0] as unknown as SlackMessageEvent;
          if (latestMessage.ts) {
            this.lastMessageTimestamps.set(channelId, latestMessage.ts);
          }
        }
      } catch (error) {
        this.logger.warn({ channelId, error }, 'Failed to initialize channel timestamp');
      }
    }
    this.logger.debug(`Initialized timestamps for ${this.lastMessageTimestamps.size} channels`);
  }

  private async poll(): Promise<void> {
    if (this.stopped) return;

    try {
      for (const channelId of this.channels) {
        await this.pollChannel(channelId);
      }
    } catch (error) {
      this.logger.error({ error }, 'Polling error');
      this.emit('error', error instanceof Error ? error : new Error(String(error)));
    }
  }

  private async pollChannel(channelId: string): Promise<void> {
    try {
      const lastTs = this.lastMessageTimestamps.get(channelId);
      const messages = await this.client.getHistory(
        channelId,
        50,
        lastTs // Only get messages newer than last seen
      );

      if (messages.length === 0) return;

      // Process messages in chronological order (oldest first)
      const sortedMessages = messages
        .map(msg => msg as unknown as SlackMessageEvent)
        .filter(msg => msg.ts && msg.type && msg.channel)
        .sort((a, b) => parseFloat(a.ts) - parseFloat(b.ts));

      for (const message of sortedMessages) {
        // Skip if we've already seen this message
        if (lastTs && parseFloat(message.ts) <= parseFloat(lastTs)) {
          continue;
        }

        // Emit the message event
        this.emit('slack_event', message as SlackRTMEvent);
        this.metrics.eventsReceived++;
        this.metrics.lastEventAt = new Date();

        // Update last seen timestamp
        this.lastMessageTimestamps.set(channelId, message.ts);
      }
    } catch (error) {
      this.logger.warn({ channelId, error }, 'Failed to poll channel');
    }
  }
}