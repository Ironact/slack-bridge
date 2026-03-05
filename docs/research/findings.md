# Research Findings

> This document contains validated facts from research, not assumptions.
> Every claim here is backed by external sources. Updated: 2026-03-05.
> **Revision 2**: Deep dive — critical corrections to original assumptions.

## 1. xoxc- Token: What We Know

### What it is
- `xoxc-` is a **user session token**, extracted from the Slack web/desktop client
- It represents the **authenticated user's full permissions** — not a bot, not an app
- Must be paired with the `d` cookie (value starts with `xoxd-`) for API calls to work

### How to get it
- **From browser**: Login to Slack web → DevTools → Application → localStorage or intercept `client.boot` response
- **From desktop app**: Extract from the app's encrypted local storage
- **Existing tools**:
  - [hraftery/slacktokens](https://github.com/hraftery/slacktokens) — Python, extracts from desktop app
  - [maorfr/slack-token-extractor](https://github.com/maorfr/slack-token-extractor) — Python/browser extension
  - [fr4nk3nst1ner/slackattack](https://github.com/fr4nk3nst1ner/slackattack) — Go, post-exploitation

### How to use it
```http
POST https://slack.com/api/{method}
Content-Type: application/x-www-form-urlencoded
Cookie: d={xoxd-value}
Origin: https://app.slack.com

token={xoxc-token}&channel=C123&text=hello
```

### Proven to work with
- Standard Slack API methods: `chat.postMessage`, `conversations.history`, `auth.test`, etc.
- Official Slack SDKs (Go, Python, Node) via custom HTTP client that injects the `d` cookie
- Source: [shaharia.com/blog](https://shaharia.com/blog/slack-browser-tokens-golang-sdk-bypass-app-creation/) (2024)

### Token lifetime
- **No fixed expiration** — valid as long as the browser session is active
- Typically lasts **weeks to months** with regular usage
- Invalidated by: logout, password change, admin session duration settings
- **Does NOT auto-refresh** — must re-login to get a new token
- Source: [maorfr/slack-token-extractor](https://github.com/maorfr/slack-token-extractor), [slack help](https://slack.com/help/articles/115005223763)

## 2. WebSocket / Real-Time Events

### ~~🔴 CRITICAL: `rtm.connect` does NOT work with xoxc- tokens~~

### 🟢 CORRECTED BY POC: `rtm.connect` WORKS with xoxc- tokens!

Original research was wrong. POC on 2026-03-06 confirmed:

- `rtm.connect` **succeeds** with xoxc- token **when d cookie is present**
- Returns WebSocket URL: `wss://wss-primary.slack.com/websocket/LEGACY_BOT:...`
- The research sources likely tested without the d cookie → got `not_allowed_token_type`
- `rtm.start` is fully deprecated since Sept 2022 (still true)
- Legacy custom bots discontinued **March 31, 2025** (still true)
- Source: [Our own POC](./poc-results.md), [Slack docs](https://docs.slack.dev/reference/methods/rtm.connect/)

### What the web client actually uses

The web client has its own real-time flow, completely separate from RTM:

1. **Boot**: After login, browser calls `client.userBoot` or `api/client.boot`
   - Returns: user info, channels, workspace state, unread counts, **WebSocket URL**
   - This is an **undocumented internal API**
2. **WebSocket connect**: Browser opens `wss://wss-primary.slack.com/link/` (or backup)
   - Auth via token in query params + cookies from login session
   - DNS routed by NS1 to nearest regional NLB
   - TLS terminated by envoy-wss proxy → routed to Gatewayserver
3. **Events**: Bidirectional JSON frames over WebSocket
   - `{"type":"message","user":"U123","text":"hello","ts":"1234567890.123456"}`
   - Subtypes: `message_changed`, `file_share`, etc.
   - Ping/pong keepalive every ~30 seconds
4. **No re-auth per message** — WebSocket is pre-authenticated at connection time

Sources:
- [Slack engineering: Traffic 101](https://slack.engineering/traffic-101-packets-mostly-flow/)
- [Slack engineering: Migrating WebSockets to Envoy](https://slack.engineering/migrating-millions-of-concurrent-websockets-to-envoy/)
- [RE analysis](https://gist.github.com/sshh12/4cca8d6698be3c80e9232b68586b7924)

### Undocumented internal API endpoints

The web client uses many undocumented endpoints:

| Endpoint | Purpose |
|----------|---------|
| `client.userBoot` | Initialize user session, get WS URL |
| `client.counts` | Unread counts, badge numbers |
| `conversations.view` | Detailed conversation data |
| Plus all standard public API methods | chat.postMessage, etc. |

These are called via `POST https://app.slack.com/api/{method}` with xoxc- token + d cookie.

Source: [ErikKalkoken/slackApiDoc](https://github.com/ErikKalkoken/slackApiDoc)

### Architecture implications

**We have TWO paths for real-time events:**

**Path A: Replicate web client WebSocket flow**
- Call `client.userBoot` → get WS URL
- Connect to `wss://wss-primary.slack.com/link/`
- Receive events like the web client does
- Pros: Most authentic, same as real human
- Cons: Completely undocumented, could break anytime

**Path B: Polling-based approach**
- Periodically call `conversations.history` for each monitored channel
- Compare with last known state to detect new messages
- Pros: Uses documented API methods, more stable
- Cons: Not real-time (delay), more API calls, rate limit risk

**Path C: Keep browser alive with Playwright**
- Don't close the browser after login
- Intercept WebSocket frames directly in the browser
- Pros: Zero reverse-engineering needed, browser handles everything
- Cons: Resource-heavy (browser always running), fragile

**~~Recommendation: Start with Path C (safest), then migrate to Path A (most elegant)~~**

**UPDATED after POC: Start with RTM WebSocket (rtm.connect works!), polling as fallback.**

Since `rtm.connect` works with xoxc- tokens (+ d cookie), we don't need any of these complex paths for Phase 1.
See [POC results](./poc-results.md) for details.

## 3. Existing Projects (Prior Art)

| Project | Approach | Status | Lessons |
|---------|----------|--------|---------|
| [irslackd](https://github.com/adsr/irslackd) | IRC↔Slack bridge, xoxc- support | Active-ish | Proven xoxc + cookie works for RTM |
| [wee-slack](https://github.com/wee-slack/wee-slack) | WeeChat Slack plugin | Active | Uses xoxc + cookie, RTM-based |
| [korotovsky/slack-mcp-server](https://github.com/korotovsky/slack-mcp-server) | MCP server for Slack | Active | **xoxc tokens get invalidated during user caching** (Issue #86) |
| [shaharia's Go approach](https://shaharia.com/blog/slack-browser-tokens-golang-sdk-bypass-app-creation/) | Go SDK + custom HTTP client | Blog post | Clean pattern for SDK integration |
| [slackattack](https://github.com/fr4nk3nst1ner/slackattack) | Security tool | Active | Can auto-convert xoxd cookie → xoxc token |

### Critical learning from slack-mcp-server
**Issue #86**: Slack invalidates xoxc/xoxd tokens when the server caches users aggressively. This means:
- We can't bulk-fetch all users at startup
- Need lazy/on-demand user resolution
- Aggressive API usage patterns trigger token invalidation

## 3.5. Node.js SDK Integration

### @slack/web-api with xoxc- token
The official Node.js SDK supports custom request interceptors:

```typescript
const { WebClient } = require('@slack/web-api');

const webClient = new WebClient('xoxc-your-token', {
  requestInterceptor: (config) => {
    config.headers['Cookie'] = 'd=xoxd-your-cookie';
    config.headers['Origin'] = 'https://app.slack.com';
    return config;
  }
});
```

This means:
- ✅ We can use the official SDK with full type safety
- ✅ All public API methods work (chat.postMessage, conversations.history, etc.)
- ✅ No need to build raw HTTP client from scratch
- Source: [Slack Node SDK docs](https://docs.slack.dev/tools/node-slack-sdk/web-api/)

### Alternative: slack-web-api-client
- Zero-dependency, strong TypeScript types
- Also supports custom adapters
- Source: [slack-edge/slack-web-api-client](https://github.com/slack-edge/slack-web-api-client)

## 3.6. Token Extraction Details

### From browser localStorage
```javascript
JSON.parse(localStorage.localConfig_v2).teams[
  Object.keys(JSON.parse(localStorage.localConfig_v2).teams)[0]
].token
// Returns: xoxc-...
```

### d cookie
- Cookie name: `d`
- Value starts with `xoxd-`
- Domain: `.slack.com`
- **Can have expiry up to 10 years** (long-lived)
- Extract from browser DevTools → Application → Cookies

### Using Playwright
```typescript
// After successful login:
const token = await page.evaluate(() => {
  const config = JSON.parse(localStorage.getItem('localConfig_v2'));
  const teams = config.teams;
  const firstTeamId = Object.keys(teams)[0];
  return teams[firstTeamId].token;
});

const cookies = await page.context().cookies();
const dCookie = cookies.find(c => c.name === 'd');

// Save browser state for reuse
await page.context().storageState({ path: 'slack-session.json' });
```

Using `storageState` means we can restore the browser session without re-login.

Source: [Playwright docs](https://playwright.dev/docs/api/class-browsercontext#browser-context-storage-state)

## 3.7. Message Appearance

### Messages sent with xoxc- token look human
When using a user token (xoxc-), messages:
- Show the user's name and avatar
- Have `"user": "U..."` field (no `app_id` or `bot_id`)
- Are **indistinguishable from human-sent messages**
- No BOT badge

This is confirmed by multiple sources including the Go SDK approach.

Source: [Slack bot_users docs](https://github.com/slackhq/slack-api-docs/blob/master/index_bot_users.md)

## 4. Risk Assessment

### Token invalidation risks
- **Aggressive API calls** can trigger token invalidation (proven by slack-mcp-server #86)
- **Rate limiting**: Slack can disable tokens that spam requests
- No documented detection threshold

### Terms of Service
- xoxc- tokens are **unofficial** — not documented or supported by Slack for external use
- Slack's ToS doesn't explicitly address this, but automation using extracted tokens is gray area
- Enterprise workspaces may have additional monitoring
- **Risk level: Medium** — OK for internal/personal use, risky for public-facing products

### Mitigation strategies
- Rate limit all API calls conservatively
- Don't bulk-fetch data at startup
- Add User-Agent that mimics the web client
- Include `Origin: https://app.slack.com` header
- Don't use for spam/abuse
- Make token refresh seamless (user barely notices)

## 5. Open Questions (Need POC)

### Already answered by research:

| Question | Answer | Source |
|----------|--------|--------|
| Can `rtm.connect` work with xoxc-? | **YES** — works when d cookie is present (POC confirmed) | [POC results](./poc-results.md) |
| What headers are needed? | `Cookie: d=xoxd-...` + `Origin: https://app.slack.com` | shaharia.com, irslackd |
| How to extract xoxc- token? | `localStorage.localConfig_v2` → teams → token | Multiple sources |
| Do messages look human? | **YES** — no `app_id`, no `bot_id`, no BOT badge | Slack docs |
| Token lifetime? | Weeks to months, session-based, no auto-refresh | Multiple sources |
| Rate limits? | Tier 1-4 (1-100+ req/min per method), 1 msg/sec/channel | Slack docs |

### Still need POC validation:

1. **Can we extract xoxc- token from our actual Slack session?**
   - We have a logged-in browser → try the localStorage approach
   
2. **Does `chat.postMessage` work with xoxc- + d cookie via curl?**
   - If yes: API approach is viable
   
3. **Can we call `client.userBoot` to get WebSocket URL?**
   - This determines whether Path A (direct WS) is possible
   
4. **Can Playwright intercept WebSocket frames from the running Slack client?**
   - This determines whether Path C (browser-based) is practical
   
5. **File upload: does `files.upload` work with xoxc-?**
   - Standard `files.upload` (deprecated Nov 2025)
   - New flow: `files.getUploadURLExternal` → PUT → `files.completeUploadExternal`

## 6. Revised Architecture (Post-Research)

### What changed from original spec:

| Original Assumption | Reality |
|---------------------|---------|
| Use RTM WebSocket for events | ❌ RTM doesn't accept xoxc- tokens |
| Build raw HTTP client | ❌ Can use official Node SDK with interceptor |
| Token needs complex refresh | ⚠️ Token lasts weeks/months, just re-login when dead |
| Web client uses special endpoints | ✅ Mix of public API + undocumented internal endpoints |

### Revised approach:

**Phase 1: API + Polling (Stable, proven)**
- Playwright login → extract xoxc- token + d cookie
- Use `@slack/web-api` with `requestInterceptor` for cookie injection
- Poll channels with `conversations.history` at intervals
- Send messages with `chat.postMessage`
- Store session with `storageState()` for persistence

**Phase 2: WebSocket (Real-time)**
- Investigate `client.userBoot` → WebSocket URL extraction
- Replicate web client's WS connection
- Or keep Playwright browser alive and intercept WS frames
- This is risky (undocumented) — hence Phase 2

### SDK integration: Confirmed ✅
- Node.js `@slack/web-api` supports `requestInterceptor`
- Inject `Cookie: d=xoxd-...` and `Origin: https://app.slack.com`
- Full type safety, all public API methods, maintained by Slack

### Session management: Simpler than expected
- Token lasts weeks/months
- `storageState()` saves entire browser session
- On token death → restore storageState → if still dead → re-login
- **Critical**: Don't bulk-fetch data, don't spam APIs → token stays alive

### Rate limits: Well-documented
- Tier 1: 1+ req/min (admin methods)
- Tier 2: 20+ req/min (most methods)
- Tier 3: 50+ req/min (conversations.history, replies)
- Tier 4: 100+ req/min (high-volume methods)
- Messages: 1/sec/channel
- Response includes `Retry-After` header on 429
- Internal apps exempt from 2025 reductions

## 7. Recommended Next Steps

### POC (in order):

1. **Extract xoxc- token + d cookie from our logged-in browser**
2. **curl `auth.test`** — validate credentials work
3. **curl `chat.postMessage`** — send a test message
4. **Try `client.userBoot`** — see if we can get WebSocket URL
5. **Node SDK test** — verify requestInterceptor approach

### Then update specs:

6. **Rewrite WebSocket spec** — Path A vs Path C decision
7. **Simplify Client spec** — use SDK, not raw HTTP
8. **Add polling spec** — as fallback/Phase 1 approach
9. **Update architecture** — reflect actual proven flow

### Then code:

10. **Phase 1: Login + SDK + Polling**
11. **Phase 2: Real-time WebSocket**

## 8. Risk Matrix (Updated)

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| xoxc- token invalidated by aggressive use | **High** | Critical | Conservative rate limits, lazy loading |
| Slack changes internal WS protocol | Medium | High | Path C (browser) as fallback |
| Token expires unexpectedly | Low | Medium | Auto-detect + re-login flow |
| Account banned for automation | **Low** | Critical | Mimic real usage patterns, internal use only |
| files.upload deprecated flow breaks | Medium | Low | Use new upload flow as default |
| Node SDK drops requestInterceptor | Low | Medium | Fork or raw HTTP fallback |
