/* ---------------- Schema v2 ----------------
   Normalized collections. Every child record carries caseId so cross-case
   views (Waiting, Dates, Evidence) are simple filters and deleting a case
   can move its whole bundle to the trash intact. */

const FACT_KINDS = {
  confirmed: { label: 'Confirmed', desc: 'Checked against a document, a statement, or the organization itself.' },
  assumption: { label: 'Assumption', desc: 'Something you believe but haven’t checked yet.' },
  unverified: { label: 'Unverified', desc: 'Remembered, heard or inferred — not yet checked.' },
  missing: { label: 'Missing', desc: 'Needed to choose the right path, but not known yet.' },
};
const CONS_STATUS = { potential: 'Could happen', established: 'Has happened', avoided: 'Avoided' };
const REVERSIBILITY = { reversible: 'Reversible', hard: 'Hard to undo', irreversible: 'Can’t be undone', unknown: 'Unknown' };
const CERTAINTY = { confirmed: 'Confirmed', reported: 'Not checked', estimated: 'Estimate' };
const DL_STATUS = { open: 'Open', met: 'Met', missed: 'Passed', void: 'No longer applies' };
const APPROACHES = {
  direct: 'Resolve directly', negotiate: 'Negotiate', exception: 'Ask for an exception', dispute: 'Dispute',
  arrangement: 'Arrangement', appeal: 'Appeal', escalate: 'Escalate', alternative: 'Alternative',
  accept: 'Accept and close', advice: 'Get advice',
};
const PATH_STATUS = { considering: 'Considering', chosen: 'Chosen', worked: 'Worked', didnt_work: 'Didn’t work', ruled_out: 'Ruled out' };
const WAIT_KINDS = {
  response: { label: 'Response', long: 'Waiting for a response' },
  action: { label: 'Action', long: 'Waiting for them to do something' },
  document: { label: 'Document', long: 'Waiting for a document' },
  decision: { label: 'Decision', long: 'Waiting for a decision' },
  payment: { label: 'Payment', long: 'Waiting for a payment or refund' },
};
const WAIT_STATUS = { waiting: 'Waiting', received: 'Received', escalated: 'Escalated', dropped: 'Stopped waiting' };
const COMMIT_STATUS = { pending: 'Pending', kept: 'Kept', missed: 'Missed', released: 'No longer needed' };
const RES_STATES = {
  open: { label: 'Not resolved yet', tone: '', closed: false },
  partial: { label: 'Partly resolved', tone: 'amber', closed: false },
  conditional: { label: 'Resolved, on a condition', tone: 'amber', closed: false },
  disputed: { label: 'Disputed', tone: 'coral', closed: false },
  monitoring: { label: 'Monitoring', tone: 'blue', closed: false },
  verified: { label: 'Verified closed', tone: 'sage', closed: true },
  closed_unverified: { label: 'Closed, not verified', tone: '', closed: true },
  withdrawn: { label: 'Let go', tone: '', closed: true },
};
const CRIT_STATUS = { pending: 'Not yet', met: 'Met', not_met: 'Not met', na: 'Doesn’t apply' };
const EVIDENCE_TYPES = {
  confirmation: 'Confirmation', receipt: 'Receipt', statement: 'Statement', letter: 'Letter or notice', email: 'Email',
  screenshot: 'Screenshot', photo: 'Photo', agreement: 'Agreement', reference: 'Reference number', call_note: 'Call record', other: 'Other',
};
const DOC_STATUS = { needed: 'Needed', have: 'Have it', sent: 'Sent' };
const LINK_TYPES = {
  blocks: { fwd: 'Blocks', back: 'Blocked by' },
  affects: { fwd: 'Affects', back: 'Affected by' },
  caused_by: { fwd: 'Caused by', back: 'Led to' },
  related: { fwd: 'Related to', back: 'Related to' },
};
const CHANNELS = { call: 'Call', email: 'Email', letter: 'Letter', message: 'Message / portal', in_person: 'In person' };
const PURPOSES = {
  request: 'Ask for something (waiver, exception, help)',
  arrangement: 'Propose a payment arrangement',
  reschedule: 'Rebook or reschedule',
  inquiry: 'Ask a question / find out options',
  update: 'Let them know what you’ve done',
  follow_up: 'Follow up on something pending',
  negotiate: 'Negotiate terms',
  dispute: 'Dispute something',
  complaint: 'Make a formal complaint',
  escalate: 'Escalate',
};
const STANCES = {
  neutral: { label: 'Facts only', desc: 'States what happened and what you need. No apology, no fault.' },
  acknowledge: { label: 'Acknowledge', desc: 'Recognises the issue without saying whose fault it was.' },
  apologize: { label: 'Apologize', desc: 'Expresses regret. Often helps a goodwill request, but can be read as accepting fault.' },
  accept: { label: 'Take responsibility', desc: 'Explicitly accepts fault. Use only if you’re sure — it can weaken a later dispute.' },
  dispute: { label: 'Dispute', desc: 'Says you believe something is wrong. No apology; sticks to facts and evidence.' },
  negotiate: { label: 'Negotiate', desc: 'Proposes terms. Focuses on a workable outcome rather than fault.' },
};
const TONES = { warm: 'Warm', neutral: 'Neutral', firm: 'Firm' };
const COMM_STATUS = { draft: 'Draft', sent: 'Sent', done: 'Completed', received: 'Received' };
const COLLECTIONS = ['cases', 'facts', 'consequences', 'deadlines', 'paths', 'tasks', 'comms', 'commitments', 'waits', 'evidence', 'docs', 'criteria', 'events', 'links', 'obligations'];

