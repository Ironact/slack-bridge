/**
 * WebClient wrapper with cookie injection via requestInterceptor.
 */
import { WebClient } from '@slack/web-api';
import { RateLimiter } from './rate-limiter.js';
import { UserCache, ChannelCache } from './cache.js';
import type { UserInfo, ChannelInfo } from './cache.js';
import { isTokenDead } from '../auth/types.js';
import type { Logger } from '../config/logger.js';

export interface SlackClientOptions {
  token: string;
  cookie: string;
  logger: Logger;
  rateLimitConfig?: {
    globalMaxPerMinute?: number;
    minDelayMs?: number;
  };
  userCacheTtlMs?: number;
  channelCacheTtlMs?: number;
}

export interface MessageResult {
  ok: boolean;
  ts: string;
  channel: string;
}

export interface AuthResult {
  ok: boolean;
  userId?: string;
  teamId?: string;
  user?: string;
  team?: string;
}

export class SlackClientWrapper {
  private _raw: WebClient;
  private readonly rateLimiter: RateLimiter;
  private readonly userCache: UserCache;
  private readonly channelCache: ChannelCache;
  private readonly logger: Logger;
  private onTokenDeath?: () => Promise<void>;

  constructor(options: SlackClientOptions) {
    this.logger = options.logger;

    this._raw = new WebClient(options.token, {
      headers: {
        Cookie: `d=${options.cookie}`,
        Origin: 'https://app.slack.com',
      },
    });

    this.rateLimiter = new RateLimiter(
      {
        globalMaxPerMinute: options.rateLimitConfig?.globalMaxPerMinute,
        minDelayMs: options.rateLimitConfig?.minDelayMs,
      },
      this.logger,
    );

    this.userCache = new UserCache(options.userCacheTtlMs);
    this.channelCache = new ChannelCache(options.channelCacheTtlMs);
  }

  get raw(): WebClient {
    return this._raw;
  }

  setTokenDeathHandler(handler: () => Promise<void>): void {
    this.onTokenDeath = handler;
  }

  updateCredentials(token: string, cookie: string): void {
    // Create a new WebClient with updated credentials
    this._raw = new WebClient(token, {
      headers: {
        Cookie: `d=${cookie}`,
        Origin: 'https://app.slack.com',
      },
    });
  }

  async testAuth(): Promise<AuthResult> {
    await this.rateLimiter.waitForSlot('auth.test');
    try {
      const result = await this.raw.auth.test();
      return {
        ok: result.ok ?? false,
        userId: result.user_id,
        teamId: result.team_id,
        user: result.user,
        team: result.team,
      };
    } catch (error) {
      await this.handleError(error);
      throw error;
    }
  }

  async isTokenValid(): Promise<boolean> {
    try {
      const result = await this.testAuth();
      return result.ok;
    } catch {
      return false;
    }
  }

  async sendMessage(
    channel: string,
    text: string,
    threadTs?: string,
  ): Promise<MessageResult> {
    await this.rateLimiter.waitForSlot('chat.postMessage');
    try {
      const result = await this.raw.chat.postMessage({
        channel,
        text,
        thread_ts: threadTs,
      });
      return {
        ok: result.ok ?? false,
        ts: result.ts ?? '',
        channel: result.channel ?? channel,
      };
    } catch (error) {
      await this.handleError(error);
      throw error;
    }
  }

  async editMessage(channel: string, ts: string, text: string): Promise<void> {
    await this.rateLimiter.waitForSlot('chat.update');
    try {
      await this.raw.chat.update({ channel, ts, text });
    } catch (error) {
      await this.handleError(error);
      throw error;
    }
  }

  async deleteMessage(channel: string, ts: string): Promise<void> {
    await this.rateLimiter.waitForSlot('chat.delete');
    try {
      await this.raw.chat.delete({ channel, ts });
    } catch (error) {
      await this.handleError(error);
      throw error;
    }
  }

  async getHistory(
    channel: string,
    limit = 50,
    oldest?: string,
  ): Promise<Record<string, unknown>[]> {
    await this.rateLimiter.waitForSlot('conversations.history');
    try {
      const result = await this.raw.conversations.history({
        channel,
        limit,
        oldest,
      });
      return (result.messages ?? []) as Record<string, unknown>[];
    } catch (error) {
      await this.handleError(error);
      throw error;
    }
  }

  async getThread(
    channel: string,
    ts: string,
    limit = 50,
  ): Promise<Record<string, unknown>[]> {
    await this.rateLimiter.waitForSlot('conversations.replies');
    try {
      const result = await this.raw.conversations.replies({
        channel,
        ts,
        limit,
      });
      return (result.messages ?? []) as Record<string, unknown>[];
    } catch (error) {
      await this.handleError(error);
      throw error;
    }
  }

  async addReaction(channel: string, ts: string, emoji: string): Promise<void> {
    await this.rateLimiter.waitForSlot('reactions.add');
    try {
      await this.raw.reactions.add({ channel, timestamp: ts, name: emoji });
    } catch (error) {
      await this.handleError(error);
      throw error;
    }
  }

  async removeReaction(channel: string, ts: string, emoji: string): Promise<void> {
    await this.rateLimiter.waitForSlot('reactions.remove');
    try {
      await this.raw.reactions.remove({ channel, timestamp: ts, name: emoji });
    } catch (error) {
      await this.handleError(error);
      throw error;
    }
  }

