// Functional end-to-end tests. Run: node test/e2e.mjs
import { launch, newPage, go, assert, ROOT } from './helpers.mjs';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const browser = await launch();
const results = [];
async function test(name, fn, opts = {}) {
  if (process.env.ONLY && !name.includes(process.env.ONLY)) return;
  const { ctx, page } = await newPage(browser, opts);
  try { await fn(page, ctx); if (page.errors.length) throw new Error('page errors: ' + page.errors.join(' | ')); results.push(['PASS', name]); }
  catch (e) { results.push(['FAIL', name, e.message.split('\n')[0]]); }
  finally { await ctx.close(); }
}
const S = page => page.evaluate(() => JSON.parse(JSON.stringify(ATF.S)));
const click = async (page, sel) => { await page.locator(sel).first().click(); await page.waitForTimeout(sel.includes('load-samples') ? 250 : 0); };
const pick = (page, inputSel, scope = '') => page.locator(`${scope} label`.trim(), { has: page.locator(inputSel) }).first().click();
mkdirSync(ROOT + '/test/tmp', { recursive: true });

// ---------------------------------------------------------------------------
await test('Dates are local: today() matches the Los Angeles calendar date at 22:22', async page => {
  const r = await page.evaluate(() => ({ t: today(), d: daysUntil(today()), add: addDays('2026-11-01', 1), dst: daysBetween('2026-10-31', '2026-11-02') }));
  assert(r.t === '2026-11-23', 'today ' + r.t); assert(r.d === 0, 'daysUntil(today)=' + r.d);
  assert(r.add === '2026-11-02', 'addDays across DST end ' + r.add); assert(r.dst === 2, 'daysBetween across DST ' + r.dst);
});

await test('Intake: plain language → understood → questions re-rank → case created with honest facts', async page => {
  await click(page, 'button[data-act="intake-example"][data-i="0"]');
  await page.waitForSelector('text=Here’s what I understood.');
  const firstPath = await page.locator('input[name="path"]:checked').getAttribute('value');
  assert(firstPath === 'pay_waive', 'initial top path ' + firstPath);
  await pick(page, 'input[data-q="canPay"][value="no"]');
  await page.waitForTimeout(100);
  const top = await page.locator('input[name="path"]:checked').getAttribute('value');
  assert(top === 'arrangement', 'after “can’t pay”, top path should be arrangement, got ' + top);
  await page.fill('input[name="title"]', 'Electric bill — late');
  await page.click('button:has-text("Create case")');
  await page.waitForSelector('h1:has-text("Electric bill — late")');
  const s = await S(page);
  const c = s.cases.find(x => x.title === 'Electric bill — late');
  assert(c && c.type === 'payment', 'case type');
  const facts = s.facts.filter(f => f.caseId === c.id);
  assert(facts.some(f => f.kind === 'unverified' && /10 days ago/.test(f.text)), 'date from words is unverified');
  assert(!facts.some(f => f.kind === 'confirmed'), 'nothing is confirmed yet');
  assert(facts.filter(f => f.kind === 'missing').length >= 4, 'missing info listed');
  const dl = s.deadlines.find(d => d.caseId === c.id);
  assert(dl && dl.certainty === 'estimated' && dl.date === '2026-11-13', 'estimated original due date ' + JSON.stringify(dl));
  const chosen = s.paths.find(p => p.caseId === c.id && p.status === 'chosen');
  assert(chosen && chosen.key === 'arrangement', 'chosen path');
  assert(s.tasks.filter(t => t.caseId === c.id).length === 4, 'tasks from path');
  assert(s.tasks.filter(t => t.caseId === c.id)[2].dependsOn.length === 1, 'dependent step');
  const cons = s.consequences.filter(x => x.caseId === c.id);
  assert(cons.length >= 3, 'consequences');
  assert(s.events.filter(e => e.caseId === c.id).length >= 3, 'timeline entries');
});

await test('Search inputs keep focus while typing (original bug)', async page => {
  await click(page, 'button[data-act="load-samples"]');
  await go(page, '#/cases');
  await page.click('#cases-search');
  await page.keyboard.type('deposit', { delay: 25 });
  const r = await page.evaluate(() => ({ id: document.activeElement.id, v: document.activeElement.value, rows: document.querySelectorAll('#view .list .item').length }));
  assert(r.id === 'cases-search' && r.v === 'deposit', 'focus kept: ' + JSON.stringify(r));
  assert(r.rows === 1, 'filtered to one case, got ' + r.rows);
});