function emptyState() {
  const s = {
    schema: APP.schema,
    meta: { createdAt: nowStamp(), updatedAt: nowStamp(), lastExportAt: '', migratedFrom: null, lastSnapshotDay: '' },
    settings: { region: '', focusMinutes: 15 },
    dismissed: [],
    trash: [],
  };
  COLLECTIONS.forEach(c => { s[c] = []; });
  return s;
}

/* ---- primitive coercions ---- */
const T = {
  str: (v, max = 4000) => (v === null || v === undefined ? '' : String(v)).slice(0, max),
  id: v => (typeof v === 'string' || typeof v === 'number') && String(v).trim() ? String(v).trim().slice(0, 80) : '',
  one: (v, obj, d) => (Object.prototype.hasOwnProperty.call(obj, v) ? v : d),
  date: v => (isISODate(v) ? v : ''),
  stamp: (v, d = '') => (isStamp(v) ? new Date(v).toISOString() : d),
  bool: v => v === true || v === 'true' || v === 1,
  num: (v, d = 0, min = -1e9, max = 1e9) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d; },
  arr: v => (Array.isArray(v) ? v : []),
  ids: v => (Array.isArray(v) ? [...new Set(v.map(T.id).filter(Boolean))] : []),
  map: v => { const o = {}; if (v && typeof v === 'object' && !Array.isArray(v)) for (const k of Object.keys(v).slice(0, 50)) o[T.str(k, 40)] = T.str(v[k], 200); return o; },
};

