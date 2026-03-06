import { describe, it, expect } from 'vitest';
import { isTokenDead, TOKEN_DEATH_ERRORS } from '../../src/client/types.js';

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
