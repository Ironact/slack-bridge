/**
 * TTL-based cache for Slack users and channels.
 * Lazy-loading: never pre-populates, fetches on demand.
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class TTLCache<T> {
  private readonly store = new Map<string, CacheEntry<T>>();
  private readonly ttlMs: number;

  constructor(ttlMs: number) {
    this.ttlMs = ttlMs;
  }

  get(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: T): void {
    this.store.set(key, {
      value,
      expiresAt: Date.now() + this.ttlMs,
    });
  }

  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  delete(key: string): boolean {
    return this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  get size(): number {
    // Clean expired entries first
    this.cleanup();
    return this.store.size;
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (now > entry.expiresAt) {
        this.store.delete(key);
      }
    }
  }
}

export interface UserInfo {
  id: string;
  name: string;
  realName?: string;
  displayName?: string;
  email?: string;
  isBot?: boolean;
}

export interface ChannelInfo {
  id: string;
  name: string;
  isPrivate: boolean;
  isMember: boolean;
  topic?: string;
  purpose?: string;
}

const DEFAULT_USER_TTL_MS = 3_600_000; // 1 hour
const DEFAULT_CHANNEL_TTL_MS = 1_800_000; // 30 min

export class UserCache {
  readonly cache: TTLCache<UserInfo>;

  constructor(ttlMs: number = DEFAULT_USER_TTL_MS) {
    this.cache = new TTLCache(ttlMs);
  }

  get(userId: string): UserInfo | undefined {
    return this.cache.get(userId);
  }

  set(userId: string, user: UserInfo): void {
    this.cache.set(userId, user);
  }

  has(userId: string): boolean {
    return this.cache.has(userId);
  }
}

export class ChannelCache {
  readonly cache: TTLCache<ChannelInfo>;
  private allChannels: ChannelInfo[] | null = null;
  private allChannelsExpiresAt = 0;
  readonly refreshIntervalMs: number;

  constructor(ttlMs: number = DEFAULT_CHANNEL_TTL_MS) {
    this.cache = new TTLCache(ttlMs);
    this.refreshIntervalMs = ttlMs;
  }

  get(channelId: string): ChannelInfo | undefined {
    return this.cache.get(channelId);
  }

  set(channelId: string, channel: ChannelInfo): void {
    this.cache.set(channelId, channel);
  }

  has(channelId: string): boolean {
    return this.cache.has(channelId);
  }

  setAll(channels: ChannelInfo[]): void {
    this.allChannels = channels;
    this.allChannelsExpiresAt = Date.now() + this.refreshIntervalMs;
    for (const ch of channels) {
      this.cache.set(ch.id, ch);
    }
  }

  getAll(): ChannelInfo[] | null {
    if (!this.allChannels) return null;
    if (Date.now() > this.allChannelsExpiresAt) {
      this.allChannels = null;
      return null;
    }
    return this.allChannels;
  }
}
