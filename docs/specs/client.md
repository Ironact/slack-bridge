# Slack Client Spec

## Overview

The Slack Client communicates with Slack's servers using the authenticated user's credentials (`xoxc-` token + `d` cookie). It wraps Slack's internal web APIs — the same endpoints the Slack web client calls.

## Base Request Format

All Slack internal API calls follow this pattern:

```http
POST https://{workspace}.slack.com/api/{method}
Content-Type: application/x-www-form-urlencoded

token={xoxc-token}&{params}
```

Headers:
```http
Cookie: d={d-cookie}
```

## API Methods

### Messages

#### `chat.postMessage`
Send a message to a channel or DM.

```typescript
interface PostMessageParams {
  channel: string;      // Channel ID (C...) or DM ID (D...)
  text: string;         // Message text (supports mrkdwn)
  thread_ts?: string;   // Reply to thread
  reply_broadcast?: boolean; // Also send to channel
  unfurl_links?: boolean;
  unfurl_media?: boolean;
}
```

#### `chat.update`
Edit an existing message.

```typescript
interface UpdateMessageParams {
  channel: string;
  ts: string;           // Message timestamp (ID)
  text: string;         // New message text
}
```

#### `chat.delete`
Delete a message.

```typescript
interface DeleteMessageParams {
  channel: string;
  ts: string;
}
```

#### `conversations.history`
Fetch channel message history.

```typescript
interface HistoryParams {
  channel: string;
  limit?: number;       // Default 100, max 1000
  cursor?: string;      // Pagination
  oldest?: string;      // Start timestamp
  latest?: string;      // End timestamp
  inclusive?: boolean;
}
```

#### `conversations.replies`
Fetch thread replies.

```typescript
interface RepliesParams {
  channel: string;
  ts: string;           // Parent message timestamp
  limit?: number;
  cursor?: string;
}
```

### Reactions

#### `reactions.add`
```typescript
interface AddReactionParams {
  channel: string;
  timestamp: string;    // Message timestamp
  name: string;         // Emoji name (without colons)
}
```

#### `reactions.remove`
```typescript
interface RemoveReactionParams {
  channel: string;
  timestamp: string;
  name: string;
}
```

### Files

#### `files.uploadV2`
Upload a file to a channel.

```typescript
interface UploadFileParams {
  channels: string[];   // Channel IDs
  content?: Buffer;     // File content
  filename: string;
  filetype?: string;    // Auto-detected if omitted
  title?: string;
  initial_comment?: string;
  thread_ts?: string;
}
```

#### `files.list`
```typescript
interface ListFilesParams {
  channel?: string;
  user?: string;
  types?: string;       // "images", "pdfs", etc.
  count?: number;
  page?: number;
}
```

### Channels

#### `conversations.list`
```typescript
interface ListChannelsParams {
  types?: string;       // "public_channel,private_channel,mpim,im"
  exclude_archived?: boolean;
  limit?: number;
  cursor?: string;
}
```

#### `conversations.join`
```typescript
interface JoinChannelParams {
  channel: string;      // Channel ID
}
```

#### `conversations.leave`
```typescript
interface LeaveChannelParams {
  channel: string;
}
```

#### `conversations.create`
```typescript
interface CreateChannelParams {
  name: string;
  is_private?: boolean;
}
```

#### `conversations.info`
```typescript
interface ChannelInfoParams {
  channel: string;
}
```

### Users

#### `users.list`
```typescript
interface ListUsersParams {
  limit?: number;
  cursor?: string;
}
```

#### `users.info`
```typescript
interface UserInfoParams {
  user: string;         // User ID
}
```

#### `users.profile.set`
```typescript
interface SetProfileParams {
  profile: {
    status_text?: string;
    status_emoji?: string;
    display_name?: string;
    first_name?: string;
    last_name?: string;
  };
}
```

### Search

#### `search.messages`
```typescript
interface SearchMessagesParams {
  query: string;
  sort?: 'score' | 'timestamp';
  sort_dir?: 'asc' | 'desc';
  count?: number;
  page?: number;
}
```

### DM

#### `conversations.open`
Open or find a DM channel with a user.

```typescript
interface OpenDMParams {
  users: string;        // User ID (or comma-separated for group DM)
}
```

## Rate Limiting

Slack applies rate limits to internal API calls. Strategy:

```
1. Track response headers for rate limit info
2. On 429 (Too Many Requests):
   - Read Retry-After header
   - Queue the request
   - Retry after the specified delay
3. Proactive throttling:
   - Max 1 request per 100ms per method (configurable)
   - Burst queue with configurable depth
```

### Rate Limiter Config
```typescript
interface RateLimitConfig {
  defaultIntervalMs: number;     // 100ms between calls
  maxBurst: number;              // 10 queued requests
  retryMaxAttempts: number;      // 3 retries on 429
  backoffMultiplier: number;     // 2x exponential backoff
}
```

## Error Handling

All API calls return a standard result:

```typescript
interface SlackAPIResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
  response_metadata?: {
    next_cursor?: string;
    scopes?: string[];
  };
}
```

Common errors:
| Error | Meaning | Action |
|-------|---------|--------|
| `invalid_auth` | Token expired | Trigger session refresh |
| `token_revoked` | User revoked access | Trigger re-login |
| `ratelimited` | Too many requests | Backoff and retry |
| `channel_not_found` | Invalid channel | Return error |
| `not_in_channel` | Need to join first | Auto-join or return error |
| `cant_delete_message` | Not your message | Return error |

## TypeScript Interface

```typescript
interface SlackClient {
  // Messages
  postMessage(params: PostMessageParams): Promise<SlackAPIResult<Message>>;
  updateMessage(params: UpdateMessageParams): Promise<SlackAPIResult<Message>>;
  deleteMessage(params: DeleteMessageParams): Promise<SlackAPIResult<void>>;
  getHistory(params: HistoryParams): Promise<SlackAPIResult<Message[]>>;
  getReplies(params: RepliesParams): Promise<SlackAPIResult<Message[]>>;
  
  // Reactions
  addReaction(params: AddReactionParams): Promise<SlackAPIResult<void>>;
  removeReaction(params: RemoveReactionParams): Promise<SlackAPIResult<void>>;
  
  // Files
  uploadFile(params: UploadFileParams): Promise<SlackAPIResult<File>>;
  listFiles(params: ListFilesParams): Promise<SlackAPIResult<File[]>>;
  
  // Channels
  listChannels(params: ListChannelsParams): Promise<SlackAPIResult<Channel[]>>;
  joinChannel(params: JoinChannelParams): Promise<SlackAPIResult<Channel>>;
  leaveChannel(params: LeaveChannelParams): Promise<SlackAPIResult<void>>;
  createChannel(params: CreateChannelParams): Promise<SlackAPIResult<Channel>>;
  getChannelInfo(params: ChannelInfoParams): Promise<SlackAPIResult<Channel>>;
  
  // Users
  listUsers(params: ListUsersParams): Promise<SlackAPIResult<User[]>>;
  getUserInfo(params: UserInfoParams): Promise<SlackAPIResult<User>>;
  setProfile(params: SetProfileParams): Promise<SlackAPIResult<void>>;
  
  // Search
  searchMessages(params: SearchMessagesParams): Promise<SlackAPIResult<SearchResult>>;
  
  // DM
  openDM(params: OpenDMParams): Promise<SlackAPIResult<Channel>>;
}
```
