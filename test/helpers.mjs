let chromium;
try { ({ chromium } = await import('playwright')); } catch (e) { ({ chromium } = await import('/opt/npm-tools/node_modules/playwright/index.mjs')); }
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const APP_URL = 'file://' + join(ROOT, 'dist/index.html');
// 22:22 on Mon Nov 23 2026 in Los Angeles (06:22Z Nov 24) — the evening hour where UTC date math breaks.
export const NOW = new Date('2026-11-24T06:22:00Z');

export async function launch() {
  return chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
}

export async function newPage(browser, { mobile = false, tz = 'America/Los_Angeles', now = NOW, storage = null } = {}) {
  const ctx = await browser.newContext({
    timezoneId: tz,
    viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 },
    deviceScaleFactor: mobile ? 2 : 1,
    isMobile: mobile, hasTouch: mobile,
    acceptDownloads: true,
  });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', e => page.errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_FAILED|net::/.test(m.text())) page.errors.push('console: ' + m.text()); });
  await page.clock.install({ time: now });
  if (storage) {
    await page.addInitScript(s => { if (!sessionStorage.getItem('__seeded')) { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); sessionStorage.setItem('__seeded', '1'); } }, storage);
  }
  await page.goto(APP_URL);
  await page.waitForFunction(() => window.ATF && window.ATF.S);
  return { ctx, page };
}

export async function go(page, hash) {
  await page.evaluate(h => { location.hash = h; }, hash);
  await page.waitForTimeout(80);
}

export function assert(cond, msg) { if (!cond) throw new Error('ASSERT: ' + msg); }
