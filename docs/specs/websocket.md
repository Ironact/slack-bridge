# Real-Time Events Spec

## Overview

> **Updated after research**: `rtm.connect` does NOT accept xoxc- tokens.
> This spec documents the actual approaches for real-time event reception.

The original spec assumed RTM WebSocket would work. It doesn't. This spec documents
three viable paths, in order of implementation priority.

## The Problem

Slack's RTM API (`rtm.connect`) only accepts `xoxp-` and `xoxb-` tokens.
Our xoxc- (browser session) tokens return `not_allowed_token_type`.

We need an alternative way to receive real-time events from Slack.

## Path A: Polling (Phase 1 — Stable)

The simplest and most reliable approach. Poll channels for new messages at intervals.

### How it works

```
Every N seconds:
  1. For each monitored channel:
     - Call conversations.history(oldest: lastSeenTs)
     - If new messages → emit events
     - Update lastSeenTs
  2. For DMs (if monitored):
     - Call conversations.list(types: "im") to find active DMs
     - Poll each active DM
```

### Polling Strategy

```typescript
interface PollingConfig {
  // How often to poll each channel (ms)
  intervalMs: number;              // Default: 3000 (3s)
  
  // Minimum interval to avoid rate limits (ms)
  minIntervalMs: number;           // Default: 1000 (1s)
  
  // Maximum channels to poll per cycle
  maxChannelsPerCycle: number;     // Default: 20
  
  // Stagger requests to avoid bursts
  staggerMs: number;               // Default: 100 (100ms between each channel)
  
  // Back off when no activity detected
  idleMultiplier: number;          // Default: 2 (double interval when idle)
  idleMaxIntervalMs: number;       // Default: 30000 (30s max when idle)
  
  // Resume fast polling when activity detected
  activeIntervalMs: number;        // Default: 2000 (2s when active)
}
```

### Rate Limit Budget

`conversations.history` is Tier 3: 50+ requests/minute.

With 20 channels at 3s intervals:
- 20 channels × 20 polls/min = 400 requests/min ❌ Way over limit

**Solution: Round-robin polling**
- Don't poll all channels every cycle
- Prioritize channels with recent activity
- Batch: poll 3-5 channels per cycle, rotate

```
Cycle 1: [general, dev-feed, funding]     → 3 API calls
Cycle 2: [product, random, pa-dev]        → 3 API calls
Cycle 3: [general, dev-feed, idea]        → 3 API calls (general repeats — active)
...
```

At 3 channels per 3-second cycle: 60 requests/min → within Tier 3 limit ✅

### Tracking State

```typescript
interface ChannelPollState {
  channelId: string;
  channelName: string;
  lastMessageTs: string;        // Latest message timestamp seen
  lastPolledAt: number;         // Unix ms when last polled
  activityScore: number;        // Higher = more active = poll more often
  consecutiveEmpty: number;     // How many polls returned 0 new messages
}
```

### Advantages
- ✅ Uses only documented, stable API methods
- ✅ No reverse engineering
- ✅ Works with xoxc- token (proven)
- ✅ Simple to implement and debug

### Disadvantages
- ❌ Not truly real-time (1-5 second delay typical)
- ❌ Consumes API rate limit budget
- ❌ More channels = slower or higher rate limit usage

## Path B: Web Client WebSocket (Phase 2 — Advanced)

Replicate the Slack web client's internal WebSocket connection.

### How it works

```
1. Call client.userBoot with xoxc- token + d cookie
   → Returns workspace state + WebSocket URL
2. Connect to wss://wss-primary.slack.com/link/...
   → Authenticated via token in query params + cookies
3. Receive real-time events as JSON frames
   → Same events the web client sees
```

### client.userBoot

```http
POST https://app.slack.com/api/client.userBoot
Content-Type: application/x-www-form-urlencoded
Cookie: d={xoxd-cookie}

token={xoxc-token}
```

Expected response (based on reverse engineering):
```json
{
  "ok": true,
  "self": { "id": "U...", "name": "VISION" },
  "team": { "id": "T...", "name": "Muhak 3-7" },
  "url": "wss://wss-primary.slack.com/link/...",
  "channels": [...],
  "ims": [...],
  "...": "..."
}
```

### WebSocket Connection

```typescript
const ws = new WebSocket(bootData.url, {
  headers: {
    'Cookie': `d=${dCookie}`,
    'Origin': 'https://app.slack.com',
    'User-Agent': 'Mozilla/5.0 ...'
  }
});

ws.on('message', (data) => {
  const event = JSON.parse(data);
  // event.type: "message", "reaction_added", "user_typing", etc.
});
```

