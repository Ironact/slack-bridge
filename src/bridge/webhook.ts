import { createHmac } from 'node:crypto';
import type { BridgeEvent } from './types.js';
import type { Logger } from '../config/logger.js';

export interface WebhookConfig {
  url: string;
  secret: string;
  maxRetries?: number;
  retryBaseDelayMs?: number;
  timeoutMs?: number;
}

interface WebhookDeliveryResult {
  success: boolean;
  statusCode?: number;
  attempts: number;
  error?: string;
}

/**
 * Generate HMAC-SHA256 signature for webhook payload.
 * Format: sha256={hmac(timestamp.body)}
 */
export function generateSignature(
  secret: string,
  timestamp: string,
  body: string,
): string {
  const hmac = createHmac('sha256', secret);
  hmac.update(`${timestamp}.${body}`);
  return `sha256=${hmac.digest('hex')}`;
}

/**
 * Verify webhook signature.
 */
export function verifySignature(
  secret: string,
  timestamp: string,
  body: string,
  signature: string,
): boolean {
  const expected = generateSignature(secret, timestamp, body);
  // Constant-time comparison
  if (expected.length !== signature.length) return false;
  let result = 0;
  for (let i = 0; i < expected.length; i++) {
    result |= (expected.charCodeAt(i) ?? 0) ^ (signature.charCodeAt(i) ?? 0);
  }
  return result === 0;
}

/**
 * Deliver a webhook event with retries and exponential backoff.
 */
export async function deliverWebhook(
  config: WebhookConfig,
  event: BridgeEvent,
  logger: Logger,
): Promise<WebhookDeliveryResult> {
  const maxRetries = config.maxRetries ?? 3;
  const baseDelay = config.retryBaseDelayMs ?? 1000;
  const timeout = config.timeoutMs ?? 5000;

  const body = JSON.stringify(event);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = generateSignature(config.secret, timestamp, body);

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(config.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Bridge-Event': event.type,
          'X-Bridge-Signature': signature,
          'X-Bridge-Timestamp': timestamp,
        },
        body,
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (response.ok) {
        logger.debug({ eventId: event.id, attempt }, 'Webhook delivered');
        return { success: true, statusCode: response.status, attempts: attempt };
      }

      // Retry on 5xx
      if (response.status >= 500) {
        logger.warn(
          { eventId: event.id, status: response.status, attempt },
          'Webhook 5xx, retrying',
        );
        if (attempt < maxRetries) {
          await sleep(baseDelay * Math.pow(2, attempt - 1));
          continue;
        }
        return {
          success: false,
          statusCode: response.status,
          attempts: attempt,
          error: `Server error: ${response.status}`,
        };
      }

      // Don't retry on 4xx
      return {
        success: false,
        statusCode: response.status,
        attempts: attempt,
        error: `Client error: ${response.status}`,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn({ eventId: event.id, attempt, error: message }, 'Webhook delivery failed');

      if (attempt < maxRetries) {
        await sleep(baseDelay * Math.pow(2, attempt - 1));
        continue;
      }

      return { success: false, attempts: attempt, error: message };
    }
  }

  return { success: false, attempts: maxRetries, error: 'Max retries exceeded' };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
