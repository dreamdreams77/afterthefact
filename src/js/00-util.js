'use strict';
/* =====================================================================
   AFTER THE FACT — v2
   Local-first. No network calls are made by this script except the
   optional web-font stylesheet (see Fonts in 99-boot.js), which the
   person can switch off in Data & privacy.
   ===================================================================== */

const APP = {
  name: 'AFTER THE FACT',
  schema: 2,
  lsKey: 'after_the_fact_v2',
  lsV1: 'after_the_fact_v1',
  prefsKey: 'atf_prefs',
  maxFileBytes: 15 * 1024 * 1024,
  maxSnapshots: 8,
  maxTrash: 40,
};

/* ---------------- Dates ----------------
   Calendar dates are stored as local "YYYY-MM-DD" strings and are never
   passed through toISOString() (which converts to UTC and shifts the day
   for anyone west of Greenwich in the evening). Instants (timeline events)
   are stored as full ISO timestamps and displayed in local time. */
const pad2 = n => String(n).padStart(2, '0');
function nowDate() { return new Date(); }
function toISODate(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
function today() { return toISODate(nowDate()); }
function parseISODate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  return dt;
}
const isISODate = s => !!parseISODate(s);
function addDays(iso, n) {
  const d = parseISODate(iso) || parseISODate(today());
  d.setDate(d.getDate() + n);
  return toISODate(d);
}
const offset = n => addDays(today(), n);
function dayNumber(iso) { const d = parseISODate(iso); return d ? Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000 : null; }
function daysUntil(iso) { const a = dayNumber(iso); return a === null ? null : a - dayNumber(today()); }
function daysBetween(a, b) { const x = dayNumber(a), y = dayNumber(b); return x === null || y === null ? null : y - x; }
function fmtDate(iso, { weekday = false, year = 'auto' } = {}) {
  const d = parseISODate(iso);
  if (!d) return '';
  const o = { month: 'short', day: 'numeric' };
  if (weekday) o.weekday = 'short';
  if (year === true || (year === 'auto' && d.getFullYear() !== nowDate().getFullYear())) o.year = 'numeric';
  return d.toLocaleDateString('en-US', o);
}
function relDay(iso) {
  const n = daysUntil(iso);
  if (n === null) return '';
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  if (n === -1) return 'yesterday';
  if (n > 1 && n < 14) return `in ${n} days`;
  if (n >= 14 && n < 60) return `in ${Math.round(n / 7)} weeks`;
  if (n < -1 && n > -14) return `${-n} days ago`;
  if (n <= -14 && n > -60) return `${Math.round(-n / 7)} weeks ago`;
  return n > 0 ? `in ${Math.round(n / 30)} months` : `${Math.round(-n / 30)} months ago`;
}
function dateAndRel(iso) { return iso ? `${fmtDate(iso)} · ${relDay(iso)}` : ''; }
function nowStamp() { return new Date().toISOString(); }
function isStamp(s) { return typeof s === 'string' && s.length >= 10 && !isNaN(Date.parse(s)); }
function stampDate(ts) { const d = new Date(ts); return isNaN(d) ? '' : toISODate(d); }
function fmtTime(ts) { const d = new Date(ts); return isNaN(d) ? '' : d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); }
function fmtStamp(ts) { const d = new Date(ts); return isNaN(d) ? '' : `${fmtDate(toISODate(d))}, ${fmtTime(ts)}`; }
function icsDate(iso) { return iso.replace(/-/g, ''); }

/* ---------------- Ids & text ---------------- */
function uid(p = 'id') { return `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`; }
function esc(v) {
  if (v === null || v === undefined) return '';
  return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
const cap = s => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');
const plural = (n, one, many) => `${n} ${n === 1 ? one : (many || one + 's')}`;
function truncate(s, n) { s = String(s || ''); if (s.length <= n) return s; const cut = s.slice(0, n - 1); const sp = cut.lastIndexOf(' '); return (sp > n * 0.6 ? cut.slice(0, sp) : cut).replace(/[,;:\s]+$/, '') + '…'; }
function norm(s) { return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim(); }
function listJoin(arr, word = 'and') { const a = arr.filter(Boolean); if (a.length <= 1) return a.join(''); return a.slice(0, -1).join(', ') + ` ${word} ` + a[a.length - 1]; }
function fmtBytes(n) { if (!n && n !== 0) return ''; if (n < 1024) return n + ' B'; if (n < 1048576) return Math.round(n / 1024) + ' KB'; return (n / 1048576).toFixed(1) + ' MB'; }
function byOrder(a, b) { return (a.order ?? 0) - (b.order ?? 0); }

/* ---------------- Clipboard & downloads ---------------- */
async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return true; }
  } catch (e) { /* fall through */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.left = '-9999px';
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch (e) { return false; }
}
/* Hosted viewers (e.g. a claude.ai artifact) block ordinary downloads but may
   offer a save capability. Only window.claude.use is ever read. */
let HostDownloads;
function hostDownloads() {
  if (HostDownloads !== undefined) return Promise.resolve(HostDownloads);
  if (!(window.claude && typeof window.claude.use === 'function')) return Promise.resolve((HostDownloads = null));
  return Promise.resolve(window.claude.use('downloads')).then(d => (HostDownloads = d || null), () => (HostDownloads = null));
}
async function downloadBlob(filename, blob) {
  const host = await hostDownloads();
  if (host) {
    try { await host.save({ filename, data: blob }); return true; }
    catch (e) {
      const code = e && e.code;
      if (code === 'declined') { UI.toast('Save cancelled.'); return false; }
      const ext = (filename.split('.').pop() || '').toLowerCase();
      UI.toast(code === 'rejected_extension' ? `This viewer can’t save .${ext} files. Open the app file directly to download it.` : 'This viewer couldn’t save the file. For backups, use “Copy backup text”.', 'warn');
      return false;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return true;
}
function downloadText(filename, text, mime = 'text/plain') { return downloadBlob(filename, new Blob([text], { type: mime + ';charset=utf-8' })); }
function safeFileName(s) { return String(s || 'file').replace(/[^\w.\- ]+/g, '').replace(/\s+/g, '-').slice(0, 60) || 'file'; }
function readFileAs(file, how) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = () => rej(r.error || new Error('Could not read file'));
    if (how === 'text') r.readAsText(file); else if (how === 'dataurl') r.readAsDataURL(file); else r.readAsArrayBuffer(file);
  });
}
async function sha256Hex(buf) {
  try {
    if (!crypto || !crypto.subtle) return '';
    const h = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2, '0')).join('');
  } catch (e) { return ''; }
}
function dataUrlToBlob(dataUrl) {
  const m = /^data:([^;,]*)(;base64)?,(.*)$/s.exec(String(dataUrl || ''));
  if (!m) return null;
  const mime = m[1] || 'application/octet-stream';
  if (m[2]) {
    const bin = atob(m[3]); const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }
  return new Blob([decodeURIComponent(m[3])], { type: mime });
}
function blobToDataUrl(blob) { return readFileAs(blob, 'dataurl'); }
