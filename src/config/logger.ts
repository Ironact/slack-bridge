import pino from 'pino';
import type { Env } from './env.js';

/**
 * Token patterns to redact from logs.
 * xoxc- and xoxd- tokens are masked to prevent credential leaks.
 */
const TOKEN_PATTERNS = [
  /xoxc-[a-zA-Z0-9-]+/g,
  /xoxd-[a-zA-Z0-9%/-]+/g,
  /xoxb-[a-zA-Z0-9-]+/g,
  /xoxp-[a-zA-Z0-9-]+/g,
];

/**
 * Redact sensitive tokens from a string.
 */
export function redactTokens(value: string): string {
  let result = value;
  for (const pattern of TOKEN_PATTERNS) {
    result = result.replace(pattern, (match) => {
      const prefix = match.slice(0, 5);
      return `${prefix}****`;
    });
  }
  return result;
}

/**
 * Create a configured pino logger instance.
 */
export function createLogger(env: Pick<Env, 'LOG_LEVEL' | 'NODE_ENV'>) {
  return pino({
    level: env.LOG_LEVEL,
    transport:
      env.NODE_ENV === 'development'
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined,
    formatters: {
      log(obj: Record<string, unknown>) {
        // Redact tokens from all string values
        const redacted: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(obj)) {
          redacted[key] = typeof value === 'string' ? redactTokens(value) : value;
        }
        return redacted;
      },
    },
  });
}

export type Logger = ReturnType<typeof createLogger>;
