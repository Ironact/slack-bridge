import type { Logger } from '../config/logger.js';
import type { SlackRTMEvent, SlackMessageEvent } from '../receiver/types.js';

export interface OpenClawConnectorDeps {
  gatewayUrl: string;
  gatewayToken: string;
  botUserId: string;
  logger: Logger;
  /** Webhook path on the gateway (default: /webhook/slack-bridge) */
  webhookPath?: string;
  /** Bridge token for webhook auth (if different from gatewayToken) */
  bridgeToken?: string;
  /** Max consecutive forward failures before alerting (default: 3) */
  maxConsecutiveFailures?: number;
}

export class OpenClawConnector {
  private readonly gatewayUrl: string;
  private readonly gatewayToken: string;
  private readonly botUserId: string;
  private readonly logger: Logger;
  private readonly webhookPath: string;
  private readonly bridgeToken: string;
  private readonly maxConsecutiveFailures: number;

  // Failure tracking
  private consecutiveFailures = 0;
  private lastSuccessAt: Date | null = null;
  private lastFailureAt: Date | null = null;
  private totalForwarded = 0;
  private totalFailed = 0;

  constructor(deps: OpenClawConnectorDeps) {
    this.gatewayUrl = deps.gatewayUrl;
    this.gatewayToken = deps.gatewayToken;
    this.botUserId = deps.botUserId;
    this.logger = deps.logger;
    this.webhookPath = deps.webhookPath ?? '/webhook/slack-bridge';
    this.bridgeToken = deps.bridgeToken ?? deps.gatewayToken;
    this.maxConsecutiveFailures = deps.maxConsecutiveFailures ?? 3;
  }

  /**
   * Build the HTTP base URL from the gateway URL.
   * Converts ws:// → http://, wss:// → https://
   */
  private getHttpBaseUrl(): string {
    return this.gatewayUrl
      .replace(/^wss:\/\//i, 'https://')
      .replace(/^ws:\/\//i, 'http://');
  }

  /** Get forwarding metrics for health endpoint */
  getMetrics() {
    return {
      consecutiveFailures: this.consecutiveFailures,
      lastSuccessAt: this.lastSuccessAt,
      lastFailureAt: this.lastFailureAt,
      totalForwarded: this.totalForwarded,
      totalFailed: this.totalFailed,
    };
  }

  async forwardEvent(event: SlackRTMEvent): Promise<void> {
    if (event.type !== 'message') return;

    const msg = event as SlackMessageEvent;

    // Skip subtypes (edits, deletes, bot messages, etc.)
    if (msg.subtype) return;
    if (!msg.text || !msg.user || !msg.channel) return;

    // Skip own messages to prevent echo loops
    if (msg.user === this.botUserId) return;

    // Only forward if bot is @mentioned or it's a DM
    const isDM = msg.channel.startsWith('D');
    const isMentioned = msg.text.includes(`<@${this.botUserId}>`);

    if (!isDM && !isMentioned) return;

    // Build InboundPayload matching the gateway plugin's expected format
    const payload = {
      type: 'message',
      channel: { id: msg.channel },
      user: { id: msg.user },
      message: {
        ts: msg.ts,
        text: msg.text,
        threadTs: msg.threadTs ?? null,
      },
      mentioned: isMentioned,
      isDM,
    };

    const url = `${this.getHttpBaseUrl()}${this.webhookPath}`;

    // Retry up to 2 times on transient failures
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const resp = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.bridgeToken}`,
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(10_000), // 10s timeout
        });

        if (!resp.ok) {
          const body = await resp.text();

          // Auth failure — likely token expired, no point retrying
          if (resp.status === 401 || resp.status === 403) {
            this.consecutiveFailures++;
            this.totalFailed++;
            this.lastFailureAt = new Date();
            this.logger.error(
              { status: resp.status, body, channel: msg.channel, consecutiveFailures: this.consecutiveFailures },
              'OpenClaw gateway auth rejected — bridge token may be invalid',
            );
            return;
          }

          this.logger.error(
            { status: resp.status, body, channel: msg.channel, attempt },
            'OpenClaw gateway rejected event',
          );

          // Retry on 5xx
          if (resp.status >= 500 && attempt < 2) {
            await this.delay(1000 * (attempt + 1));
            continue;
          }

          this.consecutiveFailures++;
          this.totalFailed++;
          this.lastFailureAt = new Date();
          return;
        }

        // Success — reset failure counter
        this.consecutiveFailures = 0;
        this.totalForwarded++;
        this.lastSuccessAt = new Date();

        this.logger.info(
          { channel: msg.channel, user: msg.user, isDM, mentioned: isMentioned },
          'Forwarded event to OpenClaw',
        );
        return;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);

        if (attempt < 2) {
          this.logger.warn(
            { error: errorMsg, channel: msg.channel, attempt },
            'Forward attempt failed, retrying...',
          );
          await this.delay(1000 * (attempt + 1));
          continue;
        }

        this.consecutiveFailures++;
        this.totalFailed++;
        this.lastFailureAt = new Date();

        this.logger.error(
          { error: errorMsg, channel: msg.channel, consecutiveFailures: this.consecutiveFailures },
          'Failed to forward event to OpenClaw (all retries exhausted)',
        );

        // Alert on sustained failures
        if (this.consecutiveFailures >= this.maxConsecutiveFailures) {
          this.logger.fatal(
            { consecutiveFailures: this.consecutiveFailures, lastSuccessAt: this.lastSuccessAt?.toISOString() },
            '⚠️ ALERT: Multiple consecutive forwarding failures — gateway may be unreachable',
          );
        }
      }
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
