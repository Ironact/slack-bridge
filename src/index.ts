/**
 * slack-bridge — Use Slack as a real human, not a bot.
 *
 * Entry point for programmatic usage.
 */

export { parseEnv, envSchema } from './config/env.js';
export type { Env } from './config/env.js';
export { createLogger, redactTokens } from './config/logger.js';
export type { Logger } from './config/logger.js';
