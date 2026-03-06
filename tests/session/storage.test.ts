import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  saveStorageState,
  loadStorageState,
  saveMetadata,
  loadMetadata,
  getStorageStatePath,
} from '../../src/session/storage.js';
import type { SessionMetadata } from '../../src/auth/types.js';
import pino from 'pino';

const logger = pino({ level: 'silent' });

describe('session storage', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'slack-bridge-test-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  const opts = () => ({
    sessionDir: tempDir,
    logger,
  });

  describe('saveStorageState / loadStorageState', () => {
    it('should save and load plaintext storage state', async () => {
      const state = JSON.stringify({ cookies: [], origins: [] });
      await saveStorageState('T123', state, opts());
      const loaded = await loadStorageState('T123', opts());
      expect(loaded).toBe(state);
    });

    it('should save and load encrypted storage state', async () => {
      const state = JSON.stringify({ cookies: [{ name: 'd', value: 'xoxd-test' }] });
      const encOpts = { ...opts(), encryptionKey: 'a'.repeat(32) };
      await saveStorageState('T123', state, encOpts);
      const loaded = await loadStorageState('T123', encOpts);
      expect(loaded).toBe(state);
    });

    it('should return null when file does not exist', async () => {
      const loaded = await loadStorageState('nonexistent', opts());
      expect(loaded).toBeNull();
    });

    it('should return null when decryption fails', async () => {
      // Save with one encryption key
      const state = '{"plaintext": true}';
      const encOpts = { ...opts(), encryptionKey: 'a'.repeat(32) };
      await saveStorageState('T123', state, encOpts);
      // Try to load with different encryption key
      const loaded = await loadStorageState('T123', {
        ...opts(),
        encryptionKey: 'b'.repeat(32),
      });
      expect(loaded).toBeNull();
    });

    it('should set file permissions to 600', async () => {
      const state = '{}';
      await saveStorageState('T123', state, opts());
      const filePath = getStorageStatePath(tempDir, 'T123');
      const fileStat = await stat(filePath);
      const mode = fileStat.mode & 0o777;
      expect(mode).toBe(0o600);
    });
  });

  describe('saveMetadata / loadMetadata', () => {
    const metadata: SessionMetadata = {
      workspaceId: 'T123',
      workspaceName: 'Test Workspace',
      userId: 'U001',
      userName: 'testuser',
      email: 'test@example.com',
      lastValidated: '2026-03-05T18:00:00Z',
      loginCount: 1,
    };

    it('should save and load metadata', async () => {
      await saveMetadata('T123', metadata, opts());
      const loaded = await loadMetadata('T123', opts());
      expect(loaded).toEqual(metadata);
    });

    it('should return null when file does not exist', async () => {
      const loaded = await loadMetadata('nonexistent', opts());
      expect(loaded).toBeNull();
    });

    it('should set metadata file permissions to 600', async () => {
      await saveMetadata('T123', metadata, opts());
      const filePath = join(tempDir, 'T123.meta.json');
      const fileStat = await stat(filePath);
      const mode = fileStat.mode & 0o777;
      expect(mode).toBe(0o600);
    });
  });

  describe('getStorageStatePath', () => {
    it('should return correct path', () => {
      const path = getStorageStatePath('/data/sessions', 'T123');
      expect(path).toBe('/data/sessions/T123.state.json');
    });
  });
});