### Event Types (same as original spec)

All events from the original websocket.md spec remain valid here:
- `message`, `message_changed`, `message_deleted`
- `reaction_added`, `reaction_removed`
- `user_typing`, `presence_change`
- `member_joined_channel`, `member_left_channel`

### Reconnection

Same strategy as original spec:
- Exponential backoff with jitter
- Max 10 attempts
- On token invalid → trigger session refresh

### Risks
- ⚠️ `client.userBoot` is undocumented — could change without notice
- ⚠️ WebSocket URL format may change
- ⚠️ Additional auth headers may be required that we haven't discovered

### Needs POC validation before implementation

## Path C: Browser WebSocket Interception (Fallback)

Keep Playwright browser running and intercept WebSocket frames.

### How it works

```
1. Login via Playwright (already implemented)
2. Navigate to Slack workspace
3. Intercept WebSocket frames via CDP (Chrome DevTools Protocol)
4. Forward events to the bridge
```

### Implementation

```typescript
// After login, navigate to Slack
await page.goto('https://app.slack.com/client/T0A37JX8BC4');

// Intercept WebSocket via CDP
const cdp = await page.context().newCDPSession(page);
await cdp.send('Network.enable');

cdp.on('Network.webSocketFrameReceived', (params) => {
  const payload = JSON.parse(params.response.payloadData);
  if (payload.type === 'message') {
    // Forward to bridge
  }
});
```

### Sending messages via browser

```typescript
// Option 1: Use the API (preferred — faster, more reliable)
await slackClient.chat.postMessage({ channel, text });

// Option 2: Type in the browser (last resort)
await page.click(`[data-qa="message_input"]`);
await page.type(`[data-qa="message_input"]`, message);
await page.keyboard.press('Enter');
```

### Advantages
- ✅ Zero reverse engineering — browser handles WebSocket natively
- ✅ Always up-to-date with Slack's protocol
- ✅ Guaranteed to work (it's literally the web client)

### Disadvantages
- ❌ Resource-heavy (~200-400MB RAM for Chrome)
- ❌ Slower startup (browser launch)
- ❌ Fragile (Slack UI changes can break selectors)
- ❌ Only practical for single workspace

## Recommended Implementation Order

```
Phase 1: Path A (Polling)
  → Works immediately
  → Reliable
  → Good enough for most use cases

Phase 2: Path B (Web Client WS)  
  → If POC validates client.userBoot
  → True real-time
  → More efficient than polling

Fallback: Path C (Browser WS)
  → If Path B breaks
  → Always works
  → Resource trade-off
```

## TypeScript Interface

```typescript
interface EventReceiver extends EventEmitter {
  // Lifecycle
  start(): Promise<void>;
  stop(): Promise<void>;
  
  // Events
  on(event: 'message', handler: (e: SlackMessageEvent) => void): this;
  on(event: 'reaction_added', handler: (e: SlackReactionEvent) => void): this;
  on(event: 'message_changed', handler: (e: SlackMessageChangedEvent) => void): this;
  on(event: 'message_deleted', handler: (e: SlackMessageDeletedEvent) => void): this;
  on(event: 'error', handler: (error: Error) => void): this;
  
  // Info
  getMode(): 'polling' | 'websocket' | 'browser';
  getMetrics(): ReceiverMetrics;
}

interface ReceiverMetrics {
  mode: string;
  startedAt: Date | null;
  eventsReceived: number;
  lastEventAt: Date | null;
  // Polling-specific
  pollCount?: number;
  avgPollLatencyMs?: number;
  // WebSocket-specific
  wsConnectedAt?: Date | null;
  wsReconnectCount?: number;
}
```

## Environment Variables

```bash
# Event receiver mode
RECEIVER_MODE=polling              # polling | websocket | browser

# Polling config
POLL_INTERVAL_MS=3000
POLL_CHANNELS_PER_CYCLE=3
POLL_STAGGER_MS=100
POLL_IDLE_MULTIPLIER=2
POLL_IDLE_MAX_MS=30000

# WebSocket config (Phase 2)
WS_PING_INTERVAL=30000
WS_PONG_TIMEOUT=10000
WS_RECONNECT_MAX_ATTEMPTS=10
WS_RECONNECT_INITIAL_DELAY=1000

# Browser config (fallback)
BROWSER_HEADLESS=true
BROWSER_WS_INTERCEPT=true
```
