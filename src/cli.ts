/**
 * slack-bridge CLI
 *
 * Commands: login, start, status
 */

import { Command } from 'commander';
import { parseEnv } from './config/env.js';
import { createLogger } from './config/logger.js';
import { performLogin } from './auth/login.js';
import type { SessionMetadata } from './auth/types.js';
import {
  saveStorageState,
  loadStorageState,
  saveMetadata,
  loadMetadata,
  getStorageStatePath,
} from './session/storage.js';
import { createBridgeServer, startBridgeServer } from './bridge/server.js';
import { SlackClient } from './client/slack.js';

const program = new Command();

program
  .name('slack-bridge')
  .description('Use Slack as a real human, not a bot.')
  .version('0.1.0');

program
  .command('login')
  .description('Login to Slack via browser automation')
  .requiredOption('-w, --workspace <url>', 'Slack workspace URL')
  .option('-e, --email <email>', 'Slack email')
  .option('-p, --password <password>', 'Slack password')
  .option('--headed', 'Run browser in headed mode (visible)', false)
  .action(async (options) => {
    const env = parseEnv(process.env);
    const logger = createLogger(env);
    const storageOpts = { sessionDir: env.SESSION_DIR, encryptionKey: env.SESSION_ENCRYPTION_KEY, logger };

    try {
      const storageStatePath = getStorageStatePath(env.SESSION_DIR, 'default');

      const session = await performLogin(
        {
          workspaceUrl: options.workspace,
          email: options.email,
          password: options.password,
          headed: options.headed,
        },
        { logger, storageStatePath },
      );

      const wid = session.workspace.id || 'default';
      await saveStorageState(wid, JSON.stringify(session), storageOpts);

      const meta: SessionMetadata = {
        workspaceId: wid,
        workspaceName: session.workspace.name,
        userId: session.user.id,
        userName: session.user.name,
        email: session.user.email ?? '',
        lastValidated: new Date().toISOString(),
        loginCount: 1,
      };
      await saveMetadata(wid, meta, storageOpts);

      logger.info(
        { workspace: session.workspace.name, user: session.user.name },
        '✅ Login successful! Session saved.',
      );
    } catch (err) {
      logger.error({ error: err instanceof Error ? err.message : String(err) }, '❌ Login failed');
      process.exit(1);
    }
  });

program
  .command('start')
  .description('Start the bridge server')
  .option('--workspace-id <id>', 'Workspace ID', 'default')
  .action(async (options) => {
    const env = parseEnv(process.env);
    const logger = createLogger(env);
    const storageOpts = { sessionDir: env.SESSION_DIR, encryptionKey: env.SESSION_ENCRYPTION_KEY, logger };

    try {
      const raw = await loadStorageState(options.workspaceId, storageOpts);
      if (!raw) {
        logger.error('No session found. Run "slack-bridge login" first.');
        process.exit(1);
      }

      const session = JSON.parse(raw) as { workspace: { name: string }; user: { name: string }; credentials: { token: string; cookie: string } };
      logger.info({ workspace: session.workspace.name, user: session.user.name }, 'Session loaded');

      const slackClient = new SlackClient({ credentials: session.credentials, logger });

      const auth = await slackClient.testAuth();
      if (!auth.ok) {
        logger.error({ error: auth.error }, 'Auth failed. Run "slack-bridge login" again.');
        process.exit(1);
      }
      logger.info({ user: auth.userName, team: auth.teamName }, '✅ Auth verified');

      const app = createBridgeServer({ env, logger, slack: slackClient });
      await startBridgeServer(app, { host: env.HOST, port: env.PORT, logger });

      const shutdown = async () => {
        logger.info('Shutting down...');
        await app.close();
        process.exit(0);
      };
      process.on('SIGINT', shutdown);
      process.on('SIGTERM', shutdown);
    } catch (err) {
      logger.error({ error: err instanceof Error ? err.message : String(err) }, '❌ Failed to start');
      process.exit(1);
    }
  });

program
  .command('status')
  .description('Check bridge and session status')
  .option('--workspace-id <id>', 'Workspace ID', 'default')
  .action(async (options) => {
    const env = parseEnv(process.env);
    const logger = createLogger(env);
    const storageOpts = { sessionDir: env.SESSION_DIR, encryptionKey: env.SESSION_ENCRYPTION_KEY, logger };

    try {
      const meta = await loadMetadata(options.workspaceId, storageOpts);
      if (!meta) {
        logger.info('No session found. Run "slack-bridge login" first.');
        return;
      }

      logger.info({ workspace: meta.workspaceName, user: meta.userName, lastValidated: meta.lastValidated }, 'Session info');

      const raw = await loadStorageState(options.workspaceId, storageOpts);
      if (!raw) {
        logger.warn('Session data not found or corrupted');
        return;
      }

      const session = JSON.parse(raw) as { credentials: { token: string; cookie: string } };
      const slackClient = new SlackClient({ credentials: session.credentials, logger });

      const auth = await slackClient.testAuth();
      if (auth.ok) {
        logger.info({ user: auth.userName, team: auth.teamName }, '✅ Session valid');
      } else {
        logger.warn({ error: auth.error }, '❌ Session expired or invalid');
      }
    } catch (err) {
      logger.error({ error: err instanceof Error ? err.message : String(err) }, 'Status check failed');
    }
  });

program.parse();