const Normalize = {
  cases: c => ({
    id: T.id(c.id) || uid('case'),
    title: T.str(c.title, 200).trim() || 'Untitled case',
    type: T.one(c.type, PLAYBOOKS, 'general'),
    summary: T.str(c.summary, 6000),
    counterparty: T.str(c.counterparty, 200),
    reference: T.str(c.reference, 200),
    jurisdiction: T.str(c.jurisdiction, 120),
    createdAt: T.date(c.createdAt) || today(),
    updatedAt: T.stamp(c.updatedAt, nowStamp()),
    answers: T.map(c.answers),
    answerSource: T.map(c.answerSource),
    resolution: (r => ({
      state: T.one(r.state, RES_STATES, 'open'),
      note: T.str(r.note, 4000),
      condition: T.str(r.condition, 1000),
      monitorUntil: T.date(r.monitorUntil),
      closedAt: T.date(r.closedAt),
    }))(c.resolution && typeof c.resolution === 'object' ? c.resolution : {}),
    parkedUntil: T.date(c.parkedUntil),
    parkNote: T.str(c.parkNote, 1000),
    sample: T.bool(c.sample),
  }),
  facts: f => ({
    id: T.id(f.id) || uid('fact'), caseId: T.id(f.caseId), text: T.str(f.text, 1000).trim(),
    kind: T.one(f.kind, FACT_KINDS, 'unverified'), source: T.str(f.source, 300), why: T.str(f.why, 400), key: T.str(f.key, 40),
    evidenceIds: T.ids(f.evidenceIds), createdAt: T.stamp(f.createdAt, nowStamp()), updatedAt: T.stamp(f.updatedAt, nowStamp()),
  }),
  consequences: x => ({
    id: T.id(x.id) || uid('csq'), caseId: T.id(x.caseId), text: T.str(x.text, 400).trim(),
    status: T.one(x.status, CONS_STATUS, 'potential'), reversibility: T.one(x.reversibility, REVERSIBILITY, 'unknown'),
    severity: T.num(x.severity, 1, 1, 3), note: T.str(x.note, 600), key: T.str(x.key, 40), general: T.bool(x.general),
  }),
  deadlines: d => ({
    id: T.id(d.id) || uid('dl'), caseId: T.id(d.caseId), label: T.str(d.label, 200).trim() || 'Deadline', date: T.date(d.date),
    kind: T.one(d.kind, { external: 1, self: 1 }, 'external'), certainty: T.one(d.certainty, CERTAINTY, 'reported'),
    source: T.str(d.source, 300), status: T.one(d.status, DL_STATUS, 'open'), note: T.str(d.note, 600), key: T.str(d.key, 40),
  }),
  paths: p => ({
    id: T.id(p.id) || uid('path'), caseId: T.id(p.caseId), key: T.str(p.key, 40), approach: T.one(p.approach, APPROACHES, 'direct'),
    title: T.str(p.title, 200).trim() || 'Approach', why: T.str(p.why, 1000), downsides: T.str(p.downsides, 1000),
    prerequisites: T.arr(p.prerequisites).map(x => T.str(x, 300)).filter(Boolean).slice(0, 12),
    uncertainties: T.arr(p.uncertainties).map(x => T.str(x, 300)).filter(Boolean).slice(0, 12),
    outcome: T.str(p.outcome, 600), status: T.one(p.status, PATH_STATUS, 'considering'), note: T.str(p.note, 1000), custom: T.bool(p.custom),
  }),
  tasks: t => ({
    id: T.id(t.id) || uid('task'), caseId: T.id(t.caseId), text: T.str(t.text, 500).trim() || 'Untitled step',
    done: T.bool(t.done), doneAt: T.stamp(t.doneAt), pathId: T.id(t.pathId), dependsOn: T.ids(t.dependsOn),
    waitDep: T.id(t.waitDep), caseDep: T.id(t.caseDep), effort: T.num(t.effort, 0, 0, 600), order: T.num(t.order, 0),
    note: T.str(t.note, 1000), createdAt: T.stamp(t.createdAt, nowStamp()),
  }),
  comms: m => ({
    id: T.id(m.id) || uid('comm'), caseId: T.id(m.caseId), channel: T.one(m.channel, CHANNELS, 'email'),
    direction: T.one(m.direction, { out: 1, in: 1 }, 'out'), purpose: T.one(m.purpose, PURPOSES, 'request'),
    stance: T.one(m.stance, STANCES, 'acknowledge'), tone: T.one(m.tone, TONES, 'warm'), status: T.one(m.status, COMM_STATUS, 'draft'),
    date: T.date(m.date), subject: T.str(m.subject, 300), body: T.str(m.body, 20000), contact: T.str(m.contact, 200),
    phone: T.str(m.phone, 80), to: T.str(m.to, 200), reference: T.str(m.reference, 200), outcome: T.str(m.outcome, 6000),
    proposal: T.str(m.proposal, 600), replyBy: T.date(m.replyBy), pathId: T.id(m.pathId),
    checklist: T.arr(m.checklist).map(i => ({ id: T.id(i && i.id) || uid('ck'), text: T.str(i && i.text, 300), done: T.bool(i && i.done) })).filter(i => i.text).slice(0, 40),
    questions: T.arr(m.questions).map(i => ({ id: T.id(i && i.id) || uid('q'), text: T.str(i && i.text, 300), answer: T.str(i && i.answer, 1000) })).filter(i => i.text).slice(0, 40),
    edited: T.bool(m.edited), createdAt: T.stamp(m.createdAt, nowStamp()),
  }),
  commitments: c => ({
    id: T.id(c.id) || uid('cmt'), caseId: T.id(c.caseId), party: T.one(c.party, { them: 1, me: 1 }, 'them'),
    text: T.str(c.text, 500).trim() || 'Commitment', due: T.date(c.due), status: T.one(c.status, COMMIT_STATUS, 'pending'),
    commId: T.id(c.commId), waitId: T.id(c.waitId), note: T.str(c.note, 600), createdAt: T.stamp(c.createdAt, nowStamp()),
  }),
  waits: w => ({
    id: T.id(w.id) || uid('wait'), caseId: T.id(w.caseId), kind: T.one(w.kind, WAIT_KINDS, 'response'),
    what: T.str(w.what, 300).trim() || 'A reply', from: T.str(w.from, 200), since: T.date(w.since) || today(),
    expectedBy: T.date(w.expectedBy), basis: T.one(w.basis, { promised: 1, policy: 1, estimate: 1 }, 'estimate'),
    followUpOn: T.date(w.followUpOn), status: T.one(w.status, WAIT_STATUS, 'waiting'), reference: T.str(w.reference, 200),
    commitmentId: T.id(w.commitmentId), receivedAt: T.date(w.receivedAt), outcome: T.str(w.outcome, 2000),
    log: T.arr(w.log).map(l => ({ id: T.id(l && l.id) || uid('wl'), date: T.date(l && l.date) || today(), note: T.str(l && l.note, 1000) })).filter(l => l.note).slice(0, 200),
  }),
  evidence: e => ({
    id: T.id(e.id) || uid('ev'), caseId: T.id(e.caseId), type: T.one(e.type, EVIDENCE_TYPES, 'other'),
    title: T.str(e.title, 300).trim() || 'Evidence', reference: T.str(e.reference, 200), note: T.str(e.note, 4000),
    date: T.date(e.date), location: T.str(e.location, 400),
    file: e.file && typeof e.file === 'object' && T.id(e.file.blobId) ? {
      blobId: T.id(e.file.blobId), name: T.str(e.file.name, 200) || 'file', mime: T.str(e.file.mime, 100), size: T.num(e.file.size, 0, 0), sha256: T.str(e.file.sha256, 64).replace(/[^a-f0-9]/g, ''),
    } : null,
    links: T.arr(e.links).map(l => ({ t: T.one(l && l.t, LINKABLE, ''), id: T.id(l && l.id) })).filter(l => l.t && l.id).slice(0, 60),
    createdAt: T.stamp(e.createdAt, nowStamp()),
  }),
  docs: d => ({ id: T.id(d.id) || uid('doc'), caseId: T.id(d.caseId), name: T.str(d.name, 300).trim() || 'Document', status: T.one(d.status, DOC_STATUS, 'needed'), note: T.str(d.note, 600), evidenceId: T.id(d.evidenceId) }),
  criteria: c => ({ id: T.id(c.id) || uid('crit'), caseId: T.id(c.caseId), text: T.str(c.text, 400).trim() || 'Criterion', status: T.one(c.status, CRIT_STATUS, 'pending'), evidenceIds: T.ids(c.evidenceIds), note: T.str(c.note, 1000), checkedAt: T.date(c.checkedAt), key: T.str(c.key, 40) }),
  events: v => ({ id: T.id(v.id) || uid('evt'), caseId: T.id(v.caseId), at: T.stamp(v.at, nowStamp()), type: T.str(v.type, 30) || 'note', text: T.str(v.text, 2000), manual: T.bool(v.manual) }),
  links: l => ({ id: T.id(l.id) || uid('lnk'), from: T.id(l.from), to: T.id(l.to), type: T.one(l.type, LINK_TYPES, 'related'), note: T.str(l.note, 400) }),
  obligations: o => ({ id: T.id(o.id) || uid('obl'), title: T.str(o.title, 200).trim() || 'Recurring obligation', cadence: T.one(o.cadence, CADENCES, 'yearly'), next: T.date(o.next) || today(), remindDays: T.num(o.remindDays, 7, 0, 90), caseType: T.str(o.caseType, 30), note: T.str(o.note, 600), createdAt: T.stamp(o.createdAt, nowStamp()) }),
};
const LINKABLE = { comms: 1, commitments: 1, tasks: 1, facts: 1, criteria: 1, waits: 1, deadlines: 1 };
const CADENCES = { monthly: 'Monthly', quarterly: 'Every 3 months', yearly: 'Yearly', once: 'Once' };

