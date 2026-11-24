/* ---------------- Actions, forms and dialogs ---------------- */
const Actions = {}; const Changes = {}; const Inputs = {}; const Forms = {};
const val = (fd, k) => String(fd.get(k) ?? '').trim();
const caseOptions = (exclude = '') => S.cases.filter(c => c.id !== exclude && !isClosed(c)).map(c => [c.id, c.title]);
function undoToast(msg, trashId) {
  UI.toast(msg, '', trashId ? { label: 'Undo', fn: () => { commit(() => restoreTrash(trashId)); UI.toast('Restored.', 'ok'); } } : null);
}
/* Keep both sides of an evidence link in step (record.evidenceIds and evidence.links). */
function syncEvidenceLinks(coll, rec, evIds) {
  rec.evidenceIds = [...new Set(evIds)];
  S.evidence.filter(e => e.caseId === rec.caseId).forEach(e => {
    const has = e.links.some(l => l.t === coll && l.id === rec.id);
    if (rec.evidenceIds.includes(e.id) && !has) e.links.push({ t: coll, id: rec.id });
    if (!rec.evidenceIds.includes(e.id) && has) e.links = e.links.filter(l => !(l.t === coll && l.id === rec.id));
  });
}
function evidenceChecklist(caseId, selected = [], name = 'evidence') {
  const evs = byCase('evidence', caseId);
  if (!evs.length) return '<p class="xs muted">No evidence in this case yet.</p>';
  return `<div class="list plain">${evs.map(e => `<label class="check" style="padding:6px 0"><input type="checkbox" name="${name}" value="${esc(e.id)}" ${selected.includes(e.id) ? 'checked' : ''}><span class="small">${esc(e.title)}${e.reference ? ` <span class="mono muted">${esc(e.reference)}</span>` : ''}</span></label>`).join('')}</div>`;
}

/* ===== Global ===== */
Actions['copy'] = async el => { const ok = await copyText(el.dataset.text || ''); UI.toast(ok ? 'Copied.' : 'Couldn’t copy automatically — select and copy it manually.', ok ? 'ok' : 'warn'); };
Actions['dismiss-notice'] = el => { UIState.dismissedNotices.add(el.dataset.key); UI.renderBanners(); };
Actions['download-corrupt'] = () => { const raw = Runtime.corruptKey ? LocalStore.get(Runtime.corruptKey) : Runtime.corruptRaw; if (raw) downloadText(`after-the-fact-unreadable-${today()}.txt`, raw); };
Actions['more-sheet'] = () => Dialog.open({ title: 'More', body: `<div class="list">${NAV.slice(3).map(n => `<a class="item link" href="${href(n.id)}" data-dlg-close>${ico(n.icon)}<span class="item-main item-title">${n.label}</span>${ico('arrow', 'sm')}</a>`).join('')}</div>` });
Actions['open-search'] = () => openSearch();
Actions['toggle-today-all'] = () => { UIState.showAllToday = !UIState.showAllToday; UI.render(); };
Actions['start-focus'] = el => { UIState.focus = null; Router.go(`focus?min=${el.dataset.min || S.settings.focusMinutes}`); };

Actions['toggle-task'] = el => {
  const t = findRec('tasks', el.dataset.id); if (!t) return;
  const wasDone = t.done;
  const blockers = Engine.taskBlockers(t);
  const done = commit(() => Ops.toggleTask(t.id), { caseId: t.caseId });
  if (done && blockers.length) UI.toast(`Marked done. (It was waiting on: ${blockers[0].text.replace(/^After /, '')}.)`);
  else if (done) {
    const c = getCase(t.caseId);
    const left = Engine.openTasks(t.caseId).length;
    UI.toast(left ? 'Done. Nice.' : 'That was the last step. Next: check whether it’s actually resolved.', 'ok', !left && c ? { label: 'Check', fn: () => Router.go(`case/${encodeURIComponent(c.id)}/resolve`) } : { label: 'Undo', fn: () => commit(() => Ops.toggleTask(t.id), { caseId: t.caseId }) });
  } else if (wasDone) UI.toast('Marked as not done.');
};

/* ===== Intake ===== */
Forms['quick-intake'] = fd => { const text = val(fd, 'text'); UIState.intake = { text }; if (text.length >= 4) { UIState.intake.draft = Engine.draft(text); } Router.go('new'); };
Actions['intake-example'] = el => { const text = EXAMPLES[Number(el.dataset.i)] || ''; UIState.intake = { text, draft: Engine.draft(text) }; Router.go('new'); };
Inputs['intake-text'] = el => { UIState.intake = { ...(UIState.intake || {}), text: el.value }; };
Forms['intake-describe'] = fd => {
  const text = val(fd, 'text');
  if (text.length < 4) { UI.toast('Add a few words about what happened.', 'warn'); return; }
  UIState.intake = { text, draft: Engine.draft(text) };
  UI.render({ scrollTop: true });
};
Actions['intake-back'] = () => { UIState.intake = { text: UIState.intake.draft.text }; UI.render({ scrollTop: true }); };
Actions['intake-cancel'] = () => { UIState.intake = null; Router.go('today'); };
function setIntakeType(type) {
  const I = UIState.intake; const d = I.draft;
  d.type = type;
  d.answers = Engine.inferAnswers(type, d.text);
  d.answerSource = {}; Object.keys(d.answers).forEach(k => { d.answerSource[k] = 'inferred'; });
  d.classification = { ...d.classification, alternatives: (d.classification.alternatives || []).filter(t => t !== type) };
  I.pathKey = undefined;
  UI.render();
}
Changes['intake-type'] = el => setIntakeType(el.value);
Actions['intake-settype'] = el => setIntakeType(el.dataset.type);
Inputs['intake-field'] = el => { const I = UIState.intake; if (el.dataset.k === 'title') I.draft.title = el.value; else I[el.dataset.k] = el.value; };
Changes['intake-answer'] = el => { const d = UIState.intake.draft; d.answers[el.dataset.q] = el.value; d.answerSource[el.dataset.q] = 'you'; UIState.intake.pathKey = undefined; UI.render(); };
Changes['intake-path'] = el => { UIState.intake.pathKey = el.value; };
Forms['intake-create'] = fd => {
  const I = UIState.intake; const d = I.draft;
  d.title = val(fd, 'title') || d.title;
  const opts = { pathKey: fd.has('path') ? val(fd, 'path') : (I.pathKey || ''), counterparty: val(fd, 'counterparty'), reference: val(fd, 'reference'), jurisdiction: val(fd, 'jurisdiction'), target: val(fd, 'target') };
  const id = commit(() => Ops.createCase(d, opts), { render: false });
  UIState.intake = null;
  Router.go(`case/${encodeURIComponent(id)}`);
  UI.toast('Case created. Everything in it is editable.', 'ok');
};

/* ===== Lists & filters ===== */
Changes['cases-filter'] = el => { UIState.casesFilter = el.value; UI.render(); };
Inputs['cases-search'] = el => { UIState.casesQuery = el.value; UI.render(); };
Changes['waiting-kind'] = el => { UIState.waitingKind = el.value; UI.render(); };
Inputs['evidence-search'] = el => { UIState.evidenceQuery = el.value; UI.render(); };
Changes['evidence-type'] = el => { UIState.evidenceType = el.value; UI.render(); };
Actions['timeline-order'] = () => { UIState.timelineAsc = !UIState.timelineAsc; UI.render(); };
Actions['insight-dismiss'] = el => commit(s => { s.dismissed.push(el.dataset.id); });

/* ===== Case details ===== */
Actions['case-edit'] = el => {
  const c = getCase(el.dataset.id);
  Dialog.open({
    title: 'Case details', body: `${field('Title', inputEl('title', c.title, 'required'))}
      ${field('Kind of situation', selectEl('type', PLAYBOOK_ORDER.map(k => [k, PLAYBOOKS[k].label]), c.type), 'Changing this adds that kind’s options. Nothing you’ve recorded is removed.')}
      ${field('In your words', textareaEl('summary', c.summary))}
      <div class="grid2">${field('Who it’s with', inputEl('counterparty', c.counterparty))}${field('Account or reference', inputEl('reference', c.reference, 'class="input mono"'))}</div>
      ${field('Where this applies', inputEl('jurisdiction', c.jurisdiction, 'placeholder="e.g. Oregon, US"'))}`,
    foot: '<button type="button" class="btn" data-dlg-close>Cancel</button><button class="btn btn-ink" type="submit">Save</button>',
    onSubmit: fd => commit(() => {
      const type = val(fd, 'type'); const changedType = type !== c.type;
      Object.assign(c, { title: val(fd, 'title') || c.title, summary: val(fd, 'summary'), counterparty: val(fd, 'counterparty'), reference: val(fd, 'reference'), jurisdiction: val(fd, 'jurisdiction'), type });
      if (changedType) {
        const have = new Set(byCase('paths', c.id).map(p => p.key));
        pb(type).paths.filter(p => !have.has(p.key)).forEach(p => S.paths.push(Normalize.paths({ caseId: c.id, key: p.key, approach: p.approach, title: p.title, why: p.why, downsides: p.downsides, prerequisites: p.prereq, uncertainties: p.uncertain, outcome: p.outcome })));
        logEvent(c.id, 'note', `Kind of situation changed to “${pb(type).label}”`);
      } else logEvent(c.id, 'note', 'Case details edited');
    }, { caseId: c.id }),
  });
};
Actions['case-park'] = el => {
  const c = getCase(el.dataset.id);
  const soon = byCase('deadlines', c.id).filter(d => d.kind === 'external' && d.status === 'open' && d.date && daysUntil(d.date) >= 0 && daysUntil(d.date) <= 14);
  Dialog.open({
    title: 'Park this case', sub: 'Hide it from Today until a date you choose. Useful when there’s too much at once.',
    body: `${soon.length ? `<div class="banner warn" style="margin-bottom:14px"><p>Parking doesn’t pause real deadlines: <b>${esc(soon[0].label)}</b> is ${esc(relDay(soon[0].date))}. If it gets within 3 days, this case comes back to Today early.</p></div>` : ''}
      ${field('Bring it back on', inputEl('until', offset(7), 'type="date" required'))}${field('Note to future you (optional)', inputEl('note', '', 'placeholder="e.g. after payday"'))}`,
    foot: '<button type="button" class="btn" data-dlg-close>Cancel</button><button class="btn btn-ink" type="submit">Park</button>',
    onSubmit: fd => { const until = val(fd, 'until'); if (!isISODate(until) || daysUntil(until) <= 0) { UI.toast('Choose a date after today.', 'warn'); return false; } commit(() => { c.parkedUntil = until; c.parkNote = val(fd, 'note'); logEvent(c.id, 'note', `Parked until ${fmtDate(until)}${c.parkNote ? ' — ' + c.parkNote : ''}`); }, { caseId: c.id }); UI.toast(`Parked until ${fmtDate(until)}.`); },
  });
};
Actions['case-unpark'] = el => { const c = getCase(el.dataset.id); commit(() => { c.parkedUntil = ''; c.parkNote = ''; logEvent(c.id, 'note', 'Unparked'); }, { caseId: c.id }); };
Actions['case-delete'] = async el => {
  const c = getCase(el.dataset.id);
  const n = COLLECTIONS.reduce((a, k) => a + S[k].filter(r => r.caseId === c.id).length, 0);
  if (!await confirmDialog({ title: 'Delete this case?', text: `“${esc(c.title)}” and everything in it (${n} records, including evidence and history) will move to the trash. You can restore it from Data & privacy.`, ok: 'Move to trash', danger: true })) return;
  const tid = commit(() => deleteCaseBundle(c.id), { render: false });
  Router.go('cases');
  undoToast('Case moved to the trash.', tid);
};
Actions['note-add'] = el => Dialog.open({
  title: 'Add a note', body: field('Note', textareaEl('text', '', 'required rows="3" placeholder="Anything worth remembering — who you spoke to, what you noticed…"')),
  foot: '<button type="button" class="btn" data-dlg-close>Cancel</button><button class="btn btn-ink" type="submit">Add to history</button>',
  onSubmit: fd => commit(() => logEvent(el.dataset.case, 'note', val(fd, 'text'), true), { caseId: el.dataset.case }),
});
Forms['note-add'] = (fd, form) => { const t = val(fd, 'text'); if (!t) return; commit(() => logEvent(form.dataset.case, 'note', t, true), { caseId: form.dataset.case }); };
Forms['case-jurisdiction'] = (fd, form) => { const c = getCase(form.dataset.case); commit(() => { c.jurisdiction = val(fd, 'jurisdiction'); logEvent(c.id, 'note', `Where this applies: ${c.jurisdiction || 'cleared'}`); }, { caseId: c.id }); UI.toast('Saved.'); };
Changes['case-answer'] = el => {
  const r = commit(() => Ops.answer(el.dataset.case, el.dataset.q, el.value), { caseId: el.dataset.case });
  const bits = [];
  if (r.newBest) bits.push(`Best fit is now “${r.newBest}”`);
  if (r.added.length) bits.push(`Added: ${r.added.join(', ').toLowerCase()}`);
  if (r.upgraded.length) bits.push(`Marked as happened: ${r.upgraded.join(', ').toLowerCase()}`);
  UI.toast(bits.length ? bits.join('. ') + '.' : 'Saved.', 'ok');
};

