# Security Guide

## Threat Model

slack-bridge handles sensitive credentials (Slack session tokens, cookies, passwords). This document outlines the security model and best practices.

## Credential Handling

### Environment Variables

All secrets are managed via environment variables:

| Secret | Env Var | Never in... |
|--------|---------|-------------|
| Slack password | `SLACK_PASSWORD` | Code, logs, git |
| Session encrypt key | `SLACK_SESSION_ENCRYPT_KEY` | Code, logs, git |
| API auth token | `BRIDGE_AUTH_TOKEN` | Code, logs, git |
| Webhook secret | `BRIDGE_WEBHOOK_SECRET` | Code, logs, git |
| xoxc- token | (runtime only) | Code, logs, git, plaintext disk |
| d cookie | (runtime only) | Code, logs, git, plaintext disk |

### .gitignore

The following must always be gitignored:

```
.env
.env.*
data/
*.enc.json
```

### Session Encryption

Session files containing tokens are encrypted at rest:

- **Algorithm:** AES-256-GCM
- **Key derivation:** PBKDF2 (100,000 iterations) from `SLACK_SESSION_ENCRYPT_KEY`
- **Unique IV per file**
- **If no encrypt key:** Warning logged, but session still stored (development mode only)

### Log Masking

Tokens and secrets are masked in all log output:

```
// Bad
logger.info(`Token: xoxc-1234-5678-abcd`);

// Good
logger.info(`Token: xoxc-****-****-****`);
```

Masking rules:
- `xoxc-*` → `xoxc-****`
- `d=*` → `d=****`
- Any env var value from the secret list → `****`

## Network Security

### Bridge API

- **Default bind:** `127.0.0.1` (localhost only)
- **Auth:** Bearer token required for all endpoints
- **CORS:** Disabled by default
- **HTTPS:** Not built-in; use a reverse proxy (nginx, caddy) for TLS

### Webhook Delivery

- **Signature:** HMAC-SHA256 on every webhook payload
- **Timestamp:** Included to prevent replay attacks (reject if > 5 min old)
- **Retry:** Only to the configured URL, no redirect following

### WebSocket (Phase 2)

- **Auth:** Token required on connection
- **Origin check:** Configurable origin allowlist

## Access Control

### Bridge API Auth

```bash
BRIDGE_AUTH_TOKEN=your-secret-token
```

All API calls must include:
```http
Authorization: Bearer {BRIDGE_AUTH_TOKEN}
```

### Channel Filtering

Limit which channels the bridge monitors:

```bash
BRIDGE_CHANNELS=general,dev-feed
```

Only events from listed channels are forwarded. If empty, all channels are monitored.

## Operational Security

### Browser Automation

- Playwright runs in headless mode by default (no visible window)
- Browser profile is isolated (dedicated user-data directory)
- No browser extensions loaded
- Browser is closed after login; only reopened for token refresh

### Process Isolation

- Run slack-bridge as a dedicated user (not root)
- Limit file system access to the project directory
- Use systemd/launchd security features (sandboxing, restricted paths)

### Update Cadence

- Monitor Slack web client changes (they may break token extraction)
- Pin Playwright version to avoid unexpected browser updates
- Run security updates promptly

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Token stolen from disk | Full Slack access | Encrypt at rest, restrict file permissions |
| Token leaked in logs | Full Slack access | Log masking, log rotation |
| .env committed to git | All secrets exposed | .gitignore, pre-commit hook |
| MITM on webhook | Event interception | HMAC signatures, localhost binding |
| Slack detects automation | Account suspension | Use internal APIs (same as web client), no scraping |
| Session encrypt key lost | Can't decrypt sessions | Re-login required (not catastrophic) |
| Bridge API exposed | Unauthorized Slack actions | Localhost binding, auth token, firewall |

## Slack's Perspective

**Important:** slack-bridge uses the same APIs that Slack's own web client uses. It's indistinguishable from a human using the browser. However:

- Slack's Terms of Service may restrict automated access
- Enterprise workspaces may have additional monitoring
- High-frequency actions may trigger rate limits
- Use responsibly and within your organization's policies

## Checklist for Deployment

- [ ] `SLACK_SESSION_ENCRYPT_KEY` is set and strong
- [ ] `BRIDGE_AUTH_TOKEN` is set and unique
- [ ] `.env` is in `.gitignore`
- [ ] Bridge binds to `127.0.0.1` only (or behind TLS proxy)
- [ ] File permissions on `data/` directory are restricted (700)
- [ ] Logs don't contain secrets (test with `LOG_LEVEL=debug`)
- [ ] Session files are in gitignored `data/` directory
- [ ] Running as non-root user
