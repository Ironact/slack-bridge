import { z } from 'zod';

// ─── Config ────────────────────────────────────────────────

export interface OpenClawConnectorConfig {
  gatewayUrl: string;
  gatewayToken: string;
  botUserId: string;
}

// ─── Inbound (Slack → OpenClaw) ────────────────────────────

export const inboundMessageSchema = z.object({
  channel: z.string().min(1),
  channelType: z.enum(['channel', 'dm', 'group', 'mpim']),
  user: z.string().min(1),
  text: z.string(),
  ts: z.string().min(1),
  threadTs: z.string().optional(),
});

export type InboundMessage = z.infer<typeof inboundMessageSchema>;

// ─── Outbound (OpenClaw → Slack) ───────────────────────────

export const outboundReplySchema = z.object({
  channel: z.string().min(1),
  text: z.string().min(1),
  threadTs: z.string().optional(),
});

export type OutboundReply = z.infer<typeof outboundReplySchema>;
