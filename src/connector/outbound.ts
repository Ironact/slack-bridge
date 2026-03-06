import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { Logger } from '../config/logger.js';
import type { SlackOperations } from '../bridge/server.js';
import { outboundReplySchema } from './types.js';

export interface OutboundHandlerConfig {
  token: string;
  logger: Logger;
  slack: SlackOperations;
}

export function registerOutboundRoutes(
  app: FastifyInstance,
  config: OutboundHandlerConfig,
): void {
  app.post('/api/v1/openclaw/reply', async (request: FastifyRequest, reply: FastifyReply) => {
    // Auth check
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      reply.code(401).send({ ok: false, error: 'Missing or invalid authorization header' });
      return;
    }

    const token = authHeader.slice(7);
    if (token !== config.token) {
      reply.code(403).send({ ok: false, error: 'Invalid token' });
      return;
    }

    // Validate body
    const parsed = outboundReplySchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400).send({ ok: false, error: parsed.error.issues });
      return;
    }

    const { channel, text, threadTs } = parsed.data;

    config.logger.info({ channel, threadTs }, 'OpenClaw reply received');

    const result = await config.slack.sendMessage({ channel, text, threadTs });
    return result;
  });
}
