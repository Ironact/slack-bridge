# Bridge Spec

## Overview

The Bridge layer connects Slack events/actions to AI agents. It has two directions:

- **Inbound (Slack → Agent):** Real-time events from Slack, forwarded to the agent
- **Outbound (Agent → Slack):** Actions requested by the agent, executed on Slack

## Event Schema

All Slack events are normalized into a standard schema before forwarding:

```typescript
interface BridgeEvent {
  id: string;                    // Unique event ID (uuid)
  type: BridgeEventType;
  timestamp: string;             // ISO 8601
  workspace: {
    id: string;
    name: string;
  };
  channel: {
    id: string;
    name: string;
    type: 'channel' | 'dm' | 'group' | 'mpim';
  };
  user: {
    id: string;
    name: string;
    displayName: string;
    isBot: boolean;
  };
  message?: {
    ts: string;
    text: string;
    threadTs?: string;
    edited?: boolean;
    attachments?: Attachment[];
    files?: FileInfo[];
  };
  reaction?: {
    emoji: string;
    messageTs: string;
  };
  context?: {
    threadMessages?: Message[];    // Thread history if in a thread
    recentMessages?: Message[];    // Recent channel messages for context
    mentionedUsers?: UserInfo[];   // Users mentioned in the message
    channelMembers?: number;       // Channel member count
  };
  raw: any;                       // Original Slack event (for debugging)
}

type BridgeEventType =
  | 'message'
  | 'message_edited'
  | 'message_deleted'
  | 'reaction_added'
  | 'reaction_removed'
  | 'member_joined'
  | 'member_left'
  | 'channel_created'
  | 'file_shared';
```

## Event Delivery

### Mode 1: Webhook (Phase 1)

POST events to a configured URL:

```http
POST {BRIDGE_WEBHOOK_URL}
Content-Type: application/json
X-Bridge-Event: message
X-Bridge-Signature: sha256={hmac}
X-Bridge-Timestamp: 1772701408

{BridgeEvent JSON}
```

**Signature verification:**
```
signature = HMAC-SHA256(
  key: BRIDGE_WEBHOOK_SECRET,
  message: timestamp + "." + body
)
```

**Delivery guarantees:**
- At-least-once delivery
- Retry on 5xx or timeout (3 attempts, exponential backoff)
- Event queue with configurable depth (default 1000)
- Events older than 5 minutes are dropped

### Mode 2: WebSocket (Phase 2)

Bidirectional WebSocket connection:

```
Agent connects to ws://localhost:{BRIDGE_PORT}/ws
  → Receives events as JSON frames
  → Sends actions as JSON frames
```

### Mode 3: OpenClaw Plugin (Phase 3)

Direct integration with OpenClaw's channel system.

## Action API

The Bridge exposes an HTTP API for agents to perform actions on Slack:

### Base URL
```
http://localhost:{BRIDGE_PORT}/api/v1
```

### Authentication
```http
Authorization: Bearer {BRIDGE_AUTH_TOKEN}
```

### Endpoints

#### POST `/messages/send`
Send a message.

```json
{
  "channel": "C0A4RS9QJFP",
  "text": "Hello from the bridge!",
  "threadTs": "1772701408.000000",
  "replyBroadcast": false
}
```

Response:
```json
{
  "ok": true,
  "ts": "1772701500.000000",
  "channel": "C0A4RS9QJFP"
}
```

#### POST `/messages/update`
Edit a message.

```json
{
  "channel": "C0A4RS9QJFP",
  "ts": "1772701500.000000",
  "text": "Updated message text"
}
```

#### POST `/messages/delete`
Delete a message.

```json
{
  "channel": "C0A4RS9QJFP",
  "ts": "1772701500.000000"
}
```

#### GET `/messages/history`
Get channel history.

```
GET /messages/history?channel=C0A4RS9QJFP&limit=50
```

#### GET `/messages/thread`
Get thread replies.

```
GET /messages/thread?channel=C0A4RS9QJFP&ts=1772701408.000000
```

