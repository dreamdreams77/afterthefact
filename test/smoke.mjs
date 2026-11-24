// Smoke test: every route and every case tab renders without errors, on desktop and mobile.
import { launch, newPage, go, assert, ROOT } from './helpers.mjs';
import { mkdirSync } from 'node:fs';

const shots = process.argv.includes('--shots');
mkdirSync(ROOT + '/test/shots', { recursive: true });
const browser = await launch();
const report = [];

for (const mobile of [false, true]) {
  const { ctx, page } = await newPage(browser, { mobile });
  const tag = mobile ? 'm' : 'd';
  // First run: welcome view
  const h1 = await page.textContent('h1');
  assert(/Things slip/.test(h1), 'welcome headline on first run, got ' + h1);
  if (shots) await page.screenshot({ path: `${ROOT}/test/shots/${tag}-00-welcome.png`, fullPage: true });

  await page.click('button[data-act="load-samples"]');
  await page.waitForTimeout(250);
  const n = await page.evaluate(() => ATF.S.cases.length);
  assert(n === 9, 'nine example cases, got ' + n);

  for (const r of ['today', 'cases', 'waiting', 'dates', 'evidence', 'insights', 'data', 'new', 'focus?min=15']) {
    await go(page, '#/' + r);
    await page.waitForTimeout(150);
    const t = await page.textContent('h1');
    assert(t && !/Something went wrong/i.test(t), `route ${r} rendered: ${t}`);
    if (shots) await page.screenshot({ path: `${ROOT}/test/shots/${tag}-r-${r.replace(/\W.*/, '')}.png`, fullPage: true });
  }
  const ids = await page.evaluate(() => ATF.S.cases.map(c => c.id));
  for (const id of ids) {
    for (const tab of ['overview', 'understand', 'options', 'plan', 'contact', 'waiting', 'evidence', 'timeline', 'resolve']) {
      await go(page, `#/case/${id}/${tab}`);
      const t = await page.textContent('#view');
      assert(!/Something went wrong/.test(t), `case ${id} tab ${tab}`);
    }
  }
  if (shots) {
    const water = ids[0];
    for (const tab of ['overview', 'understand', 'options', 'plan', 'contact', 'resolve', 'timeline']) {
      await go(page, `#/case/${water}/${tab}`);
      await page.waitForTimeout(120);
      await page.screenshot({ path: `${ROOT}/test/shots/${tag}-case-${tab}.png`, fullPage: true });
    }
  }
  report.push({ viewport: mobile ? 'mobile' : 'desktop', cases: n, errors: page.errors });
  await ctx.close();
}
console.log(JSON.stringify(report, null, 2));
const errs = report.flatMap(r => r.errors);
await browser.close();
if (errs.length) { console.error('ERRORS FOUND'); process.exit(1); }
console.log('SMOKE OK');
