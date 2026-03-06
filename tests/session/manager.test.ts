import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SessionManager } from '../../src/session/manager.js';
import type { Env } from '../../src/config/env.js';
import pino from 'pino';

// Mock performLogin
vi.mock('../../src/auth/login.js', () => ({
  performLogin: vi.fn().mockResolvedValue({
    version: 1,
    workspace: { id: 'T123', name: 'Test', url: 'test.slack.com' },
    user: { id: 'U001', name: 'testuser', email: 'test@test.com' },
    credentials: { token: 'xoxc-test', cookie: 'xoxd-test' },
    extractedAt: new Date().toISOString(),
  }),
}));

// Mock storage
vi.mock('../../src/session/storage.js', () => ({
  loadStorageState: vi.fn().mockResolvedValue(null),
  saveStorageState: vi.fn().mockResolvedValue(undefined),
  loadMetadata: vi.fn().mockResolvedValue(null),
  saveMetadata: vi.fn().mockResolvedValue(undefined),
  getStorageStatePath: vi.fn().mockReturnValue('/tmp/test.state.json'),
}));

const logger = pino({ level: 'silent' });

function createEnv(overrides: Partial<Env> = {}): Env {
  return {
    PORT: 3847,
    HOST: '127.0.0.1',
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    SLACK_WORKSPACE_URL: 'https://test.slack.com',
    SLACK_EMAIL: 'test@test.com',
    SLACK_PASSWORD: 'password',
    SESSION_DIR: '/tmp/test-sessions',
    RATE_LIMIT_MESSAGES_PER_SEC: 1,
    RATE_LIMIT_API_PER_MIN: 40,
    AUTH_VALIDATION_INTERVAL_MS: 300_000,
    BROWSER_HEADLESS: true,
    BROWSER_TIMEOUT_MS: 60_000,
    ...overrides,
  } as Env;
}

describe('SessionManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('initialize', () => {
    it('should perform login and set credentials', async () => {
      const manager = new SessionManager({
        env: createEnv(),
        logger,
      });

      await manager.initialize();
      const creds = await manager.getCredentials();
      expect(creds.token).toBe('xoxc-test');
      expect(creds.cookie).toBe('xoxd-test');
    });

    it('should throw when SLACK_WORKSPACE_URL is not set', async () => {
      const manager = new SessionManager({
        env: createEnv({ SLACK_WORKSPACE_URL: undefined }),
        logger,
      });

      await expect(manager.initialize()).rejects.toThrow('SLACK_WORKSPACE_URL is required');
    });

    it('should throw when SLACK_EMAIL is not set', async () => {
      const manager = new SessionManager({
        env: createEnv({ SLACK_EMAIL: undefined }),
        logger,
      });

      await expect(manager.initialize()).rejects.toThrow('SLACK_EMAIL is required');
    });
  });

  describe('getCredentials', () => {
    it('should return cached credentials on subsequent calls', async () => {
      const manager = new SessionManager({
        env: createEnv(),
        logger,
      });

      await manager.initialize();
      const creds1 = await manager.getCredentials();
      const creds2 = await manager.getCredentials();
      expect(creds1).toBe(creds2);
    });
  });

  describe('getHealth', () => {
    it('should return health status', async () => {
      const manager = new SessionManager({
        env: createEnv(),
        logger,
      });

      await manager.initialize();
      const health = manager.getHealth();
      expect(health.status).toBe('active');
      expect(health.loginCount).toBe(1);
      expect(health.lastValidated).toBeInstanceOf(Date);
    });

    it('should show failed status before init', () => {
      const manager = new SessionManager({
        env: createEnv(),
        logger,
      });

      const health = manager.getHealth();
      expect(health.status).toBe('failed');
      expect(health.loginCount).toBe(0);
    });
  });

  describe('reportTokenDeath', () => {
    it('should track consecutive failures', async () => {
      const manager = new SessionManager({
        env: createEnv(),
        logger,
      });

      await manager.initialize();
      await manager.reportTokenDeath();
      await manager.reportTokenDeath();
      // Should not trigger re-login yet (need 3)
      const health = manager.getHealth();
      expect(health.status).toBe('active');
    });

    it('should trigger re-login after 3 consecutive failures', async () => {
      const manager = new SessionManager({
        env: createEnv(),
        logger,
      });

      await manager.initialize();
      await manager.reportTokenDeath();
      await manager.reportTokenDeath();
      await manager.reportTokenDeath();

      const health = manager.getHealth();
      expect(health.loginCount).toBe(2); // initial + re-login
    });
  });

  describe('forceRelogin', () => {
    it('should perform re-login', async () => {
      const manager = new SessionManager({
        env: createEnv(),
        logger,
      });

      await manager.initialize();
      await manager.forceRelogin();
      const health = manager.getHealth();
      expect(health.loginCount).toBe(2);
    });
  });

  describe('health check', () => {
    it('should start and stop health check timer', async () => {
      const manager = new SessionManager({
        env: createEnv(),
        logger,
      });

      await manager.initialize();
      manager.startHealthCheck();
      // Call again should be no-op
      manager.startHealthCheck();
      manager.stopHealthCheck();
      // Call again should be no-op
      manager.stopHealthCheck();
    });
  });
});
