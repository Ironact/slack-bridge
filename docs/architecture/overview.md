# Architecture Overview

## Design Philosophy

slack-bridge follows three core principles:

1. **API over UI** — Never click buttons when you can call APIs
2. **Browser for auth only** — Playwright handles login, then gets out of the way
3. **Stateless bridge** — The bridge is a pipe; intelligence lives in the AI agent

## System Architecture

```
┌──────────────────────────────────────────────────────────┐
│                      AI Agent                            │
│              (OpenClaw, Claude, GPT, etc.)                │
└────────────────────────┬─────────────────────────────────┘
                         │
              ┌──────────▼──────────┐
              │    Bridge Layer     │
              │                     │
              │  ┌───────────────┐  │
              │  │ Event Emitter │  │  Slack → Agent (webhook/ws)
              │  └───────────────┘  │
              │  ┌───────────────┐  │
              │  │ Action Handler│  │  Agent → Slack (HTTP API)
              │  └───────────────┘  │
              └──────────┬──────────┘
                         │
              ┌──────────▼──────────┐
              │    Slack Client     │
              │                     │
              │  ┌───────┐ ┌─────┐ │
              │  │  API  │ │ WS  │ │
              │  │Client │ │Recv │ │
              │  └───┬───┘ └──┬──┘ │
              │      │        │    │
              └──────┼────────┼────┘
                     │        │
              ┌──────▼────────▼────┐
              │  Session Manager   │
              │                    │
              │  xoxc- token       │
              │  d cookie          │
              │  workspace meta    │
              └────────┬───────────┘
                       │
              ┌────────▼───────────┐
              │    Auth Layer      │
              │                    │
              │  Playwright login  │
              │  Token extraction  │
              │  Session storage   │
              └────────────────────┘
```

## Component Responsibilities

### Auth Layer
**Purpose:** Get valid Slack credentials from a browser login.

- Opens a Playwright browser instance
- Navigates to the Slack workspace login page
- Supports multiple auth methods (Google OAuth, email/password, SSO)
- Extracts `xoxc-` token and `d` cookie from browser storage
- Encrypts and stores session data locally
- Only runs when:
  - First-time login
  - Session expired and can't be refreshed
  - User explicitly requests re-login

### Session Manager
**Purpose:** Keep credentials valid and manage their lifecycle.

- Loads encrypted session from disk on startup
- Validates token freshness via Slack API (`auth.test`)
- Refreshes tokens before expiry when possible
- Triggers re-auth (Auth Layer) when refresh fails
- Provides credential access to other components
- Tracks session health metrics

### Slack Client
**Purpose:** Communicate with Slack as a human user.

Two sub-components:

**API Client** — Outbound operations
- Wraps Slack's internal web API endpoints
- Uses `xoxc-` token + `d` cookie for auth
- Handles rate limiting with exponential backoff
- Methods mirror human capabilities (send, edit, delete, react, search, etc.)

**WebSocket Receiver** — Inbound real-time events
- Connects to Slack's WebSocket endpoint
- Receives all workspace events in real-time
- Handles reconnection automatically
- Parses raw events into typed objects

### Bridge Layer
**Purpose:** Connect Slack events/actions to AI agents.

**Event Emitter** — Slack → Agent
- Receives events from WebSocket Receiver
- Normalizes into a standard event schema
- Filters based on configuration (channels, mentions, etc.)
- Enriches with context (channel info, user info, thread history)
- Delivers via configured transport (webhook, WebSocket, etc.)

**Action Handler** — Agent → Slack
- Exposes HTTP API for agent actions
- Validates and authorizes requests
- Translates to Slack Client API calls
- Returns results to the agent

## Data Flow

### Receiving a message

```
Slack servers
  → WebSocket frame
    → WS Receiver (parse)
      → Event Emitter (normalize, filter, enrich)
        → Webhook POST to AI agent
```

### Sending a message

```
AI agent
  → HTTP POST to Bridge API
    → Action Handler (validate)
      → API Client (chat.postMessage)
        → Slack servers
          → Appears in Slack as the human user
```

## Configuration Model

All configuration flows through environment variables:

```
.env file
  → Config loader (src/config/env.ts)
    → Zod validation
      → Typed config object
        → Injected into all components
```

No configuration is ever hardcoded. Every secret, URL, and behavior flag is externalized.

## Process Model

slack-bridge runs as a single Node.js process:

```
Main process
  ├── Auth (on-demand, spawns browser)
  ├── Session Manager (background, periodic checks)
  ├── WebSocket Receiver (persistent connection)
  ├── Bridge HTTP Server (always listening)
  └── Health Check endpoint
```

For production, it can be managed as a system service (systemd, launchd, Docker).

## Error Handling Strategy

| Error | Response |
|-------|----------|
| WebSocket disconnect | Auto-reconnect with backoff |
| Token expired | Auto-refresh via Session Manager |
| Refresh failed | Trigger re-login via Auth Layer |
| Rate limited | Exponential backoff + queue |
| API error | Log + return error to agent |
| Network down | Queue events, retry on recovery |

## Thread Safety

Node.js is single-threaded, so no mutex/locks needed. However:
- WebSocket events and HTTP requests are interleaved via the event loop
- Session refresh is serialized (one refresh at a time)
- API calls use a rate limiter queue
