/**
 * Session lifecycle: load, validate, re-login, periodic health check.
 */
import type { Credentials, SessionData, SessionHealth, SessionMetadata } from '../auth/types.js';
import { performLogin } from '../auth/login.js';
import { extractCredentials } from '../auth/credentials.js';
import {
  loadStorageState,
  saveMetadata,
  loadMetadata,
  getStorageStatePath,
} from './storage.js';
import { chromium } from 'playwright';
import type { Logger } from '../config/logger.js';
import type { Env } from '../config/env.js';

export interface SessionManagerOptions {
  env: Env;
  logger: Logger;
  validateFn?: (credentials: Credentials) => Promise<boolean>;
}

export class SessionManager {
  private credentials: Credentials | null = null;
  private session: SessionData | null = null;
  private metadata: SessionMetadata | null = null;
  private healthCheckTimer: ReturnType<typeof setInterval> | null = null;
  private status: SessionHealth['status'] = 'failed';
  private lastValidated: Date | null = null;
  private loginCount = 0;
  private consecutiveFailures = 0;

  private readonly env: Env;
  private readonly logger: Logger;
  private readonly validateFn?: (credentials: Credentials) => Promise<boolean>;

  constructor(opts: SessionManagerOptions) {
    this.env = opts.env;
    this.logger = opts.logger;
    this.validateFn = opts.validateFn;
  }

  async initialize(): Promise<void> {
    const workspaceUrl = this.env.SLACK_WORKSPACE_URL;
    if (!workspaceUrl) {
      throw new Error('SLACK_WORKSPACE_URL is required');
    }

    const workspaceId = this.getWorkspaceIdFromUrl(workspaceUrl);
    const storageOpts = {
      sessionDir: this.env.SESSION_DIR,
      encryptionKey: this.env.SESSION_ENCRYPTION_KEY,
      logger: this.logger,
    };

    this.metadata = await loadMetadata(workspaceId, storageOpts);
    this.loginCount = this.metadata?.loginCount ?? 0;

    const storageState = await loadStorageState(workspaceId, storageOpts);

    if (storageState) {
      this.logger.info({ workspaceId }, 'Found existing session, validating');
      try {
        // Try to extract and validate credentials from existing session
        const credentials = await this.extractCredentialsFromStorageState(storageState);
        if (credentials && this.validateFn) {
          const isValid = await this.validateFn(credentials);
          if (isValid) {
            this.credentials = credentials;
            this.status = 'active';
            this.lastValidated = new Date();
            this.consecutiveFailures = 0;
            this.logger.info({ workspaceId }, 'Existing session credentials are valid, skipping login');
            return;
          }
        }
        this.logger.info({ workspaceId }, 'Stored session validation failed, performing fresh login');
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn({ workspaceId, error: message }, 'Failed to validate stored session, performing fresh login');
      }
    }

    await this.loginAndExtract();
  }

  async getCredentials(): Promise<Credentials> {
    if (this.credentials) {
      return this.credentials;
    }
    await this.initialize();
    if (!this.credentials) {
      throw new Error('Failed to obtain credentials');
    }
    return this.credentials;
  }

  async reportTokenDeath(): Promise<void> {
    this.consecutiveFailures++;
    this.logger.warn(
      { consecutiveFailures: this.consecutiveFailures },
      'Token death reported',
    );

    if (this.consecutiveFailures >= 3) {
      this.logger.info('Max consecutive failures reached, triggering re-login');
      await this.forceRelogin();
    }
  }

  async forceRelogin(): Promise<void> {
    this.status = 'refreshing';
    this.credentials = null;
    await this.loginAndExtract();
  }

  getHealth(): SessionHealth {
    const extractedAt = this.session?.extractedAt;
    const tokenAge = extractedAt
      ? Math.floor((Date.now() - new Date(extractedAt).getTime()) / 1000)
      : 0;

    return {
      status: this.status,
      lastValidated: this.lastValidated,
      tokenAge,
      loginCount: this.loginCount,
    };
  }