await test('Answering a question changes consequences and ranking, logged in the timeline', async page => {
  await click(page, 'button[data-act="load-samples"]');
  const id = await page.evaluate(() => ATF.S.cases.find(c => c.type === 'penalty').id);
  await go(page, `#/case/${id}/overview`);
  await pick(page, 'input[data-q="fair"][value="no"]');
  await page.waitForTimeout(100);
  const best = await page.evaluate(i => ATF.Engine.rankPaths(i).find(x => x.best).path.key, id);
  assert(best === 'contest', 'contest becomes best fit, got ' + best);
  const s = await S(page);
  assert(s.events.some(e => e.caseId === id && /issued correctly/.test(e.text)), 'logged');
});

await test('Composer: stance conflicts and unconfirmed amounts are flagged; mark sent creates a wait', async page => {
  await click(page, 'button[data-act="load-samples"]');
  const id = await page.evaluate(() => ATF.S.cases.find(c => c.title.startsWith('Got a parking')).id);
  await go(page, `#/case/${id}/contact`);
  await click(page, 'button[data-act="compose"]');
  await page.waitForSelector('.dlg');
  await page.selectOption('.dlg select[name="purpose"]', 'dispute');
  await pick(page, 'input[name="stance"][value="apologize"]', '.dlg');
  await page.waitForTimeout(80);
  let checks = await page.textContent('.dlg [data-role="checks"]');
  assert(/undermine your position/.test(checks), 'apology-while-disputing warning');
  assert(/placeholder/.test(checks), 'placeholder warning');
  await pick(page, 'input[name="stance"][value="dispute"]', '.dlg');
  await page.fill('.dlg textarea[name="body"]', 'Hello, I believe this $45 penalty was issued in error. Citation PC-55120.');
  await page.waitForTimeout(60);
  checks = await page.textContent('.dlg [data-role="checks"]');
  assert(/\$45/.test(checks) && /haven’t marked as confirmed/.test(checks), 'unconfirmed amount flagged');
  assert(!/undermine/.test(checks), 'no conflict once stance is dispute');
  await page.click('.dlg button[value="sent"]');
  await page.waitForSelector('.dlg-title:has-text("Mark as sent")');
  await page.click('.dlg button[type="submit"]:has-text("Save")');
  await page.waitForTimeout(150);
  const s = await S(page);
  const m = s.comms.find(x => x.caseId === id);
  assert(m && m.status === 'sent' && m.stance === 'dispute' && m.edited, 'comm saved as sent ' + JSON.stringify(m && { st: m.status, s: m.stance }));
  const w = s.waits.find(x => x.caseId === id);
  assert(w && w.basis === 'estimate' && w.followUpOn, 'reply tracked as a wait');
});

await test('Call notes: their promise becomes a tracked wait; answers become confirmed facts with a source', async page => {
  await click(page, 'button[data-act="load-samples"]');
  const id = await page.evaluate(() => ATF.S.cases.find(c => c.type === 'appointment').id);
  await go(page, `#/case/${id}/contact`);
  await click(page, 'button[data-act="comm-open"]');
  await page.waitForSelector('.dlg-title:has-text("Call script")');
  await page.click('.dlg button[value="sent"]');
  await page.waitForSelector('.dlg-title:has-text("Call notes")');
  await page.fill('.dlg input[name="contact"]', 'Priya');
  await page.fill('.dlg input[name="reference"]', 'CG-7781');
  await page.fill('.dlg textarea[name="outcome"]', 'Rebooked for Dec 3 at 9:30. No fee this time.');
  await page.fill('.dlg input[name="them_text"]', 'text a reminder the day before');
  await page.fill('.dlg input[name="them_due"]', '2026-12-02');
  await page.fill('.dlg input[name="fact_text"]', 'New appointment: Dec 3, 9:30 AM');
  await page.click('.dlg button:has-text("Save call record")');
  await page.waitForSelector('.toast:has-text("Call recorded")');
  const s = await S(page);
  const m = s.comms.find(x => x.caseId === id);
  assert(m.status === 'done' && m.contact === 'Priya' && m.reference === 'CG-7781', 'call saved: ' + JSON.stringify({ n: s.comms.filter(x => x.caseId === id).length, st: m.status, c: m.contact, r: m.reference, all: s.comms.filter(x => x.caseId === id).map(x => [x.status, x.contact, x.subject]) }));
  const cm = s.commitments.find(x => x.caseId === id && x.party === 'them');
  assert(cm && cm.due === '2026-12-02' && cm.waitId, 'commitment with wait');
  const w = s.waits.find(x => x.id === cm.waitId);
  assert(w.basis === 'promised' && w.expectedBy === '2026-12-02', 'wait promised');
  const f = s.facts.find(x => x.caseId === id && x.text.startsWith('New appointment'));
  assert(f && f.kind === 'confirmed' && /Call with Priya/.test(f.source), 'fact confirmed with source');
  assert(s.evidence.some(e => e.caseId === id && e.type === 'call_note' && e.links.some(l => l.t === 'comms')), 'call record evidence linked');
});

