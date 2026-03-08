# slack-bridge 🌉

> Use Slack as a real human, not a bot.

**slack-bridge** lets AI agents interact with Slack using browser-based session tokens (`xoxc-`/`xoxd-`), bypassing bot API limitations. Send messages, react, and receive real-time events — all as a human user.

## Why?

Bot tokens (`xoxb-`) can't do everything. Some Slack features are human-only:
- Custom emoji reactions as yourself
- Posting in channels where bots are restricted
- Appearing as a real team member
- Accessing workspace features bots can't reach

## Features

- 🔐 **Browser Login** — Playwright-based auth (email/password or Google OAuth)
- 🔒 **Encrypted Sessions** — AES-256-GCM session storage
- 💬 **Slack Client** — Send messages, reactions, read channels (rate-limited)
- 🌐 **Bridge Server** — Fastify HTTP API for programmatic access
- 📡 **RTM Receiver** — Real-time WebSocket events (messages, reactions)
- 🔄 **Session Management** — Auto-validation, re-login triggers
- 🪝 **Webhooks** — Forward Slack events to your endpoints (HMAC-signed)

## Quick Start

```bash
# Install
npm install slack-bridge

# Login to Slack (opens browser)
npx slack-bridge login -w your-workspace.slack.com -e you@email.com --headed

# Start the bridge server
npx slack-bridge start

# Check status
npx slack-bridge status
```

## API

Once the bridge server is running:

```bash
# Send a message
curl -X POST http://localhost:3000/api/send \
  -H "Content-Type: application/json" \
  -d '{"channel": "C0123ABCDEF", "text": "Hello from slack-bridge!"}'

# React to a message
curl -X POST http://localhost:3000/api/react \
  -H "Content-Type: application/json" \
  -d '{"channel": "C0123ABCDEF", "timestamp": "1234567890.123456", "emoji": "thumbsup"}'

# Health check
curl http://localhost:3000/health
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Bridge server port | `3000` |
| `HOST` | Bind address | `0.0.0.0` |
| `LOG_LEVEL` | Pino log level | `info` |
| `SESSION_DIR` | Session storage directory | `./data/sessions` |
| `SESSION_ENCRYPTION_KEY` | AES-256 encryption passphrase | _(optional)_ |
| `WEBHOOK_URL` | Webhook delivery endpoint | _(optional)_ |
| `WEBHOOK_SECRET` | HMAC signing secret | _(optional)_ |

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│  CLI / API  │────▶│ Bridge Server│────▶│ Slack Client │
│  Consumer   │     │  (Fastify)   │     │ (WebClient)  │
└─────────────┘     └──────┬───────┘     └──────┬───────┘
                           │                     │
                    ┌──────▼───────┐     ┌──────▼───────┐
                    │   Webhooks   │     │ RTM Receiver │
                    │  (outbound)  │     │ (WebSocket)  │
                    └──────────────┘     └──────────────┘
                                                │
                    ┌──────────────┐     ┌──────▼───────┐
                    │  Session Mgr │────▶│  Auth Layer  │
                    │  (storage)   │     │ (Playwright) │
                    └──────────────┘     └──────────────┘
```

## Running as a Service

For production use, run slack-bridge as a system service that auto-starts on boot:

```bash
# Install to a persistent location (NOT /tmp!)
mkdir -p ~/.slack-bridge/logs
cp -R dist node_modules package.json ~/.slack-bridge/
```

See **[Service Setup Guide](docs/guides/service-setup.md)** for full macOS (launchd) and Linux (systemd) instructions, including multi-instance setups.

## Development

```bash
# Install dependencies
npm install

# Run tests
npm test

# Type check
npm run typecheck

# Lint
npm run lint

# Build
npm run build
```

## Security

- Session tokens are encrypted at rest (AES-256-GCM + PBKDF2)
- Token values are redacted in all log output
- File permissions set to `0600` for session data
- Webhook payloads are HMAC-SHA256 signed

## ⚠️ Disclaimer

This tool uses browser session tokens, not official Slack bot APIs. Use responsibly and in compliance with Slack's Terms of Service. The authors are not responsible for any account actions taken by Slack.

## License

MIT