  /**
   * Get all channels (bulk fetch).
   * 
   * ⚠️ WARNING: This violates the lazy loading principle by fetching up to 200 channels at once.
   * Only use this method when you explicitly need all channels and understand the performance implications.
   * For individual channel info, use getChannel(channelId) instead.
   * 
   * @param forceRefresh - Set to true to bypass cache and force a fresh fetch
   */
  async getChannels(forceRefresh = false): Promise<ChannelInfo[]> {
    if (!forceRefresh) {
      const cached = this.channelCache.getAll();
      if (cached) return cached;
    }

    this.logger.warn('Performing bulk channel fetch (getChannels) - consider using lazy loading instead');

    await this.rateLimiter.waitForSlot('conversations.list');
    try {
      const result = await this.raw.conversations.list({
        types: 'public_channel,private_channel',
        exclude_archived: true,
        limit: 200,
      });

      const channels: ChannelInfo[] = (result.channels ?? []).map((ch) => ({
        id: ch.id ?? '',
        name: ch.name ?? '',
        isPrivate: ch.is_private ?? false,
        isMember: ch.is_member ?? false,
        topic: (ch.topic as { value?: string } | undefined)?.value,
        purpose: (ch.purpose as { value?: string } | undefined)?.value,
      }));

      this.channelCache.setAll(channels);
      return channels;
    } catch (error) {
      await this.handleError(error);
      throw error;
    }
  }

  async getChannel(channelId: string): Promise<ChannelInfo> {
    const cached = this.channelCache.get(channelId);
    if (cached) return cached;

    await this.rateLimiter.waitForSlot('conversations.info');
    try {
      const result = await this.raw.conversations.info({ channel: channelId });
      const ch = result.channel!;
      const channelInfo: ChannelInfo = {
        id: ch.id ?? channelId,
        name: ch.name ?? '',
        isPrivate: ch.is_private ?? false,
        isMember: ch.is_member ?? false,
        topic: (ch.topic as { value?: string } | undefined)?.value,
        purpose: (ch.purpose as { value?: string } | undefined)?.value,
      };

      this.channelCache.set(channelId, channelInfo);
      return channelInfo;
    } catch (error) {
      await this.handleError(error);
      throw error;
    }
  }

  async joinChannel(channelId: string): Promise<void> {
    await this.rateLimiter.waitForSlot('conversations.join');
    try {
      await this.raw.conversations.join({ channel: channelId });
    } catch (error) {
      await this.handleError(error);
      throw error;
    }
  }

  async leaveChannel(channelId: string): Promise<void> {
    await this.rateLimiter.waitForSlot('conversations.leave');
    try {
      await this.raw.conversations.leave({ channel: channelId });
    } catch (error) {
      await this.handleError(error);
      throw error;
    }
  }

  async getUser(userId: string): Promise<UserInfo> {
    const cached = this.userCache.get(userId);
    if (cached) return cached;

    await this.rateLimiter.waitForSlot('users.info');
    try {
      const result = await this.raw.users.info({ user: userId });
      const u = result.user!;
      const userInfo: UserInfo = {
        id: u.id ?? userId,
        name: u.name ?? '',
        realName: u.real_name,
        displayName: u.profile?.display_name,
        email: u.profile?.email,
        isBot: u.is_bot,
      };

      this.userCache.set(userId, userInfo);
      return userInfo;
    } catch (error) {
      await this.handleError(error);
      throw error;
    }
  }

  async setStatus(text: string, emoji: string): Promise<void> {
    await this.rateLimiter.waitForSlot('users.profile.set');
    try {
      await this.raw.users.profile.set({
        profile: { status_text: text, status_emoji: emoji },
      });
    } catch (error) {
      await this.handleError(error);
      throw error;
    }
  }

  async search(
    query: string,
    count = 20,
  ): Promise<Record<string, unknown>> {
    await this.rateLimiter.waitForSlot('search.messages');
    try {
      const result = await this.raw.search.messages({
        query,
        sort: 'timestamp',
        sort_dir: 'desc',
        count,
      });
      return result as unknown as Record<string, unknown>;
    } catch (error) {
      await this.handleError(error);
      throw error;
    }
  }

  async openDM(userId: string): Promise<string> {
    await this.rateLimiter.waitForSlot('conversations.open');
    try {
      const result = await this.raw.conversations.open({ users: userId });
      const channelId = result.channel?.id;
      if (!channelId) {
        throw new Error('Failed to open DM: no channel ID returned');
      }
      return channelId;
    } catch (error) {
      await this.handleError(error);
      throw error;
    }
  }

  async uploadFile(
    channel: string,
    file: Buffer,
    filename: string,
    comment?: string,
  ): Promise<void> {
    await this.rateLimiter.waitForSlot('files.getUploadURLExternal');
    try {
      const uploadUrl = await this.raw.files.getUploadURLExternal({
        filename,
        length: file.length,
      });

      if (!uploadUrl.upload_url || !uploadUrl.file_id) {
        throw new Error('Failed to get upload URL');
      }

      await fetch(uploadUrl.upload_url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: file,
      });

      await this.raw.files.completeUploadExternal({
        files: [{ id: uploadUrl.file_id, title: filename }],
        channel_id: channel,
        initial_comment: comment,
      });
    } catch (error) {
      await this.handleError(error);
      throw error;
    }
  }

  private async handleError(error: unknown): Promise<void> {
    if (!error || typeof error !== 'object') return;

    const slackError = error as { data?: { error?: string } };
    const errorCode = slackError.data?.error;

    if (errorCode && isTokenDead(errorCode)) {
      this.logger.error({ error: errorCode }, 'Token death detected');
      if (this.onTokenDeath) {
        await this.onTokenDeath();
      }
    }
  }
}