/* ===== Links between cases ===== */
Actions['link-add'] = el => {
  const c = getCase(el.dataset.case);
  const others = S.cases.filter(x => x.id !== c.id).map(x => [x.id, x.title + (isClosed(x) ? ' (closed)' : '')]);
  if (!others.length) { UI.toast('There are no other cases to link to yet.'); return; }
  Dialog.open({
    title: 'Link to another case', sub: 'Priorities take links into account — resolving a case that blocks others moves it up.',
    body: `${field('This case…', selectEl('type', [['blocks', 'blocks'], ['affects', 'affects'], ['caused_by', 'was caused by'], ['related', 'is related to']], 'related'))}${field('…the case', selectEl('to', others, others[0][0]))}${field('Note (optional)', inputEl('note', '', 'placeholder="e.g. Need proof of renewal to contest the ticket"'))}`,
    foot: '<button type="button" class="btn" data-dlg-close>Cancel</button><button class="btn btn-ink" type="submit">Link</button>',
    onSubmit: fd => commit(() => { const to = val(fd, 'to'); const type = val(fd, 'type'); S.links.push(Normalize.links({ from: c.id, to, type, note: val(fd, 'note') })); logEvent(c.id, 'note', `Linked: ${LINK_TYPES[type].fwd.toLowerCase()} “${caseTitle(to)}”`); logEvent(to, 'note', `Linked: ${LINK_TYPES[type].back.toLowerCase()} “${c.title}”`); }, { caseId: c.id }),
  });
};
Actions['link-delete'] = el => { const l = findRec('links', el.dataset.id); commit(() => { S.links = S.links.filter(x => x.id !== l.id); logEvent(l.from, 'note', `Unlinked from “${caseTitle(l.to)}”`); }); };

/* ===== Facts ===== */
function openFact(caseId, { id = '', kind = '', source = '', mode = 'add' } = {}) {
  const f = id ? findRec('facts', id) : null;
  const k = mode === 'confirm' || mode === 'fill' ? 'confirmed' : (f ? f.kind : (kind || 'unverified'));
  const title = { add: 'Add to what you know', edit: 'Edit', confirm: 'Confirm this', fill: 'Fill in a missing detail' }[mode];
  const linked = f ? [...f.evidenceIds] : [];
  Dialog.open({
    title, sub: mode === 'fill' ? esc(f.text) : mode === 'confirm' ? 'Confirmed means you checked it against a document, a statement or the organization.' : '',
    body: `${field(mode === 'fill' ? 'What did you find out?' : 'Detail', textareaEl('text', mode === 'fill' ? '' : (f ? f.text : ''), `rows="2" required ${mode === 'fill' ? 'placeholder="e.g. $86.40 including an $18 fee"' : ''}`))}
      ${segEl('kind', Object.entries(FACT_KINDS).filter(([x]) => mode === 'fill' ? x !== 'missing' : true).map(([x, v]) => [x, v.label]), k, 'How sure is this?')}
      ${field('Source', inputEl('source', mode === 'confirm' ? '' : (source || (f ? f.source : '')), `${mode === 'confirm' ? 'required' : ''} placeholder="e.g. Statement dated Nov 3, call with Maya, official website"`), 'Where it came from — so you can trust it later.')}
      ${f && f.kind === 'missing' && mode === 'edit' ? field('Why it matters', inputEl('why', f.why)) : ''}
      <fieldset class="field"><legend class="label">Supporting evidence</legend>${evidenceChecklist(caseId, linked)}</fieldset>`,
    foot: '<button type="button" class="btn" data-dlg-close>Cancel</button><button class="btn btn-ink" type="submit">Save</button>',
    onSubmit: fd => {
      const newKind = val(fd, 'kind') || k; const src = val(fd, 'source');
      if (newKind === 'confirmed' && !src) { UI.toast('Add where you confirmed it — that’s what makes it trustworthy.', 'warn'); return false; }
      const text = val(fd, 'text');
      const evIds = fd.getAll('evidence').map(String);
      commit(() => {
        if (f) {
          const before = f.kind;
          const label = mode === 'fill' ? `${f.text}: ${text}` : text;
          Object.assign(f, { text: mode === 'fill' ? label : text, kind: newKind, source: src, updatedAt: nowStamp(), why: fd.has('why') ? val(fd, 'why') : f.why });
          syncEvidenceLinks('facts', f, evIds);
          logEvent(caseId, 'understanding', before !== newKind ? `${FACT_KINDS[newKind].label}: ${f.text}${src ? ` (source: ${src})` : ''}` : `Updated: ${f.text}`);
        } else {
          const nf = Normalize.facts({ caseId, text, kind: newKind, source: src });
          S.facts.push(nf); syncEvidenceLinks('facts', nf, evIds);
          logEvent(caseId, 'understanding', `${FACT_KINDS[newKind].label}: ${text}${src ? ` (source: ${src})` : ''}`);
        }
      }, { caseId });
    },
  });
}
Actions['fact-add'] = el => openFact(el.dataset.case, { kind: el.dataset.kind, source: el.dataset.source });
Actions['fact-edit'] = el => { const f = findRec('facts', el.dataset.id); openFact(f.caseId, { id: f.id, mode: 'edit' }); };
Actions['fact-confirm'] = el => { const f = findRec('facts', el.dataset.id); openFact(f.caseId, { id: f.id, mode: 'confirm' }); };
Actions['fact-fill'] = el => { const f = findRec('facts', el.dataset.id); openFact(f.caseId, { id: f.id, mode: 'fill' }); };
Actions['fact-delete'] = el => { const f = findRec('facts', el.dataset.id); const tid = commit(() => deleteRecord('facts', f.id, `Detail: ${truncate(f.text, 60)}`), { caseId: f.caseId }); undoToast('Removed.', tid); };

/* ===== Consequences ===== */
function openCons(caseId, id = '') {
  const x = id ? findRec('consequences', id) : null;
  Dialog.open({
    title: x ? 'Edit consequence' : 'Add a consequence',
    body: `${field('What could happen, or has happened', inputEl('text', x ? x.text : '', 'required'))}
      ${segEl('status', Object.entries(CONS_STATUS), x ? x.status : 'potential', 'Status')}
      ${segEl('reversibility', Object.entries(REVERSIBILITY), x ? x.reversibility : 'unknown', 'If it happens, can it be undone?')}
      ${segEl('severity', [['1', 'Minor'], ['2', 'Significant'], ['3', 'Serious']], String(x ? x.severity : 2), 'How much would it matter?')}
      ${field('Note', inputEl('note', x ? x.note : ''))}`,
    foot: '<button type="button" class="btn" data-dlg-close>Cancel</button><button class="btn btn-ink" type="submit">Save</button>',
    onSubmit: fd => commit(() => {
      const data = { text: val(fd, 'text'), status: val(fd, 'status'), reversibility: val(fd, 'reversibility'), severity: Number(val(fd, 'severity')), note: val(fd, 'note') };
      if (x) Object.assign(x, data, { general: false }); else S.consequences.push(Normalize.consequences({ caseId, ...data }));
      logEvent(caseId, 'understanding', `${x ? 'Updated' : 'Added'} consequence: ${data.text} (${CONS_STATUS[data.status].toLowerCase()})`);
    }, { caseId }),
  });
}
Actions['cons-add'] = el => openCons(el.dataset.case);
Actions['cons-edit'] = el => { const x = findRec('consequences', el.dataset.id); openCons(x.caseId, x.id); };
Actions['cons-delete'] = el => { const x = findRec('consequences', el.dataset.id); const tid = commit(() => deleteRecord('consequences', x.id, `Consequence: ${truncate(x.text, 60)}`), { caseId: x.caseId }); undoToast('Removed.', tid); };
Changes['cons-status'] = el => { const x = findRec('consequences', el.dataset.id); commit(() => { x.status = el.value; logEvent(x.caseId, 'understanding', `${x.text}: ${CONS_STATUS[x.status].toLowerCase()}`); }, { caseId: x.caseId }); };

/* ===== Deadlines ===== */
function openDeadline(caseId, id = '') {
  const d = id ? findRec('deadlines', id) : null;
  Dialog.open({
    title: d ? 'Edit date' : 'Add a date',
    body: `${field('What is it?', inputEl('label', d ? d.label : '', 'required placeholder="e.g. Contest deadline, My target"'))}
      <div class="grid2">${field('Date', inputEl('date', d ? d.date : '', 'type="date" required'))}${field('Status', selectEl('status', Object.entries(DL_STATUS), d ? d.status : 'open'))}</div>
      ${segEl('kind', [['external', 'Their deadline'], ['self', 'Your own target']], d ? d.kind : 'external', 'Whose date is it?')}
      ${segEl('certainty', Object.entries(CERTAINTY), d ? d.certainty : 'reported', 'How sure is it?')}
      ${field('Source', inputEl('source', d ? d.source : '', 'placeholder="e.g. Printed on the notice"'))}`,
    foot: '<button type="button" class="btn" data-dlg-close>Cancel</button><button class="btn btn-ink" type="submit">Save</button>',
    onSubmit: fd => {
      const data = { label: val(fd, 'label'), date: val(fd, 'date'), status: val(fd, 'status'), kind: val(fd, 'kind'), certainty: val(fd, 'certainty'), source: val(fd, 'source') };
      if (!isISODate(data.date)) { UI.toast('Choose a valid date.', 'warn'); return false; }
      if (data.kind === 'external' && data.certainty === 'confirmed' && !data.source) { UI.toast('Add where the confirmed date comes from.', 'warn'); return false; }
      commit(() => {
        if (d) { const old = d.date; Object.assign(d, data); logEvent(caseId, 'date', `${data.label}: ${old !== data.date ? `moved from ${fmtDate(old)} to ` : ''}${fmtDate(data.date)} (${CERTAINTY[data.certainty].toLowerCase()})`); }
        else { S.deadlines.push(Normalize.deadlines({ caseId, ...data })); logEvent(caseId, 'date', `Added date: ${data.label} — ${fmtDate(data.date)} (${CERTAINTY[data.certainty].toLowerCase()})`); }
      }, { caseId });
    },
  });
}
Actions['dl-add'] = el => openDeadline(el.dataset.case);
Actions['dl-edit'] = el => { const d = findRec('deadlines', el.dataset.id); openDeadline(d.caseId, d.id); };
Actions['dl-met'] = el => { const d = findRec('deadlines', el.dataset.id); commit(() => { d.status = 'met'; logEvent(d.caseId, 'date', `Met: ${d.label}`); }, { caseId: d.caseId }); };
Actions['dl-delete'] = el => { const d = findRec('deadlines', el.dataset.id); const tid = commit(() => deleteRecord('deadlines', d.id, `Date: ${d.label}`), { caseId: d.caseId }); undoToast('Removed.', tid); };

