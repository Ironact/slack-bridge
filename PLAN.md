# slack-bridge — Project Plan

> Use Slack as a real human, not a bot.
> **Updated**: Reflects research findings and revised architecture.

## 🎯 Goal

Let AI agents (OpenClaw, Claude, etc.) use Slack through a **real user account** —
no bot tokens, no BOT badges, no API restrictions. Just a human.

## 🧠 Core Idea

The Slack web client uses `xoxc-` session tokens + `d` cookies for API calls.
We extract these via browser login, then use the official `@slack/web-api` SDK
with cookie injection to make API calls as the authenticated user.

Messages sent this way are **indistinguishable from human-sent messages**.

## 🏗️ Architecture

```
AI Agent (OpenClaw, Claude, etc.)
    ↕ HTTP webhook / REST API
slack-bridge
    ↕ @slack/web-api SDK (xoxc- token + d cookie)
Slack (as a real human)
```

**Auth**: Playwright browser login → extract token from `localStorage.localConfig_v2`
**API**: Official SDK with `requestInterceptor` for cookie injection (form-urlencoded only!)
**Events**: RTM WebSocket via `rtm.connect` (polling as fallback)
**Session**: `storageState()` for persistence, `auth.test` for validation

## 📦 Modules

| Module | Purpose | Status |
|--------|---------|--------|
| Auth Layer | Playwright login + token extraction | Spec ✅ |
| Session Manager | Credential lifecycle + storageState | Spec ✅ |
| Slack Client | SDK wrapper with caching + rate limiting | Spec ✅ |
| Event Receiver | Polling (Phase 1) / WebSocket (Phase 2) | Spec ✅ |
| Bridge Server | HTTP API + webhook delivery | Spec ✅ |
| CLI | login, start, status commands | Spec ✅ |

## 🔒 Key Constraints

1. **All credentials via env vars** — never hardcoded
2. **Conservative API usage** — aggressive calls invalidate xoxc- tokens
3. **Lazy loading** — never bulk-fetch users or channels
4. **Rate limit budget** — 40 req/min global, 1 msg/sec/channel
5. **Token masking** — all logs mask xoxc-/xoxd- values

## 🚀 Roadmap

### Phase 1: MVP (RTM WebSocket)
- [ ] Project setup (TypeScript, SDK, Playwright, Fastify, Zod)
- [ ] Auth: Playwright login (Google OAuth + email/password)
- [ ] Auth: Token extraction from localStorage + d cookie
- [ ] Auth: storageState save/restore
- [ ] Session: Periodic validation + auto re-login
- [ ] Client: SDK wrapper with requestInterceptor (form-urlencoded!)
- [ ] Client: Messages (send, edit, delete, history, thread)
- [ ] Client: User/channel caching (lazy)
- [ ] Events: RTM WebSocket receiver (rtm.connect → WSS)
- [ ] Events: Ping/pong keepalive (30s interval)
- [ ] Events: Reconnect with exponential backoff
- [ ] Events: Polling fallback (if RTM fails)
- [ ] Bridge: Fastify HTTP server (action endpoints)
- [ ] Bridge: Webhook event delivery (HMAC signed)
- [ ] CLI: login, start, status
- [ ] .env validation with Zod

### Phase 2: Enhancements
- [ ] Client: Reactions (add/remove)
- [ ] Client: File upload (new v2 flow)
- [ ] Client: Search
- [ ] Client: DM support
- [ ] Client: Profile/status updates
- [ ] Bridge: Event filtering (channel, mention, custom)
- [ ] Bridge: Context enrichment (thread, user, channel)
- [ ] Workspace metadata via client.userBoot (optional)

### Phase 3: Integration
- [ ] OpenClaw channel plugin
- [ ] Multi-workspace support
- [ ] Docker image
- [ ] GitHub Actions CI/CD

### Future
- [ ] MCP server interface
- [ ] Typing indicators
- [ ] Canvas/list manipulation
- [ ] Presence management

## 🔬 POC Checklist ✅ COMPLETE

All POCs passed on 2026-03-06. See [full results](docs/research/poc-results.md).

- [x] **POC 1**: Token extraction from localStorage ✅
- [x] **POC 2**: `auth.test` ✅ (user: vision, team: Muhak 3-7)
- [x] **POC 3**: `chat.postMessage` ✅ (no BOT badge!)
- [x] **POC 4**: `rtm.connect` ✅ (returns WSS URL — game changer!)
- [x] **POC 5**: `conversations.history` + `client.userBoot` ✅
- [ ] **POC 6**: Node SDK with `requestInterceptor` from server-side (validate during Phase 1)

## ⚠️ Known Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Token invalidated by aggressive API use | High | Critical | Conservative rate limits, lazy loading |
| Slack changes internal WS protocol | Medium | High | Polling fallback always available |
| Token expires unexpectedly | Low | Medium | Auto-detect + re-login |
| Account banned for automation | Low | Critical | Mimic real patterns, internal use |
| files.upload deprecated flow breaks | Medium | Low | Use new upload flow |

## 🛠️ Tech Stack

- **Runtime**: Node.js (TypeScript, strict mode)
- **Slack SDK**: @slack/web-api (official, with requestInterceptor)
- **Browser**: Playwright (login + session management)
- **HTTP Server**: Fastify
- **Validation**: Zod
- **Build**: tsup
- **Testing**: Vitest
- **CI/CD**: GitHub Actions

## 📁 Project Structure

```
slack-bridge/
├── README.md
├── PLAN.md
├── LICENSE (MIT)
├── CONTRIBUTING.md
├── package.json
├── tsconfig.json
├── .env.example
├── .gitignore
├── src/
│   ├── index.ts              # Entry point
│   ├── cli.ts                # CLI commands
│   ├── auth/
│   │   ├── login.ts          # Playwright login flows
│   │   └── extract.ts        # Token + cookie extraction
│   ├── session/
│   │   └── manager.ts        # Session lifecycle
│   ├── client/
│   │   ├── slack.ts          # SDK wrapper
│   │   ├── cache.ts          # User/channel cache
│   │   └── types.ts          # Slack types
│   ├── receiver/
│   │   ├── rtm.ts            # RTM WebSocket receiver (primary)
│   │   ├── polling.ts        # Polling fallback receiver
│   │   └── types.ts          # Event types
│   ├── bridge/
│   │   ├── server.ts         # Fastify HTTP server
│   │   ├── events.ts         # Event normalization + webhook
│   │   └── actions.ts        # Action handler
│   └── config/
│       └── env.ts            # Zod-validated config
├── docs/
│   ├── research/findings.md
│   ├── architecture/overview.md
│   ├── specs/ (auth, client, websocket, bridge, session)
│   ├── guides/ (security, configuration)
│   └── ko/README.md
├── data/                     # Runtime (gitignored)
│   ├── sessions/
│   └── logs/
└── tests/
```

## 📚 Documentation

| Document | Description |
|----------|-------------|
| [Research Findings](docs/research/findings.md) | Validated facts, prior art, risks |
| [Architecture](docs/architecture/overview.md) | System design |
| [Auth Spec](docs/specs/auth.md) | Login + token extraction |
| [Client Spec](docs/specs/client.md) | SDK wrapper + API methods |
| [Event Receiver Spec](docs/specs/websocket.md) | Polling / WS / browser paths |
| [Bridge Spec](docs/specs/bridge.md) | AI agent integration |
| [Session Spec](docs/specs/session.md) | Credential lifecycle |
| [Security Guide](docs/guides/security.md) | Security model |
| [Configuration](docs/guides/configuration.md) | All env variables |
