# Configuration Guide

## Overview

All configuration is managed via environment variables. No config files, no hardcoded values. Use a `.env` file for local development (never commit it).

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
| `SLACK_AUTH_METHOD` | `auto` | Login method: `auto`, `google`, `password`, `sso` |
| `SLACK_AUTH_HEADED` | `false` | Show browser window during login |
| `SLACK_AUTH_TIMEOUT` | `120000` | Login timeout in ms |

### Session

| Variable | Default | Description |
|----------|---------|-------------|
| `SLACK_SESSION_DIR` | `./data/sessions` | Session storage directory |
| `SLACK_SESSION_ENCRYPT_KEY` | — | Encryption key for stored sessions |
| `SESSION_CHECK_INTERVAL` | `300000` | Token validation interval (ms) |
| `SESSION_MAX_AGE` | `86400000` | Force refresh after this age (ms) |
| `SESSION_MAX_FAILURES` | `3` | Re-login after N consecutive failures |

### Bridge

| Variable | Default | Description |
|----------|---------|-------------|
| `BRIDGE_MODE` | `webhook` | Delivery mode: `webhook`, `websocket`, `openclaw` |
| `BRIDGE_PORT` | `3001` | HTTP server port |
| `BRIDGE_HOST` | `127.0.0.1` | HTTP server bind address |
| `BRIDGE_AUTH_TOKEN` | — | Bearer token for API authentication |
| `BRIDGE_WEBHOOK_URL` | — | Webhook destination URL |
| `BRIDGE_WEBHOOK_SECRET` | — | HMAC signing key for webhooks |

### Filtering

| Variable | Default | Description |
|----------|---------|-------------|
| `BRIDGE_CHANNELS` | — | Comma-separated channel names/IDs (empty = all) |
| `BRIDGE_MENTION_ONLY` | `false` | Only forward messages mentioning the user |
| `BRIDGE_INCLUDE_BOTS` | `false` | Include bot messages in events |
| `BRIDGE_SELF_EXCLUDE` | `true` | Exclude own messages from events |

### Context

| Variable | Default | Description |
|----------|---------|-------------|
| `BRIDGE_CONTEXT_THREAD_DEPTH` | `20` | Thread messages to include |
| `BRIDGE_CONTEXT_CHANNEL_DEPTH` | `10` | Recent channel messages for context |
| `BRIDGE_CONTEXT_INCLUDE_PROFILES` | `true` | Include user profiles in events |

### WebSocket (Slack connection)

| Variable | Default | Description |
|----------|---------|-------------|
| `WS_PING_INTERVAL` | `30000` | Ping interval (ms) |
| `WS_PONG_TIMEOUT` | `10000` | Pong deadline (ms) |
| `WS_RECONNECT_MAX_ATTEMPTS` | `10` | Max reconnection attempts |
| `WS_RECONNECT_INITIAL_DELAY` | `1000` | Initial reconnect delay (ms) |
| `WS_RECONNECT_MAX_DELAY` | `300000` | Max reconnect delay (ms) |

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
SLACK_SESSION_ENCRYPT_KEY=change-me-to-a-strong-random-string

# --- Bridge ---
BRIDGE_MODE=webhook
BRIDGE_PORT=3001
BRIDGE_HOST=127.0.0.1
BRIDGE_AUTH_TOKEN=change-me-to-a-random-token
BRIDGE_WEBHOOK_URL=http://localhost:3000/slack-events
BRIDGE_WEBHOOK_SECRET=change-me-to-a-random-secret

# --- Filtering ---
BRIDGE_CHANNELS=
BRIDGE_MENTION_ONLY=false
BRIDGE_INCLUDE_BOTS=false

# --- Context ---
BRIDGE_CONTEXT_THREAD_DEPTH=20
BRIDGE_CONTEXT_CHANNEL_DEPTH=10

# --- Logging ---
LOG_LEVEL=info
LOG_FILE=
LOG_FORMAT=text
```

## Validation

All environment variables are validated at startup using Zod schemas. If required variables are missing or values are invalid, the process exits with a clear error message:

```
❌ Configuration error:
  - SLACK_WORKSPACE_URL is required
  - BRIDGE_PORT must be a number between 1 and 65535
  - BRIDGE_MODE must be one of: webhook, websocket, openclaw
```

## Runtime Config Updates

Environment variables are read once at startup. To change configuration:

1. Update `.env` file
2. Restart slack-bridge

Hot-reload is not supported to avoid complexity and ensure consistency.
