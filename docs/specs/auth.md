# Auth Spec

## Overview

The Auth module handles Slack login via browser automation and extracts session credentials. It's the only component that uses Playwright — everything else runs headless via API.

## Credentials

Slack's web client uses two pieces for authentication:

| Credential | Format | Source |
|-----------|--------|--------|
| `xoxc-` token | `xoxc-...` (long string) | Extracted from `localStorage` or API bootstrap data |
| `d` cookie | Cookie value | Extracted from browser cookies |

Together, these allow full access to Slack's internal APIs as the authenticated user.

## Login Flows

### Flow 1: Google OAuth (Primary)

Most common for Google Workspace users.

```
1. Navigate to {workspace}.slack.com
2. Click "Sign in with Google"
3. Enter email → enter password → handle 2FA if needed
4. Google redirects back to Slack
5. Slack loads the web client
6. Extract xoxc- token + d cookie
```

### Flow 2: Email + Password

For workspaces with password-based login enabled.

```
1. Navigate to {workspace}.slack.com
2. Click "Sign in with password"
3. Enter email + password
4. Handle CAPTCHA if triggered
5. Slack loads the web client
6. Extract xoxc- token + d cookie
```

### Flow 3: SSO / SAML (Future)

For enterprise workspaces with single sign-on.

```
1. Navigate to {workspace}.slack.com
2. Redirect to SSO provider
3. Authenticate
4. Redirect back to Slack
5. Extract credentials
```

## Token Extraction

After successful login, the Slack web client boots with a JSON payload containing the `xoxc-` token. Two extraction methods:

### Method A: localStorage
```javascript
// Slack stores boot data in localStorage
const bootData = JSON.parse(localStorage.getItem('localConfig_v2'));
const token = bootData.teams[teamId].token; // xoxc-...
```

### Method B: API Response Interception
```javascript
// Intercept the boot API call
page.on('response', async (response) => {
  if (response.url().includes('/api/client.boot')) {
    const data = await response.json();
    const token = data.self.token; // xoxc-...
  }
});
```

### Cookie Extraction
```javascript
const cookies = await context.cookies();
const dCookie = cookies.find(c => c.name === 'd');
```

## Session Storage

Extracted credentials are encrypted and stored locally:

```
data/sessions/
  └── {workspace-id}.enc.json
```

### Storage Format (before encryption)
```json
{
  "version": 1,
  "workspace": {
    "id": "T0A37JX8BC4",
    "name": "Muhak 3-7",
    "url": "muhak3-7.slack.com"
  },
  "user": {
    "id": "U...",
    "name": "VISION",
    "email": "vision@ironact.net"
  },
  "credentials": {
    "token": "xoxc-...",
    "cookie": "d=...",
    "expiresAt": "2026-04-05T00:00:00Z"
  },
  "extractedAt": "2026-03-05T09:00:00Z"
}
```

### Encryption
- Algorithm: AES-256-GCM
- Key: Derived from `SLACK_SESSION_ENCRYPT_KEY` env var via PBKDF2
- Each file has a unique IV
- If no encrypt key is set, warn the user but still store (development mode)

## Re-authentication

The Auth module is triggered when:

1. **First run** — No stored session
2. **Session expired** — Token validation returns invalid
3. **Refresh failed** — Session Manager couldn't refresh
4. **User request** — `slack-bridge login` CLI command

### Headless vs Headed Mode

- **Default:** Headless (no visible browser window)
- **Interactive flag:** `--headed` opens visible browser for debugging or manual 2FA
- **2FA detection:** If 2FA is required, auto-switch to headed mode and prompt user

## Error Handling

| Scenario | Action |
|----------|--------|
| Wrong password | Return error, prompt user |
| CAPTCHA triggered | Switch to headed mode, wait for user |
| 2FA required | Switch to headed mode, wait for user |
| Google OAuth blocked | Log error, suggest app password |
| Network error | Retry with backoff |
| Workspace not found | Return error with suggestion |

## Environment Variables

```bash
# Required
SLACK_WORKSPACE_URL=muhak3-7.slack.com
SLACK_EMAIL=vision@ironact.net
SLACK_PASSWORD=                        # Optional if using Google OAuth

# Optional
SLACK_SESSION_DIR=./data/sessions
SLACK_SESSION_ENCRYPT_KEY=my-secret-key
SLACK_AUTH_HEADED=false                # Force headed mode
SLACK_AUTH_TIMEOUT=120000              # Login timeout (ms)
```

## CLI

```bash
# Interactive login
slack-bridge login --workspace muhak3-7.slack.com --email vision@ironact.net

# Login with headed browser (for debugging / 2FA)
slack-bridge login --headed

# Check session validity
slack-bridge session check

# Force re-login
slack-bridge login --force
```

## API

```typescript
interface AuthModule {
  // Perform browser login and extract credentials
  login(options: LoginOptions): Promise<SessionData>;
  
  // Load stored session
  loadSession(workspaceId: string): Promise<SessionData | null>;
  
  // Save session (encrypted)
  saveSession(session: SessionData): Promise<void>;
  
  // Validate existing session
  validateSession(session: SessionData): Promise<boolean>;
}

interface LoginOptions {
  workspaceUrl: string;
  email: string;
  password?: string;
  headed?: boolean;
  timeout?: number;
}

interface SessionData {
  version: number;
  workspace: WorkspaceInfo;
  user: UserInfo;
  credentials: Credentials;
  extractedAt: string;
}
```
