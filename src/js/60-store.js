/* ---------------- Live state, persistence and operations ---------------- */
let S = null;
const Runtime = { saveBlocked: false, saveError: '', corruptKey: '', corruptRaw: '', newerSchema: false, notices: [], idbOk: false, firstRun: false };

const getCase = id => (S ? S.cases.find(c => c.id === id) || null : null);
const isClosed = c => !!(c && RES_STATES[c.resolution.state].closed);
const byCase = (coll, caseId) => S[coll].filter(r => r.caseId === caseId);
const findRec = (coll, id) => S[coll].find(r => r.id === id) || null;

async function loadState() {
  const notices = [];
  if (!LocalStore.available) {
    notices.push({ level: 'warn', key: 'nostorage', text: 'This browser isn’t allowing the app to save (private browsing or blocked storage). Everything works, but changes will be lost when this tab closes — export a backup to keep your work.' });
    return { state: emptyState(), firstRun: true, notices };
  }
  const raw = LocalStore.get(APP.lsKey);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Number(parsed.schema) > APP.schema) {
        Runtime.saveBlocked = true; Runtime.newerSchema = true;
        notices.push({ level: 'alert', key: 'newer', text: 'This data was saved by a newer version of AFTER THE FACT. To avoid losing anything, this version won’t save changes. Export a backup or open the newer version.' });
      }
      const { state, report } = normalizeState(parsed);
      if (report.dropped) notices.push({ level: 'info', key: 'repair', text: `Some saved records were incomplete and were set aside while loading (${report.dropped}). A safety snapshot of the previous data is kept in Data & privacy.` });
      if (report.dropped) await Snapshots.take('Before repairing saved data', raw);
      return { state, firstRun: false, notices };
    } catch (e) {
      const key = `${APP.lsKey}_unreadable_${Date.now()}`;
      const kept = LocalStore.set(key, raw);
      Runtime.corruptKey = kept.ok ? key : '';
      if (!kept.ok) { Runtime.saveBlocked = true; Runtime.corruptRaw = raw; }
      const snaps = await Snapshots.list();
      for (const snap of snaps) {
        try {
          const { state } = normalizeState(JSON.parse(snap.json));
          notices.push({ level: 'alert', key: 'corrupt', text: `Your saved data couldn’t be read, so the most recent safety snapshot (${fmtStamp(snap.at)}) was restored. The unreadable data was kept aside untouched — you can download it in Data & privacy.` });
          return { state, firstRun: false, notices };
        } catch (e2) { /* try the next one */ }
      }
      notices.push({ level: 'alert', key: 'corrupt', text: 'Your saved data couldn’t be read. It has been kept aside untouched (download it from Data & privacy), and you’re starting with an empty workspace.' });
      return { state: emptyState(), firstRun: false, notices };
    }
  }
  const v1raw = LocalStore.get(APP.lsV1);
  if (v1raw) {
    try {
      const v1 = JSON.parse(v1raw);
      if (looksLikeV1(v1)) {
        await Snapshots.take('Version 1 data, before upgrading', v1raw);
        const { state: migrated, pendingFiles } = migrateV1(v1);
        const { state } = normalizeState(migrated);
        let failed = 0;
        for (const f of pendingFiles) {
          const ev = state.evidence.find(e => e.file && e.file.blobId === f.blobId);
          try {
            const blob = dataUrlToBlob(f.dataUrl);
            if (!blob) throw new Error('bad data');
            const sha = await sha256Hex(await blob.arrayBuffer());
            await IDB.putBlob(f.blobId, { blob, name: f.name, mime: f.mime || blob.type, size: blob.size });
            if (ev) { ev.file.size = blob.size; ev.file.sha256 = sha; }
          } catch (e) {
            failed++;
            if (ev) { ev.file = null; ev.note += '\nThe original file couldn’t be moved to the new file store. It is still inside your version-1 data, which hasn’t been changed.'; }
          }
        }
        notices.push({ level: 'ok', key: 'migrated', text: `Your data was upgraded to the new case format (${plural(state.cases.length, 'case')}). Nothing was deleted: your original version-1 data is untouched and a snapshot was saved.${failed ? ` ${plural(failed, 'attached file')} couldn’t be moved and ${failed === 1 ? 'remains' : 'remain'} in the version-1 data.` : ''}` });
        return { state, firstRun: false, notices, dirty: true };
      }
    } catch (e) {
      notices.push({ level: 'warn', key: 'v1bad', text: 'Older (version 1) data was found but couldn’t be read. It has been left untouched.' });
    }
  }
  return { state: emptyState(), firstRun: true, notices };
}

