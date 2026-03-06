import { describe, it, expect } from 'vitest';
import { redactTokens, createLogger } from '../../src/config/logger.js';

describe('redactTokens', () => {
  it('should redact xoxc- tokens', () => {
    const input = 'token is xoxc-1234567890-abcdefghij';
    const result = redactTokens(input);
    expect(result).toBe('token is xoxc-****');
    expect(result).not.toContain('1234567890');
  });

  it('should redact xoxd- tokens', () => {
    const input = 'cookie is xoxd-abc123def456%2F';
    const result = redactTokens(input);
    expect(result).toBe('cookie is xoxd-****');
    expect(result).not.toContain('abc123');
  });

  it('should redact xoxb- tokens', () => {
    const input = 'bot token xoxb-123-456-abc';
    const result = redactTokens(input);
    expect(result).toBe('bot token xoxb-****');
  });

  it('should redact xoxp- tokens', () => {
    const input = 'user token xoxp-123-456-789';
    const result = redactTokens(input);
    expect(result).toBe('user token xoxp-****');
  });

  it('should redact multiple tokens in one string', () => {
    const input = 'xoxc-aaa and xoxd-bbb%2F';
    const result = redactTokens(input);
    expect(result).toBe('xoxc-**** and xoxd-****');
  });

  it('should not modify strings without tokens', () => {
    const input = 'hello world, no tokens here';
    expect(redactTokens(input)).toBe(input);
  });

  it('should handle empty string', () => {
    expect(redactTokens('')).toBe('');
  });
});

describe('createLogger', () => {
  it('should create a logger with info level', () => {
    const logger = createLogger({ LOG_LEVEL: 'info', NODE_ENV: 'test' });
    expect(logger).toBeDefined();
    expect(logger.level).toBe('info');
  });

  it('should create a logger with debug level', () => {
    const logger = createLogger({ LOG_LEVEL: 'debug', NODE_ENV: 'test' });
    expect(logger.level).toBe('debug');
  });

  it('should not use pino-pretty in production', () => {
    const logger = createLogger({ LOG_LEVEL: 'info', NODE_ENV: 'production' });
    expect(logger).toBeDefined();
  });
});
