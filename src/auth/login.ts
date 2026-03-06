/**
 * Browser login flows (Google OAuth, email+password) using Playwright.
 */
import { chromium } from 'playwright';
import type { Browser, Page, BrowserContext } from 'playwright';
import type { LoginOptions, SessionData } from './types.js';
import { extractCredentials, extractWorkspaceInfo, extractUserInfo } from './credentials.js';
import type { Logger } from '../config/logger.js';

const DEFAULT_TIMEOUT = 60_000;
const CLIENT_PATH = '/client/';
const WAIT_AFTER_LOGIN_MS = 5_000;

export interface LoginDependencies {
  logger: Logger;
  storageStatePath?: string;
}

export async function performLogin(
  options: LoginOptions,
  deps: LoginDependencies,
): Promise<SessionData> {
  const { logger, storageStatePath } = deps;
  const timeout = options.timeout ?? DEFAULT_TIMEOUT;

  logger.info({ workspace: options.workspaceUrl }, 'Starting browser login');

  let browser: Browser | null = null;

  try {
    browser = await chromium.launch({
      headless: !options.headed,
    });

    let context: BrowserContext;
    if (storageStatePath) {
      try {
        const { readFile } = await import('node:fs/promises');
        await readFile(storageStatePath, 'utf-8');
        context = await browser.newContext({ storageState: storageStatePath });
        logger.debug('Restored browser context from storageState');
      } catch {
        context = await browser.newContext();
        logger.debug('No existing storageState found, using fresh context');
      }
    } else {
      context = await browser.newContext();
    }

    const page = await context.newPage();
    page.setDefaultTimeout(timeout);

    const workspaceUrl = options.workspaceUrl.startsWith('https://')
      ? options.workspaceUrl
      : `https://${options.workspaceUrl}`;

    await page.goto(workspaceUrl, { waitUntil: 'networkidle' });

    const isLoggedIn = page.url().includes(CLIENT_PATH);

    if (!isLoggedIn) {
      logger.info('Not logged in, performing login flow');
      await executeLoginFlow(page, options, deps);
    } else {
      logger.info('Already logged in from stored session');
    }

    await page.waitForURL(`**${CLIENT_PATH}**`, { timeout });
    await page.waitForTimeout(WAIT_AFTER_LOGIN_MS);

    const credentials = await extractCredentials(page);
    const workspace = await extractWorkspaceInfo(page);
    const user = await extractUserInfo(page);

    if (storageStatePath) {
      const { mkdir } = await import('node:fs/promises');
      const { dirname } = await import('node:path');
      await mkdir(dirname(storageStatePath), { recursive: true, mode: 0o700 });
      await context.storageState({ path: storageStatePath });
      const { chmod } = await import('node:fs/promises');
      await chmod(storageStatePath, 0o600);
      logger.debug('Saved storageState');
    }

    const session: SessionData = {
      version: 1,
      workspace: {
        id: workspace.id,
        name: workspace.name,
        url: options.workspaceUrl,
      },
      user: {
        id: user.id,
        name: user.name,
        email: options.email,
      },
      credentials,
      extractedAt: new Date().toISOString(),
    };

    logger.info({ workspaceId: workspace.id, userId: user.id }, 'Login successful');
    return session;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

async function executeLoginFlow(
  page: Page,
  options: LoginOptions,
  deps: LoginDependencies,
): Promise<void> {
  const { logger } = deps;

  if (options.password) {
    logger.info('Using email + password login flow');
    await emailPasswordLogin(page, options, logger);
  } else {
    logger.info('Using Google OAuth login flow');
    await googleOAuthLogin(page, options, logger);
  }
}

async function emailPasswordLogin(
  page: Page,
  options: LoginOptions,
  logger: Logger,
): Promise<void> {
  try {
    const emailInput = page.locator('input[type="email"], input[data-qa="login_email"]');
    await emailInput.waitFor({ timeout: 10_000 });
    await emailInput.fill(options.email);

    const passwordInput = page.locator(
      'input[type="password"], input[data-qa="login_password"]',
    );
    await passwordInput.waitFor({ timeout: 5_000 });
    await passwordInput.fill(options.password!);

    const submitButton = page.locator(
      'button[type="submit"], button[data-qa="signin_button"]',
    );
    await submitButton.click();

    logger.debug('Submitted email + password login form');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Email+password login failed: ${message}`, { cause: error });
  }
}

async function googleOAuthLogin(
  page: Page,
  options: LoginOptions,
  logger: Logger,
): Promise<void> {
  try {
    const googleButton = page.locator(
      'a[data-qa="sign_in_with_google"], a:has-text("Sign in with Google")',
    );
    await googleButton.waitFor({ timeout: 10_000 });
    await googleButton.click();

    logger.debug('Clicked Google OAuth button');

    const emailInput = page.locator('input[type="email"]');
    await emailInput.waitFor({ timeout: 10_000 });
    await emailInput.fill(options.email);

    const nextButton = page.locator('#identifierNext, button:has-text("Next")');
    await nextButton.click();

    if (options.password) {
      const passwordInput = page.locator('input[type="password"]');
      await passwordInput.waitFor({ timeout: 10_000 });
      await passwordInput.fill(options.password);

      const passwordNext = page.locator('#passwordNext, button:has-text("Next")');
      await passwordNext.click();
    }

    logger.debug('Completed Google OAuth flow');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Google OAuth login failed: ${message}`, { cause: error });
  }
}
