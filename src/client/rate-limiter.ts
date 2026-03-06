/**
 * Simple token-bucket rate limiter.
 * Ensures minimum delay between API calls and max calls per minute.
 */

export interface RateLimiterConfig {
  /** Maximum calls per minute (default: 40) */
  maxPerMinute: number;
  /** Minimum delay between calls in ms (default: 100) */
  minDelayMs: number;
}

export class RateLimiter {
  private readonly maxPerMinute: number;
  private readonly minDelayMs: number;
  private readonly timestamps: number[] = [];
  private lastCallAt = 0;

  constructor(config: Partial<RateLimiterConfig> = {}) {
    this.maxPerMinute = config.maxPerMinute ?? 40;
    this.minDelayMs = config.minDelayMs ?? 100;
  }

  /**
   * Wait until it's safe to make the next API call.
   * Returns the delay waited (in ms).
   */
  async acquire(): Promise<number> {
    let totalWait = 0;

    // Enforce minimum delay between calls
    const now = Date.now();
    const timeSinceLast = now - this.lastCallAt;
    if (timeSinceLast < this.minDelayMs) {
      const wait = this.minDelayMs - timeSinceLast;
      await sleep(wait);
      totalWait += wait;
    }

    // Enforce per-minute limit
    this.pruneOldTimestamps();
    if (this.timestamps.length >= this.maxPerMinute) {
      const oldest = this.timestamps[0]!;
      const wait = 60_000 - (Date.now() - oldest) + 1;
      if (wait > 0) {
        await sleep(wait);
        totalWait += wait;
        this.pruneOldTimestamps();
      }
    }

    this.lastCallAt = Date.now();
    this.timestamps.push(this.lastCallAt);
    return totalWait;
  }

  /** Current number of calls in the last minute. */
  get currentLoad(): number {
    this.pruneOldTimestamps();
    return this.timestamps.length;
  }

  private pruneOldTimestamps(): void {
    const cutoff = Date.now() - 60_000;
    while (this.timestamps.length > 0 && (this.timestamps[0] ?? Infinity) < cutoff) {
      this.timestamps.shift();
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