await test('Waiting: missed promise is detected, flagged and offers escalation', async page => {
  await click(page, 'button[data-act="load-samples"]');
  await go(page, '#/waiting');
  const txt = await page.textContent('#view');
  assert(/Promises missed/.test(txt) && /Security deposit check/.test(txt), 'missed promise group');
  assert(/Draft an escalation/.test(txt), 'escalation offered');
  const step = await page.evaluate(() => { const c = ATF.S.cases.find(x => x.title.includes('security deposit')); return ATF.Engine.nextStep(c.id); });
  assert(step.kind === 'followup' && step.purpose === 'escalate', 'missed promise becomes the next step: ' + step.kind);
  const conf = await page.evaluate(() => { const c = ATF.S.cases.find(x => x.title.includes('security deposit')); return ATF.S.facts.filter(f => f.caseId === c.id && f.kind === 'confirmed').length; });
  assert(conf === 1, 'example confirmed fact present');
  const ins = await page.evaluate(() => ATF.Engine.insights().map(i => i.title));
  assert(ins.some(t => /Oakridge.*missed/.test(t)), 'insight about missed promises: ' + ins.join(' | '));
});

await test('Evidence: real file stored in IndexedDB with fingerprint; integrity verified on open', async page => {
  await click(page, 'button[data-act="load-samples"]');
  const id = await page.evaluate(() => ATF.S.cases[0].id);
  await go(page, `#/case/${id}/evidence`);
  await click(page, 'button[data-act="ev-new"]');
  await page.waitForSelector('.dlg');
  await page.fill('.dlg input[name="title"]', 'Payment confirmation screenshot');
  await page.fill('.dlg input[name="reference"]', 'PAY-1182');
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
  await page.setInputFiles('.dlg input[type="file"]', { name: 'confirm.png', mimeType: 'image/png', buffer: png });
  await page.click('.dlg button[type="submit"]');
  await page.waitForTimeout(300);
  const e = await page.evaluate(() => ATF.S.evidence.find(x => x.title === 'Payment confirmation screenshot'));
  assert(e && e.file && e.file.sha256.length === 64 && e.file.size === png.length, 'file metadata ' + JSON.stringify(e && e.file));
  const stored = await page.evaluate(async b => { const r = await ATF.IDB.getBlob(b); return r && r.blob.size; }, e.file.blobId);
  assert(stored === png.length, 'blob stored');
  await page.click(`button[data-act="ev-open"][data-id="${e.id}"]`);
  await page.waitForSelector('text=Unchanged since added');
});

