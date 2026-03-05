# Session Spec

> **Updated**: Simplified based on research. Token lasts weeks/months.
> No complex refresh logic needed — just detect death and re-login.

## Overview

The Session Manager keeps Slack credentials valid. Since xoxc- tokens last
weeks to months and have no refresh mechanism, the strategy is simple:
**validate periodically, re-login when dead.**

## Credentials

| Credential | Format | Source | Lifetime |
|-----------|--------|--------|----------|
| `xoxc-` token | `xoxc-...` | `localStorage.localConfig_v2` | Weeks to months |
| `d` cookie | `xoxd-...` | Browser cookies | Up to 10 years |
| `storageState` | JSON file | Playwright `context.storageState()` | Same as above |

## Session Lifecycle

```
Startup
  │
  ├── storageState file exists?
  │   ├── Yes → Restore browser context → Extract token + cookie
  │   │         → auth.test
  │   │         ├── OK → ACTIVE ✅
  │   │         └── Fail → Re-login
  │   └── No → First-time login
  │
  ▼
ACTIVE
  │
  │  Every 5 minutes: auth.test
  │  ├── OK → Stay active
  │  └── Fail (invalid_auth) → Re-login
  │
  ▼
RE-LOGIN
  │
  ├── Open Playwright with saved storageState
  │   ├── Already logged in? → Extract new token → ACTIVE
  │   └── Login page? → Full login flow → Extract token → ACTIVE
  └── Login fails → FAILED (notify user)
```

## Storage

### Session file structure

```
data/sessions/
  ├── {workspace-id}.state.json     # Playwright storageState
  └── {workspace-id}.meta.json      # Metadata (unencrypted)
```

### storageState (Playwright)

Playwright's `storageState()` captures everything needed to restore a session:
- All cookies (including `d` cookie)
- localStorage (including `localConfig_v2` with xoxc- token)
- sessionStorage

```typescript
// Save
await context.storageState({ path: 'data/sessions/T0A37JX8BC4.state.json' });

// Restore
const context = await browser.newContext({
  storageState: 'data/sessions/T0A37JX8BC4.state.json'
});
```

This means we don't need to separately encrypt/store tokens. The storageState
file contains everything, and Playwright handles restoration.

### Metadata file (unencrypted)

```json
{
  "workspaceId": "T0A37JX8BC4",
  "workspaceName": "Muhak 3-7",
  "userId": "U...",
  "userName": "VISION",
  "email": "vision@ironact.net",
  "lastValidated": "2026-03-05T18:00:00Z",
  "loginCount": 1
}
```

### Security of storageState

The storageState file contains tokens in plaintext. Protection:

1. **File permissions**: `chmod 600` (owner read/write only)
2. **Directory permissions**: `chmod 700` on `data/sessions/`
3. **.gitignore**: `data/` is always gitignored
4. **Optional encryption**: If `SLACK_SESSION_ENCRYPT_KEY` is set, encrypt the file at rest with AES-256-GCM

For most deployments, file permissions are sufficient. Encryption is for
environments where disk access is shared.

## Token Extraction

After login or storageState restoration:

```typescript
async function extractCredentials(page: Page): Promise<Credentials> {
  // Extract xoxc- token from localStorage
  const token = await page.evaluate(() => {
    const config = JSON.parse(localStorage.getItem('localConfig_v2') || '{}');
    const teams = config.teams || {};
    const firstTeamId = Object.keys(teams)[0];
    return firstTeamId ? teams[firstTeamId].token : null;
  });
  
  // Extract d cookie
  const cookies = await page.context().cookies();
  const dCookie = cookies.find(c => c.name === 'd');
  
  if (!token || !dCookie) {
    throw new Error('Failed to extract credentials');
  }
  
  return {
    token,              // xoxc-...
    cookie: dCookie.value,  // xoxd-...
  };
}
```

## Validation

### Periodic check (every 5 minutes)

```typescript
async function validateSession(client: WebClient): Promise<boolean> {
  try {
    const result = await client.auth.test();
    return result.ok === true;
  } catch (error) {
    if (isTokenDead(error)) return false;
    // Network error — don't invalidate, just log
    return true;
  }
}
```

### On API error

When any SDK call returns a token-death error, immediately trigger re-login:

```typescript
const TOKEN_DEATH_ERRORS = [
  'invalid_auth', 'token_revoked',
  'account_inactive', 'token_expired', 'not_authed',
];
```

## Re-login Flow

```typescript
async function relogin(config: AuthConfig): Promise<Credentials> {
  const browser = await chromium.launch({ headless: true });
  
  // Try restoring saved session first
  let context;
  if (fs.existsSync(storageStatePath)) {
    context = await browser.newContext({ storageState: storageStatePath });
  } else {
    context = await browser.newContext();
  }
  
  const page = await context.newPage();
  await page.goto(`https://${config.workspaceUrl}`);
  
  // Check if already logged in
  const isLoggedIn = await page.url().includes('/client/');
  
  if (!isLoggedIn) {
    // Full login flow (see auth.md)
    await performLogin(page, config);
  }
  
  // Extract fresh credentials
  const credentials = await extractCredentials(page);
  
  // Save updated storageState
  await context.storageState({ path: storageStatePath });
  
  await browser.close();
  return credentials;
}
```

## TypeScript Interface

```typescript
interface SessionManager {
  // Initialize (load or login)
  initialize(): Promise<void>;
  
  // Get current credentials (triggers re-login if invalid)
  getCredentials(): Promise<{ token: string; cookie: string }>;
  
  // Report that a call failed with token error
  reportTokenDeath(): Promise<void>;
  
  // Manual re-login
  forceRelogin(): Promise<void>;
  
  // Health
  getHealth(): SessionHealth;
}

interface SessionHealth {
  status: 'active' | 'refreshing' | 'failed';
  lastValidated: Date | null;
  tokenAge: number;          // seconds since extraction
  loginCount: number;
}
```

## Environment Variables

```bash
SLACK_SESSION_DIR=./data/sessions
SLACK_SESSION_ENCRYPT_KEY=          # Optional, for at-rest encryption
SESSION_CHECK_INTERVAL=300000       # 5 minutes
SESSION_MAX_FAILURES=3              # Re-login after 3 consecutive failures
```
