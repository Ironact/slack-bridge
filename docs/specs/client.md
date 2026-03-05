# Slack Client Spec

## Overview

> **Updated after research**: Use the official `@slack/web-api` SDK with
> `requestInterceptor` for cookie injection. No need to build a raw HTTP client.

The Slack Client wraps the official Node.js SDK, injecting the `d` cookie
and `Origin` header to authenticate as a real user via xoxc- token.

## SDK Setup

### Dependencies

```json
{
  "@slack/web-api": "^7.x"
}
```

### Client Initialization

```typescript
import { WebClient, LogLevel } from '@slack/web-api';

interface SlackClientOptions {
  token: string;        // xoxc-...
  cookie: string;       // xoxd-...
  workspaceUrl?: string;
}

function createSlackClient(options: SlackClientOptions): WebClient {
  return new WebClient(options.token, {
    logLevel: LogLevel.INFO,
    
    // Inject d cookie + Origin header on every request
    requestInterceptor: (config) => {
      config.headers = config.headers || {};
      config.headers['Cookie'] = `d=${options.cookie}`;
      config.headers['Origin'] = 'https://app.slack.com';
      return config;
    },
  });
}
```

### Why This Works

The Slack web client makes the same API calls (`chat.postMessage`, `conversations.history`, etc.)
as the public API — the endpoints are identical. The only difference is authentication:
- Public apps use `xoxb-` or `xoxp-` tokens via OAuth
- Web client uses `xoxc-` token + `d` cookie from the browser session

By injecting the cookie, the official SDK works transparently with user credentials.

## API Methods

All methods below use the SDK's built-in types and error handling.

### Messages

```typescript
// Send a message
const result = await client.chat.postMessage({
  channel: 'C0A4RS9QJFP',
  text: 'Hello from slack-bridge!',
  thread_ts: '1772701408.000000',   // optional: reply to thread
});

// Edit a message
await client.chat.update({
  channel: 'C0A4RS9QJFP',
  ts: '1772701500.000000',
  text: 'Updated message',
});

// Delete a message
await client.chat.delete({
  channel: 'C0A4RS9QJFP',
  ts: '1772701500.000000',
});

// Get channel history
const history = await client.conversations.history({
  channel: 'C0A4RS9QJFP',
  limit: 50,
  oldest: '1772700000.000000',  // optional: messages after this timestamp
});

// Get thread replies
const replies = await client.conversations.replies({
  channel: 'C0A4RS9QJFP',
  ts: '1772701408.000000',
  limit: 50,
});
```

### Reactions

```typescript
// Add reaction
await client.reactions.add({
  channel: 'C0A4RS9QJFP',
  timestamp: '1772701500.000000',
  name: 'thumbsup',
});

// Remove reaction
await client.reactions.remove({
  channel: 'C0A4RS9QJFP',
  timestamp: '1772701500.000000',
  name: 'thumbsup',
});
```

### Files

```typescript
// Upload file (new flow — files.upload deprecated Nov 2025)
const uploadUrl = await client.files.getUploadURLExternal({
  filename: 'report.pdf',
  length: fileBuffer.length,
});

// PUT file content to the URL
await fetch(uploadUrl.upload_url, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/octet-stream' },
  body: fileBuffer,
});

// Complete upload
await client.files.completeUploadExternal({
  files: [{ id: uploadUrl.file_id, title: 'Monthly Report' }],
  channel_id: 'C0A4RS9QJFP',
});
```

### Channels

```typescript
// List channels
const channels = await client.conversations.list({
  types: 'public_channel,private_channel',
  exclude_archived: true,
  limit: 200,
});

// Join channel
await client.conversations.join({ channel: 'C0A4RS9QJFP' });

// Leave channel
await client.conversations.leave({ channel: 'C0A4RS9QJFP' });

// Channel info
const info = await client.conversations.info({ channel: 'C0A4RS9QJFP' });
```

### Users

```typescript
// List users (use sparingly — aggressive use can invalidate tokens!)
const users = await client.users.list({ limit: 100 });

// Single user info (preferred — lazy loading)
const user = await client.users.info({ user: 'U123456' });

// Update own profile
await client.users.profile.set({
  profile: {
    status_text: 'Working on slack-bridge',
    status_emoji: ':bridge_at_night:',
  },
});
```

### Search

```typescript
const results = await client.search.messages({
  query: 'funding YC',
  sort: 'timestamp',
  sort_dir: 'desc',
  count: 20,
});
```

### DM

```typescript
// Open DM with a user
const dm = await client.conversations.open({ users: 'U123456' });
const dmChannelId = dm.channel.id;

// Then send message to DM channel
await client.chat.postMessage({ channel: dmChannelId, text: 'Hey!' });
```