/* ===== Paths ===== */
Actions['path-choose'] = el => {
  const p = findRec('paths', el.dataset.id);
  const n = commit(() => Ops.choosePath(p.id), { caseId: p.caseId });
  UI.toast(n ? `${plural(n, 'step')} added to the plan.` : 'Approach chosen.', 'ok', { label: 'See plan', fn: () => Router.go(`case/${encodeURIComponent(p.caseId)}/plan`) });
};
Actions['path-outcome'] = el => {
  const p = findRec('paths', el.dataset.id); const status = el.dataset.status;
  const q = { worked: 'What happened?', didnt_work: 'What happened? (Helps choose the next option.)', ruled_out: 'Why rule it out? (Optional)' }[status];
  Dialog.open({
    title: `${PATH_STATUS[status]}: ${p.title}`, body: field(q, textareaEl('note', p.note, 'rows="3"')),
    foot: '<button type="button" class="btn" data-dlg-close>Cancel</button><button class="btn btn-ink" type="submit">Save</button>',
    onSubmit: fd => {
      commit(() => Ops.setPathStatus(p.id, status, val(fd, 'note')), { caseId: p.caseId });
      if (status === 'worked') UI.toast('Good. Next, confirm it’s resolved — with evidence if you have it.', 'ok', { label: 'Resolve', fn: () => Router.go(`case/${encodeURIComponent(p.caseId)}/resolve`) });
      if (status === 'didnt_work') UI.toast('Noted. The other options are still here, re-ranked.', '');
    },
  });
};
Actions['path-reconsider'] = el => { const p = findRec('paths', el.dataset.id); commit(() => Ops.setPathStatus(p.id, 'considering'), { caseId: p.caseId }); };
Actions['path-delete'] = el => { const p = findRec('paths', el.dataset.id); const tid = commit(() => deleteRecord('paths', p.id, `Approach: ${p.title}`), { caseId: p.caseId }); undoToast('Approach removed. Its steps are kept.', tid); };
Actions['path-add'] = el => {
  const caseId = el.dataset.case;
  Dialog.open({
    title: 'Add your own approach',
    body: `${field('Approach', inputEl('title', '', 'required placeholder="e.g. Ask my bank to send a formal letter"'))}${field('Type', selectEl('approach', Object.entries(APPROACHES), 'direct'))}
      ${field('Why it might work', textareaEl('why', '', 'rows="2"'))}${field('Downsides', textareaEl('downsides', '', 'rows="2"'))}
      ${field('You’ll need (one per line)', textareaEl('prereq', '', 'rows="2"'))}${field('Uncertain (one per line)', textareaEl('uncertain', '', 'rows="2"'))}`,
    foot: '<button type="button" class="btn" data-dlg-close>Cancel</button><button class="btn btn-ink" type="submit">Add</button>',
    onSubmit: fd => commit(() => { const lines = k => val(fd, k).split('\n').map(x => x.trim()).filter(Boolean); S.paths.push(Normalize.paths({ caseId, custom: true, key: 'custom', title: val(fd, 'title'), approach: val(fd, 'approach'), why: val(fd, 'why'), downsides: val(fd, 'downsides'), prerequisites: lines('prereq'), uncertainties: lines('uncertain') })); logEvent(caseId, 'path', `Added an approach: ${val(fd, 'title')}`); }, { caseId }),
  });
};

/* ===== Tasks & docs ===== */
Forms['task-add'] = (fd, form) => {
  const text = val(fd, 'text'); if (!text) return;
  const caseId = form.dataset.case;
  commit(() => { const order = Math.max(-1, ...byCase('tasks', caseId).map(t => t.order)) + 1; S.tasks.push(Normalize.tasks({ caseId, text, effort: Number(val(fd, 'effort')) || 0, order })); logEvent(caseId, 'task', `Added step: ${text}`); }, { caseId });
};
Actions['task-move'] = el => {
  const t = findRec('tasks', el.dataset.id); const dir = Number(el.dataset.dir);
  const list = Engine.openTasks(t.caseId); const i = list.indexOf(t); const j = i + dir;
  if (j < 0 || j >= list.length) return;
  commit(() => { list.forEach((x, k) => { x.order = k; }); const tmp = list[i].order; list[i].order = list[j].order; list[j].order = tmp; }, { caseId: t.caseId });
};
Actions['task-delete'] = el => { const t = findRec('tasks', el.dataset.id); const tid = commit(() => deleteRecord('tasks', t.id, `Step: ${truncate(t.text, 60)}`), { caseId: t.caseId }); undoToast('Step removed.', tid); };
Actions['task-edit'] = el => {
  const t = findRec('tasks', el.dataset.id);
  const others = Engine.openTasks(t.caseId).filter(x => x.id !== t.id);
  const waits = Engine.openWaits(t.caseId);
  Dialog.open({
    title: 'Edit step',
    body: `${field('Step', inputEl('text', t.text, 'required'))}<div class="grid2">${field('Rough effort', selectEl('effort', [[0, 'Not set'], [5, '5 min'], [10, '10 min'], [15, '15 min'], [20, '20 min'], [30, '30 min'], [60, '1 hour'], [120, '2 hours']], t.effort))}${field('Can’t start until this case is resolved', selectEl('caseDep', [['', 'No other case'], ...caseOptions(t.caseId)], t.caseDep))}</div>
      ${waits.length ? field('Can’t start until you receive', selectEl('waitDep', [['', 'Nothing'], ...waits.map(w => [w.id, w.what])], t.waitDep)) : ''}
      ${others.length ? `<fieldset class="field"><legend class="label">Can’t start until these steps are done</legend>${others.map(o => `<label class="check" style="padding:5px 0"><input type="checkbox" name="dependsOn" value="${esc(o.id)}" ${t.dependsOn.includes(o.id) ? 'checked' : ''}><span class="small">${esc(o.text)}</span></label>`).join('')}</fieldset>` : ''}
      ${field('Note', textareaEl('note', t.note, 'rows="2"'))}`,
    foot: '<button type="button" class="btn" data-dlg-close>Cancel</button><button class="btn btn-ink" type="submit">Save</button>',
    onSubmit: fd => {
      const deps = fd.getAll('dependsOn').map(String);
      const cyclic = deps.some(d => (function reaches(id, seen = new Set()) { if (id === t.id) return true; if (seen.has(id)) return false; seen.add(id); const x = findRec('tasks', id); return !!x && x.dependsOn.some(n => reaches(n, seen)); })(d));
      if (cyclic) { UI.toast('That would make steps wait on each other forever. Choose different dependencies.', 'warn'); return false; }
      commit(() => { Object.assign(t, { text: val(fd, 'text') || t.text, effort: Number(val(fd, 'effort')) || 0, caseDep: val(fd, 'caseDep'), waitDep: fd.has('waitDep') ? val(fd, 'waitDep') : t.waitDep, dependsOn: deps, note: val(fd, 'note') }); logEvent(t.caseId, 'task', `Edited step: ${t.text}`); }, { caseId: t.caseId });
    },
  });
};
Forms['doc-add'] = (fd, form) => { const name = val(fd, 'name'); if (!name) return; commit(() => S.docs.push(Normalize.docs({ caseId: form.dataset.case, name })), { caseId: form.dataset.case }); };
Actions['doc-cycle'] = el => { const d = findRec('docs', el.dataset.id); const order = ['needed', 'have', 'sent']; commit(() => { d.status = order[(order.indexOf(d.status) + 1) % 3]; logEvent(d.caseId, 'task', `${d.name}: ${DOC_STATUS[d.status].toLowerCase()}`); }, { caseId: d.caseId }); };
Actions['doc-edit'] = el => {
  const d = findRec('docs', el.dataset.id);
  Dialog.open({
    title: 'Edit item to gather', body: `${field('Name', inputEl('name', d.name, 'required'))}${segEl('status', Object.entries(DOC_STATUS), d.status, 'Status')}${field('Where it is / value', inputEl('note', d.note))}${field('The evidence itself', selectEl('evidenceId', [['', 'Not linked'], ...byCase('evidence', d.caseId).map(e => [e.id, e.title])], d.evidenceId))}`,
    foot: '<button type="button" class="btn" data-dlg-close>Cancel</button><button class="btn btn-ink" type="submit">Save</button>',
    onSubmit: fd => commit(() => Object.assign(d, { name: val(fd, 'name'), status: val(fd, 'status'), note: val(fd, 'note'), evidenceId: val(fd, 'evidenceId') }), { caseId: d.caseId }),
  });
};
Actions['doc-delete'] = el => { const d = findRec('docs', el.dataset.id); const tid = commit(() => deleteRecord('docs', d.id, `To gather: ${d.name}`), { caseId: d.caseId }); undoToast('Removed.', tid); };

/* ===== Communication ===== */
Actions['compose'] = el => openComposer(el.dataset.case, { pathId: el.dataset.path || '', purpose: el.dataset.purpose || '', waitId: el.dataset.wait || '' });
Actions['comm-open'] = el => { const m = findRec('comms', el.dataset.id); openComposer(m.caseId, { commId: m.id }); };
Actions['comm-delete'] = el => { const m = findRec('comms', el.dataset.id); const tid = commit(() => deleteRecord('comms', m.id, `Message: ${m.subject || PURPOSES[m.purpose]}`), { caseId: m.caseId }); undoToast('Removed.', tid); };
Actions['comm-view'] = el => {
  const m = findRec('comms', el.dataset.id);
  const cm = S.commitments.filter(x => x.commId === m.id);
  Dialog.open({
    title: m.subject || PURPOSES[m.purpose], sub: `${CHANNELS[m.channel]} · ${m.direction === 'in' ? 'from them' : 'from you'} · ${COMM_STATUS[m.status]}${m.date ? ' · ' + fmtDate(m.date, { year: true }) : ''}`,
    body: `<dl class="kv">${m.contact ? `<dt>Contact</dt><dd>${esc(m.contact)}</dd>` : ''}${m.reference ? `<dt>Reference</dt><dd class="mono">${esc(m.reference)}</dd>` : ''}${m.direction === 'out' ? `<dt>Stance</dt><dd>${esc(STANCES[m.stance].label)}, ${esc(TONES[m.tone].toLowerCase())}</dd>` : ''}</dl>
      ${m.outcome ? `<div class="inset mt12"><p class="label">${m.channel === 'call' ? 'What happened' : 'Summary'}</p><p class="small draft">${esc(m.outcome)}</p></div>` : ''}
      ${m.questions.some(q => q.answer) ? `<div class="mt12"><p class="label">Answers you got</p><ul class="bullets">${m.questions.filter(q => q.answer).map(q => `<li><b>${esc(q.text)}</b> ${esc(q.answer)}</li>`).join('')}</ul></div>` : ''}
      ${cm.length ? `<div class="mt12"><p class="label">Commitments from this contact</p><ul class="bullets">${cm.map(x => `<li>${x.party === 'them' ? 'They' : 'You'}: ${esc(x.text)}${x.due ? ` (by ${esc(fmtDate(x.due))})` : ''} — ${esc(COMMIT_STATUS[x.status].toLowerCase())}</li>`).join('')}</ul></div>` : ''}
      ${m.body ? `<details class="disclose" ${m.outcome ? '' : 'open'}><summary>${m.channel === 'call' ? 'Script' : 'Message'}</summary><p class="draft mt8">${esc(m.body)}</p></details>` : ''}`,
    foot: `${m.body ? `<button type="button" class="btn" data-act="copy" data-text="${esc(m.body)}">Copy text</button>` : ''}${m.status === 'sent' && m.channel !== 'call' ? `<button type="button" class="btn" data-act="incoming" data-case="${esc(m.caseId)}" data-dlg-close>Log their reply</button>` : ''}<button type="button" class="btn btn-ink" data-dlg-close>Close</button>`,
  });
};

