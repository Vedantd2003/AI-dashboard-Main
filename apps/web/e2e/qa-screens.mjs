// Visual QA helper (not part of CI): walks every route at desktop and mobile widths, records console errors,
// failed requests and horizontal overflow, and saves screenshots.
// Usage: node e2e/qa-screens.mjs <baseUrl> <outDir>
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:3000';
const out = process.argv[3] ?? './qa-shots';
mkdirSync(out, { recursive: true });
const exe = process.env.CHROME_PATH || undefined;

const routes = ['/', '/app', '/app/markets', '/app/markets/AAPL', '/app/watchlists', '/app/research', '/app/analyst', '/app/portfolio', '/app/alerts', '/app/automations', '/app/reports', '/app/settings'];
const email = `qa${Date.now()}@example.com`;

const browser = await chromium.launch({ executablePath: exe });
const report = [];
for (const vp of [{ name: 'desktop', width: 1440, height: 900 }, { name: 'mobile', width: 390, height: 844 }]) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('response', (r) => r.status() >= 500 && errors.push(`HTTP ${r.status()} ${r.url()}`));

  if (vp.name === 'desktop') {
    await page.goto(`${base}/register`);
    await page.fill('#name', 'QA Analyst');
    await page.fill('#email', email);
    await page.fill('#password', 'qa-password-123');
    await page.click('button[type=submit]');
    await page.waitForURL('**/app**');
  } else {
    await page.goto(`${base}/login`);
    await page.fill('#email', email);
    await page.fill('#password', 'qa-password-123');
    await page.click('button[type=submit]');
    await page.waitForURL('**/app**');
  }
  for (const r of routes) {
    errors.length = 0;
    await page.goto(`${base}${r}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    const file = `${out}/${vp.name}${r === '/' ? '-landing' : r.replace(/\//g, '-')}.png`;
    await page.screenshot({ path: file, fullPage: true });
    report.push({ vp: vp.name, route: r, overflowPx: overflow, errors: [...errors] });
  }
  await ctx.close();
}
await browser.close();
console.log(JSON.stringify(report, null, 1));
