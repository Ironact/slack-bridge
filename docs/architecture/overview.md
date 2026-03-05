# Architecture Overview

> **Updated after POC**: RTM WebSocket works with xoxc- tokens.
> Primary event path is now RTM, not polling.

## Design Philosophy

1. **SDK over raw HTTP** — Official `@slack/web-api` with cookie injection
2. **RTM for events** — Real-time via `rtm.connect` WebSocket
3. **Browser for auth only** — Playwright handles login, then gets out of the way
4. **Conservative API usage** — Aggressive calls invalidate tokens
5. **Stateless bridge** — The bridge is a pipe; intelligence lives in the AI agent

## System Architecture

```
┌──────────────────────────────────────────────────────┐
│                     AI Agent                          │
│             (OpenClaw, Claude, etc.)                   │
└───────────────┬───────────────────┬──────────────────┘
                │                   │
         Webhook POST          REST API
         (events)              (actions)
                │                   │
┌───────────────▼───────────────────▼──────────────────┐
│                   Bridge Layer                        │
│                                                       │
│   ┌─────────────────┐     ┌────────────────────┐     │
│   │  Event Emitter   │     │  Action Handler     │     │
│   │  (normalize,     │     │  (validate,         │     │
│   │   filter,        │     │   translate to SDK)  │     │
│   │   enrich,        │     │                      │     │
│   │   webhook)       │     │                      │     │
│   └────────▲────────┘     └─────────┬──────────┘     │
│            │                        │                  │
└────────────┼────────────────────────┼──────────────────┘
             │                        │
┌────────────┼────────────────────────┼──────────────────┐
│            │     Slack Client       │                   │
│  ┌─────────┴────────┐   ┌──────────▼──────────┐       │
│  │   RTM Receiver    │   │    SDK Client        │       │
│  │                   │   │  (@slack/web-api)    │       │
│  │  rtm.connect      │   │                      │       │
│  │  → WebSocket      │   │  requestInterceptor  │       │
│  │  → JSON events    │   │  → d cookie inject   │       │
│  │                   │   │                      │       │
│  │  [polling         │   │                      │       │
│  │   fallback]       │   │                      │       │
│  └─────────┬────────┘   └──────────┬──────────┘       │
│            │                        │                   │
└────────────┼────────────────────────┼──────────────────┘
             │                        │
             └───────────┬────────────┘
                         │
┌────────────────────────▼───────────────────────────────┐
│                  Session Manager                        │
│                                                         │
│   xoxc- token  +  d cookie  +  storageState            │
│   Periodic validation (auth.test every 5 min)          │
│   Auto re-login on token death                          │
└────────────────────────┬───────────────────────────────┘
                         │
┌────────────────────────▼───────────────────────────────┐
│                   Auth Layer                             │
│                                                         │
│   Playwright → login → extract token + cookie           │
│   storageState save/restore for session persistence     │
└─────────────────────────────────────────────────────────┘
```

## Data Flow

### Receiving a message (RTM — primary)

```
Slack servers
  → RTM WebSocket frame: {"type":"message","user":"U...","text":"hello"}
    → RTM Receiver (parse, validate)
      → Event Emitter (normalize, filter, enrich)
        → Webhook POST to AI agent
```

### Receiving a message (Polling — fallback)

```
Polling timer fires
  → SDK: conversations.history(channel, oldest: lastTs)
    → New messages found
      → Event Emitter (normalize, filter, enrich)
        → Webhook POST to AI agent
```

### Sending a message

```
AI agent
  → HTTP POST to Bridge /api/messages
    → Action Handler (validate auth token)
      → SDK: client.chat.postMessage(channel, text)
        → Slack servers
          → Appears as human user (no BOT badge)
```

## Component Responsibilities

### Auth Layer
- Playwright browser login (Google OAuth / email+password)
- Token extraction from `localStorage.localConfig_v2`
- d cookie extraction from browser cookies
- `storageState()` save/restore for session persistence
- Only runs: first login, token death, or manual re-login

### Session Manager
- Loads storageState from disk on startup
- Validates token via `auth.test` every 5 minutes
- Token lasts weeks/months — no aggressive refresh
- On token death → restore storageState → if dead → re-login
- Provides credentials to Slack Client

### Slack Client: SDK
- `@slack/web-api` WebClient with `requestInterceptor`
- Injects `Cookie: d=xoxd-...` header on every request
- **Must use form-urlencoded** (not JSON) for xoxc- tokens
- Lazy user/channel caching
- Conservative rate limiting (40 req/min global)

### Slack Client: RTM Receiver
- `rtm.connect` → get WSS URL
- Connect, receive JSON event frames
- Ping/pong keepalive every 30 seconds
- Exponential backoff reconnection
- Falls back to polling after 10 failed reconnects

### Bridge Layer
- **Event Emitter**: Normalize events → filter → enrich → webhook POST
- **Action Handler**: HTTP API server (Fastify) → validate → SDK calls

## Error Handling

| Error | Response |
|-------|----------|
| Token dead (`invalid_auth`) | Auto re-login via Auth Layer |
| Rate limited (429) | SDK auto-retry + backoff |
| RTM disconnect (clean) | Reconnect immediately |
| RTM disconnect (error) | Reconnect with backoff |
| RTM pong timeout | Force close + reconnect |
| RTM max reconnects | Fall back to polling |
| Network down | Queue events, retry on recovery |
| Login fails | Log error, notify user |

## Process Model

```
Main process (Node.js)
  ├── Auth Layer (on-demand, spawns Playwright)
  ├── Session Manager (validation timer: every 5 min)
  ├── RTM Receiver (WebSocket connection, always connected)
  │   └── Polling fallback (if RTM fails)
  ├── Bridge HTTP Server (Fastify, always listening)
  └── Health endpoint (/health)
```