function saveState() {
  if (Runtime.saveBlocked) return false;
  S.meta.updatedAt = nowStamp();
  const r = LocalStore.set(APP.lsKey, JSON.stringify(S));
  if (!r.ok) {
    Runtime.saveError = r.reason === 'unavailable' ? '' : r.reason === 'quota'
      ? 'Your browser’s storage is full, so the latest change couldn’t be saved. Export a backup now, then free space (empty the trash or remove old snapshots).'
      : 'The latest change couldn’t be saved. Export a backup to be safe.';
    if (typeof UI !== 'undefined') UI.renderBanners();
    return false;
  }
  if (Runtime.saveError) { Runtime.saveError = ''; if (typeof UI !== 'undefined') UI.renderBanners(); }
  return true;
}

function commit(fn, { caseId = '', render = true } = {}) {
  const out = fn(S);
  if (caseId) { const c = getCase(caseId); if (c) c.updatedAt = nowStamp(); }
  saveState();
  if (render) UI.render();
  return out;
}

function logEvent(caseId, type, text, manual = false) {
  S.events.push({ id: uid('evt'), caseId, at: nowStamp(), type, text: String(text).slice(0, 2000), manual });
}

/* ---------- Trash: nothing is destroyed silently ---------- */
function trashPush(label, items, refs = [], evLinks = []) {
  const t = { id: uid('trash'), at: nowStamp(), label, items, refs, evLinks };
  S.trash.unshift(t);
  S.trash.splice(APP.maxTrash).forEach(old => purgeTrashBlobs(old));
  return t.id;
}
async function purgeTrashBlobs(t) {
  for (const e of T.arr(t.items && t.items.evidence)) {
    if (e && e.file && e.file.blobId && !S.evidence.some(x => x.file && x.file.blobId === e.file.blobId)) {
      try { await IDB.delBlob(e.file.blobId); } catch (err) { /* ignore */ }
    }
  }
}
function deleteRecord(coll, id, label) {
  const rec = findRec(coll, id);
  if (!rec) return null;
  S[coll] = S[coll].filter(r => r.id !== id);
  const refs = [];
  for (const [rc, field, kind] of REFS[coll] || []) {
    S[rc].forEach(r => {
      if (kind === 'arr' && r[field].includes(id)) { r[field] = r[field].filter(x => x !== id); refs.push({ coll: rc, id: r.id, field, kind, value: id }); }
      else if (kind === 'one' && r[field] === id) { r[field] = ''; refs.push({ coll: rc, id: r.id, field, kind, value: id }); }
    });
  }
  const evLinks = [];
  if (LINKABLE[coll]) S.evidence.forEach(e => { const n = e.links.length; e.links = e.links.filter(l => !(l.t === coll && l.id === id)); if (e.links.length !== n) evLinks.push({ evId: e.id, t: coll, id }); });
  if (rec.caseId) logEvent(rec.caseId, 'removed', `Removed: ${label}`);
  return trashPush(label, { [coll]: [rec] }, refs, evLinks);
}
function deleteCaseBundle(caseId) {
  const c = getCase(caseId);
  if (!c) return null;
  const items = { cases: [c] };
  for (const coll of COLLECTIONS) {
    if (['cases', 'links', 'obligations'].includes(coll)) continue;
    const mine = S[coll].filter(r => r.caseId === caseId);
    if (mine.length) { items[coll] = mine; S[coll] = S[coll].filter(r => r.caseId !== caseId); }
  }
  const links = S.links.filter(l => l.from === caseId || l.to === caseId);
  if (links.length) { items.links = links; S.links = S.links.filter(l => !links.includes(l)); }
  S.cases = S.cases.filter(x => x.id !== caseId);
  const refs = [];
  S.tasks.forEach(t => { if (t.caseDep === caseId) { t.caseDep = ''; refs.push({ coll: 'tasks', id: t.id, field: 'caseDep', kind: 'one', value: caseId }); } });
  return trashPush(`Case: ${c.title}`, items, refs, []);
}
function restoreTrash(trashId) {
  const t = S.trash.find(x => x.id === trashId);
  if (!t) return { ok: false, restored: 0, skipped: 0 };
  let restored = 0; let skipped = 0;
  for (const coll of COLLECTIONS) {
    for (const raw of T.arr(t.items[coll])) {
      if (!raw || typeof raw !== 'object') { skipped++; continue; }
      const rec = Normalize[coll](raw);
      const exists = S[coll].some(r => r.id === rec.id);
      const orphan = coll === 'links' ? !(getCase(rec.from) && getCase(rec.to)) : ('caseId' in rec && coll !== 'evidence' && !getCase(rec.caseId));
      if (exists || orphan) { skipped++; continue; }
      if (coll === 'evidence' && rec.caseId && !getCase(rec.caseId)) rec.caseId = '';
      S[coll].push(rec); restored++;
    }
  }
  for (const r of T.arr(t.refs)) {
    const target = r && S[r.coll] ? findRec(r.coll, r.id) : null;
    const valueExists = r && (r.field === 'caseDep' ? getCase(r.value) : Object.keys(REFS).some(c => findRec(c, r.value)));
    if (!target || !valueExists) continue;
    if (r.kind === 'arr') { if (!target[r.field].includes(r.value)) target[r.field].push(r.value); } else if (!target[r.field]) target[r.field] = r.value;
  }
  for (const l of T.arr(t.evLinks)) { const e = l && findRec('evidence', l.evId); if (e && findRec(l.t, l.id) && !e.links.some(x => x.t === l.t && x.id === l.id)) e.links.push({ t: l.t, id: l.id }); }
  S.trash = S.trash.filter(x => x.id !== trashId);
  const caseRec = T.arr(t.items.cases)[0];
  const cid = caseRec ? caseRec.id : (Object.values(t.items).flat().find(r => r && r.caseId) || {}).caseId;
  if (cid && getCase(cid)) logEvent(cid, 'restored', `Restored from trash: ${t.label}`);
  return { ok: true, restored, skipped };
}

