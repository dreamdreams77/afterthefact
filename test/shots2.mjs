import { launch, newPage, go, ROOT } from './helpers.mjs';
const b = await launch();
for (const mobile of [false, true]) {
  const tag = mobile ? 'm' : 'd';
  const { ctx, page } = await newPage(b, { mobile });
  await page.click('button[data-act="intake-example"][data-i="2"]'); await page.waitForTimeout(200);
  await page.screenshot({ path: `${ROOT}/test/shots/${tag}-intake2.png`, fullPage: true });
  await go(page, '#/today'); await page.click('button[data-act="intake-cancel"]').catch(()=>{});
  await go(page, '#/data'); await page.click('button[data-act="load-samples"]'); await page.waitForTimeout(400);
  await go(page, '#/waiting'); await page.waitForTimeout(150);
  await page.screenshot({ path: `${ROOT}/test/shots/${tag}-waiting.png`, fullPage: true });
  await go(page, '#/data'); await page.waitForTimeout(300);
  await page.screenshot({ path: `${ROOT}/test/shots/${tag}-data.png`, fullPage: true });
  const dep = await page.evaluate(() => ATF.S.cases.find(c => c.title.includes('security deposit')).id);
  await go(page, `#/case/${dep}/overview`); await page.waitForTimeout(150);
  await page.screenshot({ path: `${ROOT}/test/shots/${tag}-dep-overview.png`, fullPage: true });
  await go(page, `#/case/${dep}/contact`); await page.waitForTimeout(100);
  await page.screenshot({ path: `${ROOT}/test/shots/${tag}-dep-contact.png`, fullPage: true });
  await page.locator('button[data-act="compose"]').first().click(); await page.waitForTimeout(250);
  await page.screenshot({ path: `${ROOT}/test/shots/${tag}-composer.png` });
  await page.evaluate(() => document.querySelector('.dlg-body').scrollTo(0, 99999)); await page.waitForTimeout(100);
  await page.screenshot({ path: `${ROOT}/test/shots/${tag}-composer2.png` });
  await ctx.close();
}
await b.close();
