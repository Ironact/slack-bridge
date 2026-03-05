# Contributing to slack-bridge

We welcome contributions! Here's how to get started.

## Development Setup

```bash
git clone https://github.com/Ironact/slack-bridge.git
cd slack-bridge
npm install
cp .env.example .env
# Edit .env with your Slack workspace details
```

## Project Structure

```
src/
├── auth/        # Browser login + token extraction
├── client/      # Slack API client + WebSocket
├── bridge/      # AI agent integration layer
├── session/     # Session lifecycle management
└── config/      # Environment variable handling
```

## Before You Code

1. Read the relevant spec in `docs/specs/`
2. Check existing issues for related work
3. For large changes, open an issue first to discuss

## Code Style

- TypeScript strict mode
- No `any` types (use `unknown` if needed)
- All functions need JSDoc comments
- All secrets through env vars — never hardcode

## Pull Request Process

1. Fork the repo
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Write tests for new functionality
4. Ensure all tests pass (`npm test`)
5. Submit a PR with a clear description

## Commit Messages

Use conventional commits:

```
feat: add reaction support
fix: handle token refresh race condition
docs: update WebSocket spec
test: add auth module tests
```

## Reporting Issues

- Use the issue template
- Include your Node.js version, OS, and Slack plan type
- For auth issues, include the login method (Google, password, SSO)
- **Never include tokens, passwords, or session data in issues**

## Security

If you find a security vulnerability, please email security@ironact.net instead of opening a public issue.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