await test('Resolution: tasks done ≠ resolved; verified requires evidence; honest fallback', async page => {
  await click(page, 'button[data-act="load-samples"]');
  const id = await page.evaluate(() => ATF.S.cases.find(c => c.type === 'renewal').id);
  await page.evaluate(i => { ATF.S.tasks.filter(t => t.caseId === i).forEach(t => { t.done = true; }); }, id);
  await go(page, `#/case/${id}/overview`);
  assert(/Every step is done/.test(await page.textContent('#view')), 'all-done banner');
  assert(await page.evaluate(i => ATF.Engine.nextStep(i).kind, id) === 'resolve', 'next step is to check resolution');
  await go(page, `#/case/${id}/resolve`);
  await page.click('button[data-act="res-set"][data-state="verified"]');
  await page.waitForSelector('text=Not quite verifiable yet');
  await page.click('.dlg button[data-dlg-close]:has-text("Add evidence first")');
  const sel = page.locator('select[data-change="crit-status"]');
  const n = await sel.count();
  for (let i = 0; i < n; i++) { await sel.nth(i).selectOption('met'); await page.waitForTimeout(60); }
  assert(await page.evaluate(i => ATF.Engine.resolution(i).suggest, id) === 'closed_unverified', 'met without evidence → not verifiable');
  const evId = await page.evaluate(() => ATF.S.evidence.find(e => e.title === 'Emissions test certificate').id);
  for (let i = 0; i < n; i++) {
    await page.locator('button[data-act="crit-evidence"]').nth(i).click();
    await page.check(`.dlg input[name="evidence"][value="${evId}"]`);
    await page.click('.dlg button[type="submit"]');
    await page.waitForTimeout(80);
  }
  assert(await page.evaluate(i => ATF.Engine.resolution(i).suggest, id) === 'verified', 'now verifiable');
  await page.click('button[data-act="res-set"][data-state="verified"]');
  await page.click('.dlg button[type="submit"]');
  await page.waitForTimeout(100);
  const s = await S(page);
  assert(s.cases.find(c => c.id === id).resolution.state === 'verified', 'verified');
  const ev = s.evidence.find(e => e.id === evId);
  assert(s.criteria.filter(c => c.caseId === id).every(c => ev.links.some(l => l.t === 'criteria' && l.id === c.id)), 'two-way evidence links');
});

await test('Deleting evidence that supports a verified case warns first', async page => {
  await click(page, 'button[data-act="load-samples"]');
  const id = await page.evaluate(() => ATF.S.evidence.find(e => e.reference === 'HB-992041-REV').id);
  await go(page, '#/evidence');
  await page.click(`button[data-act="ev-delete"][data-id="${id}"]`);
  await page.waitForSelector('text=This evidence supports your resolution');
  await page.click('.dlg button:has-text("Cancel")');
  assert(await page.evaluate(i => !!ATF.S.evidence.find(e => e.id === i), id), 'not deleted on cancel');
});

await test('Deleting a case moves the whole bundle to trash; undo restores it intact, links included', async page => {
  await click(page, 'button[data-act="load-samples"]');
  const before = await S(page);
  const reg = before.cases.find(c => c.type === 'renewal');
  const counts = s => ['facts', 'tasks', 'evidence', 'docs', 'criteria', 'paths', 'links', 'consequences', 'deadlines'].map(k => k === 'links' ? s.links.length : s[k].filter(r => r.caseId === reg.id).length).join(',');
  const depBefore = before.tasks.find(t => t.caseDep === reg.id);
  assert(depBefore, 'ticket task depends on registration case');
  await go(page, `#/case/${reg.id}`);
  await page.click('button[data-act="case-delete"]');
  await page.click('.dlg button:has-text("Move to trash")');
  await page.waitForTimeout(150);
  let s = await S(page);
  assert(!s.cases.some(c => c.id === reg.id), 'gone');
  assert(!s.tasks.some(t => t.caseDep === reg.id), 'cross-case dependency cleared');
  assert(s.trash.length === 1, 'in trash');
  await page.click('.toast button:has-text("Undo")');
  await page.waitForTimeout(150);
  s = await S(page);
  assert(counts(s) === counts(before), `restored intact ${counts(s)} vs ${counts(before)}`);
  assert(s.tasks.find(t => t.id === depBefore.id).caseDep === reg.id, 'dependency restored');
  assert(s.events.filter(e => e.caseId === reg.id).length === before.events.filter(e => e.caseId === reg.id).length + 1, 'history kept, plus a “restored” entry');
});

