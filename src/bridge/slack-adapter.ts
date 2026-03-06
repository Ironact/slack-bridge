import type { SlackClientWrapper } from '../client/slack-client.js';
import type { SlackOperations } from './server.js';
import type { BridgeActionResult } from './types.js';

/**
 * Adapter to make SlackClientWrapper compatible with SlackOperations interface.
 */
export class SlackOperationsAdapter implements SlackOperations {
  constructor(private client: SlackClientWrapper) {}

  async sendMessage(params: { 
    channel: string; 
    text: string; 
    threadTs?: string; 
    replyBroadcast?: boolean 
  }): Promise<BridgeActionResult> {
    try {
      const result = await this.client.sendMessage(params.channel, params.text, params.threadTs);
      return { ok: result.ok, data: result };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  async updateMessage(params: { 
    channel: string; 
    ts: string; 
    text: string 
  }): Promise<BridgeActionResult> {
    try {
      await this.client.editMessage(params.channel, params.ts, params.text);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  async deleteMessage(params: { 
    channel: string; 
    ts: string 
  }): Promise<BridgeActionResult> {
    try {
      await this.client.deleteMessage(params.channel, params.ts);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  async getHistory(params: { 
    channel: string; 
    limit?: number; 
    cursor?: string 
  }): Promise<BridgeActionResult> {
    try {
      const messages = await this.client.getHistory(params.channel, params.limit, params.cursor);
      return { ok: true, data: { messages } };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  async getThread(params: { 
    channel: string; 
    ts: string; 
    limit?: number 
  }): Promise<BridgeActionResult> {
    try {
      const messages = await this.client.getThread(params.channel, params.ts, params.limit);
      return { ok: true, data: { messages } };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  async addReaction(params: { 
    channel: string; 
    ts: string; 
    emoji: string 
  }): Promise<BridgeActionResult> {
    try {
      await this.client.addReaction(params.channel, params.ts, params.emoji);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  async removeReaction(params: { 
    channel: string; 
    ts: string; 
    emoji: string 
  }): Promise<BridgeActionResult> {
    try {
      await this.client.removeReaction(params.channel, params.ts, params.emoji);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }
}