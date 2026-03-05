# Research Findings

> This document contains validated facts from research, not assumptions.
> Every claim here is backed by external sources. Updated: 2026-03-05.

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

### RTM API status
- `rtm.start` — **deprecated** (since Sept 2022)
- `rtm.connect` — still functional but Slack recommends migrating away
- Legacy custom bots discontinued **March 31, 2025**
- Source: [Slack changelog](https://docs.slack.dev/changelog/2024-09-legacy-custom-bots-classic-apps-deprecation/)

### What the web client actually uses
- Slack's web client connects to `wss://wss-primary.slack.com` (or similar)
- Connection established after boot via HTTPS, then upgrades to WebSocket
- Boot payload (`client.boot`) contains: user info, channels, unread counts, event subscriptions
- Events are JSON frames: `{"type":"message","user":"U123","text":"hello","ts":"1234567890.123456"}`
- Ping/pong keepalive every ~30 seconds
- Source: [Reverse engineering analysis](https://gist.github.com/sshh12/4cca8d6698be3c80e9232b68586b7924)

### Key question still open
- Can we use `rtm.connect` with an xoxc- token? (Likely yes, based on existing tools like irslackd)
- Or do we need to replicate the web client's internal WebSocket flow?
- **This needs POC validation**

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

### Must validate before coding:

1. **Can we call `rtm.connect` with xoxc- token?**
   - If yes: Use RTM WebSocket (simplest path)
   - If no: Need to reverse-engineer web client's WS connection flow

2. **What headers/cookies are required for API calls?**
   - `Cookie: d={xoxd}` — confirmed
   - `Origin: https://app.slack.com` — likely required
   - What else? User-Agent? Other cookies?

3. **Can we extract xoxc- token from `client.boot` response?**
   - Or from localStorage?
   - What's the most reliable extraction method?

4. **What happens when we send a message?**
   - Does it appear identically to a human-sent message?
   - Any metadata differences?

5. **File upload flow**
   - Does `files.uploadV2` work with xoxc-?
   - Or does the web client use a different upload endpoint?

## 6. Revised Architecture Considerations

Based on research:

### Token approach: Validated ✅
- xoxc- token + d cookie → Slack API calls = **works**
- Proven by multiple open-source projects and Go SDK integration

### WebSocket approach: Needs validation ⚠️
- RTM with xoxc- might work (irslackd does it)
- But RTM is being deprecated — web client may use different WS endpoint
- Need POC to determine which path

### Session management: Critical ⚠️
- Token lasts weeks/months but has no refresh mechanism
- Must handle graceful re-auth when token dies
- **Don't trigger token invalidation** with aggressive API usage

### SDK integration: Possible ✅
- Can use official Slack SDK with custom HTTP client (inject cookie)
- Cleaner than raw HTTP, gets type safety and method coverage for free
- Go SDK proven; Node SDK likely works the same way

## 7. Recommended Next Steps

1. **POC: Extract xoxc- token + d cookie from our logged-in browser session**
2. **POC: Call `auth.test` with curl using extracted credentials**
3. **POC: Send a message with `chat.postMessage` via curl**
4. **POC: Try `rtm.connect` with xoxc- token**
5. **POC: Monitor browser Network/WS tab to see real-time event flow**
6. **Update specs based on POC results**
7. **Then code**
