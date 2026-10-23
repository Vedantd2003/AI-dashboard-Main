// Visual QA with seeded data (run against the fixture API only). Not part of CI.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:3000';
const out = process.argv[3] ?? './qa-populated';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror ${e.message}`));
page.on('console', (m) => m.type() === 'error' && !m.text().includes('Failed to load resource') && errors.push(m.text()));
page.on('response', (r) => r.status() >= 500 && errors.push(`HTTP ${r.status()} ${r.url()}`));

const email = `pop${Date.now()}@example.com`;
await page.goto(`${base}/register`);
await page.fill('#name', 'Priya Analyst');
await page.fill('#email', email);
await page.fill('#password', 'qa-password-123');
await page.click('button[type=submit]');
await page.waitForURL('**/app**');

const call = (method, path, body) =>
  page.evaluate(
    async ([m, p, b]) => {
      const r = await fetch(`/api/v1${p}`, { method: m, headers: { 'content-type': 'application/json', 'X-AlphaPulse-CSRF': '1' }, body: b ? JSON.stringify(b) : undefined });
      return { status: r.status, body: await r.json() };
    },
    [method, path, body],
  );

// Watchlist through the real UI
await page.goto(`${base}/app/watchlists`);
await page.getByRole('button', { name: 'New watchlist' }).click();
await page.fill('#wl-name', 'Platform leaders');
await page.fill('#wl-desc', 'Large-cap software and silicon I track for the AI build-out.');
await page.getByRole('button', { name: 'Create watchlist' }).click();
await page.getByRole('link', { name: 'Platform leaders' }).click();
for (const s of ['AAPL', 'MSFT', 'NVDA']) {
  await page.fill('#add-sym', s);
  await page.getByRole('button', { name: 'Add symbol' }).click();
  await page.getByRole('cell', { name: new RegExp(`^${s}`) }).first().waitFor();
}
const wlUrl = page.url();

const seeded = {
  alert1: (await call('POST', '/alerts', { symbol: 'NVDA', type: 'pct_move', threshold: 0.5 })).status,
  alert2: (await call('POST', '/alerts', { symbol: 'AAPL', type: 'price_above', threshold: 99999 })).status,
  evaluate: (await call('POST', '/alerts/evaluate')).body,
  portfolio: (await call('POST', '/portfolios', { name: 'Learning portfolio', positions: [{ symbol: 'AAPL', quantity: 20, averageCost: 120 }, { symbol: 'MSFT', quantity: 10, averageCost: 160 }, { symbol: 'NVDA', quantity: 15, averageCost: 90 }] })).status,
  research: (await call('POST', '/research', { question: 'What changed for Microsoft and Nvidia over the last two weeks?', symbols: ['MSFT', 'NVDA'], task: 'company_update', lookbackDays: 14 })).body.reportId,
  health: (await call('POST', '/automations/source_health/run')).body.status,
  monitor: (await call('POST', '/automations/watchlist_monitor/run')).body.status,
};

const shots = [
  ['/app', 'overview'],
  ['/app/markets/MSFT', 'symbol'],
  [wlUrl.replace(base, ''), 'watchlist'],
  ['/app/portfolio', 'portfolio'],
  [`/app/reports/${seeded.research}`, 'report'],
  ['/app/reports', 'reports'],
  ['/app/research', 'research'],
  ['/app/alerts', 'alerts'],
  ['/app/automations', 'automations'],
  ['/app/markets?q=AAPL', 'markets-search'],
];
for (const [p, name] of shots) {
  await page.goto(`${base}${p}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
}
// Interaction: open a citation in the report
await page.goto(`${base}/app/reports/${seeded.research}`, { waitUntil: 'networkidle' });
const cite = page.getByRole('button', { name: /Show cited passage/ }).first();
await cite.click();
const quoteVisible = await page.locator('blockquote').first().isVisible();
await page.screenshot({ path: `${out}/report-citation-open.png`, clip: { x: 0, y: 0, width: 1440, height: 1100 } });
// Mobile pass over the key pages
const m = await browser.newContext({ viewport: { width: 390, height: 844 }, storageState: await ctx.storageState() });
const mp = await m.newPage();
const overflow = {};
for (const [p, name] of shots) {
  await mp.goto(`${base}${p}`, { waitUntil: 'networkidle' });
  await mp.waitForTimeout(500);
  overflow[name] = await mp.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (['overview', 'report', 'portfolio', 'symbol'].includes(name)) await mp.screenshot({ path: `${out}/mobile-${name}.png`, fullPage: true });
}
console.log(JSON.stringify({ seeded, quoteVisible, overflow, errors }, null, 1));
await browser.close();
