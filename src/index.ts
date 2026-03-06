/**
 * slack-bridge — Use Slack as a real human, not a bot.
 *
 * Entry point for programmatic usage.
 */

export { parseEnv, envSchema } from './config/env.js';
export type { Env } from './config/env.js';
export { createLogger, redactTokens } from './config/logger.js';
export type { Logger } from './config/logger.js';
export { createBridgeServer, startBridgeServer } from './bridge/server.js';
export type { SlackOperations } from './bridge/server.js';
export { generateSignature, verifySignature, deliverWebhook } from './bridge/webhook.js';
export type { WebhookConfig } from './bridge/webhook.js';
export type {
  BridgeEvent,
  BridgeEventType,
  BridgeHealth,
  BridgeActionResult,
} from './bridge/types.js';
