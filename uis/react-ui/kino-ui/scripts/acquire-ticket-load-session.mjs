import { chmod, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const required = [
  'KINO_E2E_BASE_URL',
  'KINO_E2E_USERNAME',
  'KINO_E2E_PASSWORD',
  'KINO_LOAD_SESSION_FILE',
];
const missing = required.filter((name) => !process.env[name]);
if (missing.length > 0) {
  throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
}

const baseUrl = new URL(process.env.KINO_E2E_BASE_URL);
const returnTo = '/tickets/tt0000001';
const browser = await chromium.launch({ headless: true });

try {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(baseUrl.href, { waitUntil: 'domcontentloaded' });

  const login = await page.evaluate(async (ticketReturnTo) => {
    const response = await fetch(
      `/api/auth/login?returnTo=${encodeURIComponent(ticketReturnTo)}`,
      { method: 'POST' }
    );
    if (!response.ok) {
      throw new Error(`BFF login start returned ${response.status}`);
    }
    return response.json();
  }, returnTo);

  await page.goto(login.authorizationUrl, { waitUntil: 'domcontentloaded' });
  await page.locator('input[name="username"]').fill(process.env.KINO_E2E_USERNAME);
  await page.locator('input[name="password"]').fill(process.env.KINO_E2E_PASSWORD);
  await Promise.all([
    page.waitForURL(/\/tickets\/tt0000001(?:\?.*)?$/),
    page.locator('button[type="submit"], input[type="submit"]').first().click(),
  ]);

  const session = (await context.cookies(baseUrl.href)).find(
    (cookie) => cookie.name === 'kino_bff_session'
  );
  if (!session?.value) {
    throw new Error('OIDC callback completed without a Kino BFF session cookie.');
  }

  await writeFile(process.env.KINO_LOAD_SESSION_FILE, session.value, { mode: 0o600 });
  await chmod(process.env.KINO_LOAD_SESSION_FILE, 0o600);
  process.stdout.write('Acquired an ephemeral Kino BFF load-test session.\n');
} finally {
  await browser.close();
}
