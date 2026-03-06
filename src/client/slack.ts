import { WebClient } from '@slack/web-api';
import type { Logger } from '../config/logger.js';
import { TTLCache } from './cache.js';
import { RateLimiter } from './rate-limiter.js';
import type {
  SlackCredentials,
  MessageResult,
  SlackMessage,
  SlackChannel,
  SlackUser,
  AuthResult,
} from './types.js';
import { isTokenDead } from './types.js';
/**
 * Bridge action result interface (duplicated to avoid cross-module dependency).
 * Will be unified when bridge module is merged.
 */
export interface ActionResult {
  ok: boolean;
  data?: unknown;
  error?: string;
}

export interface SlackClientConfig {
  credentials: SlackCredentials;
  logger: Logger;
  /** User cache TTL in ms (default: 1 hour) */
  userCacheTtlMs?: number;
  /** Channel cache TTL in ms (default: 30 min) */
  channelCacheTtlMs?: number;
  /** Max API calls per minute (default: 40) */
  maxApiPerMinute?: number;
  /** Min delay between API calls in ms (default: 100) */
  minApiDelayMs?: number;
}

/**
 * Slack Client wrapper around @slack/web-api.
 * Handles cookie injection, caching, rate limiting, and error handling.
 */
export class SlackClient {
  readonly raw: WebClient;
  private readonly logger: Logger;
  private readonly userCache: TTLCache<SlackUser>;
  private readonly channelCache: TTLCache<SlackChannel>;
  private readonly rateLimiter: RateLimiter;
  private readonly onTokenDeath?: () => void;

  constructor(config: SlackClientConfig, onTokenDeath?: () => void) {
    this.logger = config.logger;
    this.onTokenDeath = onTokenDeath;

    this.raw = new WebClient(config.credentials.token, {
      // @ts-expect-error — requestInterceptor is not in the public types but works
      requestInterceptor: (requestConfig: Record<string, unknown>) => {
        const headers = (requestConfig['headers'] ?? {}) as Record<string, string>;
        headers['Cookie'] = `d=${config.credentials.cookie}`;
        headers['Origin'] = 'https://app.slack.com';
        requestConfig['headers'] = headers;
        return requestConfig;
      },
    });

    this.userCache = new TTLCache<SlackUser>(config.userCacheTtlMs ?? 3_600_000);
    this.channelCache = new TTLCache<SlackChannel>(config.channelCacheTtlMs ?? 1_800_000);
    this.rateLimiter = new RateLimiter({
      maxPerMinute: config.maxApiPerMinute ?? 40,
      minDelayMs: config.minApiDelayMs ?? 100,
    });
  }

  // ─── Auth ───────────────────────────────────────────────

  async testAuth(): Promise<AuthResult> {
    try {
      await this.rateLimiter.acquire();
      const result = await this.raw.auth.test();
      return {
        ok: result.ok ?? false,
        userId: result.user_id,
        userName: result.user,
        teamId: result.team_id,
        teamName: result.team,
      };
    } catch (err) {
      return { ok: false, error: this.extractError(err) };
    }
  }

  // ─── Messages ───────────────────────────────────────────

  async sendMessage(params: {
    channel: string;
    text: string;
    threadTs?: string;
    replyBroadcast?: boolean;
  }): Promise<ActionResult> {
    try {
      await this.rateLimiter.acquire();
      const args: Record<string, unknown> = {
        channel: params.channel,
        text: params.text,
      };
      if (params.threadTs) args['thread_ts'] = params.threadTs;
      if (params.replyBroadcast) args['reply_broadcast'] = params.replyBroadcast;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await this.raw.chat.postMessage(args as any);
      return { ok: true, data: { ts: result.ts, channel: result.channel } };
    } catch (err) {
      return this.handleError(err, 'sendMessage');
    }
  }

  async updateMessage(params: {
    channel: string;
    ts: string;
    text: string;
  }): Promise<ActionResult> {
    try {
      await this.rateLimiter.acquire();
      await this.raw.chat.update({
        channel: params.channel,
        ts: params.ts,
        text: params.text,
      });
      return { ok: true };
    } catch (err) {
      return this.handleError(err, 'updateMessage');
    }
  }

  async deleteMessage(params: {
    channel: string;
    ts: string;
  }): Promise<ActionResult> {
    try {
      await this.rateLimiter.acquire();
      await this.raw.chat.delete({
        channel: params.channel,
        ts: params.ts,
      });
      return { ok: true };
    } catch (err) {
      return this.handleError(err, 'deleteMessage');
    }
  }

