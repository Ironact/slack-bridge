import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TTLCache, UserCache, ChannelCache } from '../../src/client/cache.js';
import type { ChannelInfo } from '../../src/client/cache.js';

describe('TTLCache', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should store and retrieve values', () => {
    const cache = new TTLCache<string>(1000);
    cache.set('key1', 'value1');
    expect(cache.get('key1')).toBe('value1');
  });

  it('should return undefined for missing keys', () => {
    const cache = new TTLCache<string>(1000);
    expect(cache.get('missing')).toBeUndefined();
  });

  it('should expire entries after TTL', () => {
    const cache = new TTLCache<string>(1000);
    cache.set('key1', 'value1');
    expect(cache.get('key1')).toBe('value1');

    vi.advanceTimersByTime(1001);
    expect(cache.get('key1')).toBeUndefined();
  });

  it('should report has correctly', () => {
    const cache = new TTLCache<string>(1000);
    cache.set('key1', 'value1');
    expect(cache.has('key1')).toBe(true);
    expect(cache.has('missing')).toBe(false);

    vi.advanceTimersByTime(1001);
    expect(cache.has('key1')).toBe(false);
  });

  it('should delete entries', () => {
    const cache = new TTLCache<string>(1000);
    cache.set('key1', 'value1');
    expect(cache.delete('key1')).toBe(true);
    expect(cache.get('key1')).toBeUndefined();
  });

  it('should clear all entries', () => {
    const cache = new TTLCache<string>(1000);
    cache.set('key1', 'value1');
    cache.set('key2', 'value2');
    cache.clear();
    expect(cache.get('key1')).toBeUndefined();
    expect(cache.get('key2')).toBeUndefined();
  });

  it('should report correct size after pruning', () => {
    const cache = new TTLCache<string>(1000);
    cache.set('key1', 'value1');
    cache.set('key2', 'value2');
    expect(cache.size).toBe(2);

    vi.advanceTimersByTime(1001);
    expect(cache.size).toBe(0);
  });
});

describe('UserCache', () => {
  it('should store and retrieve users', () => {
    const cache = new UserCache();
    const user = { id: 'U1', name: 'test', realName: 'Test User' };
    cache.set('U1', user);
    expect(cache.get('U1')).toEqual(user);
  });

  it('should use default TTL of 1 hour', () => {
    const cache = new UserCache();
    expect(cache.cache.ttlMs).toBe(3_600_000);
  });

  it('should accept custom TTL', () => {
    const cache = new UserCache(5000);
    expect(cache.cache.ttlMs).toBe(5000);
  });

  it('should report has correctly', () => {
    const cache = new UserCache();
    cache.set('U1', { id: 'U1', name: 'test' });
    expect(cache.has('U1')).toBe(true);
    expect(cache.has('U2')).toBe(false);
  });
});

describe('ChannelCache', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should store and retrieve channels', () => {
    const cache = new ChannelCache();
    const ch: ChannelInfo = { id: 'C1', name: 'general', isPrivate: false, isMember: true };
    cache.set('C1', ch);
    expect(cache.get('C1')).toEqual(ch);
  });

  it('should use default TTL of 30 minutes', () => {
    const cache = new ChannelCache();
    expect(cache.cache.ttlMs).toBe(1_800_000);
    expect(cache.refreshIntervalMs).toBe(1_800_000);
  });

  it('should store and retrieve all channels', () => {
    const cache = new ChannelCache();
    const channels: ChannelInfo[] = [
      { id: 'C1', name: 'general', isPrivate: false, isMember: true },
      { id: 'C2', name: 'random', isPrivate: false, isMember: true },
    ];
    cache.setAll(channels);
    expect(cache.getAll()).toEqual(channels);
    expect(cache.get('C1')).toEqual(channels[0]);
    expect(cache.get('C2')).toEqual(channels[1]);
  });

  it('should expire all channels after TTL', () => {
    const cache = new ChannelCache(1000);
    const channels: ChannelInfo[] = [
      { id: 'C1', name: 'general', isPrivate: false, isMember: true },
    ];
    cache.setAll(channels);
    expect(cache.getAll()).toEqual(channels);

    vi.advanceTimersByTime(1001);
    expect(cache.getAll()).toBeNull();
  });

  it('should return null for getAll when not set', () => {
    const cache = new ChannelCache();
    expect(cache.getAll()).toBeNull();
  });
});
