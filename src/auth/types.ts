/**
 * Shared TypeScript interfaces for authentication and session management.
 */

export interface WorkspaceInfo {
  id: string;
  name: string;
  url: string;
}

export interface UserInfo {
  id: string;
  name: string;
  email: string;
}

export interface Credentials {
  token: string;
  cookie: string;
  expiresAt?: string;
}

export interface SessionData {
  version: number;
  workspace: WorkspaceInfo;
  user: UserInfo;
  credentials: Credentials;
  extractedAt: string;
}

export interface LoginOptions {
  workspaceUrl: string;
  email: string;
  password?: string;
  headed?: boolean;
  timeout?: number;
}

export interface SessionMetadata {
  workspaceId: string;
  workspaceName: string;
  userId: string;
  userName: string;
  email: string;
  lastValidated: string;
  loginCount: number;
}

export interface SessionHealth {
  status: 'active' | 'refreshing' | 'failed';
  lastValidated: Date | null;
  tokenAge: number;
  loginCount: number;
}

export interface EncryptedPayload {
  iv: string;
  salt: string;
  data: string;
  tag: string;
}

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
