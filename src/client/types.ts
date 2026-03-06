/**
 * Slack Client types.
 */

export interface SlackCredentials {
  /** xoxc- session token */
  token: string;
  /** xoxd- cookie value */
  cookie: string;
}

export interface MessageResult {
  ok: boolean;
  ts?: string;
  channel?: string;
  error?: string;
}

export interface SlackMessage {
  ts: string;
  text: string;
  user: string;
  threadTs?: string;
  edited?: boolean;
}

export interface SlackChannel {
  id: string;
  name: string;
  type: 'channel' | 'dm' | 'group' | 'mpim';
  isMember: boolean;
  memberCount?: number;
}

export interface SlackUser {
  id: string;
  name: string;
  displayName: string;
  isBot: boolean;
}

export interface AuthResult {
  ok: boolean;
  userId?: string;
  userName?: string;
  teamId?: string;
  teamName?: string;
  error?: string;
}

/**
 * Errors that indicate the token is dead and needs re-authentication.
 */
export const TOKEN_DEATH_ERRORS = [
  'invalid_auth',
  'token_revoked',
  'account_inactive',
  'token_expired',
  'not_authed',
] as const;

export function isTokenDead(error: string): boolean {
  return (TOKEN_DEATH_ERRORS as readonly string[]).includes(error);
}