  startHealthCheck(): void {
    if (this.healthCheckTimer) return;

    const interval = this.env.AUTH_VALIDATION_INTERVAL_MS;
    this.logger.info({ intervalMs: interval }, 'Starting periodic health check');

    this.healthCheckTimer = setInterval(() => {
      void this.validate();
    }, interval);
  }

  stopHealthCheck(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
      this.logger.info('Stopped periodic health check');
    }
  }

  private async validate(): Promise<void> {
    if (!this.credentials || !this.validateFn) return;

    try {
      const valid = await this.validateFn(this.credentials);
      if (valid) {
        this.lastValidated = new Date();
        this.consecutiveFailures = 0;
        this.logger.debug('Session validation passed');
      } else {
        this.logger.warn('Session validation failed, triggering re-login');
        await this.forceRelogin();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error({ error: message }, 'Session validation error (network?)');
    }
  }

  private async loginAndExtract(): Promise<void> {
    const workspaceUrl = this.env.SLACK_WORKSPACE_URL!;
    const email = this.env.SLACK_EMAIL;
    if (!email) {
      throw new Error('SLACK_EMAIL is required for login');
    }

    const workspaceId = this.getWorkspaceIdFromUrl(workspaceUrl);
    const storageOpts = {
      sessionDir: this.env.SESSION_DIR,
      encryptionKey: this.env.SESSION_ENCRYPTION_KEY,
      logger: this.logger,
    };

    this.status = 'refreshing';

    try {
      const session = await performLogin(
        {
          workspaceUrl,
          email,
          password: this.env.SLACK_PASSWORD,
          headed: !this.env.BROWSER_HEADLESS,
          timeout: this.env.BROWSER_TIMEOUT_MS,
        },
        {
          logger: this.logger,
          storageStatePath: getStorageStatePath(this.env.SESSION_DIR, workspaceId),
        },
      );

      this.session = session;
      this.credentials = session.credentials;
      this.status = 'active';
      this.lastValidated = new Date();
      this.consecutiveFailures = 0;
      this.loginCount++;

      const metadata: SessionMetadata = {
        workspaceId: session.workspace.id,
        workspaceName: session.workspace.name,
        userId: session.user.id,
        userName: session.user.name,
        email: session.user.email,
        lastValidated: new Date().toISOString(),
        loginCount: this.loginCount,
      };

      await saveMetadata(session.workspace.id, metadata, storageOpts);
      this.metadata = metadata;

      this.logger.info({ workspaceId: session.workspace.id }, 'Session established');
    } catch (error) {
      this.status = 'failed';
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error({ error: message }, 'Login failed');
      throw error;
    }
  }

  private async extractCredentialsFromStorageState(storageState: string): Promise<Credentials | null> {
    let browser = null;
    try {
      // Create temporary file for storageState
      const { writeFile, unlink } = await import('node:fs/promises');
      const { join } = await import('node:path');
      const { tmpdir } = await import('node:os');
      
      const tempPath = join(tmpdir(), `temp-storage-${Date.now()}.json`);
      await writeFile(tempPath, storageState);

      // Launch browser with existing storageState
      browser = await chromium.launch({ headless: true });
      const context = await browser.newContext({ storageState: tempPath });
      const page = await context.newPage();
      
      // Navigate to workspace to trigger storageState loading
      const workspaceUrl = this.env.SLACK_WORKSPACE_URL!;
      await page.goto(workspaceUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });

      // Extract credentials
      const credentials = await extractCredentials(page);

      // Cleanup
      await unlink(tempPath).catch(() => {}); // Ignore cleanup errors
      
      return credentials;
    } catch (error) {
      this.logger.debug({ error }, 'Failed to extract credentials from storageState');
      return null;
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }

  private getWorkspaceIdFromUrl(url: string): string {
    const cleaned = url
      .replace(/^https?:\/\//, '')
      .replace(/\.slack\.com.*$/, '')
      .replace(/[^a-zA-Z0-9-]/g, '');
    return cleaned || 'default';
  }
}
