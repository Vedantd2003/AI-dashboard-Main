import { expect, test } from '@playwright/test';

/** The core journey from the product brief, end to end, against fixture providers. */
test('register → watchlist → symbol → research → citations → save → alert → workflows', async ({ page, isMobile }) => {
  const email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`;
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  // 1. Register
  await page.goto('/register');
  await page.getByLabel('Name', { exact: true }).fill('E2E Analyst');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill('e2e-password-123');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/app/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('E2E');

  // Main navigation works (drawer on mobile)
  const openNav = async () => {
    if (isMobile) await page.getByRole('button', { name: 'Open navigation' }).click();
  };
  await openNav();
  await page.getByRole('link', { name: 'Watchlists' }).first().click();
  await expect(page.getByRole('heading', { name: 'Watchlists', level: 1 })).toBeVisible();

  // 2. Create a watchlist
  await page.getByRole('button', { name: /New watchlist|Create your first watchlist/ }).first().click();
  await page.getByLabel('Name', { exact: true }).fill('E2E list');
  await page.getByRole('button', { name: 'Create watchlist' }).click();
  await expect(page.getByText('Created E2E list')).toBeVisible();
  await page.getByRole('link', { name: 'E2E list' }).click();

  // 3. Add a supported symbol
  await page.getByLabel('Add a symbol', { exact: true }).fill('msft');
  await page.getByRole('button', { name: 'Add symbol' }).click();
  await expect(page.getByRole('link', { name: 'MSFT', exact: true })).toBeVisible();

  // 4. View its market data (provider configured in the fixture stack)
  await page.getByRole('link', { name: 'MSFT', exact: true }).click();
  await expect(page.getByText('Delayed').first()).toBeVisible();
  await expect(page.getByRole('img', { name: /MSFT daily closing price/ })).toBeVisible();
  await expect(page.getByText(/daily observations/)).toBeVisible();

  // 5. Generate research
  await page.getByRole('link', { name: 'Research MSFT' }).click();
  await expect(page.getByLabel('Symbols', { exact: true })).toHaveValue('MSFT');
  await page.getByRole('button', { name: 'Run research' }).click();
  await expect(page.getByText('Pipeline steps')).toBeVisible({ timeout: 45_000 });

  // 6. Inspect source references
  const cite = page.getByRole('button', { name: /Show cited passage/ }).first();
  await cite.click();
  await expect(cite).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('blockquote').first()).toContainText('fixture');
  await expect(page.getByText(/sourced claims verified/).first()).toBeVisible();

  // 7. Save the report
  await page.getByRole('link', { name: 'Open full report' }).click();
  await page.getByRole('button', { name: 'Save report' }).click();
  await expect(page.getByText('Report saved')).toBeVisible();

  // 8. Create a notification rule
  await page.goto('/app/alerts');
  await page.getByRole('button', { name: 'New alert' }).click();
  await page.getByLabel('Symbol', { exact: true }).fill('MSFT');
  await page.getByLabel('Price', { exact: true }).fill('1000');
  await page.getByRole('button', { name: 'Create alert' }).click();
  await expect(page.getByText('Alert created')).toBeVisible();
  await expect(page.getByRole('cell', { name: /Price at or above 1,000/ })).toBeVisible();

  // 9. Review workflow status
  await page.goto('/app/automations');
  await expect(page.getByText('Daily market brief').first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Execution history' })).toBeVisible();

  // Keyboard: skip link is first focusable element
  await page.goto('/app');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();

  expect(errors).toEqual([]);
});

test('unauthenticated workspace visit redirects to sign in', async ({ page }) => {
  await page.goto('/app/portfolio');
  await expect(page).toHaveURL(/\/login\?next=%2Fapp%2Fportfolio/);
});

test('landing page has no horizontal overflow and labels its example', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Example with a fictional company')).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