  async getHistory(params: {
    channel: string;
    limit?: number;
    cursor?: string;
  }): Promise<ActionResult> {
    try {
      await this.rateLimiter.acquire();
      const result = await this.raw.conversations.history({
        channel: params.channel,
        limit: params.limit ?? 50,
        cursor: params.cursor,
      });
      const messages: SlackMessage[] = (result.messages ?? []).map((m) => ({
        ts: m.ts ?? '',
        text: m.text ?? '',
        user: m.user ?? '',
        threadTs: m.thread_ts,
        edited: !!m.edited,
      }));
      return { ok: true, data: { messages, hasMore: result.has_more, cursor: result.response_metadata?.next_cursor } };
    } catch (err) {
      return this.handleError(err, 'getHistory');
    }
  }

  async getThread(params: {
    channel: string;
    ts: string;
    limit?: number;
  }): Promise<ActionResult> {
    try {
      await this.rateLimiter.acquire();
      const result = await this.raw.conversations.replies({
        channel: params.channel,
        ts: params.ts,
        limit: params.limit ?? 50,
      });
      const messages: SlackMessage[] = (result.messages ?? []).map((m) => ({
        ts: m.ts ?? '',
        text: m.text ?? '',
        user: m.user ?? '',
        threadTs: m.thread_ts,
        edited: !!m.edited,
      }));
      return { ok: true, data: { messages } };
    } catch (err) {
      return this.handleError(err, 'getThread');
    }
  }

  // ─── Reactions ──────────────────────────────────────────

  async addReaction(params: {
    channel: string;
    ts: string;
    emoji: string;
  }): Promise<ActionResult> {
    try {
      await this.rateLimiter.acquire();
      await this.raw.reactions.add({
        channel: params.channel,
        timestamp: params.ts,
        name: params.emoji,
      });
      return { ok: true };
    } catch (err) {
      return this.handleError(err, 'addReaction');
    }
  }

  async removeReaction(params: {
    channel: string;
    ts: string;
    emoji: string;
  }): Promise<ActionResult> {
    try {
      await this.rateLimiter.acquire();
      await this.raw.reactions.remove({
        channel: params.channel,
        timestamp: params.ts,
        name: params.emoji,
      });
      return { ok: true };
    } catch (err) {
      return this.handleError(err, 'removeReaction');
    }
  }

  // ─── Users (cached) ────────────────────────────────────

  async getUser(userId: string): Promise<SlackUser | undefined> {
    const cached = this.userCache.get(userId);
    if (cached) return cached;

    try {
      await this.rateLimiter.acquire();
      const result = await this.raw.users.info({ user: userId });
      if (result.user) {
        const user: SlackUser = {
          id: result.user.id ?? userId,
          name: result.user.name ?? '',
          displayName: result.user.profile?.display_name ?? result.user.real_name ?? '',
          isBot: result.user.is_bot ?? false,
        };
        this.userCache.set(userId, user);
        return user;
      }
      return undefined;
    } catch (err) {
      this.logger.warn({ userId, error: this.extractError(err) }, 'Failed to fetch user');
      return undefined;
    }
  }

  // ─── Channels (cached) ─────────────────────────────────

  async getChannel(channelId: string): Promise<SlackChannel | undefined> {
    const cached = this.channelCache.get(channelId);
    if (cached) return cached;

    try {
      await this.rateLimiter.acquire();
      const result = await this.raw.conversations.info({ channel: channelId });
      if (result.channel) {
        const ch = result.channel;
        const channel: SlackChannel = {
          id: ch.id ?? channelId,
          name: ch.name ?? '',
          type: ch.is_im ? 'dm' : ch.is_mpim ? 'mpim' : ch.is_group ? 'group' : 'channel',
          isMember: ch.is_member ?? false,
          memberCount: ch.num_members,
        };
        this.channelCache.set(channelId, channel);
        return channel;
      }
      return undefined;
    } catch (err) {
      this.logger.warn({ channelId, error: this.extractError(err) }, 'Failed to fetch channel');
      return undefined;
    }
  }

  // ─── Error handling ────────────────────────────────────

  private handleError(err: unknown, method: string): ActionResult {
    const errorStr = this.extractError(err);
    this.logger.error({ method, error: errorStr }, 'Slack API error');

    if (isTokenDead(errorStr)) {
      this.logger.error('Token is dead, triggering re-auth');
      this.onTokenDeath?.();
    }

    return { ok: false, error: errorStr };
  }

  private extractError(err: unknown): string {
    if (err && typeof err === 'object' && 'data' in err) {
      const data = (err as { data?: { error?: string } }).data;
      if (data?.error) return data.error;
    }
    if (err instanceof Error) return err.message;
    return String(err);
  }
}
