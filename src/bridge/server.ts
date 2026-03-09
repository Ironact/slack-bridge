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

/**
 * Callback that returns live health state from the RTM receiver + session.
 */
export interface HealthStateProvider {
  websocket: BridgeHealth['websocket'];
  session: BridgeHealth['session'];
  lastEvent: string | null;
  rtmEventsReceived: number;
  rtmUptime: number | null;
  reconnectCount: number;
}

export interface BridgeServerConfig {
  env: Env;
  logger: Logger;
  slack?: SlackOperations;
  /** Optional callback to get live RTM/session health state */
  getHealthState?: () => HealthStateProvider;
}

/**
 * Create and configure the Bridge Fastify server.
 */
export function createBridgeServer(config: BridgeServerConfig): FastifyInstance {
  const { env, logger, slack, getHealthState } = config;

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

  // ─── Slack availability check ─────────────────────────────

  const requireSlack = async (request: FastifyRequest, reply: FastifyReply) => {
    if (!slack) {
      reply.code(503).send({ ok: false, error: 'Slack client not connected' });
      return;
    }
  };

  // ─── Health ───────────────────────────────────────────────

  app.get('/api/v1/health', async (): Promise<BridgeHealth> => {
    const healthState = getHealthState?.();

    const websocket = healthState?.websocket ?? 'disconnected';
    const session = healthState?.session ?? 'unknown';

    // Determine overall status based on WebSocket state
    let status: BridgeHealth['status'] = 'healthy';
    if (websocket === 'disconnected') {
      status = 'unhealthy';
    } else if (websocket === 'reconnecting') {
      status = 'degraded';
    }

    return {
      status,
      uptime: Math.floor((Date.now() - startTime) / 1000),
      session,
      websocket,
      lastEvent: healthState?.lastEvent ?? null,
      eventsProcessed,
      rtmUptime: healthState?.rtmUptime ?? null,
      reconnectCount: healthState?.reconnectCount ?? 0,
      rtmEventsReceived: healthState?.rtmEventsReceived ?? 0,
    };
  });

  // ─── Messages ─────────────────────────────────────────────

  app.post('/api/v1/messages/send', { preHandler: requireSlack }, async (request, reply) => {
    const parsed = sendMessageSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400).send({ ok: false, error: parsed.error.issues });
      return;
    }
    eventsProcessed++;
    return slack!.sendMessage(parsed.data);
  });

  app.post('/api/v1/messages/update', { preHandler: requireSlack }, async (request, reply) => {
    const parsed = updateMessageSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400).send({ ok: false, error: parsed.error.issues });
      return;
    }
    eventsProcessed++;
    return slack!.updateMessage(parsed.data);
  });

  app.post('/api/v1/messages/delete', { preHandler: requireSlack }, async (request, reply) => {
    const parsed = deleteMessageSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400).send({ ok: false, error: parsed.error.issues });
      return;
    }
    eventsProcessed++;
    return slack!.deleteMessage(parsed.data);
  });

  app.get('/api/v1/messages/history', { preHandler: requireSlack }, async (request, reply) => {
    const parsed = historyQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      reply.code(400).send({ ok: false, error: parsed.error.issues });
      return;
    }
    return slack!.getHistory(parsed.data);
  });

  app.get('/api/v1/messages/thread', { preHandler: requireSlack }, async (request, reply) => {
    const parsed = threadQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      reply.code(400).send({ ok: false, error: parsed.error.issues });
      return;
    }
    return slack!.getThread(parsed.data);
  });

  // ─── Reactions ────────────────────────────────────────────

  app.post('/api/v1/reactions/add', { preHandler: requireSlack }, async (request, reply) => {
    const parsed = reactionSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400).send({ ok: false, error: parsed.error.issues });
      return;
    }
    eventsProcessed++;
    return slack!.addReaction(parsed.data);
  });

  app.post('/api/v1/reactions/remove', { preHandler: requireSlack }, async (request, reply) => {
    const parsed = reactionSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400).send({ ok: false, error: parsed.error.issues });
      return;
    }
    eventsProcessed++;
    return slack!.removeReaction(parsed.data);
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