## ⚠️ Critical: Token Invalidation Prevention

Research shows xoxc- tokens can be invalidated by aggressive API usage (slack-mcp-server Issue #86).

### Rules

1. **Never bulk-fetch users at startup** — use lazy loading
2. **Never poll more than 3-5 channels per cycle**
3. **Always respect rate limits** — check `Retry-After` on 429
4. **Cache aggressively** — user info, channel info rarely changes
5. **Stagger requests** — minimum 100ms between API calls

### User Cache

```typescript
interface UserCache {
  // Lazy-load: only fetch when needed
  getUser(userId: string): Promise<UserInfo>;
  
  // Cache for 1 hour
  readonly ttlMs: number;  // 3600000
  
  // Never pre-populate
  // Never fetch all users
}
```

### Channel Cache

```typescript
interface ChannelCache {
  // Fetch channel list once at startup, refresh every 30 min
  getChannels(): Promise<ChannelInfo[]>;
  getChannel(channelId: string): Promise<ChannelInfo>;
  
  readonly refreshIntervalMs: number;  // 1800000
}
```

## Rate Limiting

The SDK handles rate limiting automatically (`rejectRateLimitedCalls: false` by default).
But we add additional safeguards:

```typescript
interface RateLimitConfig {
  // Global rate limit across all methods
  globalMaxPerMinute: number;      // Default: 40 (conservative)
  
  // Per-method limits (subset of Slack's tiers)
  methodTiers: {
    'chat.postMessage': number;    // 1/sec/channel
    'conversations.history': number; // 50/min
    'users.info': number;          // 20/min
    'search.messages': number;     // 20/min
  };
  
  // Minimum delay between any two API calls
  minDelayMs: number;              // Default: 100
}
```

## Error Handling

The SDK throws typed errors:

```typescript
import { ErrorCode } from '@slack/web-api';

try {
  await client.chat.postMessage({ channel, text });
} catch (error) {
  if (error.code === ErrorCode.PlatformError) {
    switch (error.data.error) {
      case 'invalid_auth':
      case 'token_revoked':
        // → Trigger session refresh
        break;
      case 'ratelimited':
        // → SDK handles retry automatically
        break;
      case 'channel_not_found':
      case 'not_in_channel':
        // → Return error to bridge
        break;
    }
  }
}
```

### Token Death Detection

```typescript
const TOKEN_DEATH_ERRORS = [
  'invalid_auth',
  'token_revoked',
  'account_inactive',
  'token_expired',
  'not_authed',
];

function isTokenDead(error: string): boolean {
  return TOKEN_DEATH_ERRORS.includes(error);
}
```

## Log Masking

All token values must be masked in logs:

```typescript
function maskToken(token: string): string {
  if (token.startsWith('xoxc-')) return 'xoxc-****';
  if (token.startsWith('xoxd-')) return 'xoxd-****';
  return '****';
}
```

## TypeScript Interface

```typescript
interface SlackClientWrapper {
  // The underlying SDK client
  readonly raw: WebClient;
  
  // High-level methods with caching + error handling
  sendMessage(channel: string, text: string, threadTs?: string): Promise<MessageResult>;
  editMessage(channel: string, ts: string, text: string): Promise<void>;
  deleteMessage(channel: string, ts: string): Promise<void>;
  getHistory(channel: string, limit?: number, oldest?: string): Promise<Message[]>;
  getThread(channel: string, ts: string, limit?: number): Promise<Message[]>;
  
  addReaction(channel: string, ts: string, emoji: string): Promise<void>;
  removeReaction(channel: string, ts: string, emoji: string): Promise<void>;
  
  uploadFile(channel: string, file: Buffer, filename: string, comment?: string): Promise<void>;
  
  getChannels(): Promise<Channel[]>;
  getChannel(channelId: string): Promise<Channel>;
  joinChannel(channelId: string): Promise<void>;
  leaveChannel(channelId: string): Promise<void>;
  
  getUser(userId: string): Promise<User>;
  setStatus(text: string, emoji: string): Promise<void>;
  
  search(query: string, count?: number): Promise<SearchResult>;
  openDM(userId: string): Promise<string>;  // Returns DM channel ID
  
  // Health
  testAuth(): Promise<AuthResult>;
  isTokenValid(): Promise<boolean>;
}
```

## Environment Variables

```bash
# API behavior
SLACK_API_MAX_PER_MINUTE=40
SLACK_API_MIN_DELAY_MS=100
SLACK_API_LOG_LEVEL=info

# Caching
SLACK_CACHE_USER_TTL_MS=3600000      # 1 hour
SLACK_CACHE_CHANNEL_TTL_MS=1800000   # 30 min
```