await test('Persistence: reload keeps everything; daily snapshot taken', async page => {
  await click(page, 'button[data-act="load-samples"]');
  await page.waitForTimeout(100);
  const a = await S(page);
  await page.reload();
  await page.waitForFunction(() => window.ATF && ATF.S);
  await page.waitForTimeout(300);
  const b = await S(page);
  assert(a.cases.length === b.cases.length && a.facts.length === b.facts.length && a.events.length === b.events.length, 'same data after reload');
  const snaps = await page.evaluate(async () => (await ATF.Snapshots.list()).map(s => s.reason));
  assert(snaps.includes('Daily snapshot'), 'daily snapshot: ' + snaps.join(','));
});

await test('Backup: export with files → clear → import restores data and files', async (page) => {
  await click(page, 'button[data-act="load-samples"]');
  const caseId = await page.evaluate(() => ATF.S.cases[0].id);
  await page.evaluate(async c => { const f = new File([new Uint8Array([1, 2, 3, 4, 5])], 'r.bin', { type: 'application/octet-stream' }); const e = await ATF.Ops.addEvidence(c, { title: 'Binary proof' }, f); ATF.S.evidence.push(e); }, caseId);
  await go(page, '#/data');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('button[data-act="export"]')]);
  const path = ROOT + '/test/tmp/backup.json';
  await dl.saveAs(path);
  const backup = JSON.parse(readFileSync(path, 'utf8'));
  assert(backup.format === 'after-the-fact-backup' && backup.schema === 2 && Object.keys(backup.files).length === 1, 'backup shape');
  await page.click('button[data-act="clear-all"]');
  await page.fill('.dlg input[name="confirm"]', 'DELETE');
  await page.click('.dlg button[type="submit"]');
  await page.waitForTimeout(200);
  assert((await S(page)).cases.length === 0, 'cleared');
  await go(page, '#/data');
  await page.setInputFiles('input[data-change="import-file"]', path);
  await page.waitForSelector('text=Import this backup?');
  await page.click('.dlg button:has-text("Replace with this backup")');
  await page.waitForTimeout(400);
  const s = await S(page);
  assert(s.cases.length === 9, 'cases back: ' + s.cases.length);
  const ev = s.evidence.find(e => e.title === 'Binary proof');
  const size = await page.evaluate(async b => (await ATF.IDB.getBlob(b)).blob.size, ev.file.blobId);
  assert(size === 5, 'file restored');
  const snaps = await page.evaluate(async () => (await ATF.Snapshots.list()).map(s => s.reason));
  assert(snaps.includes('Before importing a backup') && snaps.includes('Before deleting all data'), 'safety snapshots ' + snaps.join(','));
});

