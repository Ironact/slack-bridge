# Session Spec

## Overview

The Session Manager is responsible for keeping Slack credentials valid throughout the bridge's lifetime. It sits between the Auth layer and the Slack Client, ensuring that every API call uses fresh, working credentials.

## Session Lifecycle

```
┌──────────────────────────────────────────────────────┐
│                  Session Lifecycle                     │
│                                                       │
│  ┌─────┐   ┌──────┐   ┌────────┐   ┌──────────────┐ │
│  │LOAD │──▶│VERIFY│──▶│ ACTIVE │──▶│REFRESH/REAUTH│ │
│  └─────┘   └──────┘   └────────┘   └──────────────┘ │
│                │            │               │         │
│                ▼            ▼               ▼         │
│           ┌────────┐  ┌─────────┐   ┌───────────┐   │
│           │NO SESSION│ │PERIODIC │   │  NEW      │   │
│           │→ LOGIN  │  │CHECK    │   │  SESSION  │   │
│           └────────┘  └─────────┘   └───────────┘   │
└──────────────────────────────────────────────────────┘
```

## Startup Sequence

```
1. Check for stored session file
   ├── Found → Decrypt → Validate token (auth.test)
   │   ├── Valid → Enter ACTIVE state
   │   └── Invalid → Attempt refresh
   │       ├── Refresh OK → Enter ACTIVE state
   │       └── Refresh failed → Trigger login
   └── Not found → Trigger login
```

## Session Validation

### Periodic Health Check

Every `SESSION_CHECK_INTERVAL` (default: 5 minutes):

```typescript
async function validateSession(): Promise<boolean> {
  const result = await slackApi.call('auth.test', { token });
  
  if (result.ok) {
    return true;  // Session is healthy
  }
  
  if (result.error === 'invalid_auth' || result.error === 'token_revoked') {
    return false;  // Session needs refresh/re-login
  }
  
  // Network error — don't invalidate, just log
  return true;
}
```

### Token Expiry Tracking

```typescript
interface SessionHealth {
  lastValidated: Date;
  lastUsed: Date;
  consecutiveFailures: number;
  tokenAge: number;          // seconds since extraction
  estimatedExpiry: Date;     // based on observed patterns
}
```

## Session Refresh

When a token is found to be invalid:

```
1. Try to refresh using stored browser cookies
   ├── Open Playwright with stored cookies
   │   ├── Navigate to Slack → already logged in?
   │   │   ├── Yes → Extract new xoxc- token
   │   │   └── No → Full re-login needed
   │   └── Save new session
   └── Close browser
```

### Refresh vs Re-login

| Condition | Action |
|-----------|--------|
| Token expired, cookies valid | Refresh (fast, no password needed) |
| Cookies expired | Full re-login |
| Password changed | Full re-login |
| 2FA challenge | Headed mode re-login |

## Session Storage

### File Structure
```
data/sessions/
  ├── {workspace-id}.enc.json    # Encrypted session data
  └── {workspace-id}.meta.json   # Unencrypted metadata
```

### Metadata File (unencrypted)
```json
{
  "workspaceId": "T0A37JX8BC4",
  "workspaceName": "Muhak 3-7",
  "userId": "U...",
  "userName": "VISION",
  "createdAt": "2026-03-05T09:00:00Z",
  "lastRefreshed": "2026-03-05T18:00:00Z",
  "refreshCount": 3
}
```

### Session File (encrypted)
Contains the full `SessionData` object including tokens and cookies.

## Multi-Workspace Support

Each workspace gets its own session file:

```
data/sessions/
  ├── T0A37JX8BC4.enc.json      # Workspace 1
  ├── T0A37JX8BC4.meta.json
  ├── TXXXXXXXXXX.enc.json       # Workspace 2
  └── TXXXXXXXXXX.meta.json
```

The Session Manager can handle multiple concurrent sessions:

```typescript
interface SessionManager {
  // Get session for a workspace
  getSession(workspaceId: string): Promise<SessionData>;
  
  // Get all active sessions
  getAllSessions(): Promise<SessionData[]>;
  
  // Refresh a specific session
  refreshSession(workspaceId: string): Promise<SessionData>;
  
  // Invalidate and re-login
  reauth(workspaceId: string): Promise<SessionData>;
  
  // Health
  getHealth(workspaceId: string): SessionHealth;
}
```

## Credential Provider Interface

Other components request credentials through a clean interface:

```typescript
interface CredentialProvider {
  // Get current valid credentials (may trigger refresh)
  getCredentials(workspaceId: string): Promise<{
    token: string;     // xoxc-...
    cookie: string;    // d=...
  }>;
  
  // Report that credentials failed (triggers refresh)
  reportInvalid(workspaceId: string): Promise<void>;
}
```

This way, the Slack Client never deals with session management directly — it just asks for credentials and reports failures.

## Environment Variables

```bash
# Session storage
SLACK_SESSION_DIR=./data/sessions
SLACK_SESSION_ENCRYPT_KEY=my-encryption-key

# Health checks
SESSION_CHECK_INTERVAL=300000       # 5 minutes
SESSION_MAX_AGE=86400000            # 24 hours (force refresh)
SESSION_MAX_FAILURES=3              # Consecutive failures before re-login

# Browser (for refresh)
SLACK_AUTH_HEADED=false
SLACK_AUTH_TIMEOUT=120000
```

## Error States

| State | Trigger | Recovery |
|-------|---------|----------|
| `token_expired` | auth.test returns invalid_auth | Auto-refresh |
| `cookies_expired` | Refresh fails (login page shown) | Re-login |
| `account_locked` | Too many login attempts | Wait + notify user |
| `password_changed` | Login fails with stored creds | Notify user, wait for new password |
| `2fa_required` | Login needs 2FA code | Switch to headed mode |
| `workspace_removed` | Workspace no longer exists | Remove session, notify user |

## Events

The Session Manager emits events for monitoring:

```typescript
interface SessionEvents {
  'session:active': (workspaceId: string) => void;
  'session:refreshing': (workspaceId: string) => void;
  'session:refreshed': (workspaceId: string) => void;
  'session:expired': (workspaceId: string) => void;
  'session:reauth_needed': (workspaceId: string) => void;
  'session:error': (workspaceId: string, error: Error) => void;
}
```