function openComposer(caseId, init = {}) {
  const c = getCase(caseId);
  const existing = init.commId ? findRec('comms', init.commId) : null;
  const st = existing ? { channel: existing.channel, purpose: existing.purpose, stance: existing.stance, tone: existing.tone, proposal: existing.proposal, replyBy: existing.replyBy, pathId: existing.pathId, includeFacts: true, reason: '', waitId: '' } : { ...Comms.defaults(caseId, init), reason: '' };
  let draft = existing ? { subject: existing.subject, body: existing.body } : Comms.compose(caseId, st);
  let edited = existing ? existing.edited : false;
  const paths = S.paths.filter(p => p.caseId === caseId && ['considering', 'chosen'].includes(p.status));
  const body = `
    <div class="grid2">${segEl('channel', entriesOf(CHANNELS).filter(([k]) => k !== 'in_person'), st.channel, 'How')}${field('Purpose', selectEl('purpose', entriesOf(PURPOSES), st.purpose))}</div>
    <fieldset class="field"><legend class="label">Stance — what you’re acknowledging, conceding or claiming</legend><div class="choices" style="grid-template-columns:repeat(auto-fill,minmax(190px,1fr))">${Object.entries(STANCES).map(([k, v]) => `<label class="choice"><input type="radio" name="stance" value="${k}" ${st.stance === k ? 'checked' : ''}><span class="box"><b>${esc(v.label)}</b><small>${esc(v.desc)}</small></span></label>`).join('')}</div></fieldset>
    <div class="grid2">${segEl('tone', entriesOf(TONES), st.tone, 'Tone')}${field('Approach', selectEl('pathId', [['', 'Not tied to an approach'], ...paths.map(p => [p.id, p.title])], st.pathId))}</div>
    <details class="disclose"><summary>Details for the draft</summary><div class="grid2 mt8">
      ${field('Your proposal or details', inputEl('proposal', st.proposal, 'placeholder="e.g. $50 a month from next week"'), 'For arrangements, negotiating, rebooking and updates.')}
      ${field('Why you disagree', inputEl('reason', st.reason, 'placeholder="e.g. I paid on the 3rd — confirmation attached"'), 'Used with the Dispute stance.')}
      ${field('Reply by', inputEl('replyBy', st.replyBy, 'type="date"'), 'Used with a firm tone.')}
      <label class="check" style="align-self:center"><input type="checkbox" name="includeFacts" ${st.includeFacts ? 'checked' : ''}><span class="small">Include confirmed details only</span></label>
    </div></details>
    <div class="between mt16"><p class="xs muted" data-role="edited-note"></p><button type="button" class="btn btn-sm" data-role="regen">Regenerate from options</button></div>
    <div data-role="subject-wrap" class="mt8">${field('Subject', inputEl('subject', draft.subject))}</div>
    ${field('Draft', `<textarea class="textarea tall" name="body" aria-describedby="draft-hint">${esc(draft.body)}</textarea>`, '<span id="draft-hint">[Square brackets] mark details only you can fill in. Nothing is sent from here.</span>')}
    <div data-role="checks" class="stack stack-sm mt12"></div>
    <div data-role="callplan" class="mt12"></div>`;
  const foot = `${existing ? '<button type="button" class="btn btn-ghost btn-danger" data-role="delete">Delete</button>' : ''}<span class="spacer"></span>
    <button type="button" class="btn" data-role="copy">${ico('copy', 'sm')}Copy</button><button type="button" class="btn" data-role="mailto">${ico('mail', 'sm')}Email app</button><button type="button" class="btn" data-role="download">${ico('download', 'sm')}.txt</button>
    <button type="submit" class="btn" name="act" value="save">Save draft</button><button type="submit" class="btn btn-ink" name="act" value="sent" data-role="primary">Mark as sent</button>`;
  Dialog.open({
    title: existing ? (existing.channel === 'call' ? 'Call script' : 'Edit draft') : 'Prepare a message', sub: esc(c.title), body, foot, size: 'wide full',
    onOpen: form => {
      const $ = sel => form.querySelector(sel);
      const read = () => { const fd = new FormData(form); ['channel', 'purpose', 'stance', 'tone', 'pathId', 'proposal', 'replyBy', 'reason'].forEach(k => { st[k] = val(fd, k) || (k === 'pathId' || k === 'proposal' || k === 'replyBy' || k === 'reason' ? '' : st[k]); }); st.includeFacts = fd.has('includeFacts'); };
      const refresh = () => {
        const call = st.channel === 'call';
        $('[data-role=subject-wrap]').hidden = call;
        $('[data-role=mailto]').hidden = st.channel !== 'email';
        $('[data-role=download]').hidden = call;
        $('[data-role=primary]').textContent = call ? 'Record the call' : 'Mark as sent';
        $('[data-role=edited-note]').textContent = edited ? 'You’ve edited the text, so changing options won’t overwrite it.' : 'The draft updates as you change the options.';
        const text = `${call ? '' : $('[name=subject]').value + '\n'}${$('[name=body]').value}`;
        const checks = Comms.preflight(caseId, text, st);
        $('[data-role=checks]').innerHTML = checks.length ? `<p class="label">Before you send</p>${checks.map(ch => `<div class="banner ${ch.level === 'warn' ? 'warn' : 'info'}"><p>${esc(ch.text)}</p></div>`).join('')}` : '<div class="banner ok"><p>No placeholders left, nothing unconfirmed, and the stance matches your approach.</p></div>';
        if (call) { const plan = Comms.callPlan(caseId, st); $('[data-role=callplan]').innerHTML = `<div class="grid2"><div class="inset"><p class="label">Have ready</p><ul class="bullets">${plan.checklist.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div><div class="inset"><p class="label">Questions to ask</p><ul class="bullets">${plan.questions.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div></div>`; }
        else $('[data-role=callplan]').innerHTML = '';
      };
      const regen = () => { draft = Comms.compose(caseId, st); $('[name=subject]').value = draft.subject; $('[name=body]').value = draft.body; edited = false; refresh(); };
      form.addEventListener('change', e => { if (['channel', 'purpose', 'stance', 'tone', 'pathId', 'includeFacts', 'replyBy'].includes(e.target.name)) { read(); if (!edited) regen(); else refresh(); } });
      form.addEventListener('input', e => { if (e.target.name === 'body' || e.target.name === 'subject') { edited = true; refresh(); } else if (['proposal', 'reason'].includes(e.target.name)) { read(); if (!edited) regen(); } });
      $('[data-role=regen]').addEventListener('click', async () => { read(); if (edited && !await confirmDialog({ title: 'Replace your edits?', text: 'Regenerating rewrites the draft from the options and discards your changes to the text.', ok: 'Replace' })) return; regen(); });
      $('[data-role=copy]').addEventListener('click', async () => { const call = st.channel === 'call'; const ok = await copyText(call ? $('[name=body]').value : `Subject: ${$('[name=subject]').value}\n\n${$('[name=body]').value}`); UI.toast(ok ? 'Copied.' : 'Couldn’t copy — select the text and copy it manually.', ok ? 'ok' : 'warn'); });
      $('[data-role=mailto]').addEventListener('click', () => { const a = document.createElement('a'); a.href = `mailto:?subject=${encodeURIComponent($('[name=subject]').value)}&body=${encodeURIComponent($('[name=body]').value)}`; a.target = '_blank'; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove(); UI.toast('Opened in your email app — nothing is sent until you press send there.'); });
      $('[data-role=download]').addEventListener('click', () => downloadText(`${safeFileName($('[name=subject]').value || 'message')}.txt`, `${$('[name=subject]').value}\n\n${$('[name=body]').value}`));
      const del = $('[data-role=delete]');
      if (del) del.addEventListener('click', async () => { if (!await confirmDialog({ title: 'Delete this draft?', text: 'It will move to the trash.', ok: 'Delete', danger: true })) return; const tid = commit(() => deleteRecord('comms', existing.id, `Draft: ${existing.subject}`), { caseId }); Dialog.close(); undoToast('Draft removed.', tid); });
      refresh();
    },
    onSubmit: (fd, form, submitter) => {
      const act = submitter && submitter.value === 'sent' ? 'sent' : 'save';
      const plan = Comms.callPlan(caseId, st);
      const data = { caseId, channel: st.channel, purpose: st.purpose, stance: st.stance, tone: st.tone, proposal: st.proposal, replyBy: st.replyBy, pathId: st.pathId, subject: val(fd, 'subject') || draft.subject, body: String(fd.get('body') || ''), edited, direction: 'out' };
      let id = existing ? existing.id : '';
      commit(() => {
        if (existing) { Object.assign(existing, data); if (st.channel === 'call' && !existing.checklist.length) { existing.checklist = plan.checklist.map(t => ({ id: uid('ck'), text: t, done: false })); existing.questions = plan.questions.map(t => ({ id: uid('q'), text: t, answer: '' })); } }
        else { const m = Normalize.comms({ ...data, status: 'draft', checklist: st.channel === 'call' ? plan.checklist.map(t => ({ text: t })) : [], questions: st.channel === 'call' ? plan.questions.map(t => ({ text: t })) : [] }); S.comms.push(m); id = m.id; logEvent(caseId, 'comm', `Drafted: ${m.subject} (${CHANNELS[m.channel].toLowerCase()}, ${STANCES[m.stance].label.toLowerCase()})`); }
      }, { caseId });
      if (act === 'save') { UI.toast('Draft saved in Contact.', 'ok'); return; }
      setTimeout(() => (st.channel === 'call' ? openCallNotes(id) : openMarkSent(id, init.waitId || st.waitId)), 60);
    },
  });
}

function openMarkSent(commId, waitId = '') {
  const m = findRec('comms', commId); const c = getCase(m.caseId);
  const w = waitId ? findRec('waits', waitId) : null;
  Dialog.open({
    title: 'Mark as sent', sub: esc(m.subject),
    body: `${field('Sent on', inputEl('date', today(), 'type="date" required'))}
      <label class="check mt12"><input type="checkbox" name="track" checked><span class="small">${w ? `Update the waiting item “${esc(w.what)}”` : 'Track their reply in Waiting'}</span></label>
      <div class="grid2 mt12">${field('Expect a reply by', inputEl('expectedBy', offset(m.purpose === 'escalate' ? 10 : 7), 'type="date"'), 'Your estimate unless they’ve promised a date.')}${field('Follow up if nothing by', inputEl('followUpOn', offset(m.purpose === 'escalate' ? 11 : 8), 'type="date"'))}</div>
      ${!w ? field('What are you waiting for?', selectEl('kind', Object.entries(WAIT_KINDS).map(([k, v]) => [k, v.long]), m.purpose === 'arrangement' || m.purpose === 'request' ? 'decision' : 'response')) : ''}`,
    foot: '<button type="button" class="btn" data-dlg-close>Not now</button><button class="btn btn-ink" type="submit">Save</button>',
    onSubmit: fd => commit(() => {
      const date = val(fd, 'date') || today();
      m.status = 'sent'; m.date = date;
      logEvent(m.caseId, 'comm', `Sent: ${m.subject} (${CHANNELS[m.channel].toLowerCase()})`);
      if (!fd.has('track')) return;
      if (w) { w.log.push({ id: uid('wl'), date, note: `${m.purpose === 'escalate' ? 'Escalated' : 'Followed up'} by ${CHANNELS[m.channel].toLowerCase()}: ${m.subject}` }); w.followUpOn = val(fd, 'followUpOn'); if (m.purpose === 'escalate') w.status = 'escalated'; if (!w.expectedBy || daysUntil(w.expectedBy) < 0) { w.expectedBy = val(fd, 'expectedBy'); w.basis = 'estimate'; } }
      else S.waits.push(Normalize.waits({ caseId: m.caseId, kind: val(fd, 'kind'), what: `Reply to: ${m.subject}`, from: c.counterparty, since: date, expectedBy: val(fd, 'expectedBy'), basis: 'estimate', followUpOn: val(fd, 'followUpOn'), log: [{ date, note: `Sent ${CHANNELS[m.channel].toLowerCase()}: ${m.subject}` }] }));
    }, { caseId: m.caseId }),
  });
}

function commitmentRows(prefix, n = 1) {
  return `<div data-rows="${prefix}">${Array.from({ length: n }).map(() => commitmentRow(prefix)).join('')}</div><button type="button" class="btn btn-xs btn-ghost mt8" data-add-row="${prefix}">+ Another</button>`;
}
function commitmentRow(prefix) {
  return `<div class="grid2" style="grid-template-columns:2fr 1fr;margin-top:6px"><input class="input" name="${prefix}_text" placeholder="${prefix === 'them' ? 'e.g. send written confirmation of the waiver' : 'e.g. pay the balance'}" aria-label="What"><input class="input" type="date" name="${prefix}_due" aria-label="By when"></div>`;
}
function wireRows(form) { form.querySelectorAll('[data-add-row]').forEach(b => b.addEventListener('click', () => { const p = b.dataset.addRow; form.querySelector(`[data-rows="${p}"]`).insertAdjacentHTML('beforeend', p === 'fact' ? factRow() : commitmentRow(p)); })); }
const factRow = () => '<input class="input mt8" name="fact_text" placeholder="e.g. The balance is $86.40 including the fee" aria-label="Fact learned">';
function saveCommitmentsAndFacts(fd, caseId, commId, source) {
  const out = { them: 0, me: 0, facts: 0 };
  ['them', 'me'].forEach(p => {
    const texts = fd.getAll(`${p}_text`).map(String); const dues = fd.getAll(`${p}_due`).map(String);
    texts.forEach((t, i) => { if (t.trim()) { Ops.addCommitment(caseId, { party: p, text: t.trim(), due: isISODate(dues[i]) ? dues[i] : '', commId, waitKind: p === 'them' ? (val(fd, 'waitKind') || 'action') : '' }); out[p]++; } });
  });
  fd.getAll('fact_text').map(String).forEach(t => { if (t.trim()) { S.facts.push(Normalize.facts({ caseId, kind: 'confirmed', text: t.trim(), source })); logEvent(caseId, 'understanding', `Confirmed: ${t.trim()} (source: ${source})`); out.facts++; } });
  return out;
}

