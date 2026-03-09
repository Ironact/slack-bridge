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
}

export class OpenClawConnector {
  private readonly gatewayUrl: string;
  private readonly gatewayToken: string;
  private readonly botUserId: string;
  private readonly logger: Logger;
  private readonly webhookPath: string;
  private readonly bridgeToken: string;

  constructor(deps: OpenClawConnectorDeps) {
    this.gatewayUrl = deps.gatewayUrl;
    this.gatewayToken = deps.gatewayToken;
    this.botUserId = deps.botUserId;
    this.logger = deps.logger;
    this.webhookPath = deps.webhookPath ?? '/webhook/slack-bridge';
    this.bridgeToken = deps.bridgeToken ?? deps.gatewayToken;
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

  async forwardEvent(event: SlackRTMEvent): Promise<void> {
    if (event.type !== 'message') return;

    const msg = event as SlackMessageEvent;

    // Skip subtypes (edits, deletes, bot messages, etc.)
    if (msg.subtype) return;
    if (!msg.text || !msg.user || !msg.channel) return;

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

    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.bridgeToken}`,
        },
        body: JSON.stringify(payload),
      });

      if (!resp.ok) {
        const body = await resp.text();
        this.logger.error(
          { status: resp.status, body, channel: msg.channel },
          'OpenClaw gateway rejected event',
        );
        return;
      }

      this.logger.info(
        { channel: msg.channel, user: msg.user, isDM, mentioned: isMentioned },
        'Forwarded event to OpenClaw',
      );
    } catch (err) {
      this.logger.error(
        { error: err instanceof Error ? err.message : String(err), channel: msg.channel },
        'Failed to forward event to OpenClaw',
      );
    }
  }
}
