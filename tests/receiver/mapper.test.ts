import { describe, it, expect } from 'vitest';
import { mapRTMEvent } from '../../src/receiver/mapper.js';

describe('mapRTMEvent', () => {
  it('should map a message event', () => {
    const result = mapRTMEvent({
      type: 'message',
      channel: 'C123',
      user: 'U456',
      text: 'hello',
      ts: '1234.5678',
    });

    expect(result).not.toBeNull();
    expect(result!.type).toBe('message');
    expect(result!.channel.id).toBe('C123');
    expect(result!.user.id).toBe('U456');
    expect(result!.message?.text).toBe('hello');
    expect(result!.message?.ts).toBe('1234.5678');
  });

  it('should map message_changed as message_edited', () => {
    const result = mapRTMEvent({
      type: 'message',
      subtype: 'message_changed',
      channel: 'C123',
    });

    expect(result!.type).toBe('message_edited');
    expect(result!.message?.edited).toBe(true);
  });

  it('should map message_deleted', () => {
    const result = mapRTMEvent({
      type: 'message',
      subtype: 'message_deleted',
      channel: 'C123',
    });

    expect(result!.type).toBe('message_deleted');
  });

  it('should map reaction_added', () => {
    const result = mapRTMEvent({
      type: 'reaction_added',
      user: 'U789',
      reaction: 'thumbsup',
      item: { type: 'message', channel: 'C123', ts: '1234.5678' },
    });

    expect(result!.type).toBe('reaction_added');
    expect(result!.reaction?.emoji).toBe('thumbsup');
    expect(result!.reaction?.messageTs).toBe('1234.5678');
  });

  it('should map reaction_removed', () => {
    const result = mapRTMEvent({
      type: 'reaction_removed',
      reaction: 'thumbsup',
      item: { channel: 'C123', ts: '111.222' },
    });

    expect(result!.type).toBe('reaction_removed');
    expect(result!.reaction?.emoji).toBe('thumbsup');
  });

  it('should return null for unknown event types', () => {
    expect(mapRTMEvent({ type: 'hello' })).toBeNull();
    expect(mapRTMEvent({ type: 'pong' })).toBeNull();
    expect(mapRTMEvent({ type: 'desktop_notification' })).toBeNull();
  });

  it('should return null for message subtypes we dont handle', () => {
    expect(mapRTMEvent({ type: 'message', subtype: 'bot_message' })).toBeNull();
  });

  it('should map im channel type to dm', () => {
    const result = mapRTMEvent({
      type: 'message',
      channel: 'D123',
      channel_type: 'im',
      text: 'dm',
    });

    expect(result!.channel.type).toBe('dm');
  });

  it('should generate unique ids', () => {
    const r1 = mapRTMEvent({ type: 'message', text: 'a' });
    const r2 = mapRTMEvent({ type: 'message', text: 'b' });
    expect(r1!.id).not.toBe(r2!.id);
  });

  it('should include raw event', () => {
    const raw = { type: 'message', text: 'raw' };
    const result = mapRTMEvent(raw);
    expect(result!.raw).toBe(raw);
  });
});
