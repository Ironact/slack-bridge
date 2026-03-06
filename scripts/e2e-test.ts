/**
 * E2E test: Send a real Slack message using slack-bridge.
 *
 * Usage:
 *   SLACK_TOKEN=xoxc-... SLACK_COOKIE=xoxd-... SLACK_CHANNEL=C... npx tsx scripts/e2e-test.ts
 */

import { SlackClient } from '../src/client/slack.js';
import { createLogger } from '../src/config/logger.js';

const token = process.env['SLACK_TOKEN'];
const cookie = process.env['SLACK_COOKIE'];
const channel = process.env['SLACK_CHANNEL'];

if (!token || !cookie || !channel) {
  console.error('Required: SLACK_TOKEN, SLACK_COOKIE, SLACK_CHANNEL');
  process.exit(1);
}

const logger = createLogger({ LOG_LEVEL: 'info', HOST: '0.0.0.0', PORT: 3000, NODE_ENV: 'development' });

async function main() {
  const client = new SlackClient({
    credentials: { token, cookie },
    logger,
  });

  // 1. Test auth
  logger.info('Testing auth...');
  const auth = await client.testAuth();
  if (!auth.ok) {
    logger.error({ error: auth.error }, '❌ Auth failed');
    process.exit(1);
  }
  logger.info({ user: auth.userName, team: auth.teamName }, '✅ Auth OK');

  // 2. Send message
  const text = `🌉 slack-bridge E2E test — ${new Date().toISOString()}`;
  logger.info({ channel, text }, 'Sending message...');
  const result = await client.sendMessage({ channel, text });

  if (result.ok) {
    logger.info({ ts: result.ts, channel: result.channel }, '✅ Message sent!');
  } else {
    logger.error({ error: result.error }, '❌ Send failed');
    process.exit(1);
  }

  // 3. React to own message
  if (result.ts) {
    logger.info('Adding reaction...');
    const reaction = await client.addReaction({
      channel,
      timestamp: result.ts,
      emoji: 'bridge_at_night',
    });
    if (reaction.ok) {
      logger.info('✅ Reaction added!');
    } else {
      logger.warn({ error: reaction.error }, '⚠️ Reaction failed (non-critical)');
    }
  }

  logger.info('🎉 E2E test complete!');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
