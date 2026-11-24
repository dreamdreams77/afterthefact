/* ---------------- Recovery engine (runs entirely on this device) ---------------- */

const NUM_WORDS = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, couple: 2, 'a couple of': 2, few: 3, 'a few': 3, several: 4 };
const UNIT_DAYS = { day: 1, week: 7, month: 30, year: 365 };
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const ESCALATE_HINTS = {
  response: 'Send a short written follow-up quoting your original date and reference. If that goes unanswered, ask for a supervisor or their complaints process.',
  action: 'Ask them to confirm the date the action is scheduled for and who is responsible, in writing.',
  document: 'Ask whether it was sent, when, and to which address, and request an electronic copy.',
  decision: 'Ask for the expected decision date and whether anything is missing from your file.',
  payment: 'Ask for the payment date, method and a transaction reference. If a promised date passes, escalate in writing.',
};

const Engine = {
  /* ---- Understanding plain-language intake ---- */
  classify(text) {
    const t = ' ' + norm(text) + ' ';
    const scored = PLAYBOOK_ORDER.filter(id => id !== 'general').map(id => {
      let score = 0;
      for (const [re, w] of PLAYBOOKS[id].match) { const m = t.match(re); if (m) score += m.length * w; }
      return { type: id, score };
    }).sort((a, b) => b.score - a.score || PLAYBOOK_ORDER.indexOf(a.type) - PLAYBOOK_ORDER.indexOf(b.type));
    const top = scored[0];
    if (!top || top.score === 0) return { type: 'general', confident: false, alternatives: scored.slice(0, 3).map(s => s.type) };
    const close = scored.filter(s => s.score > 0 && s !== top && top.score - s.score <= 1).map(s => s.type);
    return { type: top.type, confident: close.length === 0 && top.score >= 3, alternatives: close.slice(0, 2) };
  },

  parseWhen(text) {
    const t = norm(text);
    const out = [];
    const numRe = '(\\d{1,3}|a couple of|a few|an|a|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|couple|few|several)';
    const re1 = new RegExp(`\\b${numRe}\\s+(day|week|month|year)s?\\s+(ago|late|overdue|past due|back)\\b`, 'g');
    let m;
    while ((m = re1.exec(t))) {
      const n = /^\d+$/.test(m[1]) ? Number(m[1]) : (NUM_WORDS[m[1]] || 1);
      const unit = m[2];
      out.push({ offset: -n * UNIT_DAYS[unit], phrase: m[0], approx: unit !== 'day' || !/^\d+$/.test(m[1]) });
    }
    if (/\byesterday\b/.test(t)) out.push({ offset: -1, phrase: 'yesterday', approx: false });
    const re2 = /\blast (week|month|year)\b/g;
    while ((m = re2.exec(t))) out.push({ offset: -UNIT_DAYS[m[1]], phrase: m[0], approx: true });
    const re3 = /\blast (sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/g;
    while ((m = re3.exec(t))) {
      const dow = nowDate().getDay(); const target = WEEKDAYS.indexOf(m[1]);
      out.push({ offset: -(((dow - target + 7) % 7) || 7), phrase: m[0], approx: false });
    }
    const seen = new Set();
    return out.filter(x => (seen.has(x.phrase) ? false : seen.add(x.phrase))).map(x => ({ ...x, date: offset(x.offset) }));
  },

  parseAmounts(text) {
    const out = [];
    const re = /([$£€])\s?(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)(\s+[a-z][a-z-]*){0,2}/gi;
    let m;
    while ((m = re.exec(text))) out.push({ value: m[1] + m[2], phrase: m[0].trim().replace(/\s+(and|to|for|from|ago|that|which|is|was)$/i, '') });
    return out.slice(0, 4);
  },

  inferAnswers(type, text) {
    const t = norm(text);
    const out = {};
    for (const [re, qid, val] of pb(type).infer) if (!(qid in out) && re.test(t)) out[qid] = val;
    return out;
  },

  makeTitle(text) {
    let t = String(text || '').trim().replace(/\s+/g, ' ');
    t = t.replace(/^(so|ok|okay|um|hi|help)[,!.]?\s+/i, '');
    t = t.replace(/^i(?:'ve| have| had)?\s+(?:just\s+|totally\s+|completely\s+|kind of\s+)?(?=\w)/i, '');
    t = t.split(/(?<=[.!?])\s|\s+(?:and|but|so)\s+(?:i\s+|i'm\s+)?(?:want|need|would like|have to|am|was|now|don'?t)\b/i)[0];
    t = cap(t.replace(/[.!?,;:]+$/, '').trim());
    return truncate(t, 80) || 'New case';
  },

  draft(text) {
    const cls = this.classify(text);
    const answers = this.inferAnswers(cls.type, text);
    const answerSource = {}; Object.keys(answers).forEach(k => { answerSource[k] = 'inferred'; });
    return { text, title: this.makeTitle(text), type: cls.type, classification: cls, answers, answerSource, when: this.parseWhen(text), amounts: this.parseAmounts(text) };
  },

  matches(answers, rule) { return !!rule && rule[1].includes(answers[rule[0]]); },

  consequencesFor(type, answers) {
    return pb(type).consequences
      .filter(c => !c.if || this.matches(answers, c.if))
      .map(c => ({ key: c.key, text: c.text, status: c.est && this.matches(answers, c.est) ? 'established' : 'potential', reversibility: c.rev, severity: c.sevIf && this.matches(answers, c.sevIf) ? c.sevIf[2] : c.sev, note: c.note || '', general: !!c.general }));
  },

  scorePath(type, path, answers, signals = {}) {
    const def = pb(type).paths.find(p => p.key === path.key);
    if (!def) return { score: 0, reasons: [] };
    let score = def.base || 0;
    const reasons = [];
    for (const [qid, vals, delta, text] of def.rank || []) if (vals.includes(answers[qid])) { score += delta; reasons.push({ text, delta }); }
    for (const [sig, delta, text] of def.dyn || []) if (signals[sig]) { score += delta; reasons.push({ text, delta }); }
    return { score, reasons };
  },

  /* Build every record for a new case from a confirmed draft. Nothing is saved here. */
  materialize(d, { pathKey = '', counterparty = '', reference = '', jurisdiction = '', target = '' } = {}) {
    const P = pb(d.type);
    const caseId = uid('case');
    const at = nowStamp();
    const b = { cases: [], facts: [], consequences: [], deadlines: [], paths: [], tasks: [], docs: [], criteria: [], events: [] };
    b.cases.push({ id: caseId, title: d.title, type: d.type, summary: d.text, counterparty, reference, jurisdiction, createdAt: today(), updatedAt: at, answers: { ...d.answers }, answerSource: { ...d.answerSource }, resolution: { state: 'open', note: '', condition: '', monitorUntil: '', closedAt: '' }, parkedUntil: '', parkNote: '' });
    d.when.forEach(w => b.facts.push({ id: uid('fact'), caseId, kind: 'unverified', text: `Around ${fmtDate(w.date, { year: true })} — from “${w.phrase}”`, source: 'Your description', why: '', key: 'parsed_when', evidenceIds: [], createdAt: at, updatedAt: at }));
    d.amounts.forEach(a => b.facts.push({ id: uid('fact'), caseId, kind: 'unverified', text: `Amount mentioned: ${a.phrase}`, source: 'Your description — what it refers to isn’t confirmed', why: '', key: 'amount_mentioned', evidenceIds: [], createdAt: at, updatedAt: at }));
    P.facts.forEach(([key, text, why]) => b.facts.push({ id: uid('fact'), caseId, kind: 'missing', text, why, source: '', key, evidenceIds: [], createdAt: at, updatedAt: at }));
    this.consequencesFor(d.type, d.answers).forEach(c => b.consequences.push({ id: uid('csq'), caseId, ...c }));
    // Only where a past date in the description usually *is* the deadline; elsewhere it stays an unverified fact.
    const dlLabel = { payment: 'Original due date', renewal: 'Expiry date', application: 'Original deadline' }[d.type];
    if (dlLabel && d.when[0]) {
      const w = d.when[0];
      b.deadlines.push({ id: uid('dl'), caseId, label: dlLabel, date: w.date, kind: 'external', certainty: 'estimated', source: `Estimated from “${w.phrase}” — check the original`, status: daysUntil(w.date) < 0 ? 'missed' : 'open', note: '', key: 'original' });
    }
    if (isISODate(target)) b.deadlines.push({ id: uid('dl'), caseId, label: 'Your target', date: target, kind: 'self', certainty: 'confirmed', source: 'Set by you', status: 'open', note: '', key: 'target' });
    const ranked = P.paths.map(p => ({ p, ...this.scorePath(d.type, p, d.answers) })).sort((a, b2) => b2.score - a.score);
    ranked.forEach(({ p }) => {
      b.paths.push({ id: uid('path'), caseId, key: p.key, approach: p.approach, title: p.title, why: p.why, downsides: p.downsides || '', prerequisites: [...(p.prereq || [])], uncertainties: [...(p.uncertain || [])], outcome: p.outcome || '', status: p.key === pathKey ? 'chosen' : 'considering', note: '', custom: false });
    });
    const chosen = b.paths.find(p => p.status === 'chosen');
    if (chosen) b.tasks.push(...this.tasksForPath(caseId, chosen, 0, d.type));
    P.docs.forEach(name => b.docs.push({ id: uid('doc'), caseId, name, status: 'needed', note: '', evidenceId: '' }));
    P.criteria.forEach((text, i) => b.criteria.push({ id: uid('crit'), caseId, text, status: 'pending', evidenceIds: [], note: '', checkedAt: '', key: 'c' + i }));
    b.events.push({ id: uid('evt'), caseId, at, type: 'created', text: `Case opened: “${truncate(d.text, 300)}”`, manual: false });
    const answered = Object.keys(d.answers).map(q => { const qd = P.questions.find(x => x.id === q); const o = qd && qd.opts.find(x => x[0] === d.answers[q]); return qd && o ? `${qd.q} → ${o[1]}${d.answerSource[q] === 'inferred' ? ' (inferred from your description)' : ''}` : null; }).filter(Boolean);
    if (answered.length) b.events.push({ id: uid('evt'), caseId, at, type: 'understanding', text: `Context recorded: ${answered.join('; ')}`, manual: false });
    if (chosen) b.events.push({ id: uid('evt'), caseId, at, type: 'path', text: `Chose an approach: ${chosen.title}`, manual: false });
    return { caseId, bundle: b };
  },

  tasksForPath(caseId, path, startOrder, type) {
    const def = pb(type).paths.find(p => p.key === path.key);
    if (!def) return [];
    const out = [];
    def.tasks.forEach(([raw, effort], i) => {
      const dep = raw.startsWith('>');
      const id = uid('task');
      out.push({ id, caseId, text: dep ? raw.slice(1) : raw, done: false, doneAt: '', pathId: path.id, dependsOn: dep && out[i - 1] ? [out[i - 1].id] : [], waitDep: '', caseDep: '', effort, order: startOrder + i, note: '', createdAt: nowStamp() });
    });
    return out;
  },

  /* Used for migrated v1 cases: add the understanding layer without touching their tasks. */
  enrichCase(s, c) {
    const P = pb(c.type);
    const at = nowStamp();
    const has = coll => s[coll].some(r => r.caseId === c.id);
    if (!has('paths')) P.paths.forEach(p => s.paths.push({ id: uid('path'), caseId: c.id, key: p.key, approach: p.approach, title: p.title, why: p.why, downsides: p.downsides || '', prerequisites: [...(p.prereq || [])], uncertainties: [...(p.uncertain || [])], outcome: p.outcome || '', status: 'considering', note: '', custom: false }));
    if (!has('criteria')) P.criteria.forEach((text, i) => s.criteria.push({ id: uid('crit'), caseId: c.id, text, status: 'pending', evidenceIds: [], note: '', checkedAt: '', key: 'c' + i }));
    if (!has('facts')) P.facts.forEach(([key, text, why]) => s.facts.push({ id: uid('fact'), caseId: c.id, kind: 'missing', text, why, source: '', key, evidenceIds: [], createdAt: at, updatedAt: at }));
    if (!has('consequences')) this.consequencesFor(c.type, c.answers || {}).forEach(x => s.consequences.push({ id: uid('csq'), caseId: c.id, ...x }));
    if (!has('docs')) P.docs.forEach(name => s.docs.push({ id: uid('doc'), caseId: c.id, name, status: 'needed', note: '', evidenceId: '' }));
  },

  /* ---- Live analysis of a case ---- */
  signals(caseId) {
    const missedPromise = S.commitments.some(m => m.caseId === caseId && m.party === 'them' && (m.status === 'missed' || (m.status === 'pending' && m.due && daysUntil(m.due) < 0)))
      || S.waits.some(w => w.caseId === caseId && w.status === 'waiting' && w.basis === 'promised' && w.expectedBy && daysUntil(w.expectedBy) < 0);
    const deadlinePassed = S.deadlines.some(d => d.caseId === caseId && d.kind === 'external' && (d.status === 'missed' || (d.status === 'open' && d.date && daysUntil(d.date) < 0)));
    return { missedPromise, deadlinePassed };
  },

  rankPaths(caseId) {
    const c = getCase(caseId);
    if (!c) return [];
    const sig = this.signals(caseId);
    const order = { worked: 0, chosen: 1, considering: 2, didnt_work: 3, ruled_out: 4 };
    const list = S.paths.filter(p => p.caseId === caseId).map(p => ({ path: p, ...(p.custom ? { score: 0, reasons: [] } : this.scorePath(c.type, p, c.answers, sig)) }));
    const live = list.filter(x => ['considering', 'chosen'].includes(x.path.status));
    const best = live.length ? Math.max(...live.map(x => x.score)) : null;
    list.forEach(x => { x.best = best !== null && x.score === best && ['considering', 'chosen'].includes(x.path.status) && live.filter(y => y.score === best).length < live.length; });
    return list.sort((a, b) => (order[a.path.status] - order[b.path.status]) || (b.score - a.score));
  },

  taskBlockers(t) {
    const out = [];
    for (const id of t.dependsOn) { const d = S.tasks.find(x => x.id === id); if (d && !d.done) out.push({ kind: 'task', id, text: `After “${truncate(d.text, 60)}”` }); }
    if (t.waitDep) { const w = S.waits.find(x => x.id === t.waitDep); if (w && !['received', 'dropped'].includes(w.status)) out.push({ kind: 'wait', id: w.id, text: `Waiting for: ${truncate(w.what, 60)}` }); }
    if (t.caseDep) { const c2 = getCase(t.caseDep); if (c2 && !isClosed(c2)) out.push({ kind: 'case', id: c2.id, text: `Needs “${truncate(c2.title, 50)}” resolved first` }); }
    return out;
  },

  openTasks(caseId) { return S.tasks.filter(t => t.caseId === caseId && !t.done).sort(byOrder); },
  actionableTasks(caseId) { return this.openTasks(caseId).filter(t => this.taskBlockers(t).length === 0); },

  nextStep(caseId) {
    const c = getCase(caseId);
    if (!c) return null;
    if (isClosed(c)) return { kind: 'closed', text: RES_STATES[c.resolution.state].label };
    if (c.resolution.state === 'monitoring' && c.resolution.monitorUntil && daysUntil(c.resolution.monitorUntil) <= 0) {
      return { kind: 'monitor', text: `Check it’s still resolved${c.resolution.condition ? ': ' + c.resolution.condition : ''}`, why: 'Your monitoring date has arrived.' };
    }
    const pending = this.openWaits(caseId).map(w => ({ w, st: this.waitState(w) }));
    const missed = pending.find(x => x.st.key === 'missed');
    const followUp = ({ w, st }) => ({ kind: 'followup', wait: w, purpose: st.key === 'missed' ? 'escalate' : 'follow_up', text: `${st.key === 'missed' ? 'Escalate' : 'Follow up'}: ${w.what}`, why: `${st.label}${w.from ? ' — ' + w.from : ''}.` });
    if (missed) return followUp(missed);
    const acts = this.actionableTasks(caseId);
    if (acts.length) return { kind: 'task', task: acts[0], text: acts[0].text };
    const due = pending.find(x => ['follow', 'overdue'].includes(x.st.key));
    if (due) return followUp(due);
    const open = this.openTasks(caseId);
    const chosen = S.paths.some(p => p.caseId === caseId && p.status === 'chosen');
    if (!open.length && !chosen && !S.comms.some(m => m.caseId === caseId) && !this.openWaits(caseId).length) {
      return { kind: 'choose', text: 'Compare your options and choose an approach', why: 'No approach chosen yet.' };
    }
    if (open.length) {
      const blockers = this.taskBlockers(open[0]);
      return { kind: 'blocked', text: blockers[0] ? blockers[0].text : 'Steps are waiting on something', task: open[0], blockers };
    }
    const waits = this.openWaits(caseId);
    if (waits.length) return { kind: 'wait', text: `Waiting on ${waits[0].from || 'them'}: ${waits[0].what}`, wait: waits[0] };
    if (['monitoring', 'conditional'].includes(c.resolution.state)) return { kind: 'watch', text: c.resolution.state === 'monitoring' ? `Monitoring until ${fmtDate(c.resolution.monitorUntil) || 'you decide'}` : `Waiting for the condition: ${c.resolution.condition || 'not described'}` };
    return { kind: 'resolve', text: 'Check whether the problem is actually resolved', why: 'All steps are done — but a finished checklist isn’t the same as a solved problem.' };
  },

  openWaits(caseId) { return S.waits.filter(w => (!caseId || w.caseId === caseId) && ['waiting', 'escalated'].includes(w.status)); },

  waitState(w) {
    if (w.status === 'received') return { key: 'received', label: 'Received', tone: 'sage' };
    if (w.status === 'dropped') return { key: 'dropped', label: 'Stopped waiting', tone: '' };
    const exp = w.expectedBy ? daysUntil(w.expectedBy) : null;
    const fu = w.followUpOn ? daysUntil(w.followUpOn) : null;
    if (exp !== null && exp < 0 && w.basis === 'promised') return { key: 'missed', label: `Promise missed ${relDay(w.expectedBy)}`, tone: 'coral', rank: 0 };
    if (exp !== null && exp < 0) return { key: 'overdue', label: `Past expected date (${fmtDate(w.expectedBy)})`, tone: 'amber', rank: 1 };
    if (fu !== null && fu <= 0) return { key: 'follow', label: fu === 0 ? 'Follow up today' : `Follow-up due since ${fmtDate(w.followUpOn)}`, tone: 'amber', rank: 2 };
    if (w.status === 'escalated') return { key: 'escalated', label: 'Escalated', tone: 'blue', rank: 3 };
    return { key: 'on_track', label: exp !== null ? `Expected ${relDay(w.expectedBy)}` : (fu !== null ? `Follow up ${relDay(w.followUpOn)}` : 'Waiting'), tone: '', rank: 4 };
  },

  priority(caseId) {
    const c = getCase(caseId);
    if (!c || isClosed(c)) return null;
    let score = 0;
    const reasons = [];
    const add = (pts, text, hot = false) => { score += pts; reasons.push({ text, hot, pts }); };
    const dls = S.deadlines.filter(d => d.caseId === caseId && d.status !== 'met' && d.status !== 'void' && d.date);
    let passedNoted = false;
    let hardSoon = false;
    for (const d of dls) {
      const n = daysUntil(d.date);
      if (d.kind === 'external') {
        if (n < 0 || d.status === 'missed') { if (!passedNoted) { add(1, `${d.label} has passed (${fmtDate(d.date)})`); passedNoted = true; } }
        else if (n <= 2) { add(d.certainty === 'confirmed' ? 6 : 4, `${d.certainty === 'confirmed' ? 'Confirmed' : 'Unconfirmed'} deadline ${relDay(d.date)}: ${d.label}`, true); hardSoon = true; }
        else if (n <= 7) { add(3, `${d.label} ${relDay(d.date)}`); hardSoon = n <= 3 || hardSoon; }
        else if (n <= 14) add(1, `${d.label} ${relDay(d.date)}`);
      } else if (n <= 0) add(1, `Your own target date ${n === 0 ? 'is today' : 'has passed'}`);
    }
    const cons = S.consequences.filter(x => x.caseId === caseId && x.status === 'potential');
    const severe = cons.filter(x => x.severity >= 3 && x.reversibility !== 'reversible');
    if (severe.length) add(4, `Could lead to ${severe[0].text.charAt(0).toLowerCase() + severe[0].text.slice(1)} — ${REVERSIBILITY[severe[0].reversibility].toLowerCase()}`, true);
    else if (cons.some(x => x.severity >= 2)) add(1, 'Has consequences worth avoiding');
    const est = S.consequences.find(x => x.caseId === caseId && x.status === 'established' && x.reversibility === 'reversible');
    if (est) add(1, `Can still be reversed: ${est.text.charAt(0).toLowerCase() + est.text.slice(1)}`);
    const ws = this.openWaits(caseId).map(w => this.waitState(w));
    if (ws.some(x => x.key === 'missed')) add(3, 'They missed a date they promised', true);
    else if (ws.some(x => x.key === 'follow' || x.key === 'overdue')) add(2, 'A follow-up is due');
    const mine = S.commitments.filter(m => m.caseId === caseId && m.party === 'me' && m.status === 'pending' && m.due && daysUntil(m.due) <= 3);
    if (mine.length) add(3, `You said you’d ${truncate(mine[0].text, 50)} by ${fmtDate(mine[0].due)}`, daysUntil(mine[0].due) <= 1);
    const blocks = S.links.filter(l => l.type === 'blocks' && l.from === caseId).map(l => getCase(l.to)).filter(x => x && !isClosed(x));
    if (blocks.length) add(2 * blocks.length, `Resolving this unblocks “${truncate(blocks[0].title, 40)}”${blocks.length > 1 ? ` and ${blocks.length - 1} more` : ''}`);
    const step = this.nextStep(caseId);
    if (step && step.kind === 'monitor') add(2, 'A monitoring check is due');
    const actionable = !!step && ['task', 'choose', 'resolve', 'monitor', 'followup'].includes(step.kind);
    if (!actionable) score -= 2;
    const parked = !!c.parkedUntil && daysUntil(c.parkedUntil) > 0;
    const parkedButUrgent = parked && hardSoon;
    if (parkedButUrgent) reasons.unshift({ text: 'Parked, but a deadline is close', hot: true, pts: 99 });
    reasons.sort((a, b) => (b.hot - a.hot) || (b.pts - a.pts));
    return { caseId, score, reasons, step, actionable, parked: parked && !parkedButUrgent };
  },

  prioritized() {
    return S.cases.map(c => this.priority(c.id)).filter(Boolean).sort((a, b) => b.score - a.score);
  },

  caseStatus(caseId) {
    const c = getCase(caseId);
    const r = RES_STATES[c.resolution.state];
    if (r.closed) return { key: c.resolution.state, label: r.label, tone: r.tone };
    if (c.parkedUntil && daysUntil(c.parkedUntil) > 0) return { key: 'parked', label: `Parked until ${fmtDate(c.parkedUntil)}`, tone: '' };
    if (c.resolution.state !== 'open') return { key: c.resolution.state, label: r.label, tone: r.tone };
    const step = this.nextStep(caseId);
    if (step.kind === 'followup') return { key: 'waiting', label: step.purpose === 'escalate' ? 'Promise missed' : 'Follow-up due', tone: step.purpose === 'escalate' ? 'coral' : 'amber' };
    if (step.kind === 'wait') return { key: 'waiting', label: 'Waiting on others', tone: 'amber' };
    if (step.kind === 'blocked') return { key: 'blocked', label: 'Blocked', tone: 'blue' };
    if (step.kind === 'resolve') return { key: 'check', label: 'Ready to verify', tone: 'sage' };
    const started = S.tasks.some(t => t.caseId === caseId && t.done) || S.comms.some(m => m.caseId === caseId && m.status !== 'draft');
    return started ? { key: 'progress', label: 'In progress', tone: '' } : { key: 'new', label: 'Not started', tone: '' };
  },

  resolution(caseId) {
    const crit = S.criteria.filter(x => x.caseId === caseId && x.status !== 'na');
    const met = crit.filter(x => x.status === 'met');
    const evidenced = met.filter(x => x.evidenceIds.length);
    const pendingTheirs = S.commitments.filter(m => m.caseId === caseId && m.party === 'them' && m.status === 'pending');
    const tasksOpen = this.openTasks(caseId).length;
    let suggest = null; let text = '';
    if (!crit.length) { text = 'Add at least one statement of what “resolved” means, so you’ll know when you’re done.'; }
    else if (evidenced.length === crit.length) { suggest = 'verified'; text = 'Every criterion is met and backed by evidence. You can close this as verified.'; }
    else if (met.length === crit.length) { suggest = 'closed_unverified'; text = `Everything is marked as met, but ${plural(crit.length - evidenced.length, 'criterion', 'criteria')} ${crit.length - evidenced.length === 1 ? 'has' : 'have'} no evidence yet. Add evidence to verify, or close it as not verified.`; }
    else if (met.length) { suggest = 'partial'; text = `${met.length} of ${crit.length} criteria met.`; }
    else text = 'None of the criteria are met yet.';
    if (pendingTheirs.length && suggest !== 'verified') text += ` ${plural(pendingTheirs.length, 'promise')} from the other side ${pendingTheirs.length === 1 ? 'is' : 'are'} still pending — “resolved on a condition” may fit.`;
    return { crit, met, evidenced, suggest, text, tasksOpen, pendingTheirs };
  },

  focusQueue(minutes) {
    const pri = this.prioritized().filter(p => !p.parked && p.actionable);
    const pool = [];
    pri.forEach(p => { this.actionableTasks(p.caseId).slice(0, 2).forEach(t => pool.push({ task: t, caseId: p.caseId, reasons: p.reasons })); });
    const queue = []; let used = 0;
    for (const item of pool) {
      const eff = item.task.effort || 10;
      if (used + eff <= minutes || queue.length === 0) { queue.push(item); used += eff; }
      if (queue.length >= 6) break;
    }
    return { queue, minutes: used, available: pool.length };
  },

  agenda() {
    const items = [];
    const open = new Set(S.cases.filter(c => !isClosed(c)).map(c => c.id));
    S.deadlines.filter(d => open.has(d.caseId) && d.date && ['open', 'missed'].includes(d.status)).forEach(d => items.push({ date: d.date, kind: d.kind === 'self' ? 'target' : 'deadline', title: d.label, caseId: d.caseId, certainty: d.certainty, id: d.id, passed: d.status === 'missed' || daysUntil(d.date) < 0 }));
    S.waits.filter(w => open.has(w.caseId) && ['waiting', 'escalated'].includes(w.status)).forEach(w => {
      if (w.expectedBy) items.push({ date: w.expectedBy, kind: 'expected', title: `${w.basis === 'promised' ? 'Promised' : 'Expected'}: ${w.what}`, caseId: w.caseId, id: w.id, certainty: w.basis === 'promised' ? 'confirmed' : 'estimated' });
      if (w.followUpOn) items.push({ date: w.followUpOn, kind: 'followup', title: `Follow up: ${w.what}`, caseId: w.caseId, id: w.id });
    });
    S.commitments.filter(m => open.has(m.caseId) && m.status === 'pending' && m.due).forEach(m => items.push({ date: m.due, kind: m.party === 'me' ? 'mine' : 'theirs', title: m.party === 'me' ? `You committed: ${m.text}` : `They committed: ${m.text}`, caseId: m.caseId, id: m.id }));
    S.cases.forEach(c => {
      if (c.resolution.state === 'monitoring' && c.resolution.monitorUntil) items.push({ date: c.resolution.monitorUntil, kind: 'monitor', title: 'Monitoring check', caseId: c.id });
      if (c.parkedUntil && daysUntil(c.parkedUntil) >= 0 && !isClosed(c)) items.push({ date: c.parkedUntil, kind: 'parked', title: 'Parked case comes back', caseId: c.id });
    });
    S.obligations.forEach(o => items.push({ date: o.next, kind: 'obligation', title: o.title, id: o.id }));
    return items.sort((a, b) => a.date.localeCompare(b.date));
  },

  insights() {
    const out = [];
    const counts = {};
    S.cases.forEach(c => { counts[c.type] = (counts[c.type] || 0) + 1; });
    Object.entries(counts).forEach(([type, n]) => {
      if (n < 2 || type === 'general') return;
      out.push({ id: `type:${type}`, kind: 'pattern', title: `${n} of your cases were ${pb(type).label.toLowerCase()}`, text: 'Not a judgement — just a pattern. A small change upstream could stop the next one before it starts.', type, suggestions: pb(type).prevention });
    });
    const parties = {};
    S.cases.forEach(c => { const k = norm(c.counterparty); if (k) (parties[k] = parties[k] || { name: c.counterparty, n: 0 }).n++; });
    Object.entries(parties).forEach(([k, v]) => { if (v.n >= 2) out.push({ id: `party:${k}`, kind: 'pattern', title: `${v.n} cases involved ${v.name}`, text: 'It may help to keep their contact details, your account numbers and past outcomes together — the next contact will be quicker.' }); });
    const lags = [];
    S.cases.forEach(c => {
      const d = S.deadlines.find(x => x.caseId === c.id && x.kind === 'external' && x.date && x.date < c.createdAt);
      if (d) lags.push(daysBetween(d.date, c.createdAt));
    });
    if (lags.length >= 2) {
      const sorted = [...lags].sort((a, b) => a - b); const med = sorted[Math.floor(sorted.length / 2)];
      if (med >= 4) out.push({ id: 'lag', kind: 'timing', title: `Things tend to reach this app about ${med} days after the original date`, text: 'That’s common and fine. If you’d like more room next time, a reminder a week before due dates is an easy, optional change.' });
    }
    const byApproach = {};
    S.paths.filter(p => ['worked', 'didnt_work'].includes(p.status)).forEach(p => { const a = (byApproach[p.approach] = byApproach[p.approach] || { w: 0, n: 0 }); a.n++; if (p.status === 'worked') a.w++; });
    Object.entries(byApproach).forEach(([a, v]) => out.push({ id: `worked:${a}`, kind: 'track', title: `${APPROACHES[a]}: worked ${v.w} of ${v.n} time${v.n === 1 ? '' : 's'} for you`, text: v.n < 3 ? 'An early pattern from your own cases — useful context, not a prediction.' : 'Your own track record — useful when choosing next time, though every case differs.' }));
    const missedBy = {};
    S.commitments.filter(m => m.party === 'them' && (m.status === 'missed' || (m.status === 'pending' && m.due && daysUntil(m.due) < 0))).forEach(m => { const c = getCase(m.caseId); const k = (c && c.counterparty) || 'The other side'; missedBy[k] = (missedBy[k] || 0) + 1; });
    Object.entries(missedBy).forEach(([k, n]) => out.push({ id: `promises:${norm(k)}`, kind: 'track', title: `${k} missed ${plural(n, 'promised date')}`, text: 'Next time, ask for dates in writing and set your follow-up for the day after.' }));
    return out.filter(i => !S.dismissed.includes(i.id));
  },
};

function buildICS(events) {
  const escI = s => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  const fold = line => { const out = []; let l = line; while (l.length > 73) { out.push(l.slice(0, 73)); l = ' ' + l.slice(73); } out.push(l); return out.join('\r\n'); };
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//After the Fact//Local//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  events.forEach(e => {
    lines.push('BEGIN:VEVENT', `UID:${e.uid}@after-the-fact.local`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${icsDate(e.date)}`, `DTEND;VALUE=DATE:${icsDate(addDays(e.date, 1))}`, fold(`SUMMARY:${escI(e.title)}`));
    if (e.desc) lines.push(fold(`DESCRIPTION:${escI(e.desc)}`));
    if (e.rrule) lines.push(`RRULE:${e.rrule}`);
    if (e.alarmDays !== undefined && e.alarmDays !== null) lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', fold(`DESCRIPTION:${escI(e.title)}`), `TRIGGER:-P${Math.max(0, e.alarmDays)}D`, 'END:VALARM');
    lines.push('END:VEVENT');
  });
  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}
const RRULES = { monthly: 'FREQ=MONTHLY', quarterly: 'FREQ=MONTHLY;INTERVAL=3', yearly: 'FREQ=YEARLY', once: '' };
