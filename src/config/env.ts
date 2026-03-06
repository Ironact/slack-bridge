import { z } from 'zod';

/**
 * Environment configuration schema.
 * All credentials via env vars — never hardcoded.
 */
export const envSchema = z.object({
  // Server
  PORT: z.coerce.number().default(3847),
  HOST: z.string().default('127.0.0.1'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  // Slack Auth
  SLACK_WORKSPACE_URL: z.string().url().optional(),
  SLACK_EMAIL: z.string().email().optional(),
  SLACK_PASSWORD: z.string().optional(),

  // Session
  SESSION_DIR: z.string().default('./data/sessions'),
  SESSION_ENCRYPTION_KEY: z.string().min(32).optional(),

  // Webhook
  WEBHOOK_URL: z.string().url().optional(),
  WEBHOOK_SECRET: z.string().min(16).optional(),

  // Rate Limiting
  RATE_LIMIT_MESSAGES_PER_SEC: z.coerce.number().default(1),
  RATE_LIMIT_API_PER_MIN: z.coerce.number().default(40),

  // Auth validation interval (ms)
  AUTH_VALIDATION_INTERVAL_MS: z.coerce.number().default(300_000), // 5 min

  // OpenClaw
  OPENCLAW_GATEWAY_URL: z.string().url().optional(),
  OPENCLAW_GATEWAY_TOKEN: z.string().optional(),
  SLACK_BOT_USER_ID: z.string().optional(),

  // Browser
  BROWSER_HEADLESS: z
    .string()
    .default('true')
    .transform((val) => val === 'true' || val === '1'),
  BROWSER_TIMEOUT_MS: z.coerce.number().default(60_000),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Parse and validate environment variables.
 * Throws ZodError with details on invalid config.
 */
export function parseEnv(env: Record<string, string | undefined> = process.env): Env {
  const result = envSchema.safeParse(env);

  if (!result.success) {
    const formatted = result.error.issues
      .map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${formatted}`);
  }

  return result.data;
}