function openCallNotes(commId) {
  const m = findRec('comms', commId); const c = getCase(m.caseId);
  Dialog.open({
    title: 'Call notes', sub: esc(c.title) + (c.counterparty ? ' · ' + esc(c.counterparty) : ''), size: 'wide full',
    body: `<details class="disclose" style="border-top:0;margin-top:0;padding-top:0"><summary>Your script</summary><p class="draft mt8 small">${esc(m.body)}</p></details>
      ${m.checklist.length ? `<fieldset class="field mt12"><legend class="label">Have ready</legend>${m.checklist.map(i => `<label class="check" style="padding:5px 0"><input type="checkbox" name="ck" value="${esc(i.id)}" ${i.done ? 'checked' : ''}><span class="small">${esc(i.text)}</span></label>`).join('')}</fieldset>` : ''}
      <div class="grid3 mt12">${field('Date', inputEl('date', m.date || today(), 'type="date"'))}${field('Who you spoke to', inputEl('contact', m.contact, 'placeholder="Name"'))}${field('Reference number', inputEl('reference', m.reference, 'class="input mono"'))}</div>
      ${m.questions.length ? `<fieldset class="field mt12"><legend class="label">Questions to ask — note the answers</legend>${m.questions.map(q => `<label class="field" style="margin-top:8px"><span class="small">${esc(q.text)}</span><input class="input" name="qa_${esc(q.id)}" value="${esc(q.answer)}"></label>`).join('')}</fieldset>` : ''}
      ${field('What happened', textareaEl('outcome', m.outcome, 'rows="3" placeholder="What did they agree to, refuse, or explain?"'))}
      <fieldset class="field"><legend class="label">They committed to…</legend>${commitmentRows('them')}<div class="mt8">${field('Track their promises as', selectEl('waitKind', Object.entries(WAIT_KINDS).map(([k, v]) => [k, v.long]), 'action'))}</div></fieldset>
      <fieldset class="field"><legend class="label">You committed to…</legend>${commitmentRows('me')}</fieldset>
      <fieldset class="field"><legend class="label">Facts you learned (saved as confirmed)</legend><div data-rows="fact">${factRow()}</div><button type="button" class="btn btn-xs btn-ghost mt8" data-add-row="fact">+ Another</button></fieldset>
      <label class="check mt12"><input type="checkbox" name="asEvidence" checked><span class="small">Save this call record as evidence</span></label>`,
    foot: '<button type="button" class="btn" data-dlg-close>Cancel</button><button class="btn btn-ink" type="submit">Save call record</button>',
    onOpen: wireRows,
    onSubmit: fd => {
      const date = val(fd, 'date') || today();
      const r = commit(() => {
        const checked = fd.getAll('ck').map(String);
        m.checklist.forEach(i => { i.done = checked.includes(i.id); });
        m.questions.forEach(q => { q.answer = val(fd, `qa_${q.id}`); });
        Object.assign(m, { status: 'done', date, contact: val(fd, 'contact'), reference: val(fd, 'reference'), outcome: val(fd, 'outcome') });
        logEvent(m.caseId, 'comm', `Call${m.contact ? ' with ' + m.contact : ''}${m.reference ? ' (ref ' + m.reference + ')' : ''}${m.outcome ? ': ' + truncate(m.outcome, 300) : ''}`);
        const source = `Call${m.contact ? ' with ' + m.contact : ''} on ${fmtDate(date, { year: true })}`;
        const out = saveCommitmentsAndFacts(fd, m.caseId, m.id, source);
        m.questions.filter(q => q.answer).forEach(q => { S.facts.push(Normalize.facts({ caseId: m.caseId, kind: 'confirmed', text: `${q.text.replace(/^Can you confirm:\s*/i, '').replace(/\?$/, '')}: ${q.answer}`, source })); out.facts++; });
        if (fd.has('asEvidence')) S.evidence.push(Normalize.evidence({ caseId: m.caseId, type: 'call_note', title: `Call record — ${fmtDate(date)}${m.contact ? ', ' + m.contact : ''}`, reference: m.reference, note: m.outcome, date, links: [{ t: 'comms', id: m.id }, ...S.commitments.filter(x => x.commId === m.id).map(x => ({ t: 'commitments', id: x.id }))] }));
        return out;
      }, { caseId: m.caseId });
      UI.toast(`Call recorded.${r.them ? ` ${plural(r.them, 'promise')} now tracked in Waiting.` : ''}${r.facts ? ` ${plural(r.facts, 'fact')} confirmed.` : ''}`, 'ok');
    },
  });
}

Actions['incoming'] = el => {
  const caseId = el.dataset.case; const c = getCase(caseId);
  const waits = Engine.openWaits(caseId);
  Dialog.open({
    title: 'Log a reply or contact', sub: esc(c.title),
    body: `<div class="grid2">${field('How', selectEl('channel', entriesOf(CHANNELS), 'email'))}${field('Date', inputEl('date', today(), 'type="date"'))}</div>
      <div class="grid2">${field('From', inputEl('contact', '', 'placeholder="Name or team"'))}${field('Reference', inputEl('reference', '', 'class="input mono"'))}</div>
      ${field('What did they say?', textareaEl('outcome', '', 'rows="3" required'))}
      ${waits.length ? field('Does this answer something you were waiting for?', selectEl('waitId', [['', 'No'], ...waits.map(w => [w.id, w.what])], waits.length === 1 ? waits[0].id : '')) : ''}
      <fieldset class="field"><legend class="label">They committed to…</legend>${commitmentRows('them')}<div class="mt8">${field('Track their promises as', selectEl('waitKind', Object.entries(WAIT_KINDS).map(([k, v]) => [k, v.long]), 'action'))}</div></fieldset>
      <fieldset class="field"><legend class="label">Facts confirmed by this reply</legend><div data-rows="fact">${factRow()}</div><button type="button" class="btn btn-xs btn-ghost mt8" data-add-row="fact">+ Another</button></fieldset>
      <label class="check mt12"><input type="checkbox" name="asEvidence" checked><span class="small">Save as evidence</span></label>`,
    foot: '<button type="button" class="btn" data-dlg-close>Cancel</button><button class="btn btn-ink" type="submit">Save</button>',
    onOpen: wireRows,
    onSubmit: fd => {
      const date = val(fd, 'date') || today(); const ch = val(fd, 'channel'); const outcome = val(fd, 'outcome');
      commit(() => {
        const m = Normalize.comms({ caseId, channel: ch, direction: 'in', status: 'received', date, contact: val(fd, 'contact'), reference: val(fd, 'reference'), outcome, subject: `Reply${val(fd, 'contact') ? ' from ' + val(fd, 'contact') : ''}`, edited: true });
        S.comms.push(m);
        logEvent(caseId, 'comm', `Received (${CHANNELS[ch].toLowerCase()}): ${truncate(outcome, 300)}`);
        const wid = val(fd, 'waitId'); if (wid) Ops.receiveWait(wid, truncate(outcome, 300), date);
        saveCommitmentsAndFacts(fd, caseId, m.id, `${CHANNELS[ch]} from ${val(fd, 'contact') || 'them'}, ${fmtDate(date, { year: true })}`);
        if (fd.has('asEvidence')) S.evidence.push(Normalize.evidence({ caseId, type: ch === 'letter' ? 'letter' : ch === 'email' ? 'email' : 'other', title: `${CHANNELS[ch]} from ${val(fd, 'contact') || c.counterparty || 'them'} — ${fmtDate(date)}`, reference: val(fd, 'reference'), note: outcome, date, links: [{ t: 'comms', id: m.id }] }));
      }, { caseId });
      UI.toast('Recorded.', 'ok');
    },
  });
};

/* ===== Commitments ===== */
Actions['cmt-add'] = el => {
  const caseId = el.dataset.case;
  Dialog.open({
    title: 'Add a commitment', body: `${segEl('party', [['them', 'They committed'], ['me', 'I committed']], 'them', 'Who')}${field('What', inputEl('text', '', 'required'))}${field('By when', inputEl('due', '', 'type="date"'))}${field('If theirs, track it in Waiting as', selectEl('waitKind', [['', 'Don’t track'], ...Object.entries(WAIT_KINDS).map(([k, v]) => [k, v.long])], 'action'))}`,
    foot: '<button type="button" class="btn" data-dlg-close>Cancel</button><button class="btn btn-ink" type="submit">Add</button>',
    onSubmit: fd => commit(() => Ops.addCommitment(caseId, { party: val(fd, 'party'), text: val(fd, 'text'), due: val(fd, 'due'), waitKind: val(fd, 'party') === 'them' ? val(fd, 'waitKind') : '' }), { caseId }),
  });
};
Actions['cmt-status'] = el => {
  const m = findRec('commitments', el.dataset.id); const status = el.dataset.status;
  commit(() => {
    m.status = status;
    logEvent(m.caseId, 'commitment', `${m.party === 'them' ? 'Their' : 'Your'} commitment “${truncate(m.text, 80)}”: ${COMMIT_STATUS[status].toLowerCase()}`);
    const w = m.waitId ? findRec('waits', m.waitId) : null;
    if (w && status === 'kept' && w.status !== 'received') Ops.receiveWait(w.id, 'Commitment kept');
    if (w && status === 'missed' && w.status === 'waiting') w.basis = 'promised';
  }, { caseId: m.caseId });
  if (status === 'missed' && m.party === 'them') UI.toast('Noted. A missed promise is a fair basis to escalate.', '', { label: 'Draft escalation', fn: () => openComposer(m.caseId, { purpose: 'escalate', waitId: m.waitId }) });
};
Actions['cmt-delete'] = el => { const m = findRec('commitments', el.dataset.id); const tid = commit(() => deleteRecord('commitments', m.id, `Commitment: ${truncate(m.text, 60)}`), { caseId: m.caseId }); undoToast('Removed.', tid); };

