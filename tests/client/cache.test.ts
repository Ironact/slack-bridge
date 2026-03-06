import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TTLCache } from '../../src/client/cache.js';

describe('TTLCache', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should store and retrieve values', () => {
    const cache = new TTLCache<string>(60_000);
    cache.set('key1', 'value1');
    expect(cache.get('key1')).toBe('value1');
  });

  it('should return undefined for missing keys', () => {
    const cache = new TTLCache<string>(60_000);
    expect(cache.get('missing')).toBeUndefined();
  });

  it('should expire entries after TTL', () => {
    const cache = new TTLCache<string>(1000);
    cache.set('key1', 'value1');
    expect(cache.get('key1')).toBe('value1');

    vi.advanceTimersByTime(1001);
    expect(cache.get('key1')).toBeUndefined();
  });

  it('should not expire entries before TTL', () => {
    const cache = new TTLCache<string>(1000);
    cache.set('key1', 'value1');

    vi.advanceTimersByTime(999);
    expect(cache.get('key1')).toBe('value1');
  });

  it('should overwrite existing entries', () => {
    const cache = new TTLCache<string>(60_000);
    cache.set('key1', 'old');
    cache.set('key1', 'new');
    expect(cache.get('key1')).toBe('new');
  });

  it('should report has correctly', () => {
    const cache = new TTLCache<string>(60_000);
    cache.set('key1', 'value1');
    expect(cache.has('key1')).toBe(true);
    expect(cache.has('missing')).toBe(false);
  });

  it('should report has as false for expired entries', () => {
    const cache = new TTLCache<string>(1000);
    cache.set('key1', 'value1');
    vi.advanceTimersByTime(1001);
    expect(cache.has('key1')).toBe(false);
  });

  it('should delete entries', () => {
    const cache = new TTLCache<string>(60_000);
    cache.set('key1', 'value1');
    cache.delete('key1');
    expect(cache.get('key1')).toBeUndefined();
  });

  it('should clear all entries', () => {
    const cache = new TTLCache<string>(60_000);
    cache.set('key1', 'value1');
    cache.set('key2', 'value2');
    cache.clear();
    expect(cache.get('key1')).toBeUndefined();
    expect(cache.get('key2')).toBeUndefined();
  });

  it('should report correct size excluding expired', () => {
    const cache = new TTLCache<string>(1000);
    cache.set('key1', 'value1');
    cache.set('key2', 'value2');
    expect(cache.size).toBe(2);

    vi.advanceTimersByTime(1001);
    expect(cache.size).toBe(0);
  });
});
