import { describe, it, expect } from 'vitest';
import { parseEnv, envSchema } from '../../src/config/env.js';

describe('parseEnv', () => {
  it('should return defaults when no env vars are set', () => {
    const env = parseEnv({});
    expect(env.PORT).toBe(3847);
    expect(env.HOST).toBe('127.0.0.1');
    expect(env.NODE_ENV).toBe('development');
    expect(env.LOG_LEVEL).toBe('info');
    expect(env.SESSION_DIR).toBe('./data/sessions');
    expect(env.RATE_LIMIT_MESSAGES_PER_SEC).toBe(1);
    expect(env.RATE_LIMIT_API_PER_MIN).toBe(40);
    expect(env.AUTH_VALIDATION_INTERVAL_MS).toBe(300_000);
    expect(env.BROWSER_HEADLESS).toBe(true);
    expect(env.BROWSER_TIMEOUT_MS).toBe(60_000);
  });

  it('should parse valid env vars', () => {
    const env = parseEnv({
      PORT: '8080',
      HOST: '0.0.0.0',
      NODE_ENV: 'production',
      LOG_LEVEL: 'debug',
      SLACK_WORKSPACE_URL: 'https://myteam.slack.com',
      SLACK_EMAIL: 'test@example.com',
      SLACK_PASSWORD: 'secret123',
      WEBHOOK_URL: 'https://example.com/webhook',
      WEBHOOK_SECRET: 'this-is-a-valid-secret-key',
      SESSION_ENCRYPTION_KEY: 'a'.repeat(32),
    });

    expect(env.PORT).toBe(8080);
    expect(env.HOST).toBe('0.0.0.0');
    expect(env.NODE_ENV).toBe('production');
    expect(env.LOG_LEVEL).toBe('debug');
    expect(env.SLACK_WORKSPACE_URL).toBe('https://myteam.slack.com');
    expect(env.SLACK_EMAIL).toBe('test@example.com');
  });

  it('should throw on invalid NODE_ENV', () => {
    expect(() => parseEnv({ NODE_ENV: 'invalid' })).toThrow('Invalid environment configuration');
  });

  it('should throw on invalid SLACK_WORKSPACE_URL', () => {
    expect(() => parseEnv({ SLACK_WORKSPACE_URL: 'not-a-url' })).toThrow(
      'Invalid environment configuration',
    );
  });

  it('should throw on invalid SLACK_EMAIL', () => {
    expect(() => parseEnv({ SLACK_EMAIL: 'not-an-email' })).toThrow(
      'Invalid environment configuration',
    );
  });

  it('should throw on too-short SESSION_ENCRYPTION_KEY', () => {
    expect(() => parseEnv({ SESSION_ENCRYPTION_KEY: 'short' })).toThrow(
      'Invalid environment configuration',
    );
  });

  it('should throw on too-short WEBHOOK_SECRET', () => {
    expect(() => parseEnv({ WEBHOOK_SECRET: 'short' })).toThrow(
      'Invalid environment configuration',
    );
  });

  it('should coerce string PORT to number', () => {
    const env = parseEnv({ PORT: '9999' });
    expect(env.PORT).toBe(9999);
    expect(typeof env.PORT).toBe('number');
  });

  it('should coerce BROWSER_HEADLESS string to boolean', () => {
    const env = parseEnv({ BROWSER_HEADLESS: 'false' });
    expect(env.BROWSER_HEADLESS).toBe(false);
  });
});

describe('envSchema', () => {
  it('should be a valid Zod schema', () => {
    expect(envSchema.parse).toBeDefined();
    expect(envSchema.safeParse).toBeDefined();
  });
});
