/**
 * Token extraction from Playwright page (localStorage + cookies).
 */
import type { Page } from 'playwright';
import type { Credentials } from './types.js';

export async function extractCredentials(page: Page): Promise<Credentials> {
  const token = await page.evaluate(() => {
    const raw = localStorage.getItem('localConfig_v2');
    if (!raw) return null;
    try {
      const config = JSON.parse(raw) as {
        teams?: Record<string, { token?: string }>;
      };
      const teams = config.teams ?? {};
      const firstTeamId = Object.keys(teams)[0];
      return firstTeamId ? (teams[firstTeamId]?.token ?? null) : null;
    } catch {
      return null;
    }
  });

  const cookies = await page.context().cookies();
  const dCookie = cookies.find((c) => c.name === 'd');

  if (!token || !dCookie) {
    throw new Error('Failed to extract credentials: token or d cookie not found');
  }

  if (!token.startsWith('xoxc-')) {
    throw new Error('Unexpected token format: expected xoxc- prefix');
  }

  return {
    token,
    cookie: dCookie.value,
  };
}

export async function extractWorkspaceInfo(
  page: Page,
): Promise<{ id: string; name: string; url: string }> {
  const info = await page.evaluate(() => {
    const raw = localStorage.getItem('localConfig_v2');
    if (!raw) return null;
    try {
      const config = JSON.parse(raw) as {
        teams?: Record<string, { name?: string; url?: string }>;
      };
      const teams = config.teams ?? {};
      const firstTeamId = Object.keys(teams)[0];
      if (!firstTeamId) return null;
      const team = teams[firstTeamId];
      return {
        id: firstTeamId,
        name: team?.name ?? '',
        url: team?.url ?? '',
      };
    } catch {
      return null;
    }
  });

  if (!info) {
    throw new Error('Failed to extract workspace info from localStorage');
  }

  return info;
}

export async function extractUserInfo(
  page: Page,
): Promise<{ id: string; name: string }> {
  const info = await page.evaluate(() => {
    const raw = localStorage.getItem('localConfig_v2');
    if (!raw) return null;
    try {
      const config = JSON.parse(raw) as {
        teams?: Record<
          string,
          { user_id?: string; user_name?: string }
        >;
      };
      const teams = config.teams ?? {};
      const firstTeamId = Object.keys(teams)[0];
      if (!firstTeamId) return null;
      const team = teams[firstTeamId];
      return {
        id: team?.user_id ?? '',
        name: team?.user_name ?? '',
      };
    } catch {
      return null;
    }
  });

  if (!info) {
    throw new Error('Failed to extract user info from localStorage');
  }

  return info;
}
