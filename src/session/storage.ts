/**
 * Read/write session files (storageState + metadata).
 */
import { readFile, writeFile, mkdir, chmod, access } from 'node:fs/promises';
import { join } from 'node:path';
import { encrypt, decrypt } from '../auth/encryption.js';
import type { SessionMetadata, EncryptedPayload } from '../auth/types.js';
import type { Logger } from '../config/logger.js';

export interface StorageOptions {
  sessionDir: string;
  encryptionKey?: string;
  logger: Logger;
}

function stateFilePath(sessionDir: string, workspaceId: string): string {
  return join(sessionDir, `${workspaceId}.state.json`);
}

function metaFilePath(sessionDir: string, workspaceId: string): string {
  return join(sessionDir, `${workspaceId}.meta.json`);
}

async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true, mode: 0o700 });
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function saveStorageState(
  workspaceId: string,
  storageState: string,
  opts: StorageOptions,
): Promise<void> {
  const { sessionDir, encryptionKey, logger } = opts;
  await ensureDir(sessionDir);

  const filePath = stateFilePath(sessionDir, workspaceId);

  let content: string;
  if (encryptionKey) {
    const payload = encrypt(storageState, encryptionKey);
    content = JSON.stringify(payload);
    logger.debug('Encrypted storageState before saving');
  } else {
    content = storageState;
    logger.warn('Saving storageState without encryption — set SESSION_ENCRYPTION_KEY for production');
  }

  await writeFile(filePath, content, { mode: 0o600 });
  await chmod(filePath, 0o600);
  logger.debug({ workspaceId }, 'Saved storageState');
}

export async function loadStorageState(
  workspaceId: string,
  opts: StorageOptions,
): Promise<string | null> {
  const { sessionDir, encryptionKey, logger } = opts;
  const filePath = stateFilePath(sessionDir, workspaceId);

  if (!(await fileExists(filePath))) {
    logger.debug({ workspaceId }, 'No storageState file found');
    return null;
  }

  const raw = await readFile(filePath, 'utf-8');

  if (encryptionKey) {
    try {
      const payload = JSON.parse(raw) as EncryptedPayload;
      if (payload.iv && payload.salt && payload.data && payload.tag) {
        const decrypted = decrypt(payload, encryptionKey);
        logger.debug({ workspaceId }, 'Decrypted storageState');
        return decrypted;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error({ workspaceId, error: message }, 'Failed to decrypt storageState');
      return null;
    }
  }

  return raw;
}

export async function saveMetadata(
  workspaceId: string,
  metadata: SessionMetadata,
  opts: StorageOptions,
): Promise<void> {
  const { sessionDir, logger } = opts;
  await ensureDir(sessionDir);

  const filePath = metaFilePath(sessionDir, workspaceId);
  await writeFile(filePath, JSON.stringify(metadata, null, 2), { mode: 0o600 });
  await chmod(filePath, 0o600);
  logger.debug({ workspaceId }, 'Saved session metadata');
}

export async function loadMetadata(
  workspaceId: string,
  opts: StorageOptions,
): Promise<SessionMetadata | null> {
  const { sessionDir, logger } = opts;
  const filePath = metaFilePath(sessionDir, workspaceId);

  if (!(await fileExists(filePath))) {
    logger.debug({ workspaceId }, 'No metadata file found');
    return null;
  }

  try {
    const raw = await readFile(filePath, 'utf-8');
    return JSON.parse(raw) as SessionMetadata;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ workspaceId, error: message }, 'Failed to load session metadata');
    return null;
  }
}

export function getStorageStatePath(sessionDir: string, workspaceId: string): string {
  return stateFilePath(sessionDir, workspaceId);
}
