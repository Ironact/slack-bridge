import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SlackClientWrapper } from '../../src/client/slack-client.js';
import pino from 'pino';

const logger = pino({ level: 'silent' });

// Mock the WebClient
vi.mock('@slack/web-api', () => {
  const mockClient = {
    auth: {
      test: vi.fn().mockResolvedValue({ ok: true, user_id: 'U123', team_id: 'T456', user: 'testuser', team: 'testteam' }),
    },
    chat: {
      postMessage: vi.fn().mockResolvedValue({ ok: true, ts: '1234.5678', channel: 'C001' }),
      update: vi.fn().mockResolvedValue({ ok: true }),
      delete: vi.fn().mockResolvedValue({ ok: true }),
    },
    conversations: {
      history: vi.fn().mockResolvedValue({ ok: true, messages: [{ text: 'hello', ts: '1234.5678' }] }),
      replies: vi.fn().mockResolvedValue({ ok: true, messages: [{ text: 'reply', ts: '1234.5679' }] }),
      list: vi.fn().mockResolvedValue({
        ok: true,
        channels: [{ id: 'C001', name: 'general', is_private: false, is_member: true, topic: { value: 'General' }, purpose: { value: 'General chat' } }],
      }),
      info: vi.fn().mockResolvedValue({
        ok: true,
        channel: { id: 'C001', name: 'general', is_private: false, is_member: true, topic: { value: 'General' }, purpose: { value: 'General chat' } },
      }),
      join: vi.fn().mockResolvedValue({ ok: true }),
      leave: vi.fn().mockResolvedValue({ ok: true }),
      open: vi.fn().mockResolvedValue({ ok: true, channel: { id: 'D001' } }),
    },
    reactions: {
      add: vi.fn().mockResolvedValue({ ok: true }),
      remove: vi.fn().mockResolvedValue({ ok: true }),
    },
    users: {
      info: vi.fn().mockResolvedValue({
        ok: true,
        user: { id: 'U123', name: 'testuser', real_name: 'Test User', profile: { display_name: 'Test', email: 'test@test.com' }, is_bot: false },
      }),
      profile: {
        set: vi.fn().mockResolvedValue({ ok: true }),
      },
    },
    search: {
      messages: vi.fn().mockResolvedValue({ ok: true, messages: { matches: [] } }),
    },
    files: {
      getUploadURLExternal: vi.fn().mockResolvedValue({ ok: true, upload_url: 'https://upload.example.com', file_id: 'F001' }),
      completeUploadExternal: vi.fn().mockResolvedValue({ ok: true }),
    },
  };

  return {
    WebClient: vi.fn().mockImplementation(() => mockClient),
    LogLevel: { INFO: 'info' },
    __mockClient: mockClient,
  };
});

// Mock fetch for file upload
vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));

