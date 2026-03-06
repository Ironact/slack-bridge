/**
 * RTM/Polling event receiver types.
 */

// ─── Raw Slack Events ──────────────────────────────────────

export interface SlackMessageEvent {
  type: 'message';
  subtype?: string;
  channel: string;
  user?: string;
  text?: string;
  ts: string;
  threadTs?: string;
  team?: string;
  edited?: { user: string; ts: string };
  hidden?: boolean;
  message?: {
    user?: string;
    text?: string;
    ts: string;
    edited?: { user: string; ts: string };
  };
  previous_message?: {
    user?: string;
    text?: string;
    ts: string;
  };
  deleted_ts?: string;
}

export interface SlackReactionEvent {
  type: 'reaction_added' | 'reaction_removed';
  user: string;
  reaction: string;
  item: {
    type: string;
    channel: string;
    ts: string;
  };
  event_ts: string;
}

export interface SlackHelloEvent {
  type: 'hello';
}

export interface SlackPongEvent {
  type: 'pong';
  reply_to: number;
}

export type SlackRTMEvent =
  | SlackMessageEvent
  | SlackReactionEvent
  | SlackHelloEvent
  | SlackPongEvent
  | { type: string; [key: string]: unknown };

// ─── Receiver Types ────────────────────────────────────────

export type ReceiverMode = 'rtm' | 'polling' | 'disconnected';

export interface ReceiverMetrics {
  mode: ReceiverMode;
  startedAt: Date | null;
  eventsReceived: number;
  lastEventAt: Date | null;
  reconnectCount: number;
  wsConnectedAt: Date | null;
  lastPingAt: Date | null;
  lastPongAt: Date | null;
}

export interface ReconnectConfig {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  jitterMs: number;
}

export const DEFAULT_RECONNECT_CONFIG: ReconnectConfig = {
  maxAttempts: 10,
  initialDelayMs: 1000,
  maxDelayMs: 60_000,
  backoffMultiplier: 2,
  jitterMs: 500,
};

/**
 * Calculate reconnect delay with exponential backoff + jitter.
 */
export function getReconnectDelay(attempt: number, config: ReconnectConfig = DEFAULT_RECONNECT_CONFIG): number {
  const base = Math.min(
    config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt),
    config.maxDelayMs,
  );
  const jitter = Math.random() * config.jitterMs;
  return base + jitter;
}
