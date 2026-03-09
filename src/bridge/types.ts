import { z } from 'zod';

// ─── Event Types ───────────────────────────────────────────

export const bridgeEventTypeSchema = z.enum([
  'message',
  'message_edited',
  'message_deleted',
  'reaction_added',
  'reaction_removed',
  'member_joined',
  'member_left',
  'channel_created',
  'file_shared',
]);
export type BridgeEventType = z.infer<typeof bridgeEventTypeSchema>;

export const channelTypeSchema = z.enum(['channel', 'dm', 'group', 'mpim']);
export type ChannelType = z.infer<typeof channelTypeSchema>;

export interface BridgeEvent {
  id: string;
  type: BridgeEventType;
  timestamp: string;
  workspace: {
    id: string;
    name: string;
  };
  channel: {
    id: string;
    name: string;
    type: ChannelType;
  };
  user: {
    id: string;
    name: string;
    displayName: string;
    isBot: boolean;
  };
  message?: {
    ts: string;
    text: string;
    threadTs?: string;
    edited?: boolean;
  };
  reaction?: {
    emoji: string;
    messageTs: string;
  };
  raw: unknown;
}

// ─── Action Types ──────────────────────────────────────────

export const sendMessageSchema = z.object({
  channel: z.string().min(1),
  text: z.string().min(1),
  threadTs: z.string().optional(),
  replyBroadcast: z.boolean().optional().default(false),
});
export type SendMessageParams = z.infer<typeof sendMessageSchema>;

export const updateMessageSchema = z.object({
  channel: z.string().min(1),
  ts: z.string().min(1),
  text: z.string().min(1),
});
export type UpdateMessageParams = z.infer<typeof updateMessageSchema>;

export const deleteMessageSchema = z.object({
  channel: z.string().min(1),
  ts: z.string().min(1),
});
export type DeleteMessageParams = z.infer<typeof deleteMessageSchema>;

export const historyQuerySchema = z.object({
  channel: z.string().min(1),
  limit: z.coerce.number().min(1).max(200).optional().default(50),
  cursor: z.string().optional(),
});
export type HistoryQueryParams = z.infer<typeof historyQuerySchema>;

export const threadQuerySchema = z.object({
  channel: z.string().min(1),
  ts: z.string().min(1),
  limit: z.coerce.number().min(1).max(200).optional().default(50),
});
export type ThreadQueryParams = z.infer<typeof threadQuerySchema>;

export const reactionSchema = z.object({
  channel: z.string().min(1),
  ts: z.string().min(1),
  emoji: z.string().min(1),
});
export type ReactionParams = z.infer<typeof reactionSchema>;

// ─── Action Result ─────────────────────────────────────────

export interface BridgeActionResult {
  ok: boolean;
  data?: unknown;
  error?: string;
}

// ─── Health ────────────────────────────────────────────────

export interface BridgeHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  uptime: number;
  session: 'valid' | 'invalid' | 'unknown';
  websocket: 'connected' | 'disconnected' | 'reconnecting';
  lastEvent: string | null;
  eventsProcessed: number;
  /** Seconds since RTM WebSocket connected (null if never connected) */
  rtmUptime?: number | null;
  /** Number of RTM reconnection attempts */
  reconnectCount?: number;
  /** Total RTM events received (distinct from API eventsProcessed) */
  rtmEventsReceived?: number;
}
