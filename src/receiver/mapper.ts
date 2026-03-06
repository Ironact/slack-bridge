/**
 * Map RTM events to BridgeEvent format for webhook delivery.
 */
import type { BridgeEvent, BridgeEventType, ChannelType } from '../bridge/types.js';

interface RTMRawEvent {
  type?: string;
  subtype?: string;
  channel?: string;
  channel_type?: string;
  user?: string;
  text?: string;
  ts?: string;
  thread_ts?: string;
  edited?: { user?: string; ts?: string };
  reaction?: string;
  item?: { type?: string; channel?: string; ts?: string };
  item_user?: string;
  [key: string]: unknown;
}

let eventCounter = 0;

function nextId(): string {
  return `rtm-${Date.now()}-${++eventCounter}`;
}

function mapChannelType(ct?: string): ChannelType {
  switch (ct) {
    case 'im': return 'dm';
    case 'mpim': return 'mpim';
    case 'group': return 'group';
    default: return 'channel';
  }
}

function mapEventType(type?: string, subtype?: string): BridgeEventType | null {
  switch (type) {
    case 'message':
      if (subtype === 'message_changed') return 'message_edited';
      if (subtype === 'message_deleted') return 'message_deleted';
      if (!subtype) return 'message';
      return null;
    case 'reaction_added': return 'reaction_added';
    case 'reaction_removed': return 'reaction_removed';
    case 'member_joined_channel': return 'member_joined';
    case 'member_left_channel': return 'member_left';
    case 'channel_created': return 'channel_created';
    case 'file_shared': return 'file_shared';
    default: return null;
  }
}

export function mapRTMEvent(raw: unknown): BridgeEvent | null {
  const event = raw as RTMRawEvent;
  const bridgeType = mapEventType(event.type, event.subtype);
  if (!bridgeType) return null;

  const channelId = event.channel ?? event.item?.channel ?? '';

  const bridgeEvent: BridgeEvent = {
    id: nextId(),
    type: bridgeType,
    timestamp: new Date().toISOString(),
    workspace: { id: '', name: '' }, // filled by caller if needed
    channel: {
      id: channelId,
      name: '', // would need API lookup
      type: mapChannelType(event.channel_type),
    },
    user: {
      id: event.user ?? '',
      name: '',
      displayName: '',
      isBot: false,
    },
    raw,
  };

  if (bridgeType === 'message' || bridgeType === 'message_edited' || bridgeType === 'message_deleted') {
    bridgeEvent.message = {
      ts: event.ts ?? '',
      text: event.text ?? '',
      threadTs: event.thread_ts,
      edited: bridgeType === 'message_edited',
    };
  }

  if (bridgeType === 'reaction_added' || bridgeType === 'reaction_removed') {
    bridgeEvent.reaction = {
      emoji: event.reaction ?? '',
      messageTs: event.item?.ts ?? '',
    };
  }

  return bridgeEvent;
}