#### POST `/reactions/add`
Add a reaction.

```json
{
  "channel": "C0A4RS9QJFP",
  "ts": "1772701500.000000",
  "emoji": "thumbsup"
}
```

#### POST `/reactions/remove`
Remove a reaction.

```json
{
  "channel": "C0A4RS9QJFP",
  "ts": "1772701500.000000",
  "emoji": "thumbsup"
}
```

#### POST `/files/upload`
Upload a file.

```
POST /files/upload
Content-Type: multipart/form-data

channel=C0A4RS9QJFP
file=@/path/to/file.pdf
title=My Document
comment=Check this out
```

#### GET `/channels`
List channels.

```
GET /channels?types=public_channel,private_channel
```

#### GET `/channels/:id`
Get channel info.

#### POST `/channels/join`
Join a channel.

```json
{
  "channel": "C0A4RS9QJFP"
}
```

#### POST `/channels/leave`
Leave a channel.

#### GET `/users`
List workspace users.

#### GET `/users/:id`
Get user info.

#### POST `/profile/update`
Update own profile/status.

```json
{
  "statusText": "In a meeting",
  "statusEmoji": ":calendar:"
}
```

#### GET `/search`
Search messages.

```
GET /search?query=funding&sort=timestamp&count=20
```

#### POST `/dm/open`
Open a DM with a user.

```json
{
  "userId": "U..."
}
```

#### GET `/health`
Health check endpoint.

```json
{
  "status": "healthy",
  "websocket": "connected",
  "session": "valid",
  "uptime": 3600,
  "lastEvent": "2026-03-05T18:00:00Z",
  "eventsProcessed": 1234
}
```

## Context Enrichment

When forwarding events, the bridge enriches them with context:

### For messages in threads:
```json
{
  "context": {
    "threadMessages": [
      // Last N messages in the thread
    ]
  }
}
```

### For mentions:
```json
{
  "context": {
    "mentionedUsers": [
      { "id": "U...", "name": "Abel", "displayName": "Abel" }
    ]
  }
}
```

### For channel messages (configurable):
```json
{
  "context": {
    "recentMessages": [
      // Last N messages in the channel for context
    ]
  }
}
```

### Context Config
```bash
BRIDGE_CONTEXT_THREAD_DEPTH=20      # Thread messages to include
BRIDGE_CONTEXT_CHANNEL_DEPTH=10     # Recent channel messages
BRIDGE_CONTEXT_INCLUDE_PROFILES=true # Include user profile info
```

## Event Filtering

### Channel Filter
```bash
BRIDGE_CHANNELS=general,dev-feed,funding
# Empty = all channels
```

### Mention Filter
```bash
BRIDGE_MENTION_ONLY=false
# true = only forward messages that mention the bridge user
```

### Bot Filter
```bash
BRIDGE_INCLUDE_BOTS=false
# true = include messages from other bots
```

### Custom Filters (via config)
```json
{
  "filters": [
    { "type": "channel", "include": ["C0A4RS9QJFP", "C..."] },
    { "type": "user", "exclude": ["USLACKBOT"] },
    { "type": "message", "pattern": "^!command" }
  ]
}
```

## TypeScript Interface

```typescript
interface Bridge {
  // Lifecycle
  start(): Promise<void>;
  stop(): Promise<void>;
  
  // Event handling
  onSlackEvent(event: SlackEvent): Promise<void>;
  
  // Action execution
  executeAction(action: BridgeAction): Promise<BridgeActionResult>;
  
  // Health
  getHealth(): BridgeHealth;
}

interface BridgeAction {
  type: 'send_message' | 'update_message' | 'delete_message' 
      | 'add_reaction' | 'remove_reaction' | 'upload_file'
      | 'join_channel' | 'leave_channel' | 'update_profile'
      | 'search' | 'open_dm';
  params: Record<string, any>;
}

interface BridgeActionResult {
  ok: boolean;
  data?: any;
  error?: string;
}
```
