/* ---------------- UI core: icons, routing, rendering, dialogs, toasts ---------------- */
const svg = (d, w = 1.7) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${d}</svg>`;
const ICON = {
  today: svg('<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/>'),
  cases: svg('<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M3 9h18M8 13h8M8 16h5"/>'),
  waiting: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  dates: svg('<rect x="3" y="4.5" width="18" height="16.5" rx="2.5"/><path d="M16 2.5v4M8 2.5v4M3 10h18"/>'),
  evidence: svg('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>'),
  insights: svg('<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.4 1 1.1 1 1.8V16h5v-.3c0-.7.4-1.4 1-1.8A6 6 0 0 0 12 3z"/>'),
  data: svg('<rect x="4" y="10" width="16" height="11" rx="2.5"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>'),
  more: svg('<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>', 2),
  check: svg('<path d="M20 6 9 17l-5-5"/>', 2.4),
  close: svg('<path d="M18 6 6 18M6 6l12 12"/>'),
  back: svg('<path d="M15 18l-6-6 6-6"/>'),
  arrow: svg('<path d="M5 12h14m-6-6 6 6-6 6"/>'),
  edit: svg('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>'),
  trash: svg('<path d="M3 6h18M8 6V4.5A1.5 1.5 0 0 1 9.5 3h5A1.5 1.5 0 0 1 16 4.5V6m2.5 0-.8 13.2a2 2 0 0 1-2 1.8H8.3a2 2 0 0 1-2-1.8L5.5 6"/>'),
  up: svg('<path d="m6 15 6-6 6 6"/>'),
  down: svg('<path d="m6 9 6 6 6-6"/>'),
  copy: svg('<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>'),
  phone: svg('<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>'),
  mail: svg('<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="m3.5 6.5 8.5 6 8.5-6"/>'),
  letter: svg('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h6"/>'),
  message: svg('<path d="M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-6.4A8 8 0 1 1 21 12z"/>'),
  person: svg('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'),
  clip: svg('<path d="m21.4 11-9.2 9.2a6 6 0 0 1-8.5-8.5l8.6-8.6a4 4 0 0 1 5.7 5.7l-8.6 8.6a2 2 0 0 1-2.8-2.8l8.5-8.5"/>'),
  link: svg('<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>'),
  download: svg('<path d="M12 3v12m0 0-4-4m4 4 4-4"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>'),
  upload: svg('<path d="M12 21V9m0 0-4 4m4-4 4 4"/><path d="M4 7V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2"/>'),
  pause: svg('<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>'),
  spark: svg('<path d="M12 3l1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2z"/>'),
  search: svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
  focus: svg('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/>'),
  file: svg('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>'),
};
const CHANNEL_ICON = { call: 'phone', email: 'mail', letter: 'letter', message: 'message', in_person: 'person' };
const ico = (name, cls = '') => `<span class="ico ${cls}">${ICON[name] || ''}</span>`;

/* Ephemeral UI state (not saved) */
const UIState = { casesFilter: 'open', casesQuery: '', evidenceQuery: '', evidenceType: 'all', waitingKind: 'all', showAllToday: false, intake: null, focus: null, timelineAsc: false, dismissedNotices: new Set() };

const Router = {
  parse() {
    const h = location.hash.replace(/^#\/?/, '');
    const [path, q] = h.split('?');
    const parts = path.split('/').filter(Boolean).map(p => { try { return decodeURIComponent(p); } catch (e) { return p; } });
    return { name: parts[0] || 'today', parts, query: new URLSearchParams(q || ''), key: path };
  },
  go(path) {
    const target = '#/' + path;
    if (location.hash === target) UI.render(); else location.hash = target;
  },
};
const href = (...parts) => '#/' + parts.map(p => encodeURIComponent(p)).join('/');

const NAV = [
  { id: 'today', label: 'Today', icon: 'today' },
  { id: 'cases', label: 'Cases', icon: 'cases' },
  { id: 'waiting', label: 'Waiting', icon: 'waiting' },
  { id: 'dates', label: 'Dates', icon: 'dates' },
  { id: 'evidence', label: 'Evidence', icon: 'evidence' },
  { id: 'insights', label: 'Insights', icon: 'insights' },
  { id: 'data', label: 'Data & privacy', icon: 'data' },
];

const UI = {
  lastKey: null,
  after: [],
  render({ scrollTop = false } = {}) {
    if (!S) return;
    const route = Router.parse();
    const ae = document.activeElement;
    const fk = ae && ae.dataset ? ae.dataset.fk : null;
    const sel = fk && typeof ae.selectionStart === 'number' ? [ae.selectionStart, ae.selectionEnd] : null;
    const same = this.lastKey === route.key;
    const y = window.scrollY;
    const view = Views[route.name] || Views.notFound;
    let html;
    try { html = view(route); } catch (e) { console.error(e); html = Views.error(e); }
    const host = document.getElementById('view');
    host.innerHTML = html;
    if (!same) { host.classList.remove('view-in'); void host.offsetWidth; host.classList.add('view-in'); }
    this.renderNav(route);
    this.renderBanners();
    if (fk) {
      const el = document.querySelector(`[data-fk="${CSS.escape(fk)}"]`);
      if (el) { el.focus({ preventScroll: true }); if (sel && el.setSelectionRange) { try { el.setSelectionRange(sel[0], sel[1]); } catch (e) { /* ignore */ } } }
    }
    if (!same || scrollTop) {
      window.scrollTo(0, 0);
      if (this.lastKey !== null && !fk) document.getElementById('main').focus({ preventScroll: true });
    } else window.scrollTo(0, y);
    this.lastKey = route.key;
    const h1 = host.querySelector('h1');
    document.title = `${h1 ? h1.textContent.trim() + ' · ' : ''}AFTER THE FACT`;
    const hooks = this.after; this.after = [];
    hooks.forEach(fn => { try { fn(); } catch (e) { console.error(e); } });
  },

  renderNav(route) {
    const active = route.name === 'case' ? 'cases' : route.name === 'new' ? 'cases' : route.name === 'focus' ? 'today' : route.name;
    const openCases = S.cases.filter(c => !isClosed(c)).length;
    const attention = Engine.openWaits().filter(w => ['missed', 'follow', 'overdue'].includes(Engine.waitState(w).key)).length;
    const counts = { cases: openCases ? `<span class="count">${openCases}</span>` : '', waiting: attention ? `<span class="count hot" title="Need attention">${attention}</span>` : '' };
    document.getElementById('rail-nav').innerHTML = NAV.map((n, i) => `${i === 5 ? '<div class="rail-sep" role="separator"></div>' : ''}<a class="rail-link" href="${href(n.id)}" ${active === n.id ? 'aria-current="page"' : ''}><span class="lbl">${ico(n.icon)}${n.label}</span>${counts[n.id] || ''}</a>`).join('')
      + `<div class="rail-sep" role="separator"></div><a class="rail-link" href="#/new"><span class="lbl">${ico('plus')}New case</span></a>`;
    const moreActive = ['dates', 'evidence', 'insights', 'data'].includes(active);
    document.getElementById('bottom-nav').innerHTML = [
      `<a class="bn-item" href="#/today" ${active === 'today' ? 'aria-current="page"' : ''}>${ico('today')}<span>Today</span></a>`,
      `<a class="bn-item" href="#/cases" ${active === 'cases' ? 'aria-current="page"' : ''}>${ico('cases')}<span>Cases</span></a>`,
      `<a class="bn-item bn-new" href="#/new" aria-label="New case"><span class="bn-plus">${ICON.plus}</span><span class="lbl">New</span></a>`,
      `<a class="bn-item" href="#/waiting" ${active === 'waiting' ? 'aria-current="page"' : ''}>${ico('waiting')}<span>Waiting</span>${attention ? '<i class="dot" aria-label="needs attention"></i>' : ''}</a>`,
      `<button type="button" class="bn-item" data-act="more-sheet" ${moreActive ? 'aria-current="page"' : ''} aria-haspopup="dialog">${ico('more')}<span>More</span></button>`,
    ].join('');
  },

  renderBanners() {
    const out = [];
    const route = Router.parse();
    if (Runtime.saveError) out.push(banner('alert', esc(Runtime.saveError), `<a class="btn btn-sm" href="#/data">Back up now</a>`));
    if (!LocalStore.available) out.push(banner('warn', 'Saving is unavailable in this browser session. Your work lasts until the tab closes.', '<a class="btn btn-sm" href="#/data">Export</a>'));
    for (const n of Runtime.notices) {
      if (UIState.dismissedNotices.has(n.key)) continue;
      out.push(banner(n.level, esc(n.text), `${n.key === 'corrupt' && Runtime.corruptKey ? '<button class="btn btn-sm" data-act="download-corrupt">Download unreadable data</button>' : ''}<button class="btn btn-sm btn-ghost" data-act="dismiss-notice" data-key="${esc(n.key)}">Dismiss</button>`));
    }
    if (S && S.cases.some(c => c.sample) && route.name !== 'data') out.push(banner('info', 'You’re exploring example cases. They show how the app works with realistic situations.', `<button class="btn btn-sm" data-act="remove-samples">Remove examples</button>`));
    document.getElementById('banners').innerHTML = out.join('');
  },

  toast(msg, tone = '', action = null) {
    const host = document.getElementById('toasts');
    const el = document.createElement('div');
    el.className = `toast ${tone}`;
    el.innerHTML = `<span>${esc(msg)}</span>${action ? `<button type="button">${esc(action.label)}</button>` : ''}`;
    if (action) el.querySelector('button').addEventListener('click', () => { action.fn(); el.remove(); });
    host.appendChild(el);
    while (host.children.length > 3) host.firstChild.remove();
    setTimeout(() => { el.style.transition = 'opacity .25s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 260); }, action ? 8000 : 4200);
  },
};

function banner(level, html, actions = '') {
  return `<div class="banner ${level}" role="${level === 'alert' ? 'alert' : 'status'}"><div class="grow"><p>${html}</p>${actions ? `<div class="cluster">${actions}</div>` : ''}</div></div>`;
}

/* ---------- Dialogs: accessible, stackable, mobile sheets ---------- */
const Dialog = {
  stack: [],
  open({ title, sub = '', body = '', foot = '', size = '', onSubmit = null, onClose = null, onOpen = null }) {
    const host = document.getElementById('dlg-host');
    const wrap = document.createElement('div');
    wrap.className = 'dlg-root';
    const tid = uid('dt');
    wrap.innerHTML = `<div class="dlg-backdrop" data-dlg-close></div><form class="dlg ${size}" role="dialog" aria-modal="true" aria-labelledby="${tid}" novalidate>
      <div class="dlg-grip" aria-hidden="true"></div>
      <div class="dlg-head"><div class="grow"><h2 class="dlg-title" id="${tid}">${esc(title)}</h2>${sub ? `<p class="dlg-sub">${sub}</p>` : ''}</div><button type="button" class="icon-btn" data-dlg-close aria-label="Close">${ICON.close}</button></div>
      <div class="dlg-body">${body}</div>${foot ? `<div class="dlg-foot">${foot}</div>` : ''}</form>`;
    host.appendChild(wrap);
    const formEl = wrap.querySelector('form');
    const rec = { wrap, form: formEl, prevFocus: document.activeElement, onClose };
    this.stack.push(rec);
    document.body.classList.add('no-scroll');
    formEl.addEventListener('submit', async e => {
      e.preventDefault();
      if (!onSubmit) return;
      const invalid = [...formEl.querySelectorAll('[required]')].find(f => !String(f.value || '').trim());
      if (invalid) { invalid.focus(); UI.toast('Please fill in the required field.', 'warn'); return; }
      const btns = [...formEl.querySelectorAll('button[type=submit]')];
      btns.forEach(b => { b.disabled = true; });
      try { const r = await onSubmit(new FormData(formEl), formEl, e.submitter); if (r !== false) this.close(rec); }
      catch (err) { console.error(err); UI.toast(err && err.message ? err.message : 'Something went wrong.', 'warn'); }
      finally { btns.forEach(b => { b.disabled = false; }); }
    });
    wrap.addEventListener('click', e => {
      const el = e.target.closest('[data-dlg-close]');
      if (!el) return;
      const link = el.tagName === 'A' ? el.getAttribute('href') : '';
      if (!el.dataset.act) e.preventDefault();
      this.close(rec);
      if (link && link.startsWith('#')) { e.preventDefault(); location.hash = link; }
    });
    if (onOpen) onOpen(formEl, rec);
    setTimeout(() => {
      if (!document.contains(formEl) || formEl.contains(document.activeElement)) return; // never steal focus from someone already typing
      const f = formEl.querySelector('[autofocus]') || formEl.querySelector('.dlg-body input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=file]), .dlg-body textarea, .dlg-body select');
      (f || formEl.querySelector('.dlg-head .icon-btn')).focus({ preventScroll: true });
    }, 40);
    return rec;
  },
  close(rec = this.stack[this.stack.length - 1]) {
    if (!rec) return;
    rec.wrap.remove();
    this.stack = this.stack.filter(r => r !== rec);
    if (rec.onClose) rec.onClose();
    if (!this.stack.length) { document.body.classList.remove('no-scroll'); if (this.onEmpty) this.onEmpty(); }
    if (rec.prevFocus && document.contains(rec.prevFocus)) rec.prevFocus.focus({ preventScroll: true });
  },
  closeAll() { while (this.stack.length) this.close(); },
  top() { return this.stack[this.stack.length - 1] || null; },
};

function confirmDialog({ title, text, ok = 'Confirm', danger = false, cancel = 'Cancel' }) {
  return new Promise(resolve => {
    let done = false;
    Dialog.open({
      title, body: `<p class="ink2">${text}</p>`,
      foot: `<button type="button" class="btn" data-dlg-close>${esc(cancel)}</button><button type="submit" class="btn ${danger ? 'btn-primary' : 'btn-ink'}">${esc(ok)}</button>`,
      onSubmit: () => { done = true; resolve(true); },
      onClose: () => { if (!done) resolve(false); },
    });
  });
}

/* ---------- Small render helpers ---------- */
const pill = (text, tone = '', dot = false) => `<span class="pill ${tone}">${dot ? '<i class="pdot"></i>' : ''}${esc(text)}</span>`;
const empty = (title, text, actions = '') => `<div class="empty"><p class="h3">${esc(title)}</p><p>${text}</p>${actions ? `<div class="cluster">${actions}</div>` : ''}</div>`;
const whyList = (reasons, max = 3) => (reasons && reasons.length ? `<div class="why">${reasons.slice(0, max).map(r => `<span class="why-item ${r.hot ? 'hot' : ''}">${esc(r.text)}</span>`).join('')}</div>` : '');
const statusPill = caseId => { const s = Engine.caseStatus(caseId); return pill(s.label, s.tone, true); };
const certaintyPill = c => pill(CERTAINTY[c] || c, c === 'confirmed' ? 'sage' : c === 'estimated' ? 'amber' : 'line');
const field = (label, input, hint = '', id = '') => `<label class="field" ${id ? `for="${id}"` : ''}><span class="label">${label}</span>${input}${hint ? `<span class="hint">${hint}</span>` : ''}</label>`;
const inputEl = (name, value = '', attrs = '') => `<input class="input" name="${name}" value="${esc(value)}" ${attrs}>`;
const textareaEl = (name, value = '', attrs = '') => `<textarea class="textarea" name="${name}" ${attrs}>${esc(value)}</textarea>`;
const selectEl = (name, options, value, attrs = '') => `<select class="select" name="${name}" ${attrs}>${options.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(value) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
const segEl = (name, options, value, legend) => `<fieldset class="field"><legend class="label">${legend}</legend><div class="seg">${options.map(([v, l]) => `<label><input type="radio" name="${name}" value="${esc(v)}" ${v === value ? 'checked' : ''}><span>${esc(l)}</span></label>`).join('')}</div></fieldset>`;
const entriesOf = obj => Object.entries(obj).map(([k, v]) => [k, typeof v === 'string' ? v : v.label]);
const caseTitle = id => { const c = getCase(id); return c ? c.title : 'Unknown case'; };
const caseLinkEl = (id, cls = 'linkish plain') => `<a class="${cls}" href="${href('case', id)}">${esc(caseTitle(id))}</a>`;