/* ===== Waiting ===== */
function openWait(caseId, id = '') {
  const w = id ? findRec('waits', id) : null;
  const c = caseId ? getCase(caseId) : null;
  const cases = caseOptions();
  if (!caseId && !cases.length) { UI.toast('Start a case first — waiting items belong to a case.'); return; }
  Dialog.open({
    title: w ? 'Edit waiting item' : 'Track something you’re waiting for',
    body: `${!caseId ? field('Case', selectEl('caseId', cases, cases[0][0])) : ''}
      ${field('What are you waiting for?', inputEl('what', w ? w.what : '', 'required placeholder="e.g. Refund of $142.40"'))}
      <div class="grid2">${field('Kind', selectEl('kind', Object.entries(WAIT_KINDS).map(([k, v]) => [k, v.label]), w ? w.kind : 'response'))}${field('From', inputEl('from', w ? w.from : (c ? c.counterparty : '')))}</div>
      <div class="grid2">${field('Waiting since', inputEl('since', w ? w.since : today(), 'type="date"'))}${field('Expected by', inputEl('expectedBy', w ? w.expectedBy : '', 'type="date"'))}</div>
      ${segEl('basis', [['promised', 'They promised it'], ['policy', 'Their stated timeframe'], ['estimate', 'My estimate']], w ? w.basis : 'estimate', 'Where does that date come from?')}
      <div class="grid2">${field('Follow up on', inputEl('followUpOn', w ? w.followUpOn : offset(7), 'type="date"'))}${field('Reference', inputEl('reference', w ? w.reference : '', 'class="input mono"'))}</div>
      ${w ? field('Status', selectEl('status', Object.entries(WAIT_STATUS), w.status)) : ''}`,
    foot: `${w ? '<button type="button" class="btn btn-ghost btn-danger" data-role="del">Delete</button><span class="spacer"></span>' : ''}<button type="button" class="btn" data-dlg-close>Cancel</button><button class="btn btn-ink" type="submit">Save</button>`,
    onOpen: form => { const d = form.querySelector('[data-role=del]'); if (d) d.addEventListener('click', () => { const tid = commit(() => deleteRecord('waits', w.id, `Waiting: ${w.what}`), { caseId: w.caseId }); Dialog.close(); undoToast('Removed.', tid); }); },
    onSubmit: fd => {
      const data = { what: val(fd, 'what'), kind: val(fd, 'kind'), from: val(fd, 'from'), since: val(fd, 'since') || today(), expectedBy: val(fd, 'expectedBy'), basis: val(fd, 'basis'), followUpOn: val(fd, 'followUpOn'), reference: val(fd, 'reference') };
      if (data.basis === 'promised' && !data.expectedBy) { UI.toast('Add the date they promised.', 'warn'); return false; }
      const cid = caseId || val(fd, 'caseId');
      commit(() => {
        if (w) { Object.assign(w, data, { status: val(fd, 'status') || w.status }); logEvent(w.caseId, 'wait', `Updated waiting item: ${w.what}`); }
        else { S.waits.push(Normalize.waits({ caseId: cid, ...data, log: [{ date: data.since, note: 'Started tracking.' }] })); logEvent(cid, 'wait', `Waiting for: ${data.what}${data.expectedBy ? ` (expected ${fmtDate(data.expectedBy)}, ${data.basis === 'promised' ? 'promised' : data.basis === 'policy' ? 'their timeframe' : 'estimate'})` : ''}`); }
      }, { caseId: cid });
    },
  });
}
Actions['wait-new'] = el => openWait(el.dataset.case || '');
Actions['wait-edit'] = el => { const w = findRec('waits', el.dataset.id); openWait(w.caseId, w.id); };
Actions['wait-log'] = el => {
  const w = findRec('waits', el.dataset.id);
  Dialog.open({
    title: 'Log an update', sub: esc(w.what),
    body: `${field('What happened?', textareaEl('note', '', 'rows="3" required placeholder="e.g. Called — they said it was approved and will pay within 5 business days"'))}<div class="grid2">${field('Next follow-up', inputEl('followUpOn', offset(7), 'type="date"'))}${field('Status', selectEl('status', [['waiting', 'Still waiting'], ['escalated', 'Escalated']], w.status === 'escalated' ? 'escalated' : 'waiting'))}</div>
      ${field('New expected date (if they gave one)', inputEl('expectedBy', '', 'type="date"'))}<label class="check"><input type="checkbox" name="promised"><span class="small">They promised that date</span></label>`,
    foot: '<button type="button" class="btn" data-dlg-close>Cancel</button><button class="btn btn-ink" type="submit">Save</button>',
    onSubmit: fd => commit(() => {
      const note = val(fd, 'note');
      w.log.push({ id: uid('wl'), date: today(), note }); w.followUpOn = val(fd, 'followUpOn'); w.status = val(fd, 'status');
      if (isISODate(val(fd, 'expectedBy'))) { w.expectedBy = val(fd, 'expectedBy'); w.basis = fd.has('promised') ? 'promised' : 'estimate'; if (fd.has('promised')) Ops.addCommitment(w.caseId, { party: 'them', text: w.what, due: w.expectedBy }); }
      logEvent(w.caseId, 'wait', `${w.what}: ${note}`);
    }, { caseId: w.caseId }),
  });
};
Actions['wait-receive'] = el => {
  const w = findRec('waits', el.dataset.id);
  Dialog.open({
    title: 'Received', sub: esc(w.what),
    body: `${field('What did you receive?', inputEl('outcome', '', 'placeholder="e.g. $142.40 refunded to card, Nov 30"'))}${field('Date', inputEl('date', today(), 'type="date"'))}
      <label class="check mt8"><input type="checkbox" name="asEvidence" checked><span class="small">Save as evidence</span></label>${field('Reference (optional)', inputEl('reference', w.reference, 'class="input mono"'))}
      <p class="xs muted mt12">Receiving something isn’t always the end. You can check it against the case’s resolution criteria next.</p>`,
    foot: '<button type="button" class="btn" data-dlg-close>Cancel</button><button class="btn btn-sage" type="submit">Mark received</button>',
    onSubmit: fd => {
      commit(() => {
        Ops.receiveWait(w.id, val(fd, 'outcome'), val(fd, 'date'));
        if (fd.has('asEvidence')) S.evidence.push(Normalize.evidence({ caseId: w.caseId, type: w.kind === 'payment' ? 'confirmation' : w.kind === 'document' ? 'letter' : 'other', title: `Received: ${w.what}`, reference: val(fd, 'reference'), note: val(fd, 'outcome'), date: val(fd, 'date') || today(), links: [{ t: 'waits', id: w.id }, ...(w.commitmentId ? [{ t: 'commitments', id: w.commitmentId }] : [])] }));
      }, { caseId: w.caseId });
      UI.toast('Marked received.', 'ok', { label: 'Check resolution', fn: () => Router.go(`case/${encodeURIComponent(w.caseId)}/resolve`) });
    },
  });
};

/* ===== Evidence ===== */
function openEvidence({ caseId = '', id = '', linkTo = null } = {}) {
  const e = id ? findRec('evidence', id) : null;
  const cid = e ? e.caseId : caseId;
  const linkables = cid ? [
    ['facts', 'Facts', byCase('facts', cid).filter(f => f.kind !== 'missing'), f => f.text],
    ['criteria', 'Resolution criteria', byCase('criteria', cid), x => x.text],
    ['commitments', 'Commitments', byCase('commitments', cid), x => `${x.party === 'them' ? 'They' : 'You'}: ${x.text}`],
    ['comms', 'Communications', byCase('comms', cid), x => x.subject || PURPOSES[x.purpose]],
    ['waits', 'Waiting items', byCase('waits', cid), x => x.what],
    ['tasks', 'Steps', byCase('tasks', cid), x => x.text],
    ['deadlines', 'Dates', byCase('deadlines', cid), x => x.label],
  ].filter(g => g[2].length) : [];
  const links = e ? e.links : (linkTo ? [linkTo] : []);
  const isLinked = (t, i) => links.some(l => l.t === t && l.id === i);
  Dialog.open({
    title: e ? 'Edit evidence' : 'Add evidence', size: 'wide',
    body: `${!cid ? field('Case', selectEl('caseId', [['', 'Not filed to a case'], ...S.cases.map(c => [c.id, c.title])], '')) : ''}
      <div class="grid2">${field('Title', inputEl('title', e ? e.title : '', 'required placeholder="e.g. Fee reversal confirmation email"'))}${field('Type', selectEl('type', Object.entries(EVIDENCE_TYPES), e ? e.type : 'confirmation'))}</div>
      <div class="grid2">${field('Date', inputEl('date', e ? e.date : today(), 'type="date"'))}${field('Reference / confirmation number', inputEl('reference', e ? e.reference : '', 'class="input mono"'))}</div>
      ${field('Where the original is kept', inputEl('location', e ? e.location : '', 'placeholder="e.g. Email folder “Receipts”, glovebox"'))}
      ${field('Notes', textareaEl('note', e ? e.note : '', 'rows="2"'))}
      ${IDB.available ? field(e && e.file ? `File: ${esc(e.file.name)} (${esc(fmtBytes(e.file.size))}) — choose another to replace it` : 'Attach a file (optional)', `<input class="input" type="file" name="file" accept="image/*,.pdf,.txt,.csv,.eml,.doc,.docx,.heic">`, `Stored only on this device, up to ${fmtBytes(APP.maxFileBytes)}. A fingerprint is saved so you can show it hasn’t changed.`) : '<p class="banner warn"><span>This browser’s file store isn’t available, so files can’t be attached. You can still record the reference and where the original is kept.</span></p>'}
      ${linkables.length ? `<details class="disclose" ${linkTo || (e && e.links.length) ? 'open' : ''}><summary>What does this prove?</summary>${linkables.map(([t, label, items, text]) => `<fieldset class="field mt8"><legend class="label">${label}</legend>${items.map(it => `<label class="check" style="padding:4px 0"><input type="checkbox" name="link" value="${t}:${esc(it.id)}" ${isLinked(t, it.id) ? 'checked' : ''}><span class="small">${esc(truncate(text(it), 90))}</span></label>`).join('')}</fieldset>`).join('')}</details>` : ''}`,
    foot: '<button type="button" class="btn" data-dlg-close>Cancel</button><button class="btn btn-ink" type="submit">Save</button>',
    onSubmit: async fd => {
      const file = fd.get('file');
      const hasFile = file && typeof file === 'object' && file.size > 0;
      const finalCase = cid || val(fd, 'caseId');
      const newLinks = fd.getAll('link').map(String).map(s => { const i = s.indexOf(':'); return { t: s.slice(0, i), id: s.slice(i + 1) }; });
      const data = { title: val(fd, 'title'), type: val(fd, 'type'), date: val(fd, 'date'), reference: val(fd, 'reference'), location: val(fd, 'location'), note: val(fd, 'note'), links: newLinks };
      let built = null;
      if (hasFile || !e) built = await Ops.addEvidence(finalCase, { ...data, links: newLinks }, hasFile ? file : null);
      commit(() => {
        if (e) {
          const oldBlob = e.file && hasFile ? e.file.blobId : '';
          Object.assign(e, Normalize.evidence({ ...e, ...data, file: hasFile ? built.file : e.file }));
          if (oldBlob) trashPush(`Replaced file: ${e.title}`, { evidence: [{ ...e, id: uid('ev'), title: `${e.title} (previous file)`, file: { blobId: oldBlob, name: 'previous file' }, links: [] }] });
          logEvent(e.caseId, 'evidence', `Evidence updated: ${e.title}`);
        } else {
          S.evidence.push(built);
          if (finalCase) logEvent(finalCase, 'evidence', `Evidence added: ${built.title}${built.reference ? ' (' + built.reference + ')' : ''}${built.file ? ` — file ${built.file.name}` : ''}`);
        }
        const target = e || built;
        ['criteria', 'facts'].forEach(coll => S[coll].filter(x => x.caseId === target.caseId).forEach(x => {
          const linked = target.links.some(l => l.t === coll && l.id === x.id); const has = x.evidenceIds.includes(target.id);
          if (linked && !has) x.evidenceIds.push(target.id);
          if (!linked && has) x.evidenceIds = x.evidenceIds.filter(i => i !== target.id);
        }));
      }, { caseId: finalCase });
      UI.toast('Evidence saved.', 'ok');
    },
  });
}
Actions['ev-new'] = el => openEvidence({ caseId: el.dataset.case || '' });
Actions['ev-edit'] = el => openEvidence({ id: el.dataset.id });
Actions['ev-open'] = async el => {
  const e = findRec('evidence', el.dataset.id);
  try {
    const rec = await IDB.getBlob(e.file.blobId);
    if (!rec || !rec.blob) { UI.toast('That file isn’t stored on this device (it may have come from a backup without files).', 'warn'); return; }
    const url = URL.createObjectURL(rec.blob);
    let integrity = '';
    if (e.file.sha256) { const now = await sha256Hex(await rec.blob.arrayBuffer()); integrity = now === e.file.sha256 ? pill('Unchanged since added', 'sage') : pill('Fingerprint doesn’t match', 'coral'); }
    Dialog.open({
      title: e.title, sub: `${esc(e.file.name)} · ${esc(fmtBytes(e.file.size))}`, size: 'wide',
      body: `${/^image\//.test(e.file.mime) ? `<img class="preview-img" src="${url}" alt="${esc(e.title)}">` : `<p class="small ink2">Preview isn’t available for this file type here. Download it to open it.</p>`}<div class="cluster mt12">${integrity}${e.file.sha256 ? `<span class="xs muted mono break">SHA-256 ${esc(e.file.sha256)}</span>` : ''}</div>`,
      foot: `<a class="btn btn-ink" href="${url}" download="${esc(e.file.name)}">${ico('download', 'sm')}Download</a><button type="button" class="btn" data-dlg-close>Close</button>`,
      onClose: () => setTimeout(() => URL.revokeObjectURL(url), 2000),
    });
  } catch (err) { UI.toast('Couldn’t open the file in this browser.', 'warn'); }
};
Actions['ev-delete'] = async el => {
  const e = findRec('evidence', el.dataset.id);
  const supports = S.criteria.filter(x => x.evidenceIds.includes(e.id) && x.status === 'met');
  const verified = e.caseId && getCase(e.caseId) && getCase(e.caseId).resolution.state === 'verified';
  if (supports.length || verified) {
    if (!await confirmDialog({ title: 'This evidence supports your resolution', text: `It backs ${plural(supports.length, 'met criterion', 'met criteria')}${verified ? ' on a case closed as verified' : ''}. If you delete it, those will show as “no evidence”. It moves to the trash and can be restored.`, ok: 'Delete anyway', danger: true })) return;
  }
  const tid = commit(() => deleteRecord('evidence', e.id, `Evidence: ${e.title}`), { caseId: e.caseId });
  undoToast('Evidence moved to the trash.', tid);
};