describe('SlackClientWrapper', () => {
  let client: SlackClientWrapper;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new SlackClientWrapper({
      token: 'xoxc-test-token',
      cookie: 'xoxd-test-cookie',
      logger,
      rateLimitConfig: { globalMaxPerMinute: 1000, minDelayMs: 0 },
    });
  });

  describe('testAuth', () => {
    it('should return auth result', async () => {
      const result = await client.testAuth();
      expect(result.ok).toBe(true);
      expect(result.userId).toBe('U123');
      expect(result.teamId).toBe('T456');
    });
  });

  describe('isTokenValid', () => {
    it('should return true for valid token', async () => {
      expect(await client.isTokenValid()).toBe(true);
    });

    it('should return false when auth.test throws', async () => {
      client.raw.auth.test = vi.fn().mockRejectedValue(new Error('fail'));
      expect(await client.isTokenValid()).toBe(false);
    });
  });

  describe('sendMessage', () => {
    it('should send message and return result', async () => {
      const result = await client.sendMessage('C001', 'Hello!');
      expect(result.ok).toBe(true);
      expect(result.ts).toBe('1234.5678');
      expect(result.channel).toBe('C001');
    });

    it('should send threaded message', async () => {
      await client.sendMessage('C001', 'Reply', '1234.0000');
      expect(client.raw.chat.postMessage).toHaveBeenCalledWith({
        channel: 'C001',
        text: 'Reply',
        thread_ts: '1234.0000',
      });
    });
  });

  describe('editMessage', () => {
    it('should edit a message', async () => {
      await client.editMessage('C001', '1234.5678', 'Updated');
      expect(client.raw.chat.update).toHaveBeenCalledWith({
        channel: 'C001',
        ts: '1234.5678',
        text: 'Updated',
      });
    });
  });

  describe('deleteMessage', () => {
    it('should delete a message', async () => {
      await client.deleteMessage('C001', '1234.5678');
      expect(client.raw.chat.delete).toHaveBeenCalledWith({
        channel: 'C001',
        ts: '1234.5678',
      });
    });
  });

  describe('getHistory', () => {
    it('should return messages', async () => {
      const messages = await client.getHistory('C001');
      expect(messages).toHaveLength(1);
    });
  });

  describe('getThread', () => {
    it('should return thread replies', async () => {
      const messages = await client.getThread('C001', '1234.5678');
      expect(messages).toHaveLength(1);
    });
  });

  describe('reactions', () => {
    it('should add reaction', async () => {
      await client.addReaction('C001', '1234.5678', 'thumbsup');
      expect(client.raw.reactions.add).toHaveBeenCalled();
    });

    it('should remove reaction', async () => {
      await client.removeReaction('C001', '1234.5678', 'thumbsup');
      expect(client.raw.reactions.remove).toHaveBeenCalled();
    });
  });

  describe('channels', () => {
    it('should get channels list', async () => {
      const channels = await client.getChannels();
      expect(channels).toHaveLength(1);
      expect(channels[0]!.name).toBe('general');
    });

    it('should cache channels', async () => {
      await client.getChannels();
      await client.getChannels();
      expect(client.raw.conversations.list).toHaveBeenCalledTimes(1);
    });

    it('should get single channel', async () => {
      const ch = await client.getChannel('C001');
      expect(ch.name).toBe('general');
    });

    it('should join channel', async () => {
      await client.joinChannel('C001');
      expect(client.raw.conversations.join).toHaveBeenCalledWith({ channel: 'C001' });
    });

    it('should leave channel', async () => {
      await client.leaveChannel('C001');
      expect(client.raw.conversations.leave).toHaveBeenCalledWith({ channel: 'C001' });
    });
  });

  describe('users', () => {
    it('should get user info', async () => {
      const user = await client.getUser('U123');
      expect(user.name).toBe('testuser');
      expect(user.realName).toBe('Test User');
    });

    it('should cache user info', async () => {
      await client.getUser('U123');
      await client.getUser('U123');
      expect(client.raw.users.info).toHaveBeenCalledTimes(1);
    });

    it('should set status', async () => {
      await client.setStatus('Working', ':computer:');
      expect(client.raw.users.profile.set).toHaveBeenCalled();
    });
  });

  describe('search', () => {
    it('should search messages', async () => {
      const result = await client.search('test query');
      expect(result).toBeDefined();
    });
  });

  describe('openDM', () => {
    it('should open DM and return channel ID', async () => {
      const channelId = await client.openDM('U123');
      expect(channelId).toBe('D001');
    });
  });

  describe('uploadFile', () => {
    it('should upload file', async () => {
      const file = Buffer.from('file content');
      await client.uploadFile('C001', file, 'test.txt', 'A file');
      expect(client.raw.files.getUploadURLExternal).toHaveBeenCalled();
      expect(client.raw.files.completeUploadExternal).toHaveBeenCalled();
    });
  });

  describe('token death handling', () => {
    it('should call token death handler on auth error', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      client.setTokenDeathHandler(handler);

      client.raw.chat.postMessage = vi.fn().mockRejectedValue({
        data: { error: 'invalid_auth' },
      });

      await expect(client.sendMessage('C001', 'test')).rejects.toBeDefined();
      expect(handler).toHaveBeenCalled();
    });

    it('should not call handler for non-death errors', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      client.setTokenDeathHandler(handler);

      client.raw.chat.postMessage = vi.fn().mockRejectedValue({
        data: { error: 'channel_not_found' },
      });

      await expect(client.sendMessage('C001', 'test')).rejects.toBeDefined();
      expect(handler).not.toHaveBeenCalled();
    });
  });
});