/* Where each collection's ids are referenced from (used for safe deletes and integrity checks). */
const REFS = {
  tasks: [['tasks', 'dependsOn', 'arr']],
  waits: [['tasks', 'waitDep', 'one'], ['commitments', 'waitId', 'one']],
  commitments: [['waits', 'commitmentId', 'one']],
  evidence: [['facts', 'evidenceIds', 'arr'], ['criteria', 'evidenceIds', 'arr'], ['docs', 'evidenceId', 'one']],
  comms: [['commitments', 'commId', 'one']],
  cases: [['tasks', 'caseDep', 'one']],
  paths: [['tasks', 'pathId', 'one'], ['comms', 'pathId', 'one']],
};

/* Validate + repair a whole state object. Never throws on bad records; drops
   what can't be repaired and reports it so imports can tell the person. */
function normalizeState(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Not a data object');
  const s = emptyState();
  const report = { dropped: 0, repaired: 0, details: [] };
  const m = raw.meta && typeof raw.meta === 'object' ? raw.meta : {};
  s.meta = { createdAt: T.stamp(m.createdAt, nowStamp()), updatedAt: T.stamp(m.updatedAt, nowStamp()), lastExportAt: T.stamp(m.lastExportAt), migratedFrom: m.migratedFrom === 1 ? 1 : null, lastSnapshotDay: T.date(m.lastSnapshotDay) };
  const st = raw.settings && typeof raw.settings === 'object' ? raw.settings : {};
  s.settings = { region: T.str(st.region, 120), focusMinutes: T.num(st.focusMinutes, 15, 5, 120) };
  s.dismissed = T.arr(raw.dismissed).map(x => T.str(x, 80)).filter(Boolean).slice(0, 500);

  for (const c of COLLECTIONS) {
    const seen = new Set();
    for (const rec of T.arr(raw[c])) {
      if (!rec || typeof rec !== 'object') { report.dropped++; continue; }
      let n;
      try { n = Normalize[c](rec); } catch (e) { report.dropped++; continue; }
      if (seen.has(n.id)) { n.id = uid(c.slice(0, 4)); report.repaired++; }
      seen.add(n.id);
      s[c].push(n);
    }
  }
  // Referential integrity
  const caseIds = new Set(s.cases.map(c => c.id));
  for (const c of COLLECTIONS) {
    if (c === 'cases' || c === 'links' || c === 'obligations') continue;
    const before = s[c].length;
    s[c] = s[c].filter(r => (c === 'evidence' ? (!r.caseId || caseIds.has(r.caseId)) : caseIds.has(r.caseId)));
    if (c === 'evidence') s.evidence.forEach(e => { if (e.caseId && !caseIds.has(e.caseId)) e.caseId = ''; });
    const lost = before - s[c].length;
    if (lost) { report.dropped += lost; report.details.push(`${lost} ${c} pointed to a case that doesn’t exist`); }
  }
  const lb = s.links.length;
  s.links = s.links.filter(l => l.from !== l.to && caseIds.has(l.from) && caseIds.has(l.to));
  if (s.links.length !== lb) report.dropped += lb - s.links.length;
  // Dangling references are cleared, not fatal
  const idsOf = c => new Set(s[c].map(r => r.id));
  const sets = {}; Object.keys(REFS).forEach(c => { sets[c] = idsOf(c); });
  for (const [target, specs] of Object.entries(REFS)) {
    for (const [coll, field, kind] of specs) {
      for (const r of s[coll]) {
        if (kind === 'arr') { const keep = r[field].filter(id => sets[target].has(id)); if (keep.length !== r[field].length) { r[field] = keep; report.repaired++; } }
        else if (r[field] && !sets[target].has(r[field])) { r[field] = ''; report.repaired++; }
      }
    }
  }
  const linkTargets = {}; Object.keys(LINKABLE).forEach(c => { linkTargets[c] = idsOf(c); });
  s.evidence.forEach(e => { e.links = e.links.filter(l => linkTargets[l.t] && linkTargets[l.t].has(l.id)); });
  s.tasks.forEach(t => { t.dependsOn = t.dependsOn.filter(id => id !== t.id); });
  // Evidence links are two-way: keep evidence.links and facts/criteria.evidenceIds in agreement.
  for (const coll of ['facts', 'criteria']) {
    const recs = new Map(s[coll].map(r => [r.id, r]));
    const evs = new Map(s.evidence.map(e => [e.id, e]));
    s[coll].forEach(r => r.evidenceIds.forEach(eid => { const e = evs.get(eid); if (e && !e.links.some(l => l.t === coll && l.id === r.id)) e.links.push({ t: coll, id: r.id }); }));
    s.evidence.forEach(e => e.links.filter(l => l.t === coll).forEach(l => { const r = recs.get(l.id); if (r && !r.evidenceIds.includes(e.id)) r.evidenceIds.push(e.id); }));
  }
  // Trash is kept as opaque bundles; each item is re-normalized on restore.
  s.trash = T.arr(raw.trash).filter(t => t && typeof t === 'object' && t.items && typeof t.items === 'object').slice(0, APP.maxTrash).map(t => ({
    id: T.id(t.id) || uid('trash'), at: T.stamp(t.at, nowStamp()), label: T.str(t.label, 300), items: t.items, refs: T.arr(t.refs), evLinks: T.arr(t.evLinks),
  }));
  return { state: s, report };
}

