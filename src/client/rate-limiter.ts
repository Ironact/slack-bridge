/**
 * Rate limiting layer: global + per-method limits, min delay.
 */
import type { Logger } from '../config/logger.js';

export interface RateLimitConfig {
  globalMaxPerMinute: number;
  methodTiers: Record<string, number>;
  minDelayMs: number;
}

export const DEFAULT_RATE_LIMIT_CONFIG: RateLimitConfig = {
  globalMaxPerMinute: 40,
  methodTiers: {
    'chat.postMessage': 60,
    'conversations.history': 50,
    'users.info': 20,
    'search.messages': 20,
  },
  minDelayMs: 100,
};

interface CallRecord {
  timestamps: number[];
}

export class RateLimiter {
  private readonly config: RateLimitConfig;
  private readonly logger: Logger;
  private readonly globalCalls: number[] = [];
  private readonly methodCalls = new Map<string, CallRecord>();
  private lastCallTime = 0;

  constructor(config: Partial<RateLimitConfig>, logger: Logger) {
    this.config = { ...DEFAULT_RATE_LIMIT_CONFIG, ...config };
    this.logger = logger;
  }

  async waitForSlot(method: string): Promise<void> {
    // Enforce minimum delay
    const now = Date.now();
    const timeSinceLastCall = now - this.lastCallTime;
    if (timeSinceLastCall < this.config.minDelayMs) {
      const waitTime = this.config.minDelayMs - timeSinceLastCall;
      await this.sleep(waitTime);
    }

    // Check global limit
    await this.waitForGlobalSlot();

    // Check per-method limit
    await this.waitForMethodSlot(method);

    this.lastCallTime = Date.now();
    this.recordCall(method);
  }

  private async waitForGlobalSlot(): Promise<void> {
    this.pruneOldCalls(this.globalCalls, 60_000);

    while (this.globalCalls.length >= this.config.globalMaxPerMinute) {
      const oldestCall = this.globalCalls[0]!;
      const waitTime = oldestCall + 60_000 - Date.now() + 10;
      this.logger.debug({ waitTime }, 'Global rate limit reached, waiting');
      await this.sleep(Math.max(waitTime, 10));
      this.pruneOldCalls(this.globalCalls, 60_000);
    }
  }

  private async waitForMethodSlot(method: string): Promise<void> {
    const limit = this.config.methodTiers[method];
    if (!limit) return;

    const record = this.methodCalls.get(method);
    if (!record) return;

    this.pruneOldCalls(record.timestamps, 60_000);

    while (record.timestamps.length >= limit) {
      const oldestCall = record.timestamps[0]!;
      const waitTime = oldestCall + 60_000 - Date.now() + 10;
      this.logger.debug({ method, waitTime }, 'Method rate limit reached, waiting');
      await this.sleep(Math.max(waitTime, 10));
      this.pruneOldCalls(record.timestamps, 60_000);
    }
  }

  private recordCall(method: string): void {
    const now = Date.now();
    this.globalCalls.push(now);

    let record = this.methodCalls.get(method);
    if (!record) {
      record = { timestamps: [] };
      this.methodCalls.set(method, record);
    }
    record.timestamps.push(now);
  }

  private pruneOldCalls(timestamps: number[], windowMs: number): void {
    const cutoff = Date.now() - windowMs;
    while (timestamps.length > 0 && timestamps[0]! < cutoff) {
      timestamps.shift();
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
