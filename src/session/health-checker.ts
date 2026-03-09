/**
 * Session health checker — periodic validation of xoxc session tokens.
 *
 * Emits: 'healthy', 'degraded', 'dead', 'recovered'
 */
import { EventEmitter } from 'node:events';
import type { Credentials } from '../auth/types.js';
import type { Logger } from '../config/logger.js';

export type SessionStatus = 'healthy' | 'degraded' | 'dead' | 'unknown';

export interface SessionHealthState {
  status: SessionStatus;
  lastCheck: string | null;
  latencyMs: number;
  consecutiveFailures: number;
}

export interface HealthCheckerOptions {
  /** Function that validates session credentials (e.g. auth.test) */
  validateFn: (credentials: Credentials) => Promise<boolean>;
  /** Credentials to validate */
  credentials: Credentials;
  logger: Logger;
  /** Check interval in ms (default: 300_000 = 5 min) */
  intervalMs?: number;
  /** Timeout per check in ms (default: 10_000) */
  timeoutMs?: number;
  /** Consecutive failures before 'dead' status (default: 3) */
  deadThreshold?: number;
}

export interface HealthCheckEvent {
  sessionId: string;
  status: SessionStatus;
  previousStatus: SessionStatus;
  consecutiveFailures: number;
  latencyMs: number;
  timestamp: string;
}

export class SessionHealthChecker extends EventEmitter {
  private timer: ReturnType<typeof setInterval> | null = null;
  private status: SessionStatus = 'unknown';
  private lastCheck: string | null = null;
  private latencyMs = 0;
  private consecutiveFailures = 0;

  private readonly validateFn: (credentials: Credentials) => Promise<boolean>;
  private readonly credentials: Credentials;
  private readonly logger: Logger;
  private readonly intervalMs: number;
  private readonly timeoutMs: number;
  private readonly deadThreshold: number;

  constructor(opts: HealthCheckerOptions) {
    super();
    this.validateFn = opts.validateFn;
    this.credentials = opts.credentials;
    this.logger = opts.logger;
    this.intervalMs = opts.intervalMs ?? 300_000;
    this.timeoutMs = opts.timeoutMs ?? 10_000;
    this.deadThreshold = opts.deadThreshold ?? 3;
  }

  start(): void {
    if (this.timer) return;
    this.logger.info({ intervalMs: this.intervalMs }, 'Session health checker started');

    // Run immediately, then on interval
    void this.check();
    this.timer = setInterval(() => {
      void this.check();
    }, this.intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      this.logger.info('Session health checker stopped');
    }
  }

  getState(): SessionHealthState {
    return {
      status: this.status,
      lastCheck: this.lastCheck,
      latencyMs: this.latencyMs,
      consecutiveFailures: this.consecutiveFailures,
    };
  }

  async check(): Promise<SessionHealthState> {
    const previousStatus = this.status;
    const start = Date.now();

    try {
      const valid = await this.runWithTimeout(
        this.validateFn(this.credentials),
        this.timeoutMs,
      );

      this.latencyMs = Date.now() - start;
      this.lastCheck = new Date().toISOString();

      if (valid) {
        this.consecutiveFailures = 0;
        this.status = 'healthy';

        if (previousStatus === 'degraded' || previousStatus === 'dead') {
          this.emitTransition('recovered', previousStatus);
        }

        this.emit('healthy', this.buildEvent(previousStatus));
        this.logger.debug({ latencyMs: this.latencyMs }, 'Session health check passed');
      } else {
        this.handleFailure(previousStatus);
      }
    } catch (error) {
      this.latencyMs = Date.now() - start;
      this.lastCheck = new Date().toISOString();
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn({ error: message, latencyMs: this.latencyMs }, 'Session health check error');
      this.handleFailure(previousStatus);
    }

    return this.getState();
  }

  private handleFailure(previousStatus: SessionStatus): void {
    this.consecutiveFailures++;

    if (this.consecutiveFailures >= this.deadThreshold) {
      this.status = 'dead';
      if (previousStatus !== 'dead') {
        this.emitTransition('dead', previousStatus);
      }
      this.emit('dead', this.buildEvent(previousStatus));
    } else {
      this.status = 'degraded';
      if (previousStatus !== 'degraded') {
        this.emitTransition('degraded', previousStatus);
      }
      this.emit('degraded', this.buildEvent(previousStatus));
    }

    this.logger.warn(
      { status: this.status, consecutiveFailures: this.consecutiveFailures },
      'Session health check failed',
    );
  }

  private emitTransition(event: string, previousStatus: SessionStatus): void {
    this.emit('transition', {
      event,
      ...this.buildEvent(previousStatus),
    });
  }

  private buildEvent(previousStatus: SessionStatus): HealthCheckEvent {
    return {
      sessionId: 'default',
      status: this.status,
      previousStatus,
      consecutiveFailures: this.consecutiveFailures,
      latencyMs: this.latencyMs,
      timestamp: this.lastCheck ?? new Date().toISOString(),
    };
  }

  private runWithTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Health check timed out')), ms);
      promise
        .then((val) => {
          clearTimeout(timer);
          resolve(val);
        })
        .catch((err: unknown) => {
          clearTimeout(timer);
          reject(err);
        });
    });
  }
}
