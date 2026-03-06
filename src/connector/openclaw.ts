import type { Logger } from '../config/logger.js';
import type { SlackRTMEvent, SlackMessageEvent } from '../receiver/types.js';

export interface OpenClawConnectorDeps {
  gatewayUrl: string;
  gatewayToken: string;
  botUserId: string;
  logger: Logger;
}

export class OpenClawConnector {
  private readonly gatewayUrl: string;
  private readonly gatewayToken: string;
  private readonly botUserId: string;
  private readonly logger: Logger;

  constructor(deps: OpenClawConnectorDeps) {
    this.gatewayUrl = deps.gatewayUrl;
    this.gatewayToken = deps.gatewayToken;
    this.botUserId = deps.botUserId;
    this.logger = deps.logger;
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

    const systemText = `[Slack] <@${msg.user}> in <#${msg.channel}>: ${msg.text}`;

    const payload = {
      type: 'system_event',
      data: {
        channel: msg.channel,
        channelType: isDM ? 'dm' : 'channel',
        user: msg.user,
        text: msg.text,
        ts: msg.ts,
        threadTs: msg.threadTs,
        systemText,
      },
    };

    const url = `${this.gatewayUrl}/api/v1/gateway/system-event`;

    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.gatewayToken}`,
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
        { channel: msg.channel, user: msg.user, isDM },
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
