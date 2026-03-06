import { describe, it, expect } from 'vitest';
import { isTokenDead, TOKEN_DEATH_ERRORS } from '../../src/auth/types.js';

describe('isTokenDead', () => {
  it('should return true for all token death errors', () => {
    for (const error of TOKEN_DEATH_ERRORS) {
      expect(isTokenDead(error)).toBe(true);
    }
  });

  it('should return false for non-death errors', () => {
    expect(isTokenDead('channel_not_found')).toBe(false);
    expect(isTokenDead('ratelimited')).toBe(false);
    expect(isTokenDead('not_in_channel')).toBe(false);
    expect(isTokenDead('')).toBe(false);
  });
});

describe('TOKEN_DEATH_ERRORS', () => {
  it('should contain expected errors', () => {
    expect(TOKEN_DEATH_ERRORS).toContain('invalid_auth');
    expect(TOKEN_DEATH_ERRORS).toContain('token_revoked');
    expect(TOKEN_DEATH_ERRORS).toContain('account_inactive');
    expect(TOKEN_DEATH_ERRORS).toContain('token_expired');
    expect(TOKEN_DEATH_ERRORS).toContain('not_authed');
  });

  it('should have exactly 5 entries', () => {
    expect(TOKEN_DEATH_ERRORS).toHaveLength(5);
  });
});
