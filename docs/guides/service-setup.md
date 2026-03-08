# Running as a System Service

Run slack-bridge as a persistent background service that auto-starts on boot and restarts on crash.

## Important: Avoid Temporary Paths

**Never** install slack-bridge or store session data in `/tmp`. Temporary directories are cleared on reboot, which means:

- The binary disappears → service fails to start
- Session tokens (xoxc/xoxd) are lost → requires re-login
- Logs are gone → no debugging possible

Use persistent paths like `~/.slack-bridge/` or `/opt/slack-bridge/`.

## Recommended Directory Layout

```
~/.slack-bridge/
├── dist/              # Built application
├── node_modules/      # Dependencies
├── package.json
├── data/
│   └── sessions/      # Encrypted session data (auto-created)
└── logs/
    ├── slack-bridge.log
    └── slack-bridge.err
```

### Setup

```bash
# Create persistent directory
mkdir -p ~/.slack-bridge/logs

# Install from npm
cd ~/.slack-bridge
npm init -y
npm install slack-bridge

# Or copy from a local build
cp -R /path/to/slack-bridge/{dist,node_modules,package.json} ~/.slack-bridge/

# Verify
node ~/.slack-bridge/node_modules/.bin/slack-bridge --help
```

---

## macOS (launchd)

### Create the LaunchAgent

Save as `~/Library/LaunchAgents/com.slack-bridge.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.slack-bridge</string>

    <key>ProgramArguments</key>
    <array>
        <string>/opt/homebrew/opt/node/bin/node</string>
        <string>/Users/YOUR_USER/.slack-bridge/dist/cli.js</string>
        <string>start</string>
    </array>

    <key>EnvironmentVariables</key>
    <dict>
        <key>PORT</key>
        <string>3000</string>
        <key>SESSION_DIR</key>
        <string>/Users/YOUR_USER/.slack-bridge/data/sessions</string>
        <key>PATH</key>
        <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
    </dict>

    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>

    <key>StandardOutPath</key>
    <string>/Users/YOUR_USER/.slack-bridge/logs/slack-bridge.log</string>
    <key>StandardErrorPath</key>
    <string>/Users/YOUR_USER/.slack-bridge/logs/slack-bridge.err</string>
</dict>
</plist>
```

> **Note:** Replace `YOUR_USER` with your macOS username and adjust the Node.js path if needed (`which node`).

### Load the service

```bash
# Load and start
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.slack-bridge.plist

# Check status
launchctl list | grep slack-bridge

# View logs
tail -f ~/.slack-bridge/logs/slack-bridge.log

# Stop
launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.slack-bridge.plist
```

### Multiple instances

For running multiple slack-bridge instances (e.g., different Slack accounts), use unique labels and ports:

```xml
<key>Label</key>
<string>com.slack-bridge.alice</string>
<!-- ... -->
<key>PORT</key>
<string>3001</string>
<key>SESSION_DIR</key>
<string>/Users/YOUR_USER/.slack-bridge-alice/data/sessions</string>
```

---

## Linux (systemd)

### Create the service unit

Save as `~/.config/systemd/user/slack-bridge.service`:

```ini
[Unit]
Description=slack-bridge
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=/usr/bin/node %h/.slack-bridge/dist/cli.js start
Environment=PORT=3000
Environment=SESSION_DIR=%h/.slack-bridge/data/sessions
Environment=NODE_ENV=production
Restart=always
RestartSec=5

StandardOutput=append:%h/.slack-bridge/logs/slack-bridge.log
StandardError=append:%h/.slack-bridge/logs/slack-bridge.err

[Install]
WantedBy=default.target
```

### Enable and start

```bash
# Reload systemd
systemctl --user daemon-reload

# Enable auto-start on boot
systemctl --user enable slack-bridge

# Start now
systemctl --user start slack-bridge

# Check status
systemctl --user status slack-bridge

# View logs
journalctl --user -u slack-bridge -f

# Enable lingering (so service runs even when you're not logged in)
loginctl enable-linger $USER
```

### Multiple instances

Use systemd template units:

```bash
# Save as ~/.config/systemd/user/slack-bridge@.service
# Use %i for the instance name

[Service]
ExecStart=/usr/bin/node %h/.slack-bridge/dist/cli.js start
Environment=PORT=300%i
Environment=SESSION_DIR=%h/.slack-bridge-%I/data/sessions
```

```bash
systemctl --user enable slack-bridge@1
systemctl --user start slack-bridge@1
```

---

## Health Checks

Verify the service is healthy after setup:

```bash
# HTTP health check
curl http://localhost:3000/health

# Check session validity
npx slack-bridge status --session-dir ~/.slack-bridge/data/sessions
```

## Updating

```bash
# Stop the service
launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.slack-bridge.plist  # macOS
# systemctl --user stop slack-bridge  # Linux

# Update
cd ~/.slack-bridge && npm update slack-bridge
# Or rebuild: npm run build

# Restart
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.slack-bridge.plist  # macOS
# systemctl --user start slack-bridge  # Linux
```

## Troubleshooting

| Problem | Cause | Fix |
|---------|-------|-----|
| Service fails after reboot | Binary/data in `/tmp` | Move to `~/.slack-bridge/` |
| `ENOENT` on start | Wrong path in service config | Check `ProgramArguments` / `ExecStart` path |
| Session expired | Token invalidated by Slack | Re-run `slack-bridge login` |
| Port conflict | Another instance on same port | Use different `PORT` per instance |
| Permission denied | Session files wrong perms | `chmod 600 ~/.slack-bridge/data/sessions/*` |