/* ===== Resolution ===== */
Actions['crit-add'] = el => Dialog.open({
  title: 'What would “resolved” look like?', body: field('Criterion', inputEl('text', '', 'required placeholder="e.g. Next statement shows the fee removed"')),
  foot: '<button type="button" class="btn" data-dlg-close>Cancel</button><button class="btn btn-ink" type="submit">Add</button>',
  onSubmit: fd => commit(() => S.criteria.push(Normalize.criteria({ caseId: el.dataset.case, text: val(fd, 'text') })), { caseId: el.dataset.case }),
});
Changes['crit-status'] = el => {
  const x = findRec('criteria', el.dataset.id);
  commit(() => { x.status = el.value; x.checkedAt = today(); logEvent(x.caseId, 'resolution', `Criterion “${truncate(x.text, 80)}”: ${CRIT_STATUS[x.status].toLowerCase()}`); }, { caseId: x.caseId });
  if (el.value === 'met' && !x.evidenceIds.length) UI.toast('Marked as met. Attach evidence to make it verifiable.', '', { label: 'Attach', fn: () => Actions['crit-evidence']({ dataset: { id: x.id } }) });
};
Actions['crit-delete'] = el => { const x = findRec('criteria', el.dataset.id); const tid = commit(() => deleteRecord('criteria', x.id, `Criterion: ${truncate(x.text, 60)}`), { caseId: x.caseId }); undoToast('Removed.', tid); };
Actions['crit-evidence'] = el => {
  const x = findRec('criteria', el.dataset.id);
  Dialog.open({
    title: 'Evidence for this criterion', sub: esc(x.text),
    body: `${evidenceChecklist(x.caseId, x.evidenceIds)}<div class="cluster mt12"><button type="button" class="btn btn-sm" data-role="new">${ico('plus', 'sm')}Add new evidence</button></div>`,
    foot: '<button type="button" class="btn" data-dlg-close>Cancel</button><button class="btn btn-ink" type="submit">Save</button>',
    onOpen: form => form.querySelector('[data-role=new]').addEventListener('click', () => { Dialog.close(); openEvidence({ caseId: x.caseId, linkTo: { t: 'criteria', id: x.id } }); }),
    onSubmit: fd => commit(() => {
      const ids = fd.getAll('evidence').map(String);
      syncEvidenceLinks('criteria', x, ids);
      logEvent(x.caseId, 'resolution', `Evidence for “${truncate(x.text, 60)}”: ${plural(ids.length, 'item')}`);
    }, { caseId: x.caseId }),
  });
};
Actions['res-reopen'] = el => commit(() => Ops.setResolution(el.dataset.case, 'open', { note: '' }), { caseId: el.dataset.case });
Actions['res-set'] = el => {
  const caseId = el.dataset.case; const state = el.dataset.state; const c = getCase(caseId);
  const R = Engine.resolution(caseId);
  const done = (extra) => {
    commit(() => Ops.setResolution(caseId, state, extra), { caseId });
    UI.toast(RES_STATES[state].closed ? 'Closed. If it helps, there are optional ideas to prevent a repeat below.' : `Status: ${RES_STATES[state].label}.`, 'ok');
  };
  if (state === 'verified' && R.suggest !== 'verified') {
    const gaps = R.crit.filter(x => x.status !== 'met' || !x.evidenceIds.length);
    Dialog.open({
      title: 'Not quite verifiable yet', body: `<p class="small ink2">Verified closure means every criterion is met and backed by evidence. These aren’t yet:</p><ul class="bullets">${(gaps.length ? gaps : [{ text: 'No criteria have been set for this case' }]).map(x => `<li>${esc(x.text)}${x.status === 'met' ? ' — no evidence' : ''}</li>`).join('')}</ul><p class="small ink2 mt12">You can add evidence, or close it honestly as “not verified”.</p>`,
      foot: '<button type="button" class="btn" data-dlg-close>Add evidence first</button><button class="btn btn-ink" type="submit">Close without verifying</button>',
      onSubmit: () => { commit(() => Ops.setResolution(caseId, 'closed_unverified', { note: c.resolution.note }), { caseId }); UI.toast('Closed, marked as not verified.'); },
    });
    return;
  }
  const forms = {
    verified: { body: field('Closing note (optional)', textareaEl('note', c.resolution.note, 'rows="2"')), title: 'Close as verified' },
    conditional: { body: `${field('What still needs to happen?', inputEl('condition', c.resolution.condition, 'required placeholder="e.g. Fee reversal appears on the next statement"'))}${field('Check on', inputEl('monitorUntil', offset(30), 'type="date" required'))}`, title: 'Resolved, on a condition' },
    monitoring: { body: `${field('What are you watching for?', inputEl('condition', c.resolution.condition, 'placeholder="e.g. No further notices arrive"'))}${field('Watch until', inputEl('monitorUntil', offset(30), 'type="date" required'))}`, title: 'Monitor' },
    partial: { body: field('What’s sorted, and what isn’t?', textareaEl('note', '', 'rows="3"')), title: 'Partly resolved' },
    disputed: { body: field('What’s disputed?', textareaEl('note', '', 'rows="3" required')), title: 'Disputed' },
    closed_unverified: { body: field('Note (optional)', textareaEl('note', '', 'rows="2" placeholder="e.g. They said it’s done; no written confirmation"')), title: 'Close without verifying' },
    withdrawn: { body: field('Why let it go? (optional)', textareaEl('note', '', 'rows="2" placeholder="e.g. Not worth the time for $12"')), title: 'Let it go' },
  }[state];
  Dialog.open({
    title: forms.title, body: forms.body,
    foot: '<button type="button" class="btn" data-dlg-close>Cancel</button><button class="btn btn-ink" type="submit">Save</button>',
    onSubmit: fd => { const extra = {}; ['note', 'condition', 'monitorUntil'].forEach(k => { if (fd.has(k)) extra[k] = val(fd, k); }); if (extra.monitorUntil !== undefined && !isISODate(extra.monitorUntil)) { UI.toast('Choose a valid date.', 'warn'); return false; } done(extra); },
  });
};

/* ===== Recurring obligations & calendar files ===== */
function openObligation({ id = '', title = '', type = '' } = {}) {
  const o = id ? findRec('obligations', id) : null;
  const P = type ? pb(type) : null;
  Dialog.open({
    title: o ? 'Edit recurring obligation' : 'Add a reminder', sub: 'Saved here, and downloadable as a calendar file. Nothing is sent anywhere.',
    body: `${field('What', inputEl('title', o ? o.title : title, 'required'))}<div class="grid2">${field('Repeats', selectEl('cadence', Object.entries(CADENCES), o ? o.cadence : (P && P.cadence) || 'yearly'))}${field('Next date', inputEl('next', o ? o.next : offset(P && P.cadence === 'monthly' ? 30 : 365), 'type="date" required'))}</div>${field('Remind me this many days before', inputEl('remindDays', o ? o.remindDays : 7, 'type="number" min="0" max="90"'))}${field('Note', inputEl('note', o ? o.note : ''))}`,
    foot: `<button type="button" class="btn" data-dlg-close>Cancel</button><button class="btn" type="submit" name="act" value="ics">Save & download .ics</button><button class="btn btn-ink" type="submit" name="act" value="save">Save</button>`,
    onSubmit: (fd, f, sub) => {
      const data = { title: val(fd, 'title'), cadence: val(fd, 'cadence'), next: val(fd, 'next'), remindDays: Number(val(fd, 'remindDays')) || 0, note: val(fd, 'note'), caseType: type || (o ? o.caseType : '') };
      if (!isISODate(data.next)) { UI.toast('Choose a valid date.', 'warn'); return false; }
      const rec = commit(() => { if (o) { Object.assign(o, data); return o; } const n = Normalize.obligations(data); S.obligations.push(n); return n; });
      if (sub && sub.value === 'ics') downloadObligations([rec]); else UI.toast('Reminder saved in Insights.', 'ok');
    },
  });
}
function downloadObligations(list) {
  downloadText(list.length === 1 ? `${safeFileName(list[0].title)}.ics` : 'after-the-fact-reminders.ics', buildICS(list.map(o => ({ uid: o.id, date: o.next, title: o.title, desc: o.note || 'Reminder from AFTER THE FACT', rrule: RRULES[o.cadence], alarmDays: o.remindDays }))), 'text/calendar');
}
Actions['obligation-new'] = el => openObligation({ title: el.dataset.title || '', type: el.dataset.type || '' });
Actions['obligation-edit'] = el => openObligation({ id: el.dataset.id });
Actions['obligation-delete'] = el => { const o = findRec('obligations', el.dataset.id); const tid = commit(() => deleteRecord('obligations', o.id, `Reminder: ${o.title}`)); undoToast('Removed.', tid); };
Actions['obligation-ics'] = el => downloadObligations([findRec('obligations', el.dataset.id)]);
Actions['obligation-ics-all'] = () => downloadObligations(S.obligations);
function agendaToICS(items, name) {
  const ev = items.filter(i => daysUntil(i.date) >= 0).map((i, n) => ({ uid: `${i.id || i.caseId || 'x'}-${i.kind}-${n}`, date: i.date, title: `${i.title}${i.caseId ? ' — ' + caseTitle(i.caseId) : ''}`, desc: i.certainty ? `Certainty: ${CERTAINTY[i.certainty]}` : '', alarmDays: i.kind === 'deadline' ? 2 : 0 }));
  if (!ev.length) { UI.toast('No upcoming dates to add.'); return; }
  downloadText(name, buildICS(ev), 'text/calendar');
  UI.toast(`${plural(ev.length, 'date')} saved as a calendar file. Open it to add them to your calendar.`, 'ok');
}
Actions['ics-upcoming'] = () => agendaToICS(Engine.agenda().filter(i => i.kind !== 'obligation'), 'after-the-fact-dates.ics');
Actions['case-ics'] = el => agendaToICS(Engine.agenda().filter(i => i.caseId === el.dataset.id), `${safeFileName(caseTitle(el.dataset.id))}-dates.ics`);

/* ===== Focus ===== */
Actions['focus-done'] = el => { const f = UIState.focus; commit(() => { const t = findRec('tasks', el.dataset.id); if (t && !t.done) Ops.toggleTask(t.id); }, { render: false }); f.done.push(el.dataset.id); f.idx++; UI.render({ scrollTop: true }); };
Actions['focus-skip'] = () => { const f = UIState.focus; f.skipped.push(f.queue[f.idx]); f.idx++; UI.render({ scrollTop: true }); };
Actions['focus-end'] = () => { UIState.focus.idx = UIState.focus.queue.length; UI.render({ scrollTop: true }); };
Actions['focus-again'] = () => { UIState.focus = null; UI.render({ scrollTop: true }); };
Actions['focus-blocked'] = el => {
  const t = findRec('tasks', el.dataset.id);
  Dialog.open({
    title: 'What’s in the way?', sub: esc(t.text),
    body: `<div class="choices">${[['wait', 'I’m waiting on someone', 'Tracks it in Waiting and holds this step until it arrives.'], ['step', 'Something else has to happen first', 'Adds that as a step before this one.'], ['note', 'Something else', 'Just note it and skip for now.']].map(([v, l, d], i) => `<label class="choice"><input type="radio" name="why" value="${v}" ${i === 0 ? 'checked' : ''}><span class="box"><b>${l}</b><small>${d}</small></span></label>`).join('')}</div>
      ${field('What is it?', inputEl('what', '', 'required placeholder="e.g. Renewal PIN letter from the DMV"'))}`,
    foot: '<button type="button" class="btn" data-dlg-close>Cancel</button><button class="btn btn-ink" type="submit">Save and skip</button>',
    onSubmit: fd => {
      const why = val(fd, 'why'); const what = val(fd, 'what');
      commit(() => {
        if (why === 'wait') { const w = Normalize.waits({ caseId: t.caseId, kind: 'document', what, from: (getCase(t.caseId) || {}).counterparty || '', since: today(), followUpOn: offset(7), log: [{ date: today(), note: `Blocking: ${t.text}` }] }); S.waits.push(w); t.waitDep = w.id; logEvent(t.caseId, 'wait', `Waiting for: ${what} (blocks “${t.text}”)`); }
        else if (why === 'step') { const nt = Normalize.tasks({ caseId: t.caseId, text: what, order: t.order - 0.5 }); S.tasks.push(nt); t.dependsOn = [...t.dependsOn, nt.id]; logEvent(t.caseId, 'task', `Added step before “${t.text}”: ${what}`); }
        else { t.note = what; logEvent(t.caseId, 'note', `Blocked: ${t.text} — ${what}`, true); }
      }, { render: false });
      const f = UIState.focus; f.skipped.push(t.id); f.idx++; UI.render({ scrollTop: true });
    },
  });
};

/* ===== Data & privacy ===== */
Changes['system-fonts'] = el => { Prefs.set('systemFonts', el.checked); Fonts.apply(); UI.toast(el.checked ? 'Using system fonts. No font requests will be made after reload.' : 'Web fonts on.'); };
Forms['settings'] = fd => { commit(s => { s.settings.region = val(fd, 'region'); s.settings.focusMinutes = Number(val(fd, 'focusMinutes')) || 15; }); UI.toast('Preferences saved.', 'ok'); };
Actions['persist'] = async () => { try { const ok = await navigator.storage.persist(); UI.toast(ok ? 'The browser agreed to keep this data.' : 'The browser declined for now. Regular backups are the safe option.', ok ? 'ok' : ''); UI.render(); } catch (e) { UI.toast('This browser doesn’t support that.'); } };

