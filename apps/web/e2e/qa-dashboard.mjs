// Visual QA of the overview dashboard with seeded data (fixture API only). Not part of CI.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:3000';
const out = process.argv[3] ?? './qa-dashboard';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const errors = [];
async function session(viewport, motion) {
  const ctx = await browser.newContext({ viewport, reducedMotion: motion });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`pageerror ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && !m.text().includes('Failed to load resource') && errors.push(m.text()));
  page.on('response', (r) => r.status() >= 500 && errors.push(`HTTP ${r.status()} ${r.url()}`));
  return { ctx, page };
}
const { page } = await session({ width: 1440, height: 900 }, 'no-preference');
await page.goto(`${base}/register`);
await page.fill('#name', 'Priya Analyst');
await page.fill('#email', `dash${Date.now()}@example.com`);
await page.fill('#password', 'qa-password-123');
await page.click('button[type=submit]');
await page.waitForURL('**/app**');
const call = (m, p, b) => page.evaluate(async ([m, p, b]) => (await fetch(`/api/v1${p}`, { method: m, headers: { 'content-type': 'application/json', 'X-AlphaPulse-CSRF': '1' }, body: b ? JSON.stringify(b) : undefined })).status, [m, p, b]);
const wl = await page.evaluate(async () => (await (await fetch('/api/v1/watchlists', { method: 'POST', headers: { 'content-type': 'application/json', 'X-AlphaPulse-CSRF': '1' }, body: JSON.stringify({ name: 'Platform leaders' }) })).json()).id);
for (const s of ['AAPL', 'MSFT', 'NVDA', 'AMD', 'TSLA']) await call('POST', `/watchlists/${wl}/items`, { symbol: s });
await call('POST', '/alerts', { symbol: 'NVDA', type: 'pct_move', threshold: 0.5 });
await call('POST', '/portfolios', { name: 'Learning portfolio', positions: [{ symbol: 'AAPL', quantity: 20, averageCost: 120 }, { symbol: 'MSFT', quantity: 10, averageCost: 160 }, { symbol: 'NVDA', quantity: 15, averageCost: 90 }, { symbol: 'AMD', quantity: 12, averageCost: 100 }] });
await call('POST', '/research', { question: 'What changed for Microsoft and Nvidia over the last two weeks?', symbols: ['MSFT', 'NVDA'], task: 'company_update', lookbackDays: 14 });
for (const k of ['source_health', 'watchlist_monitor', 'daily_brief']) await call('POST', `/automations/${k}/run`);

await page.goto(`${base}/app`);
await page.waitForTimeout(600);
await page.screenshot({ path: `${out}/overview-animating.png` });
await page.waitForTimeout(2500);
await page.screenshot({ path: `${out}/overview-desktop.png`, fullPage: true });
await page.locator('#w-movers svg rect[rx="4"]').first().hover().catch(() => {});
await page.screenshot({ path: `${out}/overview-hover.png`, clip: { x: 0, y: 0, width: 1440, height: 900 } });
const cookies = await page.context().cookies();
const m = await session({ width: 390, height: 844 }, 'reduce');
await m.ctx.addCookies(cookies);
await m.page.goto(`${base}/app`);
await m.page.waitForTimeout(2500);
await m.page.screenshot({ path: `${out}/overview-mobile.png`, fullPage: true });
const overflow = await m.page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
console.log(JSON.stringify({ errors, mobileOverflow: overflow }, null, 2));
await browser.close();