/* ---------------- Migration: v1 → v2 ----------------
   v1 stored situations/callPreps/documents/waitingItems/standaloneDeadlines/proofs.
   Nothing is discarded: every v1 field maps somewhere, and the original v1
   JSON is left untouched in localStorage and snapshotted before migrating. */
function looksLikeV1(o) { return o && typeof o === 'object' && Array.isArray(o.situations) && !('schema' in o); }

function migrateV1(v1) {
  const s = emptyState();
  s.meta.migratedFrom = 1;
  const pendingFiles = [];
  const typeMap = { 'Missed Payment': 'payment', Appointment: 'appointment', Renewal: 'renewal', 'Return / Refund': 'return', Application: 'application', Correspondence: 'notice', Other: 'general' };
  const caseIdBySit = {};
  const caseIdByWait = {};
  const ev = (caseId, at, type, text) => s.events.push({ id: uid('evt'), caseId, at: at || nowStamp(), type, text, manual: false });
  const atOf = d => (isISODate(d) ? new Date(parseISODate(d).getTime() + 12 * 3600e3).toISOString() : nowStamp());
  const newCase = (o) => { const c = Object.assign({ id: uid('case'), title: 'Untitled case', type: 'general', summary: '', counterparty: '', reference: '', jurisdiction: '', createdAt: today(), answers: {}, answerSource: {}, resolution: { state: 'open', note: '', condition: '', monitorUntil: '', closedAt: '' }, parkedUntil: '', parkNote: '' }, o); s.cases.push(c); return c; };

  T.arr(v1.situations).forEach(si => {
    if (!si || typeof si !== 'object') return;
    const closed = si.status === 'completed';
    const c = newCase({
      id: T.id(si.id) || uid('case'),
      title: T.str(si.title, 200) || 'Untitled case',
      type: typeMap[si.category] || 'general',
      summary: T.str(si.originalPrompt || si.summary, 6000),
      createdAt: T.date(si.createdAt) || today(),
    });
    caseIdBySit[si.id] = c.id;
    ev(c.id, atOf(c.createdAt), 'created', 'Case created (in the previous version of the app)');
    if (si.summary && si.summary !== si.originalPrompt) ev(c.id, atOf(c.createdAt), 'note', `Plan summary carried over: ${T.str(si.summary, 1000)}`);
    if (si.urgency) ev(c.id, atOf(c.createdAt), 'note', `Previously marked “${T.str(si.urgency, 20)}”. Priority is now worked out from deadlines and consequences.`);
    const steps = T.arr(si.steps);
    steps.forEach((st, i) => s.tasks.push({ id: T.id(st && st.id) || uid('task'), caseId: c.id, text: T.str(st && st.text, 500) || 'Step', done: !!(st && st.done), doneAt: st && st.done && closed && isISODate(si.completedAt) ? atOf(si.completedAt) : '', order: i, effort: 0, dependsOn: [], pathId: '', waitDep: '', caseDep: '', note: '' }));
    const dl = si.deadline && typeof si.deadline === 'object' ? si.deadline : {};
    if (isISODate(dl.originalDate)) s.deadlines.push({ id: uid('dl'), caseId: c.id, label: 'Original deadline', date: dl.originalDate, kind: 'external', certainty: 'reported', source: 'Entered in the previous version', status: closed ? 'met' : (daysUntil(dl.originalDate) < 0 ? 'missed' : 'open') });
    if (isISODate(dl.revisedDate)) s.deadlines.push({ id: uid('dl'), caseId: c.id, label: 'Your revised target', date: dl.revisedDate, kind: 'self', certainty: 'reported', source: 'Your own target', status: closed ? 'met' : 'open' });
    if (dl.nextAction && !closed && dl.nextAction !== 'Completed.') {
      const exists = steps.some(st => st && norm(st.text) === norm(dl.nextAction));
      if (!exists) s.tasks.push({ id: uid('task'), caseId: c.id, text: T.str(dl.nextAction, 500), done: false, order: -1, effort: 0, dependsOn: [], pathId: '', waitDep: '', caseDep: '', note: 'Carried over as your “next action”.' });
    }
    if (dl.reminderNote) ev(c.id, atOf(c.createdAt), 'note', `Reminder note: ${T.str(dl.reminderNote, 600)}`);
    if (closed) {
      c.resolution.note = T.str(si.outcomeNotes, 4000);
      c.resolution.closedAt = T.date(si.completedAt) || today();
      c._v1closed = true;
      ev(c.id, atOf(si.completedAt), 'resolution', `Marked complete${si.outcomeNotes ? ': ' + T.str(si.outcomeNotes, 600) : ''}`);
    }
  });

  T.arr(v1.callPreps).forEach(cp => {
    if (!cp || typeof cp !== 'object') return;
    let caseId = caseIdBySit[cp.situationId];
    if (!caseId) caseId = newCase({ title: T.str(cp.title, 200).replace(/\s*—\s*Call Prep$/i, '') || 'Phone call', counterparty: T.str(cp.organization, 200) }).id;
    const c = s.cases.find(x => x.id === caseId);
    if (c && !c.counterparty && cp.organization) c.counterparty = T.str(cp.organization, 200);
    const n = cp.callNotes && typeof cp.callNotes === 'object' ? cp.callNotes : {};
    const happened = !!(n.notes || n.repName || n.refNumber);
    const extra = T.arr(cp.talkingPoints).filter(Boolean).map(t => '• ' + T.str(t, 300));
    s.comms.push({
      id: T.id(cp.id) || uid('comm'), caseId, channel: 'call', direction: 'out', purpose: 'request', stance: 'acknowledge', tone: 'warm',
      status: happened ? 'done' : 'draft', date: T.date(n.callDate), subject: T.str(cp.title, 300),
      body: T.str(cp.openingScript, 6000) + (extra.length ? `\n\nTalking points:\n${extra.join('\n')}` : ''),
      contact: T.str(n.repName, 200), phone: T.str(cp.phone, 80), reference: T.str(n.refNumber, 200), outcome: T.str(n.notes, 4000), edited: true,
      checklist: T.arr(cp.checklist).map(i => ({ id: uid('ck'), text: T.str(i && i.text, 300), done: !!(i && i.done) })),
      questions: T.arr(cp.questions).map(q => ({ id: uid('q'), text: T.str(q, 300), answer: '' })),
    });
    if (happened) ev(caseId, atOf(n.callDate), 'comm', `Call${n.repName ? ' with ' + T.str(n.repName, 100) : ''}${n.refNumber ? ' (ref ' + T.str(n.refNumber, 60) + ')' : ''}`);
  });

  T.arr(v1.documents).forEach(d => {
    if (!d || typeof d !== 'object') return;
    let caseId = caseIdBySit[d.situationId];
    if (!caseId) caseId = (s.cases.find(c => c.title === 'Loose documents') || newCase({ title: 'Loose documents', summary: 'Document checklist items that weren’t linked to a situation in the previous version.' })).id;
    s.docs.push({ id: T.id(d.id) || uid('doc'), caseId, name: T.str(d.name, 300) || 'Document', status: d.status === 'ready' ? 'have' : d.status === 'submitted' ? 'sent' : 'needed', note: T.str(d.note, 600), evidenceId: '' });
  });

  const waitKind = { Refund: 'payment', Claim: 'decision', Response: 'response', Repair: 'action', Application: 'decision', 'Follow-up': 'response' };
  T.arr(v1.waitingItems).forEach(w => {
    if (!w || typeof w !== 'object') return;
    let caseId = caseIdBySit[w.situationId];
    if (!caseId) {
      const c = newCase({ title: T.str(w.title, 200) || 'Waiting item', type: ['Refund', 'Claim'].includes(w.type) ? 'owed' : 'general', counterparty: T.str(w.organization, 200), reference: T.str(w.refNumber, 200), createdAt: T.date(w.dateInitiated) || today() });
      ev(c.id, atOf(c.createdAt), 'created', 'Case created from a Waiting Room item (previous version)');
      caseId = c.id;
      if (w.status === 'received') { c.resolution.closedAt = today(); c._v1closed = true; }
    }
    caseIdByWait[w.id] = caseId;
    const logs = T.arr(w.logs).map(l => ({ id: uid('wl'), date: T.date(l && l.date) || today(), note: T.str(l && l.note, 1000) })).filter(l => l.note);
    s.waits.push({
      id: T.id(w.id) || uid('wait'), caseId, kind: waitKind[w.type] || 'response', what: T.str(w.title, 300) || 'A reply', from: T.str(w.organization, 200),
      since: T.date(w.dateInitiated) || today(), expectedBy: '', basis: 'estimate', followUpOn: T.date(w.followUpDate),
      status: w.status === 'received' ? 'received' : w.status === 'escalated' ? 'escalated' : 'waiting', reference: T.str(w.refNumber, 200),
      receivedAt: w.status === 'received' ? today() : '', outcome: '', log: logs, commitmentId: '',
    });
    logs.forEach(l => ev(caseId, atOf(l.date), 'wait', l.note));
  });

  T.arr(v1.standaloneDeadlines).forEach(d => {
    if (!d || typeof d !== 'object') return;
    const c = newCase({ title: T.str(d.title, 200) || 'Deadline', type: typeMap[d.category] || 'application' });
    ev(c.id, atOf(c.createdAt), 'created', 'Case created from a standalone deadline (previous version)');
    if (isISODate(d.originalDate)) s.deadlines.push({ id: uid('dl'), caseId: c.id, label: 'Original deadline', date: d.originalDate, kind: 'external', certainty: 'reported', source: 'Entered in the previous version', status: daysUntil(d.originalDate) < 0 ? 'missed' : 'open' });
    if (isISODate(d.revisedDate)) s.deadlines.push({ id: uid('dl'), caseId: c.id, label: 'Your revised target', date: d.revisedDate, kind: 'self', certainty: 'reported', source: 'Your own target', status: 'open' });
    if (d.nextAction) s.tasks.push({ id: uid('task'), caseId: c.id, text: T.str(d.nextAction, 500), done: false, order: 0, effort: 0, dependsOn: [], pathId: '', waitDep: '', caseDep: '', note: '' });
    if (d.reminderNote) ev(c.id, nowStamp(), 'note', `Reminder note: ${T.str(d.reminderNote, 600)}`);
  });

  T.arr(v1.proofs).forEach(p => {
    if (!p || typeof p !== 'object') return;
    const caseId = caseIdBySit[p.situationId] || caseIdByWait[p.waitingItemId] || '';
    const contact = p.contactName ? `Contact: ${T.str(p.contactName, 100)}` : '';
    const main = { id: uid('ev'), caseId, type: p.refNumber ? 'confirmation' : 'other', title: T.str(p.title, 300) || 'Proof of done', reference: T.str(p.refNumber, 200), note: [T.str(p.notes, 3000), p.organization ? `Organization: ${T.str(p.organization, 200)}` : '', contact].filter(Boolean).join('\n'), date: T.date(p.completionDate), location: '', file: null, links: [] };
    s.evidence.push(main);
    T.arr(p.attachments).forEach(a => {
      if (!a || typeof a !== 'object') return;
      if (a.kind === 'file' && typeof a.dataUrl === 'string' && a.dataUrl.startsWith('data:')) {
        const blobId = uid('blob');
        pendingFiles.push({ blobId, dataUrl: a.dataUrl, name: T.str(a.name, 200), mime: T.str(a.mimeType, 100) });
        s.evidence.push({ id: uid('ev'), caseId, type: (a.mimeType || '').startsWith('image/') ? 'photo' : 'other', title: T.str(a.name, 300) || 'Attachment', reference: '', note: `Attached to “${main.title}” in the previous version.`, date: main.date, location: '', file: { blobId, name: T.str(a.name, 200) || 'file', mime: T.str(a.mimeType, 100), size: T.num(a.size, 0, 0), sha256: '' }, links: [] });
      } else {
        s.evidence.push({ id: uid('ev'), caseId, type: 'other', title: T.str(a.name, 300) || 'Saved location', reference: '', note: '', date: main.date, location: T.str(a.textNote, 400), file: null, links: [] });
      }
    });
    if (caseId) ev(caseId, atOf(p.completionDate), 'evidence', `Proof recorded: ${main.title}${main.reference ? ' (' + main.reference + ')' : ''}`);
  });

  // Resolution: closed v1 cases are only "verified" when evidence exists.
  s.cases.forEach(c => {
    if (!c._v1closed) return;
    const evIds = s.evidence.filter(e => e.caseId === c.id).map(e => e.id);
    s.criteria.push({ id: uid('crit'), caseId: c.id, text: 'Resolved as recorded in the previous version', status: 'met', evidenceIds: evIds, note: '', checkedAt: c.resolution.closedAt, key: 'v1' });
    c.resolution.state = evIds.length ? 'verified' : 'closed_unverified';
    delete c._v1closed;
  });
  // Open cases get the new understanding layer (options, criteria, missing details) — tasks stay as the person wrote them.
  s.cases.forEach(c => { if (!RES_STATES[c.resolution.state].closed && c.title !== 'Loose documents') Engine.enrichCase(s, c); });
  return { state: s, pendingFiles };
}
