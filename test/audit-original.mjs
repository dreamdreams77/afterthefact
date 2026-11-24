// Probes the ORIGINAL app for suspected defects. Run: node test/audit-original.mjs
import { launch, ROOT } from './helpers.mjs';

const file = 'file://' + ROOT + '/legacy/v1.html';
const browser = await launch();
const results = {};

async function fresh(tz = 'America/Los_Angeles') {
  const ctx = await browser.newContext({ timezoneId: tz });
  const page = await ctx.newPage();
  // 22:22 local on Nov 23 in Los Angeles = 06:22Z Nov 24
  await page.clock.install({ time: new Date('2026-11-24T06:22:00Z') });
  page.on('pageerror', e => (results.pageErrors ||= []).push(String(e.message).slice(0, 120)));
  await page.goto(file);
  await page.waitForTimeout(300);
  return { ctx, page };
}

// 1. Timezone: todayISO vs local date
{
  const { ctx, page } = await fresh();
  results.timezone = await page.evaluate(() => ({
    localDate: new Date().toLocaleDateString('en-CA'),
    appTodayISO: todayISO(),
    daysFromToday_of_appToday: daysFromToday(todayISO()),
  }));
  await ctx.close();
}

// 2. Search input loses focus after first keystroke
{
  const { ctx, page } = await fresh();
  await page.evaluate(() => navigate('fixit'));
  const input = page.locator('input[placeholder="Search active plans or steps..."]');
  await input.click();
  await page.keyboard.type('water', { delay: 30 });
  results.searchFocus = await page.evaluate(() => ({
    activeTag: document.activeElement?.tagName,
    storedQuery: uiState.fixitSearch,
  }));
  await ctx.close();
}

// 3. Injection through a reference number (copy button uses inline JS)
{
  const { ctx, page } = await fresh();
  await page.evaluate(() => {
    state.proofs[0].refNumber = "x');window.__pwned=1;//";
    saveState();
    navigate('proof');
  });
  await page.locator('button[title="Click to copy"]').first().click();
  results.refNumberInjection = await page.evaluate(() => window.__pwned === 1);
  await ctx.close();
}

// 4. Corrupt storage is silently overwritten on next save
{
  const { ctx, page } = await fresh();
  await page.evaluate(() => localStorage.setItem('after_the_fact_v1', '{"situations": [ {"id":"keep-me"} '));
  await page.reload();
  await page.waitForTimeout(200);
  await page.evaluate(() => toggleStep(state.situations[0].id, state.situations[0].steps[0].id));
  results.corruptOverwritten = await page.evaluate(() => !localStorage.getItem('after_the_fact_v1').includes('keep-me'));
  await ctx.close();
}

// 5. Resolving auto-checks every step (task done ≠ problem solved)
{
  const { ctx, page } = await fresh();
  results.resolveMarksAllDone = await page.evaluate(() => {
    const s = state.situations.find(x => x.status === 'active');
    openResolveSituationModal(s.id);
    submitResolveSituation({ preventDefault() {} }, s.id);
    return s.steps.every(st => st.done);
  });
  await ctx.close();
}

// 6. Keyword classifier misfires (substring matches)
{
  const { ctx, page } = await fresh();
  results.classifier = await page.evaluate(() => [
    'Health insurance reimbursement claim from two months ago is still unpaid',
    'My current lease renewal paperwork is late',
    'Parking ticket from Vegas trip I forgot to contest',
  ].map(t => ({ t, cat: generateRecoveryPlanFromText(t).situation.category })));
  await ctx.close();
}

// 7. Deleting a situation leaves orphaned proofs / waiting items
{
  const { ctx, page } = await fresh();
  results.deleteOrphans = await page.evaluate(() => {
    const id = 'sit_cc_fee_done';
    state.situations = state.situations.filter(s => s.id !== id); // same as confirmDeleteSituation callback
    state.documents = state.documents.filter(d => d.situationId !== id);
    state.callPreps = state.callPreps.filter(c => c.situationId !== id);
    return state.proofs.filter(p => p.situationId === id).length;
  });
  await ctx.close();
}

// 8. Malformed import crashes rendering
{
  const { ctx, page } = await fresh();
  results.malformedImport = await page.evaluate(() => {
    state = { version: 1, situations: [{ id: 'a', status: 'active' }], callPreps: [], documents: [], waitingItems: [], standaloneDeadlines: [], proofs: [] };
    try { navigate('fixit'); return 'rendered'; } catch (e) { return 'crash: ' + e.message.slice(0, 80); }
  });
  await ctx.close();
}

console.log(JSON.stringify(results, null, 2));
await browser.close();
