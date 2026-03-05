# Architecture Overview

> **Updated**: Revised based on research findings. RTM is not viable with xoxc- tokens.
> Phase 1 uses SDK + polling. Phase 2 adds WebSocket via web client internal protocol.

## Design Philosophy

1. **SDK over raw HTTP** — Use official `@slack/web-api` with cookie injection
2. **Browser for auth only** — Playwright handles login, then gets out of the way
3. **Conservative API usage** — Aggressive calls invalidate tokens; be lazy and cache
4. **Stateless bridge** — The bridge is a pipe; intelligence lives in the AI agent

## System Architecture

```
┌──────────────────────────────────────────────────────┐
│                     AI Agent                          │
│             (OpenClaw, Claude, etc.)                   │
└───────────────────────┬──────────────────────────────┘
                        │
             ┌──────────▼──────────┐
             │    Bridge Layer     │
             │                     │
             │  ┌───────────────┐  │
             │  │ Event Emitter │  │  Slack → Agent (webhook)
             │  └───────────────┘  │
             │  ┌───────────────┐  │
             │  │ Action Handler│  │  Agent → Slack (HTTP API)
             │  └───────────────┘  │
             └──────────┬──────────┘
                        │
             ┌──────────▼──────────┐
             │    Slack Client     │
             │  (@slack/web-api)   │
             │                     │
             │  ┌───────┐ ┌─────┐ │
             │  │  SDK  │ │Event│ │
             │  │ + d   │ │Recv │ │
             │  │cookie │ │(poll│ │
             │  │       │ │/WS) │ │
             │  └───┬───┘ └──┬──┘ │
             └──────┼────────┼────┘
                    │        │
             ┌──────▼────────▼────┐
             │  Session Manager   │
             │                    │
             │  xoxc- token       │
             │  d cookie (xoxd-)  │
             │  storageState      │
             └────────┬───────────┘
                      │
             ┌────────▼───────────┐
             │    Auth Layer      │
             │                    │
             │  Playwright login  │
             │  localStorage read │
             │  Cookie extraction │
             │  storageState save │
             └────────────────────┘
```

## Component Responsibilities

### Auth Layer
**Purpose:** Get valid Slack credentials from a browser login.

- Opens Playwright with Chromium
- Navigates to `{workspace}.slack.com`
- Supports Google OAuth and email/password login
- Extracts `xoxc-` token from `localStorage.localConfig_v2`
- Extracts `d` cookie from browser cookies
- Saves browser state via `storageState()` for session restoration
- Only runs when: first login, session expired, or user requests

### Session Manager
**Purpose:** Keep credentials valid and manage their lifecycle.

- Loads `storageState` from disk on startup
- Validates token via `auth.test` (SDK call)
- Token lasts weeks/months — no aggressive refresh needed
- On token death: restore storageState → if dead → re-login via Auth Layer
- Provides credentials to Slack Client

### Slack Client
**Purpose:** Communicate with Slack as a human user.

Two sub-components:

**SDK Client** — Outbound operations
- Official `@slack/web-api` WebClient with `requestInterceptor`
- Injects `Cookie: d=xoxd-...` and `Origin: https://app.slack.com`
- Lazy user/channel caching to avoid token invalidation
- Rate limiting: conservative (40 req/min global cap)

**Event Receiver** — Inbound events
- **Phase 1:** Polling via `conversations.history` (round-robin, 3-5 channels/cycle)
- **Phase 2:** Web client WebSocket via `client.userBoot` (undocumented)
- **Fallback:** Playwright browser WebSocket interception via CDP
- Emits normalized events to Bridge Layer

### Bridge Layer
**Purpose:** Connect Slack events/actions to AI agents.

**Event Emitter** — Slack → Agent
- Receives events from Event Receiver
- Normalizes into standard schema
- Filters (channels, mentions, bots)
- Enriches with context (thread history, user info)
- Delivers via webhook POST

**Action Handler** — Agent → Slack
- HTTP API server (Fastify)
- Validates requests (auth token)
- Translates to SDK calls
- Returns results

## Data Flow

### Receiving a message (Phase 1 — Polling)

```
Polling timer fires
  → conversations.history(channel, oldest: lastTs)
    → New messages found
      → Event Emitter (normalize, filter, enrich)
        → Webhook POST to AI agent
```

### Receiving a message (Phase 2 — WebSocket)

```
Slack servers
  → WebSocket frame (JSON)
    → Event Receiver (parse)
      → Event Emitter (normalize, filter, enrich)
        → Webhook POST to AI agent
```

### Sending a message

```
AI agent
  → HTTP POST to Bridge Action API
    → Action Handler (validate)
      → SDK client.chat.postMessage()
        → Slack servers
          → Appears as the human user (no BOT badge)
```

## Configuration Model

```
.env file
  → Config loader (src/config/env.ts)
    → Zod validation
      → Typed config object
        → Injected into all components
```

All secrets via environment variables. Never hardcoded.

## Process Model

```
Main process (Node.js)
  ├── Auth Layer (on-demand, spawns Playwright)
  ├── Session Manager (periodic validation, every 5 min)
  ├── Event Receiver (polling timer or WS connection)
  ├── Bridge HTTP Server (Fastify, always listening)
  └── Health endpoint (/health)
```

## Error Handling

| Error | Response |
|-------|----------|
| Token dead (`invalid_auth`) | Auto re-login via Auth Layer |
| Rate limited (429) | SDK auto-retry + backoff |
| WebSocket disconnect (Phase 2) | Reconnect with backoff |
| Network down | Queue events, retry on recovery |
| Polling finds no messages | Increase interval (idle backoff) |
| Auth Layer login fails | Log error, notify user, retry with headed mode |
