# Real-Time Events Spec

## Overview

> **Updated after POC**: `rtm.connect` WORKS with xoxc- tokens (when d cookie is present).
> Phase 1 uses RTM WebSocket directly. Polling is fallback only.

## Architecture

```
rtm.connect (xoxc- + d cookie)
  → wss://wss-primary.slack.com/websocket/...
    → Real-time events (JSON frames)
      → Event Emitter → Webhook to AI agent
```

## RTM Connection Flow

### 1. Get WebSocket URL

```typescript
const body = new URLSearchParams();
body.append('token', xoxcToken);

const resp = await fetch('https://app.slack.com/api/rtm.connect', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Cookie': `d=${dCookie}`,
    'Origin': 'https://app.slack.com',
  },
  body: body.toString(),
});

const data = await resp.json();
// data.url = "wss://wss-primary.slack.com/websocket/LEGACY_BOT:..."
// data.self = { id: "U0AJGS5CB3M", name: "vision" }
// data.team = { id: "T0A37JX8BC4", name: "Muhak 3-7" }
```

**Critical**: Must use `application/x-www-form-urlencoded`, NOT JSON.
JSON content-type returns `not_authed` with xoxc- tokens.

### 2. Connect WebSocket

```typescript
import WebSocket from 'ws';

const ws = new WebSocket(data.url);

ws.on('open', () => {
  console.log('RTM connected');
});

ws.on('message', (raw: string) => {
  const event = JSON.parse(raw);
  
  switch (event.type) {
    case 'hello':
      // Connection established
      break;
    case 'message':
      handleMessage(event);
      break;
    case 'reaction_added':
    case 'reaction_removed':
      handleReaction(event);
      break;
    case 'user_typing':
      // Optional: forward typing indicators
      break;
  }
});

ws.on('close', (code, reason) => {
  // Reconnect with backoff
});

ws.on('error', (err) => {
  // Log and reconnect
});
```

### 3. Keep Alive

RTM uses ping/pong for keepalive:

```typescript
// Send ping every 30 seconds
const pingInterval = setInterval(() => {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'ping', id: Date.now() }));
  }
}, 30000);

// Server responds with { type: 'pong', reply_to: <id> }
// If no pong within 10 seconds → connection is dead → reconnect
```

## Event Types

### message

```json
{
  "type": "message",
  "channel": "C0A3YAWPCJU",
  "user": "U0AE9KLG4QL",
  "text": "Hello world",
  "ts": "1772730011.162009",
  "team": "T0A37JX8BC4"
}
```

### message subtypes

| Subtype | Meaning |
|---------|---------|
| (none) | Normal message |
| `message_changed` | Message edited |
| `message_deleted` | Message deleted |
| `me_message` | /me action |
| `file_share` | File uploaded |
| `thread_broadcast` | Thread reply also posted to channel |
| `channel_join` | User joined channel |
| `channel_leave` | User left channel |

### reaction_added / reaction_removed

```json
{
  "type": "reaction_added",
  "user": "U0AE9KLG4QL",
  "reaction": "thumbsup",
  "item": {
    "type": "message",
    "channel": "C0A3YAWPCJU",
    "ts": "1772730011.162009"
  },
  "event_ts": "1772730020.000000"
}
```

### Other events

| Event | Description |
|-------|-------------|
| `hello` | Connection established |
| `user_typing` | User is typing in a channel |
| `presence_change` | User went online/offline |
| `member_joined_channel` | User joined a channel |
| `member_left_channel` | User left a channel |
| `channel_created` | New channel created |
| `channel_deleted` | Channel deleted |
| `emoji_changed` | Custom emoji added/removed |

## Reconnection Strategy

```typescript
interface ReconnectConfig {
  maxAttempts: number;         // Default: 10
  initialDelayMs: number;      // Default: 1000
  maxDelayMs: number;          // Default: 60000
  backoffMultiplier: number;   // Default: 2
  jitterMs: number;            // Default: 500
}

function getReconnectDelay(attempt: number, config: ReconnectConfig): number {
  const base = Math.min(
    config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt),
    config.maxDelayMs
  );
  const jitter = Math.random() * config.jitterMs;
  return base + jitter;
}
```

### Reconnect triggers

| Condition | Action |
|-----------|--------|
| WebSocket close (clean) | Reconnect immediately |
| WebSocket close (error) | Reconnect with backoff |
| Pong timeout (10s) | Force close + reconnect |
| Token dead error | Trigger session refresh → then reconnect |
| Max attempts reached | Switch to polling fallback |

## Polling Fallback

If RTM connection fails repeatedly (e.g., Slack disables RTM for xoxc- tokens),
automatically fall back to polling mode.

```typescript
interface PollingConfig {
  intervalMs: number;              // Default: 3000
  channelsPerCycle: number;        // Default: 3
  staggerMs: number;               // Default: 100
  idleMultiplier: number;          // Default: 2
  idleMaxMs: number;               // Default: 30000
}
```

Polling uses `conversations.history` (Tier 3: 50+ req/min) with round-robin
channel rotation. See previous spec version for full polling details.

## TypeScript Interface

```typescript
interface EventReceiver extends EventEmitter {
  start(): Promise<void>;
  stop(): Promise<void>;
  
  on(event: 'message', handler: (e: SlackMessageEvent) => void): this;
  on(event: 'reaction_added', handler: (e: SlackReactionEvent) => void): this;
  on(event: 'reaction_removed', handler: (e: SlackReactionEvent) => void): this;
  on(event: 'message_changed', handler: (e: SlackMessageChangedEvent) => void): this;
  on(event: 'message_deleted', handler: (e: SlackMessageDeletedEvent) => void): this;
  on(event: 'connected', handler: () => void): this;
  on(event: 'disconnected', handler: (reason: string) => void): this;
  on(event: 'error', handler: (error: Error) => void): this;
  on(event: 'fallback', handler: (mode: 'polling') => void): this;
  
  getMode(): 'rtm' | 'polling';
  getMetrics(): ReceiverMetrics;
}

interface ReceiverMetrics {
  mode: 'rtm' | 'polling';
  startedAt: Date | null;
  eventsReceived: number;
  lastEventAt: Date | null;
  reconnectCount: number;
  // RTM-specific
  wsConnectedAt: Date | null;
  lastPingAt: Date | null;
  lastPongAt: Date | null;
  // Polling-specific (when in fallback)
  pollCount?: number;
  avgPollLatencyMs?: number;
}
```

## Environment Variables

```bash
# Primary: RTM WebSocket
WS_PING_INTERVAL_MS=30000
WS_PONG_TIMEOUT_MS=10000
WS_RECONNECT_MAX_ATTEMPTS=10
WS_RECONNECT_INITIAL_DELAY_MS=1000
WS_RECONNECT_MAX_DELAY_MS=60000

# Fallback: Polling
POLL_INTERVAL_MS=3000
POLL_CHANNELS_PER_CYCLE=3
POLL_STAGGER_MS=100
```
