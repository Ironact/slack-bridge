# slack-bridge 🌉

> Use Slack as a real human, not a bot.

**slack-bridge** is a browser-based bridge that lets AI agents operate Slack through a real user account — no bot tokens, no `BOT` badges, no API restrictions. Just a human.

## The Problem

Slack's Bot API is limited:
- Messages show a `BOT` badge — everyone knows it's not a person
- Bots can't do everything a human can (huddles, certain UI actions, etc.)
- You need to create a Slack App, manage OAuth scopes, and deal with bot user conflicts
- If you want your AI agent to be a "team member," a bot account doesn't cut it

## The Solution

**slack-bridge** logs into Slack as a real user via browser automation, extracts session credentials, and uses Slack's internal APIs to do everything a human can — reading, writing, reacting, uploading, searching — all under the real user's identity.

```
┌─────────────┐
│  AI Agent   │  (OpenClaw, Claude, etc.)
└──────┬──────┘
       │  Events / Actions
       ▼
┌─────────────┐
│ slack-bridge│  ← The magic layer
└──────┬──────┘
       │  xoxc- token + cookies
       ▼
┌─────────────┐
│  Slack Web  │  (as a real human)
└─────────────┘
```

The browser is only used for **login** (handling OAuth, 2FA, etc.). After that, slack-bridge communicates directly with Slack's internal APIs — fast, stable, and invisible.

## Features

### Phase 1 (MVP)
- 🔐 Browser-based login (Google OAuth, email/password)
- 🔑 Session token extraction and encrypted storage
- 💬 Send / read / edit / delete messages
- 🔄 Real-time message receiving via WebSocket
- 📡 Webhook-based event forwarding to AI agents
- 🖥️ CLI interface (`slack-bridge login`, `start`, `status`)

### Phase 2
- 😀 Reactions (add / remove)
- 📎 File upload / download
- 🧵 Thread support
- 📢 Channel management (create, join, leave)
- 👤 Profile & status updates
- 🔍 Message & file search
- 💌 Direct messages
- 🔁 Auto-reconnect & health checks

### Phase 3
- 🔌 OpenClaw channel plugin
- 🌐 Multi-workspace support
- 🐳 Docker image

### Future
- 🤖 MCP server interface
- ⌨️ Typing indicators
- 📋 Canvas & list manipulation

## Quick Start

```bash
# Install
npm install -g slack-bridge

# Login to your Slack workspace
slack-bridge login --workspace your-workspace.slack.com

# Start the bridge
slack-bridge start

# Check status
slack-bridge status
```

## Configuration

All credentials are managed via environment variables. See [.env.example](.env.example) for the full list.

```bash
# Required
SLACK_WORKSPACE_URL=your-workspace.slack.com
SLACK_EMAIL=your@email.com

# Bridge
BRIDGE_MODE=webhook
BRIDGE_WEBHOOK_URL=http://localhost:3000/slack-events
BRIDGE_PORT=3001
```

See the [Configuration Guide](docs/guides/configuration.md) for details.

## Documentation

| Document | Description |
|----------|-------------|
| [Architecture](docs/architecture/overview.md) | System design and component overview |
| [Auth Spec](docs/specs/auth.md) | Login flows and token management |
| [Client Spec](docs/specs/client.md) | Slack internal API client |
| [WebSocket Spec](docs/specs/websocket.md) | Real-time event handling |
| [Bridge Spec](docs/specs/bridge.md) | AI agent integration layer |
| [Session Spec](docs/specs/session.md) | Session lifecycle management |
| [Security](docs/guides/security.md) | Security model and best practices |
| [Configuration](docs/guides/configuration.md) | Environment variables and setup |
| [한국어 문서](docs/ko/README.md) | Korean documentation |

## How It Works

1. **Login** — Playwright opens a browser, you log into Slack (Google OAuth, email, etc.)
2. **Extract** — slack-bridge captures the `xoxc-` token and session cookies
3. **Connect** — Opens a WebSocket connection for real-time events
4. **Bridge** — Forwards events to your AI agent, executes actions back to Slack
5. **Persist** — Session is encrypted and stored locally for restart resilience

The browser closes after login. Everything runs via API calls from that point.

## Why Not Just Use the Slack Bot API?

| | Bot API | slack-bridge |
|---|---------|-------------|
| Identity | `BOT` badge | Real human |
| Setup | Create Slack App + OAuth | Just login |
| Permissions | Limited by scopes | Everything a human can do |
| Dual identity | Bot + user coexist | Single identity |
| Rate limits | Strict | Web client limits (generous) |
| Real-time | Events API / Socket Mode | Native WebSocket |

## Security

- All credentials stored in environment variables — never in code
- Session tokens encrypted at rest
- Minimal scope — only monitor channels you configure
- Token masking in all logs
- `.env` files are gitignored

See [Security Guide](docs/guides/security.md) for the full security model.

## Tech Stack

- **Runtime:** Node.js (TypeScript)
- **Browser:** Playwright (login only)
- **HTTP:** Fastify
- **WebSocket:** ws
- **Validation:** Zod
- **Build:** tsup
- **Testing:** Vitest

## Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

MIT — see [LICENSE](LICENSE) for details.

---

Built with 💎 by [Ironact](https://github.com/Ironact)