/* ---------- Domain operations ---------- */
const Ops = {
  insertBundle(bundle) { for (const [coll, items] of Object.entries(bundle)) S[coll].push(...items.map(r => Normalize[coll](r))); },

  createCase(draft, opts) {
    const { caseId, bundle } = Engine.materialize(draft, opts);
    this.insertBundle(bundle);
    if (S.settings.region && !opts.jurisdiction) getCase(caseId).jurisdiction = S.settings.region;
    return caseId;
  },

  answer(caseId, qid, value) {
    const c = getCase(caseId); const P = pb(c.type);
    const q = P.questions.find(x => x.id === qid); if (!q) return { added: [] };
    const before = Engine.rankPaths(caseId).find(x => x.best);
    c.answers[qid] = value; c.answerSource[qid] = 'you';
    const added = []; const upgraded = [];
    for (const nc of Engine.consequencesFor(c.type, c.answers)) {
      const ex = S.consequences.find(x => x.caseId === caseId && x.key === nc.key);
      if (!ex) { S.consequences.push(Normalize.consequences({ id: uid('csq'), caseId, ...nc })); added.push(nc.text); }
      else {
        if (nc.status === 'established' && ex.status === 'potential') { ex.status = 'established'; upgraded.push(ex.text); }
        if (ex.text === nc.text && ex.severity !== nc.severity) ex.severity = nc.severity;
      }
    }
    const opt = q.opts.find(o => o[0] === value);
    logEvent(caseId, 'understanding', `${q.q} → ${opt ? opt[1] : value}`);
    const after = Engine.rankPaths(caseId).find(x => x.best);
    return { added, upgraded, newBest: after && (!before || before.path.id !== after.path.id) ? after.path.title : '' };
  },

  choosePath(pathId) {
    const p = findRec('paths', pathId); const c = getCase(p.caseId);
    S.paths.forEach(x => { if (x.caseId === p.caseId && x.status === 'chosen' && x.id !== pathId) x.status = 'considering'; });
    p.status = 'chosen';
    let addedTasks = 0;
    if (!S.tasks.some(t => t.pathId === p.id)) {
      const start = Math.max(-1, ...byCase('tasks', p.caseId).map(t => t.order)) + 1;
      const ts = Engine.tasksForPath(p.caseId, p, start, c.type);
      S.tasks.push(...ts.map(Normalize.tasks)); addedTasks = ts.length;
    }
    logEvent(p.caseId, 'path', `Chose an approach: ${p.title}${addedTasks ? ` (${plural(addedTasks, 'step')} added to the plan)` : ''}`);
    return addedTasks;
  },

  setPathStatus(pathId, status, note) {
    const p = findRec('paths', pathId);
    p.status = status; if (note !== undefined) p.note = note;
    logEvent(p.caseId, 'path', `${p.title}: ${PATH_STATUS[status].toLowerCase()}${note ? ` — ${note}` : ''}`);
  },

  toggleTask(taskId) {
    const t = findRec('tasks', taskId);
    t.done = !t.done; t.doneAt = t.done ? nowStamp() : '';
    logEvent(t.caseId, 'task', `${t.done ? 'Done' : 'Reopened'}: ${t.text}`);
    return t.done;
  },

  setResolution(caseId, state, extra = {}) {
    const c = getCase(caseId);
    const prev = c.resolution.state;
    c.resolution.state = state;
    if (extra.note !== undefined) c.resolution.note = extra.note;
    if (extra.condition !== undefined) c.resolution.condition = extra.condition;
    if (extra.monitorUntil !== undefined) c.resolution.monitorUntil = extra.monitorUntil;
    c.resolution.closedAt = RES_STATES[state].closed ? (c.resolution.closedAt && RES_STATES[prev].closed ? c.resolution.closedAt : today()) : '';
    if (RES_STATES[state].closed) c.parkedUntil = '';
    const detail = [extra.condition && `condition: ${extra.condition}`, extra.monitorUntil && `watch until ${fmtDate(extra.monitorUntil)}`, extra.note].filter(Boolean).join(' · ');
    logEvent(caseId, 'resolution', `Status: ${RES_STATES[state].label}${detail ? ' — ' + detail : ''}`);
  },

  receiveWait(waitId, outcome, date) {
    const w = findRec('waits', waitId);
    w.status = 'received'; w.receivedAt = date || today(); w.outcome = outcome || '';
    w.log.push({ id: uid('wl'), date: w.receivedAt, note: `Received${outcome ? ': ' + outcome : ''}` });
    if (w.commitmentId) { const m = findRec('commitments', w.commitmentId); if (m && m.status === 'pending') m.status = 'kept'; }
    logEvent(w.caseId, 'wait', `Received: ${w.what}${outcome ? ' — ' + outcome : ''}`);
  },

  addCommitment(caseId, { party, text, due, commId = '', waitKind = '' }) {
    const m = Normalize.commitments({ id: uid('cmt'), caseId, party, text, due, commId, status: 'pending' });
    S.commitments.push(m);
    if (party === 'them' && waitKind) {
      const c = getCase(caseId);
      const w = Normalize.waits({ id: uid('wait'), caseId, kind: waitKind, what: text, from: c.counterparty, since: today(), expectedBy: due, basis: due ? 'promised' : 'estimate', followUpOn: due ? addDays(due, 1) : offset(7), commitmentId: m.id, log: [{ date: today(), note: `They committed: ${text}${due ? ' by ' + fmtDate(due) : ''}` }] });
      S.waits.push(w); m.waitId = w.id;
    }
    logEvent(caseId, 'commitment', `${party === 'me' ? 'You committed' : 'They committed'}: ${text}${due ? ` (by ${fmtDate(due)})` : ''}`);
    return m;
  },

  async addEvidence(caseId, data, file) {
    const ev = Normalize.evidence({ id: uid('ev'), caseId, ...data, file: null });
    if (file) {
      if (file.size > APP.maxFileBytes) throw new Error(`That file is ${fmtBytes(file.size)}. The limit is ${fmtBytes(APP.maxFileBytes)} — try a smaller export or a photo instead.`);
      const buf = await readFileAs(file, 'buffer');
      const sha = await sha256Hex(buf);
      const blobId = uid('blob');
      const blob = new Blob([buf], { type: file.type || 'application/octet-stream' });
      await IDB.putBlob(blobId, { blob, name: file.name, mime: file.type, size: file.size });
      ev.file = { blobId, name: file.name.slice(0, 200), mime: file.type || '', size: file.size, sha256: sha };
    }
    return ev;
  },
};

