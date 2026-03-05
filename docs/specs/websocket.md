# WebSocket Spec

## Overview

The WebSocket module maintains a persistent connection to Slack's real-time messaging system, receiving all workspace events as they happen. This is how slack-bridge knows when someone sends a message, reacts, or performs any action.

## Connection

### Obtaining the WebSocket URL

Slack provides WebSocket URLs via the `rtm.connect` API:

```http
POST https://{workspace}.slack.com/api/rtm.connect
Content-Type: application/x-www-form-urlencoded
Cookie: d={d-cookie}

token={xoxc-token}
```

Response:
```json
{
  "ok": true,
  "url": "wss://wss-primary.slack.com/websocket/...",
  "self": { "id": "U...", "name": "VISION" },
  "team": { "id": "T...", "name": "Muhak 3-7" }
}
```

### Alternative: Client Boot WebSocket

Modern Slack clients may use a different WebSocket endpoint obtained during the `client.boot` phase. The module should support both methods.

## Connection Lifecycle

```
┌─────────┐    ┌──────────┐    ┌───────────┐    ┌──────────┐
│  INIT   │───▶│CONNECTING│───▶│ CONNECTED │───▶│  READY   │
└─────────┘    └──────────┘    └───────────┘    └──────────┘
                    │                │                │
                    │           ┌────▼────┐          │
                    │           │  PING/  │          │
                    │           │  PONG   │          │
                    │           └─────────┘          │
                    │                                │
                    ▼                                ▼
              ┌───────────┐                   ┌───────────┐
              │  FAILED   │◀──────────────────│DISCONNECTED│
              └───────────┘                   └─────┬─────┘
                    │                               │
                    └───────────┐    ┌──────────────┘
                                ▼    ▼
                          ┌──────────────┐
                          │ RECONNECTING │
                          │  (backoff)   │
                          └──────┬───────┘
                                 │
                                 ▼
                          ┌──────────┐
                          │CONNECTING│
                          └──────────┘
```

### States

| State | Description |
|-------|-------------|
| `INIT` | Module created, not yet connected |
| `CONNECTING` | Opening WebSocket connection |
| `CONNECTED` | WebSocket open, waiting for hello |
| `READY` | Received hello, fully operational |
| `DISCONNECTED` | Connection lost |
| `RECONNECTING` | Attempting to reconnect |
| `FAILED` | Max reconnect attempts exceeded |

## Event Types

### Core Events

```typescript
// New message in any channel/DM
interface MessageEvent {
  type: 'message';
  subtype?: string;          // undefined for normal messages
  channel: string;
  user: string;
  text: string;
  ts: string;
  thread_ts?: string;
  team: string;
}

// Message edited
interface MessageChangedEvent {
  type: 'message';
  subtype: 'message_changed';
  channel: string;
  message: {
    user: string;
    text: string;
    ts: string;
    edited: { user: string; ts: string };
  };
  previous_message: { text: string; ts: string };
}

// Message deleted
interface MessageDeletedEvent {
  type: 'message';
  subtype: 'message_deleted';
  channel: string;
  deleted_ts: string;
  previous_message: { user: string; text: string; ts: string };
}

// Reaction added
interface ReactionAddedEvent {
  type: 'reaction_added';
  user: string;
  reaction: string;
  item: { type: 'message'; channel: string; ts: string };
  event_ts: string;
}

// Reaction removed
interface ReactionRemovedEvent {
  type: 'reaction_removed';
  user: string;
  reaction: string;
  item: { type: 'message'; channel: string; ts: string };
  event_ts: string;
}

// User typing
interface UserTypingEvent {
  type: 'user_typing';
  channel: string;
  user: string;
}

// Presence change
interface PresenceChangeEvent {
  type: 'presence_change';
  user: string;
  presence: 'active' | 'away';
}

// Channel events
interface MemberJoinedEvent {
  type: 'member_joined_channel';
  user: string;
  channel: string;
  team: string;
}

interface MemberLeftEvent {
  type: 'member_left_channel';
  user: string;
  channel: string;
  team: string;
}
```

### System Events

```typescript
// Connection established
interface HelloEvent {
  type: 'hello';
}

// Keepalive
interface PongEvent {
  type: 'pong';
  reply_to: number;
}

// Server-side disconnect
interface DisconnectEvent {
  type: 'disconnect';
  reason: string;
}
```

## Reconnection Strategy

```typescript
interface ReconnectConfig {
  maxAttempts: number;          // 10
  initialDelayMs: number;      // 1000 (1s)
  maxDelayMs: number;          // 300000 (5min)
  backoffMultiplier: number;   // 2
  jitter: boolean;             // true (add randomness)
}
```

### Backoff Formula
```
delay = min(initialDelay * (multiplier ^ attempt), maxDelay)
if jitter: delay = delay * (0.5 + random() * 0.5)
```

### Reconnect Triggers
| Trigger | Action |
|---------|--------|
| WebSocket `close` event | Reconnect immediately |
| No pong for 30s | Force close + reconnect |
| `disconnect` event from Slack | Reconnect with new URL |
| Token invalid during reconnect | Trigger session refresh, then reconnect |

## Heartbeat / Ping-Pong

```
Every 30 seconds:
  1. Send ping: { "type": "ping", "id": {counter} }
  2. Expect pong within 10 seconds
  3. If no pong: mark connection as dead, trigger reconnect
```

## Event Processing Pipeline

```
Raw WebSocket frame (JSON string)
  → Parse JSON
    → Type check (skip system events like pong)
      → Validate event shape
        → Emit typed event to listeners
```

### Filtering (before emission)

Events are filtered based on configuration:
- Skip bot messages (if `BRIDGE_INCLUDE_BOTS=false`)
- Skip own messages (don't echo back our own sends)
- Filter by channel (if `BRIDGE_CHANNELS` is set)

## TypeScript Interface

```typescript
interface WebSocketReceiver extends EventEmitter {
  // Connection
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  reconnect(): Promise<void>;
  
  // State
  getState(): ConnectionState;
  isReady(): boolean;
  
  // Events (via EventEmitter)
  on(event: 'message', handler: (e: MessageEvent) => void): this;
  on(event: 'reaction_added', handler: (e: ReactionAddedEvent) => void): this;
  on(event: 'reaction_removed', handler: (e: ReactionRemovedEvent) => void): this;
  on(event: 'member_joined', handler: (e: MemberJoinedEvent) => void): this;
  on(event: 'member_left', handler: (e: MemberLeftEvent) => void): this;
  on(event: 'presence_change', handler: (e: PresenceChangeEvent) => void): this;
  on(event: 'user_typing', handler: (e: UserTypingEvent) => void): this;
  on(event: 'connected', handler: () => void): this;
  on(event: 'disconnected', handler: (reason: string) => void): this;
  on(event: 'error', handler: (error: Error) => void): this;
  
  // Metrics
  getMetrics(): {
    connectedAt: Date | null;
    reconnectCount: number;
    messagesReceived: number;
    lastEventAt: Date | null;
  };
}

type ConnectionState = 
  | 'init' 
  | 'connecting' 
  | 'connected' 
  | 'ready' 
  | 'disconnected' 
  | 'reconnecting' 
  | 'failed';
```

## Environment Variables

```bash
WS_PING_INTERVAL=30000          # Ping every 30s
WS_PONG_TIMEOUT=10000           # Pong deadline
WS_RECONNECT_MAX_ATTEMPTS=10
WS_RECONNECT_INITIAL_DELAY=1000
WS_RECONNECT_MAX_DELAY=300000
WS_RECONNECT_BACKOFF=2
```
