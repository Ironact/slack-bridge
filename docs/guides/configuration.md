# Configuration Guide

> **Updated**: Reflects SDK-based approach and polling-first architecture.

## Overview

All configuration is managed via environment variables. No config files, no hardcoded values.
Use a `.env` file for local development (never commit it).

## Environment Variables

### Required

| Variable | Description | Example |
|----------|-------------|---------|
| `SLACK_WORKSPACE_URL` | Slack workspace domain | `muhak3-7.slack.com` |
| `SLACK_EMAIL` | Login email address | `vision@ironact.net` |

### Authentication

| Variable | Default | Description |
|----------|---------|-------------|
| `SLACK_PASSWORD` | — | Password for email/password login |
| `SLACK_AUTH_METHOD` | `auto` | Login method: `auto`, `google`, `password` |
| `SLACK_AUTH_HEADED` | `false` | Show browser window during login |
| `SLACK_AUTH_TIMEOUT` | `120000` | Login timeout in ms |

### Session

| Variable | Default | Description |
|----------|---------|-------------|
| `SLACK_SESSION_DIR` | `./data/sessions` | Session storage directory |
| `SLACK_SESSION_ENCRYPT_KEY` | — | Optional encryption key for session files |
| `SESSION_CHECK_INTERVAL` | `300000` | Token validation interval (5 min) |
| `SESSION_MAX_FAILURES` | `3` | Re-login after N consecutive failures |

### Bridge Server

| Variable | Default | Description |
|----------|---------|-------------|
| `BRIDGE_PORT` | `3001` | HTTP server port |
| `BRIDGE_HOST` | `127.0.0.1` | HTTP server bind address |
| `BRIDGE_AUTH_TOKEN` | — | Bearer token for API authentication |
| `BRIDGE_WEBHOOK_URL` | — | Webhook destination URL for events |
| `BRIDGE_WEBHOOK_SECRET` | — | HMAC signing key for webhook payloads |

### Event Receiver

| Variable | Default | Description |
|----------|---------|-------------|
| `RECEIVER_MODE` | `rtm` | Event mode: `rtm` (WebSocket), `polling` (fallback) |

#### RTM WebSocket (Primary)

| Variable | Default | Description |
|----------|---------|-------------|
| `WS_PING_INTERVAL_MS` | `30000` | Ping interval |
| `WS_PONG_TIMEOUT_MS` | `10000` | Pong deadline |
| `WS_RECONNECT_MAX_ATTEMPTS` | `10` | Max reconnection attempts |
| `WS_RECONNECT_INITIAL_DELAY_MS` | `1000` | Initial reconnect delay |
| `WS_RECONNECT_MAX_DELAY_MS` | `60000` | Max reconnect delay |

#### Polling (Fallback)

| Variable | Default | Description |
|----------|---------|-------------|
| `POLL_INTERVAL_MS` | `3000` | Base polling interval |
| `POLL_CHANNELS_PER_CYCLE` | `3` | Channels to poll per cycle |
| `POLL_STAGGER_MS` | `100` | Delay between requests in a cycle |

### Filtering

| Variable | Default | Description |
|----------|---------|-------------|
| `BRIDGE_CHANNELS` | — | Comma-separated channel names/IDs (empty = all) |
| `BRIDGE_MENTION_ONLY` | `false` | Only forward messages mentioning the user |
| `BRIDGE_INCLUDE_BOTS` | `false` | Include bot messages in events |
| `BRIDGE_SELF_EXCLUDE` | `true` | Exclude own messages from events |

### Context Enrichment

| Variable | Default | Description |
|----------|---------|-------------|
| `BRIDGE_CONTEXT_THREAD_DEPTH` | `20` | Thread messages to include |
| `BRIDGE_CONTEXT_CHANNEL_DEPTH` | `10` | Recent channel messages for context |
| `BRIDGE_CONTEXT_INCLUDE_PROFILES` | `true` | Include user profiles in events |

### Slack API

| Variable | Default | Description |
|----------|---------|-------------|
| `SLACK_API_MAX_PER_MINUTE` | `40` | Global API rate limit (conservative) |
| `SLACK_API_MIN_DELAY_MS` | `100` | Minimum delay between API calls |
| `SLACK_API_LOG_LEVEL` | `info` | SDK log level |
| `SLACK_CACHE_USER_TTL_MS` | `3600000` | User cache TTL (1 hour) |
| `SLACK_CACHE_CHANNEL_TTL_MS` | `1800000` | Channel cache TTL (30 min) |

### Logging

| Variable | Default | Description |
|----------|---------|-------------|
| `LOG_LEVEL` | `info` | Log level: `debug`, `info`, `warn`, `error` |
| `LOG_FILE` | — | Log file path (empty = stdout only) |
| `LOG_FORMAT` | `text` | Log format: `text`, `json` |

## .env.example

```bash
# ====================
# slack-bridge config
# ====================

# --- Slack Auth ---
SLACK_WORKSPACE_URL=your-workspace.slack.com
SLACK_EMAIL=your@email.com
SLACK_PASSWORD=
SLACK_AUTH_METHOD=auto

# --- Session ---
SLACK_SESSION_DIR=./data/sessions
SLACK_SESSION_ENCRYPT_KEY=

# --- Bridge Server ---
BRIDGE_PORT=3001
BRIDGE_HOST=127.0.0.1
BRIDGE_AUTH_TOKEN=change-me-to-a-random-token
BRIDGE_WEBHOOK_URL=http://localhost:3000/slack-events
BRIDGE_WEBHOOK_SECRET=change-me-to-a-random-secret

# --- Event Receiver ---
RECEIVER_MODE=rtm
WS_PING_INTERVAL_MS=30000
WS_PONG_TIMEOUT_MS=10000
# Polling fallback
POLL_INTERVAL_MS=3000
POLL_CHANNELS_PER_CYCLE=3

# --- Filtering ---
BRIDGE_CHANNELS=
BRIDGE_MENTION_ONLY=false
BRIDGE_INCLUDE_BOTS=false

# --- Logging ---
LOG_LEVEL=info
LOG_FILE=
LOG_FORMAT=text
```

## Validation

All environment variables are validated at startup using Zod schemas.
Missing required variables or invalid values cause a clear error:

```
❌ Configuration error:
  - SLACK_WORKSPACE_URL is required
  - BRIDGE_PORT must be a number between 1 and 65535
  - RECEIVER_MODE must be one of: polling, websocket, browser
```

## Runtime Config Updates

Environment variables are read once at startup. To change:
1. Update `.env` file
2. Restart slack-bridge

No hot-reload — keeps things simple and predictable.
