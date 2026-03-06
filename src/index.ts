/**
 * slack-bridge — Use Slack as a real human, not a bot.
 *
 * Entry point for programmatic usage.
 */

// Config
export { parseEnv, envSchema } from './config/env.js';
export type { Env } from './config/env.js';
export { createLogger, redactTokens } from './config/logger.js';
export type { Logger } from './config/logger.js';

// Bridge
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

// Auth
export type {
  WorkspaceInfo,
  Credentials,
  SessionData,
  LoginOptions,
  SessionMetadata,
  SessionHealth,
  EncryptedPayload,
} from './auth/types.js';
export { TOKEN_DEATH_ERRORS, isTokenDead } from './auth/types.js';
export { encrypt, decrypt } from './auth/encryption.js';
export { extractCredentials, extractWorkspaceInfo, extractUserInfo } from './auth/credentials.js';
export { performLogin } from './auth/login.js';
export type { LoginDependencies } from './auth/login.js';

// Session
export { SessionManager } from './session/manager.js';
export type { SessionManagerOptions } from './session/manager.js';
export {
  saveStorageState,
  loadStorageState,
  saveMetadata,
  loadMetadata,
  getStorageStatePath,
} from './session/storage.js';
export type { StorageOptions } from './session/storage.js';

// Client
export { SlackClientWrapper } from './client/slack-client.js';
export type { SlackClientOptions, MessageResult, AuthResult } from './client/slack-client.js';
export { RateLimiter, DEFAULT_RATE_LIMIT_CONFIG } from './client/rate-limiter.js';
export type { RateLimitConfig } from './client/rate-limiter.js';
export { TTLCache, UserCache, ChannelCache } from './client/cache.js';
export type { UserInfo as CachedUserInfo, ChannelInfo } from './client/cache.js';
