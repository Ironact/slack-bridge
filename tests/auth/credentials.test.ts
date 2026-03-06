import { describe, it, expect, vi } from 'vitest';
import { extractCredentials, extractWorkspaceInfo, extractUserInfo } from '../../src/auth/credentials.js';

function createMockPage(localStorageData: string | null, cookies: Array<{ name: string; value: string }> = []) {
  return {
    evaluate: vi.fn().mockImplementation((fn: () => unknown) => {
      const originalFn = fn.toString();
      if (localStorageData === null) return Promise.resolve(null);

      try {
        const config = JSON.parse(localStorageData);
        // Determine what the function is looking for based on its string
        if (originalFn.includes('user_id') || originalFn.includes('user_name')) {
          const teams = config.teams ?? {};
          const firstTeamId = Object.keys(teams)[0];
          if (!firstTeamId) return Promise.resolve(null);
          const team = teams[firstTeamId];
          return Promise.resolve({
            id: team?.user_id ?? '',
            name: team?.user_name ?? '',
          });
        }
        if (originalFn.includes('token')) {
          const teams = config.teams ?? {};
          const firstTeamId = Object.keys(teams)[0];
          return Promise.resolve(firstTeamId ? (teams[firstTeamId]?.token ?? null) : null);
        }
        // workspace info
        const teams = config.teams ?? {};
        const firstTeamId = Object.keys(teams)[0];
        if (!firstTeamId) return Promise.resolve(null);
        const team = teams[firstTeamId];
        return Promise.resolve({
          id: firstTeamId,
          name: team?.name ?? '',
          url: team?.url ?? '',
        });
      } catch {
        return Promise.resolve(null);
      }
    }),
    context: vi.fn().mockReturnValue({
      cookies: vi.fn().mockResolvedValue(cookies),
    }),
  };
}

describe('extractCredentials', () => {
  it('should extract token and cookie', async () => {
    const data = JSON.stringify({
      teams: { T123: { token: 'xoxc-test-token' } },
    });
    const page = createMockPage(data, [{ name: 'd', value: 'xoxd-cookie-val' }]);
    const creds = await extractCredentials(page as never);
    expect(creds.token).toBe('xoxc-test-token');
    expect(creds.cookie).toBe('xoxd-cookie-val');
  });

  it('should throw when no token found', async () => {
    const page = createMockPage(null, [{ name: 'd', value: 'xoxd-cookie' }]);
    await expect(extractCredentials(page as never)).rejects.toThrow('Failed to extract credentials');
  });

  it('should throw when no d cookie found', async () => {
    const data = JSON.stringify({ teams: { T123: { token: 'xoxc-test' } } });
    const page = createMockPage(data, []);
    await expect(extractCredentials(page as never)).rejects.toThrow('Failed to extract credentials');
  });

  it('should throw when token does not start with xoxc-', async () => {
    const data = JSON.stringify({ teams: { T123: { token: 'xoxb-bot-token' } } });
    const page = createMockPage(data, [{ name: 'd', value: 'xoxd-cookie' }]);
    await expect(extractCredentials(page as never)).rejects.toThrow('Unexpected token format');
  });
});

describe('extractWorkspaceInfo', () => {
  it('should extract workspace info', async () => {
    const data = JSON.stringify({
      teams: { T456: { name: 'My Team', url: 'myteam.slack.com' } },
    });
    const page = createMockPage(data);
    const info = await extractWorkspaceInfo(page as never);
    expect(info.id).toBe('T456');
    expect(info.name).toBe('My Team');
    expect(info.url).toBe('myteam.slack.com');
  });

  it('should throw when no data', async () => {
    const page = createMockPage(null);
    await expect(extractWorkspaceInfo(page as never)).rejects.toThrow('Failed to extract workspace info');
  });
});

describe('extractUserInfo', () => {
  it('should extract user info', async () => {
    const data = JSON.stringify({
      teams: { T789: { user_id: 'U001', user_name: 'testuser' } },
    });
    const page = createMockPage(data);
    const info = await extractUserInfo(page as never);
    expect(info.id).toBe('U001');
    expect(info.name).toBe('testuser');
  });

  it('should throw when no data', async () => {
    const page = createMockPage(null);
    await expect(extractUserInfo(page as never)).rejects.toThrow('Failed to extract user info');
  });
});