// v1 migration: seed with the ORIGINAL app's sample data plus a file attachment
const origHtml = readFileSync(ROOT + '/legacy/v1.html', 'utf8');
const v1Src = origHtml.slice(origHtml.indexOf('function daysOffset'), origHtml.indexOf('function createEmptyState'));
const v1 = new Function(v1Src.replace(/function esc[\s\S]*?\n    }\n/, '') + '\nreturn createSampleState();')();
v1.proofs[0].attachments.push({ id: 'att_f', kind: 'file', name: 'receipt.png', mimeType: 'image/png', size: 70, dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==' });
const v1json = JSON.stringify(v1);
await test('Migration: v1 data upgrades fully, original kept, files moved, closed cases honest', async page => {
  const s = await S(page);
  assert(s.meta.migratedFrom === 1, 'migratedFrom');
  assert(s.cases.length === 8, 'cases: 5 situations + 2 waiting items + 1 standalone deadline = 8, got ' + s.cases.length);
  assert(await page.evaluate(() => localStorage.getItem('after_the_fact_v1') !== null), 'v1 key untouched');
  const cc = s.cases.find(c => c.id === 'sit_cc_fee_done');
  assert(cc.resolution.state === 'verified', 'closed with proof → verified');
  assert(s.comms.find(m => m.id === 'cp_cc_fee').contact === 'Jordan M.', 'call notes carried');
  const water = s.cases.find(c => c.id === 'sit_water_bill');
  assert(s.tasks.filter(t => t.caseId === water.id).length >= 5 && s.paths.some(p => p.caseId === water.id), 'tasks kept + options added');
  assert(s.deadlines.some(d => d.caseId === water.id && d.kind === 'self'), 'revised date → own target');
  const f = s.evidence.find(e => e.file);
  assert(f && f.file.sha256, 'file moved with fingerprint');
  const blob = await page.evaluate(async b => (await ATF.IDB.getBlob(b)).blob.size, f.file.blobId);
  assert(blob === 70, 'blob size ' + blob);
  const dep = s.cases.find(c => c.title.startsWith('Security deposit'));
  assert(dep && s.waits.some(w => w.caseId === dep.id && w.log.length === 2), 'waiting item became a case with its log');
  assert(/upgraded/.test(await page.textContent('#banners')), 'upgrade notice shown');
  const snaps = await page.evaluate(async () => (await ATF.Snapshots.list()).map(x => x.reason));
  assert(snaps.includes('Version 1 data, before upgrading'), 'v1 snapshot');
}, { storage: { after_the_fact_v1: v1json } });

await test('Corrupt saved data is preserved and the app recovers instead of overwriting it', async page => {
  const t = await page.textContent('#banners');
  assert(/couldn’t be read/.test(t), 'notice: ' + t);
  const keys = await page.evaluate(() => Object.keys(localStorage));
  const bad = keys.find(k => k.startsWith('after_the_fact_v2_unreadable_'));
  assert(bad, 'kept aside: ' + keys.join(','));
  assert(await page.evaluate(k => localStorage.getItem(k).includes('keep-me'), bad), 'raw preserved');
  await page.click('button[data-act="load-samples"]');
  assert(await page.evaluate(k => localStorage.getItem(k).includes('keep-me'), bad), 'still preserved after saving');
}, { storage: { after_the_fact_v2: '{"schema":2,"cases":[{"id":"keep-me"' } });

await test('Injection: hostile text, references and imported ids never execute', async page => {
  await page.evaluate(() => { window.__pwned = 0; });
  const evil = `<img src=x onerror="window.__pwned=1">');window.__pwned=2;//`;
  await page.fill('#qi', evil);
  await page.click('form[data-form="quick-intake"] button');
  await page.waitForSelector('text=Here’s what I understood.');
  await page.click('details.disclose summary');
  await page.fill('input[data-k="reference"]', `x');window.__pwned=3;//`);
  await page.click('button:has-text("Create case")');
  await page.waitForTimeout(150);
  await page.click('button[data-act="copy"]');
  const crafted = { format: 'after-the-fact-backup', schema: 2, data: { schema: 2, cases: [{ id: `a');window.__pwned=4;//`, title: '<svg onload=window.__pwned=5>', type: 'nope', resolution: { state: 'hacked' } }], facts: [{ caseId: `a');window.__pwned=4;//`, text: '<b onmouseover=window.__pwned=6>x</b>', kind: 'confirmed' }], evidence: [{ id: 'e1', caseId: '', title: 'x', file: { blobId: '"><img src=x onerror=window.__pwned=7>', name: 'x', mime: 'image/png' } }] } };
  const path = ROOT + '/test/tmp/crafted.json';
  writeFileSync(path, JSON.stringify(crafted));
  await go(page, '#/data');
  await page.setInputFiles('input[data-change="import-file"]', path);
  await page.click('.dlg button:has-text("Replace with this backup")');
  await page.waitForTimeout(300);
  const s = await S(page);
  assert(s.cases[0].type === 'general' && s.cases[0].resolution.state === 'open', 'invalid enums repaired');
  for (const r of ['today', 'cases', 'evidence', `case/${encodeURIComponent(s.cases[0].id)}/understand`]) { await go(page, '#/' + r); await page.waitForTimeout(120); }
  await page.hover('text=x').catch(() => {});
  assert(await page.evaluate(() => window.__pwned) === 0, 'payload executed: ' + await page.evaluate(() => window.__pwned));
});

await test('Malformed import is rejected gracefully; partial records are repaired', async page => {
  const path = ROOT + '/test/tmp/junk.json';
  writeFileSync(path, '{"hello": "world"}');
  await go(page, '#/data');
  await page.setInputFiles('input[data-change="import-file"]', path);
  await page.waitForSelector('.toast:has-text("doesn’t look like")');
  const r = await page.evaluate(() => { const { state, report } = ATF.normalizeState({ schema: 2, cases: [{ id: 'c1' }, null, 5], tasks: [{ caseId: 'c1', dependsOn: ['ghost', 'c1t'] , id: 'c1t'}, { caseId: 'missing' }] }); return { c: state.cases.length, t: state.tasks.length, dep: state.tasks[0].dependsOn, report }; });
  assert(r.c === 1 && r.t === 1 && r.dep.length === 0 && r.report.dropped === 3, JSON.stringify(r));
});

await test('Focus session: one step at a time; done steps recorded; summary shown', async page => {
  await click(page, 'button[data-act="load-samples"]');
  await page.click('button[data-act="start-focus"][data-min="30"]');
  await page.waitForSelector('text=Focus ·');
  const total = Number((await page.textContent('.eyebrow:has-text("Focus ·")')).match(/of (\d+)/)[1]);
  assert(total >= 2, 'a 30-minute session has several steps, got ' + total);
  const first = await page.textContent('h1.focus-task');
  await page.click('button[data-act="focus-done"]');
  await page.waitForTimeout(80);
  const second = await page.textContent('h1.focus-task');
  assert(second !== first, 'moved to the next step');
  await page.click('button[data-act="focus-skip"]');
  await page.waitForTimeout(80);
  if (total > 2) await page.click('button[data-act="focus-end"]');
  await page.waitForSelector('text=Session finished');
  const s = await S(page);
  assert(s.tasks.some(t => t.text === first.trim() && t.done), 'done recorded');
});

await test('Parking hides a case from Today but a close deadline brings it back', async page => {
  await click(page, 'button[data-act="load-samples"]');
  const id = await page.evaluate(() => ATF.S.cases.find(c => c.type === 'penalty').id);
  await go(page, `#/case/${id}`);
  await page.click('button[data-act="case-park"]');
  assert(/doesn’t pause real deadlines/.test(await page.textContent('.dlg')), 'deadline warning in park dialog');
  await page.fill('.dlg input[name="until"]', '2026-12-10');
  await page.click('.dlg button:has-text("Park")');
  await page.waitForTimeout(100);
  assert(await page.evaluate(i => ATF.Engine.priority(i).parked, id) === true, 'parked (deadline 6 days out)');
  await page.evaluate(i => { ATF.S.deadlines.find(d => d.caseId === i && d.label === 'Pay or contest by').date = offset(2); }, id);
  const p = await page.evaluate(i => ATF.Engine.priority(i), id);
  assert(p.parked === false && p.reasons[0].text === 'Parked, but a deadline is close', 'resurfaces: ' + JSON.stringify(p.reasons[0]));
});

await test('Cross-case links: a blocking case gains priority; dependency shown on the blocked step', async page => {
  await click(page, 'button[data-act="load-samples"]');
  const reg = await page.evaluate(() => ATF.S.cases.find(c => c.type === 'renewal').id);
  const tk = await page.evaluate(() => ATF.S.cases.find(c => c.type === 'penalty').id);
  const before = await page.evaluate(i => ATF.Engine.priority(i).score, reg);
  await go(page, `#/case/${reg}`);
  await page.click('button[data-act="link-add"]');
  await page.selectOption('.dlg select[name="type"]', 'blocks');
  await page.selectOption('.dlg select[name="to"]', tk);
  await page.click('.dlg button:has-text("Link")');
  await page.waitForTimeout(100);
  const after = await page.evaluate(i => ATF.Engine.priority(i), reg);
  assert(after.score === before + 2 && after.reasons.some(r => /unblocks/.test(r.text)), 'priority boost');
  await go(page, `#/case/${tk}/plan`);
  assert(/Needs “Car registration expired/.test(await page.textContent('#view')), 'blocked step explains why');
});

await test('Dialogs are accessible: role, label, focus trap, Escape returns focus', async page => {
  await click(page, 'button[data-act="load-samples"]');
  await page.click('button[data-act="open-search"]');
  await page.waitForTimeout(120);
  const d = await page.evaluate(() => { const f = document.querySelector('.dlg'); return { role: f.getAttribute('role'), modal: f.getAttribute('aria-modal'), label: !!document.getElementById(f.getAttribute('aria-labelledby')), focusIn: f.contains(document.activeElement) }; });
  assert(d.role === 'dialog' && d.modal === 'true' && d.label && d.focusIn, JSON.stringify(d));
  for (let i = 0; i < 6; i++) await page.keyboard.press('Tab');
  assert(await page.evaluate(() => document.querySelector('.dlg').contains(document.activeElement)), 'focus trapped');
  await page.keyboard.press('Escape');
  assert(await page.evaluate(() => !document.querySelector('.dlg') && document.activeElement.dataset.act === 'open-search'), 'closed and focus returned');
  await page.fill('#cases-search', '').catch(() => {});
  await page.keyboard.press('/');
  await page.waitForTimeout(120);
  assert(await page.evaluate(() => !!document.querySelector('.dlg')), '/ opens search');
  await page.keyboard.type('HB-99');
  await page.waitForTimeout(80);
  assert(/Statement credit confirmation email/.test(await page.textContent('#gs-results')), 'search finds evidence by reference');
});

await test('Another tab’s changes are picked up instead of being overwritten', async (page, ctx) => {
  await click(page, 'button[data-act="load-samples"]');
  const p2 = await ctx.newPage();
  await p2.clock.install({ time: new Date('2026-11-24T06:22:00Z') });
  await p2.goto(page.url());
  await p2.waitForFunction(() => window.ATF && ATF.S && ATF.S.cases.length === 9);
  await p2.evaluate(() => { ATF.S.cases[0].title = 'Renamed in tab two'; localStorage.setItem('after_the_fact_v2', JSON.stringify(ATF.S)); });
  await page.waitForTimeout(300);
  assert(await page.evaluate(() => ATF.S.cases[0].title) === 'Renamed in tab two', 'tab one updated');
  // While a dialog is open in tab one, an external change must not swap the state underneath it.
  await page.click('button[data-act="open-search"]');
  await page.waitForTimeout(80);
  const before = await page.evaluate(() => ATF.S);
  await p2.evaluate(() => { ATF.S.cases[1].title = 'Second rename'; localStorage.setItem('after_the_fact_v2', JSON.stringify(ATF.S)); });
  await page.waitForTimeout(250);
  assert(await page.evaluate(b => ATF.S === b, before) || await page.evaluate(() => ATF.S.cases[1].title !== 'Second rename'), 'state not swapped under an open dialog');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  assert(await page.evaluate(() => ATF.S.cases[1].title) === 'Second rename', 'applied after the dialog closed');
});

await test('Calendar export: valid ICS with all-day events and reminders', async page => {
  await click(page, 'button[data-act="load-samples"]');
  await go(page, '#/dates');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('button[data-act="ics-upcoming"]')]);
  const p = ROOT + '/test/tmp/dates.ics'; await dl.saveAs(p);
  const ics = readFileSync(p, 'utf8');
  assert(ics.startsWith('BEGIN:VCALENDAR\r\n') && ics.includes('DTSTART;VALUE=DATE:20261129') && ics.includes('BEGIN:VALARM') && ics.trim().endsWith('END:VCALENDAR'), 'ics shape');
  assert(ics.split('\r\n').every(l => l.length <= 75), 'lines folded');
});

await test('Mobile: bottom nav, More sheet navigation, no horizontal overflow', async page => {
  await click(page, 'button[data-act="load-samples"]');
  for (const r of ['today', 'cases', 'waiting', 'dates', 'evidence', 'insights', 'data']) {
    await go(page, '#/' + r);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert(over <= 0, `overflow on ${r}: ${over}px`);
  }
  const id = await page.evaluate(() => ATF.S.cases[0].id);
  for (const tab of ['overview', 'understand', 'options', 'plan', 'contact', 'resolve']) {
    await go(page, `#/case/${id}/${tab}`);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert(over <= 0, `overflow on case ${tab}: ${over}px`);
  }
  await page.click('button[data-act="more-sheet"]');
  await page.click('.dlg a:has-text("Insights")');
  await page.waitForTimeout(100);
  assert(await page.evaluate(() => location.hash === '#/insights' && !document.querySelector('.dlg')), 'navigated from sheet');
}, { mobile: true });

for (const r of results) console.log(r.join('  '));
const failed = results.filter(r => r[0] === 'FAIL').length;
console.log(`\n${results.length - failed}/${results.length} passed`);
await browser.close();
process.exit(failed ? 1 : 0);