/* ---------- Example cases (built with the same engine the person uses) ---------- */
function buildSampleState() {
  const s = emptyState();
  const prevS = S; S = s;
  try {
    const atDay = (n, h = 10, m = 0) => { const d = parseISODate(offset(n)); d.setHours(h, m, 0, 0); return d.toISOString(); };
    const mk = (text, { type, answers = {}, pathKey = '', counterparty = '', reference = '', created = 0 }) => {
      const d = Engine.draft(text);
      if (type) { d.type = type; }
      d.answers = { ...Engine.inferAnswers(d.type, text), ...answers };
      d.answerSource = {}; Object.keys(d.answers).forEach(k => { d.answerSource[k] = k in answers ? 'you' : 'inferred'; });
      const { caseId, bundle } = Engine.materialize(d, { pathKey, counterparty, reference });
      Ops.insertBundle(bundle);
      const c = getCase(caseId); c.sample = true; c.createdAt = offset(created);
      s.events.filter(e => e.caseId === caseId).forEach(e => { e.at = atDay(created, 9); });
      s.deadlines.filter(x => x.caseId === caseId && x.key === 'original').forEach(x => { x.date = addDays(x.date, created); x.status = daysUntil(x.date) < 0 ? 'missed' : 'open'; });
      s.facts = s.facts.filter(f => !(f.caseId === caseId && f.key === 'parsed_when'));
      return caseId;
    };
    const conf = (caseId, key, text, source) => { const f = s.facts.find(x => x.caseId === caseId && x.key === key); if (f) Object.assign(f, { kind: 'confirmed', text, source }); return f; };
    const addFact = (caseId, kind, text, source) => { const f = Normalize.facts({ id: uid('fact'), caseId, kind, text, source }); s.facts.push(f); return f; };
    const doneTasks = (caseId, n, day) => s.tasks.filter(t => t.caseId === caseId).sort(byOrder).slice(0, n).forEach((t, i) => { t.done = true; t.doneAt = atDay(day, 11 + i); s.events.push({ id: uid('evt'), caseId, at: t.doneAt, type: 'task', text: `Done: ${t.text}`, manual: false }); });
    const ev = (caseId, at, type, text) => s.events.push({ id: uid('evt'), caseId, at, type, text, manual: false });
    const evidence = (caseId, o) => { const e = Normalize.evidence({ id: uid('ev'), caseId, ...o }); s.evidence.push(e); ev(caseId, atDay(o.dayOffset ?? 0, 15), 'evidence', `Evidence added: ${e.title}`); return e; };
    const crit = (caseId, idx, status, evIds = [], day = 0) => { const c = s.criteria.filter(x => x.caseId === caseId)[idx]; if (c) Object.assign(c, { status, evidenceIds: evIds, checkedAt: offset(day) }); return c; };
    const doc = (caseId, idx, status, note) => { const d2 = s.docs.filter(x => x.caseId === caseId)[idx]; if (d2) Object.assign(d2, { status, note: note || d2.note }); };

    // 1. Water bill — urgent-ish, in progress
    const water = mk('Forgot to pay my water bill 12 days ago and now there’s an $18 late fee on the account', { type: 'payment', answers: { canPay: 'yes', notice: 'no', dispute: 'no', history: 'first' }, pathKey: 'pay_waive', counterparty: 'Valley Municipal Water', reference: 'WM-482190', created: -2 });
    conf(water, 'account', 'Account number WM-482190', 'Emailed statement');
    conf(water, 'fee', 'A late fee of $18.00 was added on the latest statement', 'Online account, checked yesterday');
    conf(water, 'amount', 'Balance due: $86.40, including the $18.00 late fee', 'Online account, checked yesterday');
    s.facts = s.facts.filter(f => !(f.caseId === water && f.key === 'amount_mentioned'));
    const wdl = s.deadlines.find(x => x.caseId === water && x.key === 'original'); if (wdl) Object.assign(wdl, { certainty: 'confirmed', source: 'Statement' });
    conf(water, 'due', `Original due date was ${fmtDate(wdl ? wdl.date : offset(-12), { year: true })}`, 'Statement');
    s.consequences.filter(x => x.caseId === water && x.key === 'fee').forEach(x => { x.status = 'established'; });
    doneTasks(water, 1, -1);
    const wStmt = evidence(water, { type: 'statement', title: 'Latest water statement (email)', location: 'Email inbox — “Your Valley Municipal Water bill”', date: offset(-3), dayOffset: -1 });
    wStmt.links.push({ t: 'facts', id: s.facts.find(f => f.caseId === water && f.key === 'fee').id });
    s.deadlines.push(Normalize.deadlines({ caseId: water, label: 'Your target: paid and fee request made', date: offset(2), kind: 'self', certainty: 'confirmed', source: 'Set by you' }));
    doc(water, 0, 'have', 'Email statement, saved'); doc(water, 1, 'have', 'WM-482190');

    // 2. Dental — calm, draft call ready
    const dental = mk('Missed my dental cleaning last Thursday and need to rebook without it being awkward', { type: 'appointment', answers: { kind: 'routine', fee: 'unsure', urgent: 'no' }, pathKey: 'rebook', counterparty: 'Cedar Grove Dental', created: -4 });
    doneTasks(dental, 1, -3);
    doc(dental, 2, 'have', 'Tuesday or Thursday mornings before 10:30');
    { const o = { ...Comms.defaults(dental, {}), channel: 'call', purpose: 'reschedule', stance: 'apologize', tone: 'warm', proposal: 'Tuesday or Thursday mornings before 10:30' }; const d2 = Comms.compose(dental, o); const plan = Comms.callPlan(dental, o);
      s.comms.push(Normalize.comms({ caseId: dental, ...o, status: 'draft', subject: d2.subject, body: d2.body, checklist: plan.checklist.map(t => ({ text: t })), questions: plan.questions.map(t => ({ text: t })), createdAt: atDay(-3, 12) })); }

    // 3. Registration — expired, still driving (high consequence)
    const reg = mk('Car registration expired last month and I’m still driving it', { type: 'renewal', answers: { kind: 'vehicle', using: 'yes', docs: 'some' }, pathKey: 'renew_now', counterparty: 'State Department of Motor Vehicles', created: -3 });
    const rdl = s.deadlines.find(x => x.caseId === reg && x.key === 'original'); if (rdl) Object.assign(rdl, { date: offset(-23), certainty: 'confirmed', source: 'Registration card', status: 'missed' });
    conf(reg, 'expiry', `Registration expired on ${fmtDate(offset(-23), { year: true })}`, 'Registration card in the glovebox');
    conf(reg, 'reqs', 'Renewal after expiry needs an emissions certificate, proof of insurance and the renewal PIN', 'Official DMV renewal page (checked)');
    doneTasks(reg, 2, -2);
    const emis = evidence(reg, { type: 'confirmation', title: 'Emissions test certificate', reference: 'EM-77412', date: offset(-2), location: 'Paper copy in the glovebox; photo on phone', dayOffset: -2 });
    doc(reg, 1, 'have', 'Insurance card (PDF in phone wallet) and emissions certificate'); s.docs.find(d2 => d2.caseId === reg && d2.status === 'have').evidenceId = emis.id;
    addFact(reg, 'assumption', 'The penalty is probably small if I renew this week', 'My guess — not checked');

    // 4. Parking ticket — caused by the registration; not yet decided
    const ticket = mk('Got a parking ticket for expired tags a few days ago', { type: 'penalty', answers: { fair: 'unsure', deadline: 'no', afford: 'yes' }, counterparty: 'City Parking Services', reference: 'PC-55120', created: -1 });
    s.deadlines.push(Normalize.deadlines({ caseId: ticket, label: 'Pay or contest by', date: offset(6), kind: 'external', certainty: 'confirmed', source: 'Printed on the citation' }));
    conf(ticket, 'ref', 'Citation number PC-55120', 'The ticket');
    s.tasks.push(Normalize.tasks({ caseId: ticket, text: 'Get proof of the renewed registration (may matter if contesting)', caseDep: reg, effort: 5, order: 0 }));
    s.links.push(Normalize.links({ from: ticket, to: reg, type: 'caused_by', note: 'Ticketed for expired tags' }));

    // 5. Airline claim — waiting, on track
    const air = mk('Airline baggage delay reimbursement claim for $142.40 is still waiting for a decision', { type: 'owed', answers: { promised: 'policy', asked: 'none', written: 'yes' }, pathKey: 'wait', counterparty: 'Pacific Sky Airlines', reference: 'PSA-CLM-88421', created: -16 });
    doneTasks(air, 1, -7);
    conf(air, 'what', 'Reimbursement of $142.40 for toiletries and clothing (receipts submitted)', 'Claim submission confirmation');
    conf(air, 'promise', 'Automated email: review takes 14–21 days', 'Email from the claims team');
    s.facts = s.facts.filter(f => !(f.caseId === air && f.key === 'amount_mentioned'));
    s.comms.push(Normalize.comms({ caseId: air, channel: 'message', purpose: 'request', stance: 'neutral', status: 'sent', date: offset(-16), subject: 'Baggage delay reimbursement claim', body: 'Submitted through the airline’s baggage claims portal with receipts totalling $142.40.', reference: 'PSA-CLM-88421', edited: true }));
    s.waits.push(Normalize.waits({ caseId: air, kind: 'decision', what: 'Decision and reimbursement of $142.40', from: 'Pacific Sky Airlines', since: offset(-16), expectedBy: offset(5), basis: 'policy', followUpOn: offset(6), reference: 'PSA-CLM-88421', log: [{ date: offset(-16), note: 'Claim submitted with receipts via the online portal.' }, { date: offset(-7), note: 'Automated email: claim is in review (estimated 14–21 days).' }] }));
    evidence(air, { type: 'receipt', title: 'Receipts submitted with the claim', note: 'Toiletries and clothing, $142.40 total', location: 'Photos album “Trip receipts”', date: offset(-16), dayOffset: -16 });

    // 6. Security deposit — a promise was missed
    const dep = mk('My former landlord still hasn’t returned my security deposit', { type: 'owed', answers: { promised: 'promised', asked: 'once', written: 'yes' }, pathKey: 'follow', counterparty: 'Oakridge Property Management', reference: 'Unit 4B', created: -24 });
    doneTasks(dep, 3, -10);
    conf(dep, 'when', `Moved out and returned keys on ${fmtDate(offset(-24), { year: true })}`, 'Move-out email');
    const depMail = Normalize.comms({ caseId: dep, channel: 'email', purpose: 'follow_up', stance: 'neutral', tone: 'neutral', status: 'sent', date: offset(-10), subject: 'Follow-up — security deposit for Unit 4B', body: 'Hello,\n\nI’m following up on the security deposit for Unit 4B. I returned the keys and gave my forwarding address on move-out. Could you let me know when the deposit will be sent?\n\nKind regards', edited: true });
    s.comms.push(depMail);
    s.comms.push(Normalize.comms({ caseId: dep, channel: 'email', direction: 'in', purpose: 'follow_up', stance: 'neutral', status: 'received', date: offset(-9), subject: 'Re: Follow-up — security deposit for Unit 4B', outcome: `Property manager replied that the deposit check would be mailed by ${fmtDate(offset(-3), { year: true })}.`, contact: 'Dana (property manager)', edited: true }));
    const depPromise = Normalize.commitments({ caseId: dep, party: 'them', text: 'mail the deposit check to my forwarding address', due: offset(-3), commId: depMail.id, status: 'pending', createdAt: atDay(-9) });
    s.commitments.push(depPromise);
    const depWait = Normalize.waits({ caseId: dep, kind: 'payment', what: 'Security deposit check', from: 'Oakridge Property Management', since: offset(-24), expectedBy: offset(-3), basis: 'promised', followUpOn: offset(-2), reference: 'Unit 4B', commitmentId: depPromise.id, log: [{ date: offset(-10), note: 'Sent a follow-up email.' }, { date: offset(-9), note: `They replied: check will be mailed by ${fmtDate(offset(-3))}.` }] });
    s.waits.push(depWait); depPromise.waitId = depWait.id;
    ev(dep, atDay(-10, 18), 'comm', 'Sent: Follow-up — security deposit for Unit 4B (email)');
    ev(dep, atDay(-9, 13), 'commitment', `They committed: mail the deposit check (by ${fmtDate(offset(-3))})`);
    evidence(dep, { type: 'email', title: 'Landlord’s reply promising the check', note: `“Check will be mailed by ${fmtDate(offset(-3))}.”`, location: 'Email inbox, thread “Security deposit for Unit 4B”', date: offset(-9), dayOffset: -9, links: [{ t: 'commitments', id: depPromise.id }] });

    // 7. FSA receipts — assumption vs confirmed
    const fsa = mk('Need to submit FSA pharmacy receipts — the claim deadline passed 5 days ago but there might be a grace period', { type: 'application', answers: { late: 'passed', grace: 'yes', reason: 'no' }, pathKey: 'submit', counterparty: 'Benefits administrator', created: -5 });
    s.deadlines.push(Normalize.deadlines({ caseId: fsa, label: 'Possible grace-period cutoff', date: offset(9), kind: 'external', certainty: 'reported', source: 'Remembered from the plan summary — not checked' }));
    addFact(fsa, 'assumption', `The plan has a grace period that runs until ${fmtDate(offset(9))}`, 'Remembered from the plan summary — not checked');
    conf(fsa, 'needed', 'Itemized pharmacy receipts (3) showing date, item and amount', 'Benefits portal help page');

    // 8. Credit card late fee — verified closed
    const cc = mk('Credit card payment was 3 days late and I got a $29 late fee', { type: 'payment', answers: { canPay: 'yes', notice: 'no', dispute: 'no', history: 'first' }, pathKey: 'pay_waive', counterparty: 'Horizon Bank Card Services', reference: 'card ending 4417', created: -18 });
    const ccdl = s.deadlines.find(x => x.caseId === cc && x.key === 'original'); if (ccdl) Object.assign(ccdl, { date: offset(-21), status: 'met', certainty: 'confirmed', source: 'Statement' });
    s.facts.filter(f => f.caseId === cc && f.kind === 'missing').forEach(f => { f.kind = 'confirmed'; f.source = 'Statement / call'; });
    s.facts = s.facts.filter(f => !(f.caseId === cc && f.key === 'amount_mentioned'));
    doneTasks(cc, 4, -14);
    const ccCall = Normalize.comms({ caseId: cc, channel: 'call', purpose: 'request', stance: 'acknowledge', status: 'done', date: offset(-14), subject: 'Call — fee reversal request', body: 'Asked for a one-time courtesy reversal of the $29 late fee after paying in full.', contact: 'Jordan M.', reference: 'HB-992041-REV', outcome: 'Reversed the $29 fee immediately. Confirmed the payment won’t be reported as late.', edited: true });
    s.comms.push(ccCall);
    const ccEv = evidence(cc, { type: 'confirmation', title: 'Statement credit confirmation email', reference: 'HB-992041-REV', note: '$29.00 late fee credited back.', location: 'Email folder “Receipts & Confirmations”', date: offset(-14), dayOffset: -14, links: [{ t: 'comms', id: ccCall.id }] });
    const ccStmt = evidence(cc, { type: 'statement', title: 'Following statement showing the credit', note: 'Shows −$29.00 “Late fee reversal”.', date: offset(-6), dayOffset: -6 });
    crit(cc, 0, 'met', [ccEv.id], -14); crit(cc, 1, 'met', [ccEv.id, ccStmt.id], -6); crit(cc, 2, 'met', [ccStmt.id], -6);
    s.paths.filter(p => p.caseId === cc && p.key === 'pay_waive').forEach(p => { p.status = 'worked'; p.note = 'Fee reversed on the first call.'; });
    s.consequences.filter(x => x.caseId === cc).forEach(x => { x.status = 'avoided'; });
    Object.assign(getCase(cc).resolution, { state: 'verified', closedAt: offset(-6), note: 'Fee reversed and confirmed on the next statement.' });
    ev(cc, atDay(-14, 14), 'comm', 'Call with Jordan M. — fee reversed (ref HB-992041-REV)');
    ev(cc, atDay(-6, 9), 'resolution', 'Status: Verified closed — confirmed on the next statement');

    // 9. Coat return — verified closed
    const coat = mk('Need to return a winter coat that is 9 days past the 30-day return window, tags still on', { type: 'return', answers: { condition: 'unused', days: 'few', credit: 'yes' }, pathKey: 'credit', counterparty: 'Northfield Apparel Co.', reference: 'NFA-31098', created: -12 });
    s.facts.filter(f => f.caseId === coat && f.kind === 'missing').forEach(f => { f.kind = 'confirmed'; f.source = 'Order email / item'; });
    doneTasks(coat, 2, -9);
    const coatEv = evidence(coat, { type: 'receipt', title: 'UPS drop-off receipt', reference: '1Z999AA10123456784', date: offset(-10), dayOffset: -10 });
    const coatCredit = evidence(coat, { type: 'email', title: 'Store credit issued ($168)', reference: 'NFA-RET-31098', location: 'Apple Notes → “Gift cards”', date: offset(-8), dayOffset: -8 });
    crit(coat, 0, 'met', [coatEv.id], -10); crit(coat, 1, 'met', [coatCredit.id], -8);
    s.paths.filter(p => p.caseId === coat && p.key === 'credit').forEach(p => { p.status = 'worked'; p.note = 'Exception granted as store credit.'; });
    Object.assign(getCase(coat).resolution, { state: 'verified', closedAt: offset(-8), note: 'Full store credit issued.' });
    ev(coat, atDay(-8, 16), 'resolution', 'Status: Verified closed — store credit received');

    s.obligations.push(Normalize.obligations({ title: 'Renew vehicle registration', cadence: 'yearly', next: addDays(offset(-23), 365), remindDays: 30, caseType: 'renewal' }));
    s.meta.sample = true;
  } finally { S = prevS; }
  return normalizeState(s).state;
}
