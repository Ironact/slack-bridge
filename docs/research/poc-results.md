# POC Results

> Date: 2026-03-06
> Environment: Browser-based testing from app.slack.com
> Workspace: Muhak 3-7 (T0A37JX8BC4)
> User: VISION (U0AJGS5CB3M)

## POC 1: Token Extraction ✅

**Method**: `localStorage.localConfig_v2` → `teams[teamId].token`

```javascript
const config = JSON.parse(localStorage.getItem('localConfig_v2'));
const teamId = Object.keys(config.teams)[0];
const token = config.teams[teamId].token;
// Returns: xoxc-10109... (114 chars)
```

**Result**: Successfully extracted xoxc- token from localStorage.

**d cookie**: httpOnly — cannot be read via JavaScript. However, when making
fetch calls from within the browser with `credentials: 'include'`, the cookie
is automatically sent. For server-side use, we need Playwright's
`context.cookies()` or `context.storageState()`.

## POC 2: auth.test ✅

```
POST /api/auth.test
Content-Type: application/x-www-form-urlencoded
Cookie: (auto-included by browser)

token=xoxc-...
```

**Response**:
```json
{
  "ok": true,
  "user": "vision",
  "user_id": "U0AJGS5CB3M",
  "team": "Muhak 3-7",
  "team_id": "T0A37JX8BC4"
}
```

## POC 3: chat.postMessage ✅

```
POST /api/chat.postMessage
Content-Type: application/x-www-form-urlencoded
Cookie: (auto-included)

token=xoxc-...&channel=C0A3YAWPCJU&text=🔬 slack-bridge POC test
```

**Response**:
```json
{
  "ok": true,
  "ts": "1772730011.162009",
  "channel": "C0A3YAWPCJU",
  "message_user": "U0AJGS5CB3M",
  "has_bot_id": false,
  "has_app_id": false,
  "message_type": "message"
}
```

**Critical finding**: `has_bot_id: false` and `has_app_id: false`.
Messages sent via xoxc- token are **indistinguishable from human-sent messages**.
No BOT badge, no app attribution. Appears 100% as the user.

**Note**: JSON Content-Type returned `not_authed`. Must use `application/x-www-form-urlencoded`.

## POC 4: rtm.connect ✅ ← SURPRISE!

**This contradicts our research findings!**

Research said `rtm.connect` returns `not_allowed_token_type` for xoxc- tokens.
**Actual result: it works.**

```
POST /api/rtm.connect
Content-Type: application/x-www-form-urlencoded
Cookie: (auto-included)

token=xoxc-...
```

**Response**:
```json
{
  "ok": true,
  "url": "wss://wss-primary.slack.com/websocket/LEGACY_BOT:a602faa1688276ab6fcf1065bd8f6c67"
}
```

### What this means:
- We CAN use RTM WebSocket with xoxc- tokens (when d cookie is present)
- The research error was likely because tests were done without the d cookie
- This gives us **real-time events without polling or reverse engineering**
- The `LEGACY_BOT` prefix in the URL is just Slack's internal routing label

### Architecture impact:
- ~~Phase 1 must be polling~~ → Phase 1 can be RTM WebSocket directly
- This dramatically simplifies the architecture
- Still need polling as fallback in case RTM is later restricted

## POC 5: conversations.history (Read) ✅

```
POST /api/conversations.history
Content-Type: application/x-www-form-urlencoded
Cookie: (auto-included)

token=xoxc-...&channel=C0A3YAWPCJU&limit=3
```

**Response**: Successfully returned 3 messages with full metadata.

Verified our own POC message appears with `has_bot_id: false`.

## POC 5b: client.userBoot ✅

```
POST /api/client.userBoot
Content-Type: application/x-www-form-urlencoded
Cookie: (auto-included)

token=xoxc-...
```

**Response** (key fields):
- `ok: true`
- `self.id`: "U0AJGS5CB3M", `self.name`: "vision"
- `team.id`: "T0A37JX8BC4", `team.name`: "Muhak 3-7"
- `channels`: 17 channels returned
- `ims`: 10 DM conversations
- `slack_route`: "T0A37JX8BC4"
- **No WebSocket URL in response** (WS URL comes from `rtm.connect`, not userBoot)

## Summary

| POC | Result | Notes |
|-----|--------|-------|
| 1. Token extraction | ✅ | localStorage.localConfig_v2 |
| 2. auth.test | ✅ | User: vision, Team: Muhak 3-7 |
| 3. chat.postMessage | ✅ | No BOT badge, 100% human-like |
| 4. rtm.connect | ✅ | **Surprise! Works with xoxc-** |
| 5. conversations.history | ✅ | Read works perfectly |
| 5b. client.userBoot | ✅ | Returns workspace state, no WS URL |

## Critical Corrections to Research

1. **rtm.connect DOES work with xoxc- tokens** (when d cookie is present)
2. **Must use form-urlencoded** (not JSON) for API calls with xoxc- tokens
3. **WebSocket URL comes from rtm.connect**, not client.userBoot
4. **d cookie must be present** (credentials: 'include' or explicit Cookie header)

## Updated Architecture Recommendation

```
Phase 1: RTM WebSocket (now viable!)
  - Login → extract token + d cookie
  - rtm.connect → get WSS URL
  - Connect WebSocket → receive events
  - SDK for sending (chat.postMessage etc.)

Phase 2: Enhancements
  - Polling fallback (if RTM stops working)
  - client.userBoot for workspace metadata
  - Advanced features (files, search, etc.)
```

This is significantly simpler than the polling-first approach we planned.

## Node SDK Test (Still Needed)

Browser-based POC proves the APIs work. We still need to verify:
- [ ] @slack/web-api with requestInterceptor works from Node.js
- [ ] RTM WebSocket connection works from Node.js (outside browser)
- [ ] d cookie extraction via Playwright storageState works

These will be validated during Phase 1 implementation.
