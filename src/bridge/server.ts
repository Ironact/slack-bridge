import Fastify from 'fastify';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { Logger } from '../config/logger.js';
import type { Env } from '../config/env.js';
import {
  sendMessageSchema,
  updateMessageSchema,
  deleteMessageSchema,
  historyQuerySchema,
  threadQuerySchema,
  reactionSchema,
} from './types.js';
import type { BridgeHealth, BridgeActionResult } from './types.js';

/**
 * Abstraction over Slack operations.
 * Implemented by the Slack Client module (separate concern).
 */
export interface SlackOperations {
  sendMessage(params: { channel: string; text: string; threadTs?: string; replyBroadcast?: boolean }): Promise<BridgeActionResult>;
  updateMessage(params: { channel: string; ts: string; text: string }): Promise<BridgeActionResult>;
  deleteMessage(params: { channel: string; ts: string }): Promise<BridgeActionResult>;
  getHistory(params: { channel: string; limit?: number; cursor?: string }): Promise<BridgeActionResult>;
  getThread(params: { channel: string; ts: string; limit?: number }): Promise<BridgeActionResult>;
  addReaction(params: { channel: string; ts: string; emoji: string }): Promise<BridgeActionResult>;
  removeReaction(params: { channel: string; ts: string; emoji: string }): Promise<BridgeActionResult>;
}

export interface BridgeServerConfig {
  env: Env;
  logger: Logger;
  slack?: SlackOperations;
}

/**
 * Create and configure the Bridge Fastify server.
 */
export function createBridgeServer(config: BridgeServerConfig): FastifyInstance {
  const { env, logger, slack } = config;

  const startTime = Date.now();
  let eventsProcessed = 0;

  const app = Fastify({
    logger: false, // We use our own logger
  });

  // ─── Auth middleware ──────────────────────────────────────

  app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    // Skip auth for health endpoint
    if (request.url === '/api/v1/health') return;

    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      reply.code(401).send({ ok: false, error: 'Missing or invalid authorization header' });
      return;
    }

    const token = authHeader.slice(7);
    if (!env.WEBHOOK_SECRET || token !== env.WEBHOOK_SECRET) {
      reply.code(403).send({ ok: false, error: 'Invalid token' });
      return;
    }
  });

  // ─── Health ───────────────────────────────────────────────

  app.get('/api/v1/health', async (): Promise<BridgeHealth> => {
    return {
      status: 'healthy',
      uptime: Math.floor((Date.now() - startTime) / 1000),
      session: 'unknown',
      websocket: 'disconnected',
      lastEvent: null,
      eventsProcessed,
    };
  });

  // ─── Messages ─────────────────────────────────────────────

  app.post('/api/v1/messages/send', async (request, reply) => {
    const parsed = sendMessageSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400).send({ ok: false, error: parsed.error.issues });
      return;
    }
    if (!slack) {
      reply.code(503).send({ ok: false, error: 'Slack client not connected' });
      return;
    }
    eventsProcessed++;
    return slack.sendMessage(parsed.data);
  });

  app.post('/api/v1/messages/update', async (request, reply) => {
    const parsed = updateMessageSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400).send({ ok: false, error: parsed.error.issues });
      return;
    }
    if (!slack) {
      reply.code(503).send({ ok: false, error: 'Slack client not connected' });
      return;
    }
    eventsProcessed++;
    return slack.updateMessage(parsed.data);
  });

  app.post('/api/v1/messages/delete', async (request, reply) => {
    const parsed = deleteMessageSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400).send({ ok: false, error: parsed.error.issues });
      return;
    }
    if (!slack) {
      reply.code(503).send({ ok: false, error: 'Slack client not connected' });
      return;
    }
    eventsProcessed++;
    return slack.deleteMessage(parsed.data);
  });

  app.get('/api/v1/messages/history', async (request, reply) => {
    const parsed = historyQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      reply.code(400).send({ ok: false, error: parsed.error.issues });
      return;
    }
    if (!slack) {
      reply.code(503).send({ ok: false, error: 'Slack client not connected' });
      return;
    }
    return slack.getHistory(parsed.data);
  });

  app.get('/api/v1/messages/thread', async (request, reply) => {
    const parsed = threadQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      reply.code(400).send({ ok: false, error: parsed.error.issues });
      return;
    }
    if (!slack) {
      reply.code(503).send({ ok: false, error: 'Slack client not connected' });
      return;
    }
    return slack.getThread(parsed.data);
  });

  // ─── Reactions ────────────────────────────────────────────

  app.post('/api/v1/reactions/add', async (request, reply) => {
    const parsed = reactionSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400).send({ ok: false, error: parsed.error.issues });
      return;
    }
    if (!slack) {
      reply.code(503).send({ ok: false, error: 'Slack client not connected' });
      return;
    }
    eventsProcessed++;
    return slack.addReaction(parsed.data);
  });

  app.post('/api/v1/reactions/remove', async (request, reply) => {
    const parsed = reactionSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400).send({ ok: false, error: parsed.error.issues });
      return;
    }
    if (!slack) {
      reply.code(503).send({ ok: false, error: 'Slack client not connected' });
      return;
    }
    eventsProcessed++;
    return slack.removeReaction(parsed.data);
  });

  // ─── Error handler ────────────────────────────────────────

  app.setErrorHandler((error, _request, reply) => {
    logger.error({ err: error }, 'Unhandled server error');
    reply.code(500).send({ ok: false, error: 'Internal server error' });
  });

  return app;
}

/**
 * Start the Bridge server.
 */
export async function startBridgeServer(
  app: FastifyInstance,
  config: { host: string; port: number; logger: Logger },
): Promise<void> {
  await app.listen({ host: config.host, port: config.port });
  config.logger.info({ host: config.host, port: config.port }, '🌉 Bridge server started');
}