async function exportBackup(includeFiles) {
  const files = {};
  let missing = 0;
  if (includeFiles) {
    for (const e of S.evidence.filter(x => x.file)) {
      try { const rec = await IDB.getBlob(e.file.blobId); if (rec && rec.blob) files[e.file.blobId] = { name: rec.name || e.file.name, mime: rec.mime || e.file.mime, size: rec.blob.size, dataUrl: await blobToDataUrl(rec.blob) }; else missing++; } catch (err) { missing++; }
    }
  }
  S.meta.lastExportAt = nowStamp();
  const payload = { format: 'after-the-fact-backup', formatVersion: 1, schema: APP.schema, exportedAt: S.meta.lastExportAt, includesFiles: includeFiles, data: S, files };
  downloadText(`after-the-fact-backup-${today()}.json`, JSON.stringify(payload, null, 1), 'application/json');
  saveState(); UI.render();
  UI.toast(`Backup downloaded${includeFiles ? ` with ${plural(Object.keys(files).length, 'file')}` : ''}.${missing ? ` ${missing} file(s) weren’t found on this device.` : ''}`, 'ok');
}
Actions['export'] = () => { const cb = document.getElementById('export-files'); exportBackup(!!(cb && cb.checked && !cb.disabled)); };

Changes['import-file'] = async el => {
  const file = el.files && el.files[0]; el.value = '';
  if (!file) return;
  let parsed;
  try { parsed = JSON.parse(await readFileAs(file, 'text')); } catch (e) { UI.toast('That file isn’t valid JSON. Choose an AFTER THE FACT backup (.json).', 'warn'); return; }
  let incoming; let files = {}; let kind;
  try {
    if (parsed && parsed.format === 'after-the-fact-backup' && parsed.data) { if (Number(parsed.schema) > APP.schema) throw new Error('This backup was made by a newer version of the app.'); incoming = normalizeState(parsed.data); files = parsed.files && typeof parsed.files === 'object' ? parsed.files : {}; kind = 'backup'; }
    else if (looksLikeV1(parsed)) { const m = migrateV1(parsed); incoming = normalizeState(m.state); m.pendingFiles.forEach(f => { files[f.blobId] = { name: f.name, mime: f.mime, dataUrl: f.dataUrl }; }); kind = 'v1'; }
    else if (parsed && parsed.schema === APP.schema) { incoming = normalizeState(parsed); kind = 'raw'; }
    else throw new Error('This doesn’t look like an AFTER THE FACT backup.');
  } catch (e) { UI.toast(e.message || 'Couldn’t read that backup.', 'warn'); return; }
  const st = incoming.state; const rep = incoming.report;
  const fileCount = st.evidence.filter(e => e.file && files[e.file.blobId]).length;
  const missingFiles = st.evidence.filter(e => e.file && !files[e.file.blobId]).length;
  Dialog.open({
    title: 'Import this backup?', sub: esc(file.name),
    body: `<dl class="kv"><dt>Format</dt><dd>${kind === 'v1' ? 'Version 1 (will be upgraded)' : 'Version 2 backup'}</dd><dt>Cases</dt><dd>${st.cases.length} (${st.cases.filter(c => !isClosed(c)).length} open)</dd><dt>Evidence</dt><dd>${st.evidence.length}${fileCount ? ` · ${plural(fileCount, 'file')} included` : ''}</dd>${missingFiles ? `<dt>Files not in backup</dt><dd>${missingFiles} — the records are kept; the files themselves will be missing.</dd>` : ''}${rep.dropped || rep.repaired ? `<dt>Repaired</dt><dd>${rep.repaired} fixed, ${rep.dropped} unusable records skipped</dd>` : ''}</dl>
      <div class="banner warn mt16"><p>Importing <b>replaces</b> what’s here now (${plural(S.cases.length, 'case')}). A safety snapshot of your current data is taken first, so you can go back.</p></div>`,
    foot: '<button type="button" class="btn" data-dlg-close>Cancel</button><button class="btn btn-ink" type="submit">Replace with this backup</button>',
    onSubmit: async () => {
      await Snapshots.take('Before importing a backup', JSON.stringify(S));
      let failed = 0;
      for (const e of st.evidence.filter(x => x.file && files[x.file.blobId])) {
        try { const f = files[e.file.blobId]; const blob = dataUrlToBlob(f.dataUrl); if (!blob) throw new Error('bad'); await IDB.putBlob(e.file.blobId, { blob, name: f.name || e.file.name, mime: f.mime || blob.type, size: blob.size }); if (!e.file.sha256) e.file.sha256 = await sha256Hex(await blob.arrayBuffer()); } catch (err) { failed++; }
      }
      S = st; Runtime.notices = Runtime.notices.filter(n => n.key !== 'migrated');
      saveState(); UIState.intake = null; UIState.focus = null;
      Router.go('today'); UI.render();
      UI.toast(`Imported ${plural(st.cases.length, 'case')}.${failed ? ` ${failed} file(s) couldn’t be stored.` : ''}`, 'ok');
    },
  });
};

Actions['snapshot-now'] = async () => { const r = await Snapshots.take('Taken by you', JSON.stringify(S)); UI.toast(r.durable ? 'Snapshot saved.' : 'Snapshot kept for this session only (file store unavailable).', 'ok'); UI.render(); };
Actions['snapshot-download'] = async el => { const s = await Snapshots.get(el.dataset.id); if (s) downloadText(`after-the-fact-snapshot-${stampDate(s.at)}.json`, s.json, 'application/json'); };
Actions['snapshot-delete'] = async el => { await Snapshots.remove(el.dataset.id); UI.render(); };
Actions['snapshot-restore'] = async el => {
  const snap = await Snapshots.get(el.dataset.id); if (!snap) return;
  let restored;
  try { const raw = JSON.parse(snap.json); restored = looksLikeV1(raw) ? normalizeState(migrateV1(raw).state).state : normalizeState(raw).state; } catch (e) { UI.toast('That snapshot couldn’t be read.', 'warn'); return; }
  if (!await confirmDialog({ title: 'Restore this snapshot?', text: `It has ${plural(restored.cases.length, 'case')} (from ${esc(fmtStamp(snap.at))}). Your current data (${plural(S.cases.length, 'case')}) is snapshotted first.`, ok: 'Restore' })) return;
  await Snapshots.take('Before restoring a snapshot', JSON.stringify(S));
  S = restored; saveState(); Router.go('today'); UI.render(); UI.toast('Snapshot restored.', 'ok');
};
Actions['trash-restore'] = el => { const r = commit(() => restoreTrash(el.dataset.id)); UI.toast(r.skipped ? `Restored ${r.restored}; ${r.skipped} couldn’t be (already present or its case is gone).` : 'Restored.', 'ok'); };
Actions['trash-purge'] = async el => { if (!await confirmDialog({ title: 'Delete permanently?', text: 'This can’t be undone.', ok: 'Delete', danger: true })) return; const t = S.trash.find(x => x.id === el.dataset.id); commit(s => { s.trash = s.trash.filter(x => x.id !== el.dataset.id); }); if (t) purgeTrashBlobs(t); };
Actions['trash-empty'] = async () => { if (!await confirmDialog({ title: 'Empty the trash?', text: `${plural(S.trash.length, 'item')} will be deleted permanently, including any attached files.`, ok: 'Empty trash', danger: true })) return; const old = S.trash; commit(s => { s.trash = []; }); old.forEach(purgeTrashBlobs); };

Actions['load-samples'] = async () => {
  if (S.cases.length) await Snapshots.take('Before adding example cases', JSON.stringify(S));
  const sample = buildSampleState();
  commit(s => { COLLECTIONS.forEach(c => s[c].push(...sample[c])); });
  Router.go('today');
  UI.toast('Example cases added. Remove them any time.', 'ok');
};
Actions['remove-samples'] = async () => {
  if (!await confirmDialog({ title: 'Remove the example cases?', text: 'Only cases marked “Example” are removed. Your own cases aren’t touched.', ok: 'Remove examples' })) return;
  await Snapshots.take('Before removing example cases', JSON.stringify(S));
  commit(s => {
    const ids = new Set(s.cases.filter(c => c.sample).map(c => c.id));
    COLLECTIONS.forEach(c => { if (c === 'links') s.links = s.links.filter(l => !ids.has(l.from) && !ids.has(l.to)); else if (c === 'cases') s.cases = s.cases.filter(x => !ids.has(x.id)); else if (c !== 'obligations') s[c] = s[c].filter(r => !ids.has(r.caseId)); });
    s.obligations = s.obligations.filter(o => !(o.title === 'Renew vehicle registration' && o.caseType === 'renewal' && !s.cases.some(c => c.type === 'renewal')));
    s.tasks.forEach(t => { if (ids.has(t.caseDep)) t.caseDep = ''; });
    s.meta.sample = false;
  });
  UI.toast('Examples removed.', 'ok');
};
Actions['clear-all'] = () => Dialog.open({
  title: 'Delete all data?', body: `<p class="small ink2">Every case, piece of evidence and attached file in this browser will be deleted. A snapshot of the case data (without files) is kept in this browser.</p>${field('Type DELETE to confirm', inputEl('confirm', '', 'autocomplete="off" required'))}`,
  foot: '<button type="button" class="btn" data-dlg-close>Cancel</button><button class="btn btn-primary" type="submit">Delete everything</button>',
  onSubmit: async fd => {
    if (val(fd, 'confirm') !== 'DELETE') { UI.toast('Type DELETE in capitals to confirm.', 'warn'); return false; }
    await Snapshots.take('Before deleting all data', JSON.stringify(S));
    try { await IDB.clearBlobs(); } catch (e) { /* ignore */ }
    ThumbCache.clear();
    S = emptyState(); saveState(); UIState.intake = null; UIState.focus = null;
    Router.go('today'); UI.render(); UI.toast('All data deleted.');
  },
});

/* ===== Global search ===== */
function openSearch() {
  Dialog.open({
    title: 'Search everything', size: 'wide',
    body: `<label class="sr-only" for="gs">Search</label><input id="gs" class="input" type="search" data-input="global-search" placeholder="Cases, facts, references, messages, evidence…" autocomplete="off" autofocus><div id="gs-results" class="mt12"><p class="small muted">Searches every case, including closed ones.</p></div>`,
  });
}
Inputs['global-search'] = el => {
  const q = norm(el.value); const box = document.getElementById('gs-results'); if (!box) return;
  if (q.length < 2) { box.innerHTML = '<p class="small muted">Type at least two letters.</p>'; return; }
  const hit = s => norm(s).includes(q);
  const res = [];
  S.cases.forEach(c => { if (hit([c.title, c.summary, c.counterparty, c.reference].join(' '))) res.push({ sec: 'Case', title: c.title, sub: Engine.caseStatus(c.id).label, to: href('case', c.id) }); });
  S.facts.forEach(f => { if (f.kind !== 'missing' && hit(f.text + ' ' + f.source)) res.push({ sec: FACT_KINDS[f.kind].label, title: f.text, sub: caseTitle(f.caseId), to: href('case', f.caseId, 'understand') }); });
  S.comms.forEach(m => { if (hit([m.subject, m.body, m.outcome, m.contact, m.reference].join(' '))) res.push({ sec: CHANNELS[m.channel], title: m.subject || PURPOSES[m.purpose], sub: caseTitle(m.caseId), to: href('case', m.caseId, 'contact') }); });
  S.evidence.forEach(e => { if (hit([e.title, e.reference, e.note, e.location].join(' '))) res.push({ sec: 'Evidence', title: e.title, sub: e.reference || (e.caseId ? caseTitle(e.caseId) : ''), to: e.caseId ? href('case', e.caseId, 'evidence') : href('evidence') }); });
  S.waits.forEach(w => { if (hit([w.what, w.from, w.reference].join(' '))) res.push({ sec: 'Waiting', title: w.what, sub: caseTitle(w.caseId), to: href('case', w.caseId, 'waiting') }); });
  S.tasks.forEach(t => { if (hit(t.text)) res.push({ sec: t.done ? 'Step (done)' : 'Step', title: t.text, sub: caseTitle(t.caseId), to: href('case', t.caseId, 'plan') }); });
  box.innerHTML = res.length ? `<div class="list">${res.slice(0, 30).map(r => `<a class="item link" href="${r.to}" data-dlg-close><div class="item-main"><p class="item-title">${esc(truncate(r.title, 100))}</p><p class="item-sub">${esc(r.sub)}</p></div><span class="tag">${esc(r.sec)}</span></a>`).join('')}</div>${res.length > 30 ? `<p class="xs muted mt8">Showing 30 of ${res.length}.</p>` : ''}` : `<p class="small muted">Nothing matches “${esc(el.value)}”.</p>`;
};
