/* ---------------- Boot ---------------- */
const Fonts = {
  href: 'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;0,6..72,600;1,6..72,400&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap',
  apply() {
    const off = Prefs.get('systemFonts', false);
    const existing = document.getElementById('webfonts');
    if (off) { if (existing) existing.remove(); document.querySelectorAll('link[data-webfont]').forEach(l => l.remove()); return; }
    if (existing) return;
    const pre = document.createElement('link'); pre.rel = 'preconnect'; pre.href = 'https://fonts.gstatic.com'; pre.crossOrigin = ''; pre.dataset.webfont = '1';
    const css = document.createElement('link'); css.id = 'webfonts'; css.rel = 'stylesheet'; css.href = this.href; css.referrerPolicy = 'no-referrer';
    document.head.append(pre, css);
  },
};

function runSafely(fn, el, e) {
  try {
    const r = fn(el, e);
    if (r && typeof r.catch === 'function') r.catch(err => { console.error(err); UI.toast(`Something went wrong: ${err && err.message ? err.message : err}`, 'warn'); });
  } catch (err) { console.error(err); UI.toast(`Something went wrong: ${err && err.message ? err.message : err}`, 'warn'); }
}

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const fn = Actions[el.dataset.act];
  if (!fn) return;
  if (el.tagName === 'A' || el.getAttribute('type') !== 'submit') e.preventDefault();
  runSafely(fn, el, e);
});
document.addEventListener('change', e => { const el = e.target.closest('[data-change]'); if (el && Changes[el.dataset.change]) runSafely(Changes[el.dataset.change], el, e); });
document.addEventListener('input', e => { const el = e.target.closest('[data-input]'); if (el && Inputs[el.dataset.input]) runSafely(Inputs[el.dataset.input], el, e); });
document.addEventListener('submit', e => {
  const f = e.target.closest('form[data-form]');
  if (!f || !Forms[f.dataset.form]) return;
  e.preventDefault();
  runSafely(() => Forms[f.dataset.form](new FormData(f), f, e));
});
document.addEventListener('keydown', e => {
  const top = Dialog.top();
  if (e.key === 'Escape' && top) { e.preventDefault(); Dialog.close(top); return; }
  if (e.key === 'Tab' && top) {
    const items = [...top.form.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])')].filter(x => x.offsetParent !== null || x === document.activeElement);
    if (!items.length) return;
    const first = items[0]; const last = items[items.length - 1];
    if (!top.form.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
    else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    return;
  }
  const ae = document.activeElement;
  const typing = ae && (['INPUT', 'TEXTAREA', 'SELECT'].includes(ae.tagName) || ae.isContentEditable);
  if (e.key === '/' && !top && !typing && !e.metaKey && !e.ctrlKey) { e.preventDefault(); openSearch(); }
});

async function boot() {
  Fonts.apply();
  let r;
  try { r = await loadState(); }
  catch (e) { console.error(e); r = { state: emptyState(), firstRun: false, notices: [{ level: 'alert', key: 'loadfail', text: 'Something went wrong while loading. Your stored data hasn’t been changed; saving is paused to protect it. Try reloading.' }] }; Runtime.saveBlocked = true; }
  S = r.state; Runtime.notices = r.notices; Runtime.firstRun = r.firstRun;
  Runtime.idbOk = await IDB.probe();
  if (r.dirty) saveState();
  window.addEventListener('hashchange', () => { Dialog.closeAll(); UI.render(); });
  // Another tab saved. Never swap state under an open dialog (its form holds live records);
  // apply once dialogs close, unless this tab has saved over it in the meantime.
  let pendingExternal = null;
  const applyExternal = raw => { try { S = normalizeState(JSON.parse(raw)).state; UI.render(); UI.toast('Updated with changes from another tab.'); } catch (err) { /* ignore a half-written value */ } };
  window.addEventListener('storage', e => {
    if (e.key !== APP.lsKey || !e.newValue) return;
    if (Dialog.stack.length) { pendingExternal = e.newValue; return; }
    applyExternal(e.newValue);
  });
  Dialog.onEmpty = () => {
    if (!pendingExternal) return;
    const raw = pendingExternal; pendingExternal = null;
    if (LocalStore.get(APP.lsKey) === raw) applyExternal(raw);
    else UI.toast('Another tab changed this data while you were editing here. Your change was saved; reload to see both.', 'warn');
  };
  let lastDay = today();
  document.addEventListener('visibilitychange', () => { if (!document.hidden && today() !== lastDay) { lastDay = today(); UI.render(); } });
  UI.render();
  hostDownloads();
  if (S.cases.length && S.meta.lastSnapshotDay !== today() && !Runtime.saveBlocked) {
    Snapshots.take('Daily snapshot', JSON.stringify(S)).then(res => { if (res.durable) { S.meta.lastSnapshotDay = today(); saveState(); } });
  }
  window.ATF = { get S() { return S; }, Engine, Ops, Comms, UI, Router, Dialog, normalizeState, migrateV1, buildSampleState, Snapshots, IDB, Runtime };
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
