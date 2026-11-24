/* ---------------- Storage adapters ----------------
   localStorage: the structured case data (small, synchronous, survives reloads).
   IndexedDB: file attachments (blobs) and safety snapshots (larger, async).
   Both are probed; the app degrades gracefully when either is unavailable. */

const LocalStore = (() => {
  let ok = false;
  try { const k = '__atf_probe__'; localStorage.setItem(k, '1'); localStorage.removeItem(k); ok = true; } catch (e) { ok = false; }
  const isQuota = e => e && (e.name === 'QuotaExceededError' || e.code === 22 || e.code === 1014 || /quota/i.test(e.message || ''));
  return {
    get available() { return ok; },
    get(key) { if (!ok) return null; try { return localStorage.getItem(key); } catch (e) { return null; } },
    set(key, val) {
      if (!ok) return { ok: false, reason: 'unavailable' };
      try { localStorage.setItem(key, val); return { ok: true }; }
      catch (e) { return { ok: false, reason: isQuota(e) ? 'quota' : 'error', error: e }; }
    },
    remove(key) { if (!ok) return; try { localStorage.removeItem(key); } catch (e) { /* ignore */ } },
    keys() { if (!ok) return []; try { return Object.keys(localStorage); } catch (e) { return []; } },
    bytes(key) { const v = this.get(key); return v ? v.length * 2 : 0; },
  };
})();

const IDB = (() => {
  let dbPromise = null;
  let ok = typeof indexedDB !== 'undefined';
  function open() {
    if (!ok) return Promise.reject(new Error('IndexedDB unavailable'));
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      let req;
      try { req = indexedDB.open('after_the_fact', 1); } catch (e) { reject(e); return; }
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('blobs')) db.createObjectStore('blobs');
        if (!db.objectStoreNames.contains('snapshots')) db.createObjectStore('snapshots', { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('IndexedDB open failed'));
      req.onblocked = () => reject(new Error('IndexedDB blocked by another tab'));
    });
    dbPromise.catch(() => { ok = false; dbPromise = null; });
    return dbPromise;
  }
  function run(store, mode, fn) {
    return open().then(db => new Promise((resolve, reject) => {
      let result;
      const tx = db.transaction(store, mode);
      const req = fn(tx.objectStore(store));
      if (req) req.onsuccess = () => { result = req.result; };
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
    }));
  }
  return {
    get available() { return ok; },
    probe() { return open().then(() => true, () => false); },
    putBlob: (id, rec) => run('blobs', 'readwrite', s => s.put(rec, id)),
    getBlob: id => run('blobs', 'readonly', s => s.get(id)),
    delBlob: id => run('blobs', 'readwrite', s => s.delete(id)),
    blobKeys: () => run('blobs', 'readonly', s => s.getAllKeys()),
    clearBlobs: () => run('blobs', 'readwrite', s => s.clear()),
    putSnapshot: rec => run('snapshots', 'readwrite', s => s.put(rec)),
    listSnapshots: () => run('snapshots', 'readonly', s => s.getAll()),
    getSnapshot: id => run('snapshots', 'readonly', s => s.get(id)),
    delSnapshot: id => run('snapshots', 'readwrite', s => s.delete(id)),
  };
})();

/* Safety snapshots: taken automatically before anything that replaces data
   (migration, import, loading examples, clearing, restoring) and once a day. */
const Snapshots = (() => {
  const memory = []; // fallback when IndexedDB is unavailable (lost on reload; we say so in the UI)
  async function take(reason, json) {
    const rec = { id: uid('snap'), at: nowStamp(), reason, json, size: json.length };
    try {
      await IDB.putSnapshot(rec);
      const all = (await IDB.listSnapshots()).sort((a, b) => b.at.localeCompare(a.at));
      for (const old of all.slice(APP.maxSnapshots)) await IDB.delSnapshot(old.id);
      return { ok: true, durable: true, id: rec.id };
    } catch (e) {
      memory.unshift(rec); memory.splice(APP.maxSnapshots);
      return { ok: true, durable: false, id: rec.id };
    }
  }
  async function list() {
    let items = [];
    try { items = await IDB.listSnapshots(); } catch (e) { items = []; }
    return [...items, ...memory].sort((a, b) => b.at.localeCompare(a.at));
  }
  async function get(id) {
    const m = memory.find(s => s.id === id);
    if (m) return m;
    try { return await IDB.getSnapshot(id); } catch (e) { return null; }
  }
  async function remove(id) {
    const i = memory.findIndex(s => s.id === id);
    if (i >= 0) memory.splice(i, 1);
    try { await IDB.delSnapshot(id); } catch (e) { /* ignore */ }
  }
  return { take, list, get, remove };
})();

const Prefs = (() => {
  let p = {};
  try { p = JSON.parse(LocalStore.get(APP.prefsKey) || '{}') || {}; } catch (e) { p = {}; }
  return {
    get: (k, d) => (k in p ? p[k] : d),
    set: (k, v) => { p[k] = v; LocalStore.set(APP.prefsKey, JSON.stringify(p)); },
  };
})();
