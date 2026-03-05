# slack-bridge 🌉

> Use Slack as a real human, not a bot.

**slack-bridge** is a browser-based bridge that lets AI agents operate Slack through a real user account — no bot tokens, no `BOT` badges, no API restrictions. Just a human.

## ⚠️ Disclaimer / 면책 조항

> **English**: This tool uses Slack's internal web APIs, which are undocumented and unsupported. Use at your own risk.
>
> **한국어**: 이 도구는 Slack의 비공식 내부 API를 사용합니다. 사용에 따른 책임은 본인에게 있습니다.

**Risks / 리스크:**
- Slack may change internal APIs without notice / Slack이 내부 API를 예고 없이 변경할 수 있음
- Your account could be suspended if detected as automated / 자동화가 감지되면 계정이 정지될 수 있음
- No official support from Slack / Slack의 공식 지원 없음

**Recommendations / 권장 사항:**
- ✅ Personal or internal use only / 개인 또는 내부 용도로만 사용
- ✅ Use a dedicated Slack account / 전용 Slack 계정 사용 권장
- ❌ Do NOT use for commercial services at scale / 대규모 상업 서비스에 사용 금지
- ❌ Do NOT use to impersonate others / 타인 사칭 금지

**By using slack-bridge, you acknowledge these risks and accept full responsibility.**

**slack-bridge를 사용함으로써 위 리스크를 인지하고 모든 책임을 수용하는 것에 동의합니다.**

---

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

## Prerequisites / 사전 준비

| Requirement | Version | Notes |
|-------------|---------|-------|
| **Node.js** | >= 18.0.0 | `node --version` 으로 확인 |
| **Chrome/Chromium** | Latest | Playwright가 자동 설치 |
| **Slack Account** | — | 워크스페이스 정식 멤버 (게스트 ❌) |

**Supported Platforms / 지원 플랫폼:**
- ✅ macOS (Apple Silicon & Intel)
- ✅ Linux (x64, arm64)
- ⚠️ Windows (experimental / 실험적)

**Network / 네트워크:**
- Outbound HTTPS (443) to `*.slack.com`
- WebSocket connections allowed / WebSocket 연결 허용 필요

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
