const { test, expect } = require('@playwright/test');

const requiredEnvironment = [
  'KINO_E2E_BASE_URL',
  'KINO_E2E_USERNAME',
  'KINO_E2E_PASSWORD',
];

test.beforeAll(() => {
  const missing = requiredEnvironment.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(`Missing required E2E environment variables: ${missing.join(', ')}`);
  }
});

test('BFF login, protected title access, optional refresh, and logout', async ({ page }) => {
  const stateChangingGet = await page.request.get('/api/auth/login');
  expect(stateChangingGet.status()).toBe(405);

  const crossOriginLogin = await page.request.post('/api/auth/login', {
    headers: { Origin: 'https://untrusted.example.test' },
  });
  expect(crossOriginLogin.status()).toBe(403);

  await page.goto('/titles');

  // This is the Spring Security login form reached through the OIDC
  // Authorization Code redirect. Credentials remain CI secrets and are never
  // saved as Playwright storage state.
  await page.locator('input[name="username"]').fill(process.env.KINO_E2E_USERNAME);
  await page.locator('input[name="password"]').fill(process.env.KINO_E2E_PASSWORD);
  await Promise.all([
    page.waitForURL(/\/titles(?:\?.*)?$/),
    page.locator('button[type="submit"], input[type="submit"]').first().click(),
  ]);

  await expect.poll(() => protectedTitleStatus(page)).toBe(200);
  expect(await page.evaluate(() => document.cookie)).not.toContain('kino_bff_session=');

  // A short-token test environment may set this non-zero value. Two protected
  // requests after expiry prove the BFF can retain the rotated refresh session,
  // not merely use the one newly minted access token once.
  const refreshWaitSeconds = Number(process.env.KINO_E2E_REFRESH_WAIT_SECONDS || '0');
  if (refreshWaitSeconds > 0) {
    await page.waitForTimeout(refreshWaitSeconds * 1000);
    await expect.poll(() => protectedTitleStatus(page)).toBe(200);
    await page.waitForTimeout(refreshWaitSeconds * 1000);
    await expect.poll(() => protectedTitleStatus(page)).toBe(200);
  }

  const logoutStatus = await page.evaluate(async () => {
    const response = await fetch('/api/auth/logout', { method: 'POST' });
    return response.status;
  });
  expect(logoutStatus).toBe(204);
  await expect.poll(() => protectedTitleStatus(page)).toBe(401);
});

async function protectedTitleStatus(page) {
  return page.evaluate(async () => {
    const response = await fetch('/api/data/titles?page=0&size=1', {
      cache: 'no-store',
    });
    return response.status;
  });
}
