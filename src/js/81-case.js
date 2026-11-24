/* ---------------- Case workspace ---------------- */
const CASE_TABS = [
  ['overview', 'Overview'], ['understand', 'Understand'], ['options', 'Options'], ['plan', 'Plan'], ['contact', 'Contact'],
  ['waiting', 'Waiting'], ['evidence', 'Evidence'], ['timeline', 'Timeline'], ['resolve', 'Resolve'],
];

Views.case = route => {
  const c = getCase(route.parts[1]);
  if (!c) return `<a class="back" href="#/cases">${ico('back', 'sm')}Cases</a><div class="page-head"><h1 class="h1">Case not found</h1><p class="lede">It may have been deleted. Deleted cases can be restored from the trash in <a class="linkish" href="#/data">Data & privacy</a>.</p></div>`;
  const tab = CASE_TABS.some(t => t[0] === route.parts[2]) ? route.parts[2] : 'overview';
  const counts = {
    understand: S.facts.filter(f => f.caseId === c.id && f.kind === 'missing').length,
    plan: Engine.openTasks(c.id).length,
    contact: S.comms.filter(m => m.caseId === c.id).length,
    waiting: Engine.openWaits(c.id).length,
    evidence: S.evidence.filter(e => e.caseId === c.id).length,
  };
  const crit = S.criteria.filter(x => x.caseId === c.id && x.status !== 'na');
  const parked = c.parkedUntil && daysUntil(c.parkedUntil) > 0;
  const res = RES_STATES[c.resolution.state];
  const body = (CaseTabs[tab] || CaseTabs.overview)(c);
  return `<a class="back" href="#/cases">${ico('back', 'sm')}Cases</a>
  <header class="case-head">
    <p class="eyebrow">${esc(pb(c.type).label)}${c.sample ? ' · Example' : ''}</p>
    <h1 class="h1">${esc(c.title)}</h1>
    <div class="meta">${statusPill(c.id)}${c.resolution.state !== 'open' && !res.closed && !parked ? '' : ''}${c.counterparty ? `<span class="small ink2">${esc(c.counterparty)}</span>` : ''}${c.reference ? `<button class="pill line mono" data-act="copy" data-text="${esc(c.reference)}" title="Copy">${esc(c.reference)} ${ICON.copy}</button>` : ''}${c.jurisdiction ? `<span class="pill line">${esc(c.jurisdiction)}</span>` : ''}<span class="xs muted">Opened ${esc(fmtDate(c.createdAt))}</span></div>
    <div class="cluster mt12">
      <button class="btn btn-sm" data-act="case-edit" data-id="${esc(c.id)}">${ico('edit', 'sm')}Details</button>
      ${!res.closed ? (parked ? `<button class="btn btn-sm" data-act="case-unpark" data-id="${esc(c.id)}">Unpark</button>` : `<button class="btn btn-sm" data-act="case-park" data-id="${esc(c.id)}">${ico('pause', 'sm')}Park</button>`) : ''}
      <button class="btn btn-sm" data-act="note-add" data-case="${esc(c.id)}">Add note</button>
      <button class="btn btn-sm btn-ghost" data-act="case-ics" data-id="${esc(c.id)}">${ico('dates', 'sm')}Dates to calendar</button>
      <button class="btn btn-sm btn-ghost btn-danger" data-act="case-delete" data-id="${esc(c.id)}">Delete</button>
    </div>
  </header>
  ${parked ? `<div class="banner mt16"><div class="grow"><p><b>Parked until ${esc(fmtDate(c.parkedUntil, { year: true }))}.</b> It’s hidden from Today until then${c.parkNote ? ` — ${esc(c.parkNote)}` : ''}. Parking doesn’t pause real deadlines; if one gets close, it will come back early.</p></div></div>` : ''}
  <nav class="tabs" aria-label="Case sections">${CASE_TABS.map(([k, l]) => {
    const n = k === 'resolve' ? (crit.length ? `${crit.filter(x => x.status === 'met').length}/${crit.length}` : '') : counts[k];
    return `<a class="tab" href="${href('case', c.id, k)}" ${tab === k ? 'aria-current="page"' : ''}>${l}${n ? `<span class="count">${n}</span>` : ''}</a>`;
  }).join('')}</nav>
  <div>${body}</div>`;
};

const CaseTabs = {};

function nextStepCard(c) {
  const p = Engine.priority(c.id);
  const st = p ? p.step : Engine.nextStep(c.id);
  if (!st) return '';
  if (st.kind === 'closed') {
    return `<section class="card"><p class="eyebrow">Status</p><p class="h3 mt4">${esc(RES_STATES[c.resolution.state].label)}${c.resolution.closedAt ? ` · ${esc(fmtDate(c.resolution.closedAt))}` : ''}</p>${c.resolution.note ? `<p class="small ink2 mt8">${esc(c.resolution.note)}</p>` : ''}<div class="cluster mt12"><a class="btn btn-sm" href="${href('case', c.id, 'resolve')}">See how it was resolved</a></div></section>`;
  }
  const btn = {
    followup: st.wait ? `<button class="btn btn-ink" data-act="compose" data-case="${esc(c.id)}" data-purpose="${st.purpose}" data-wait="${esc(st.wait.id)}">${st.purpose === 'escalate' ? 'Draft an escalation' : 'Draft a follow-up'}</button><button class="btn btn-sage" data-act="wait-receive" data-id="${esc(st.wait.id)}">It arrived</button>` : '',
    task: `<button class="btn btn-sage" data-act="toggle-task" data-id="${esc(st.task && st.task.id)}">${ico('check', 'sm')}Mark done</button><a class="btn" href="${href('case', c.id, 'plan')}">Whole plan</a>`,
    choose: `<a class="btn btn-ink" href="${href('case', c.id, 'options')}">Compare options</a>`,
    blocked: `<a class="btn" href="${href('case', c.id, 'plan')}">See the plan</a>`,
    wait: `<a class="btn" href="${href('case', c.id, 'waiting')}">See what you’re waiting for</a>`,
    resolve: `<a class="btn btn-ink" href="${href('case', c.id, 'resolve')}">Check resolution</a>`,
    monitor: `<a class="btn btn-ink" href="${href('case', c.id, 'resolve')}">Do the check</a>`,
    watch: `<a class="btn" href="${href('case', c.id, 'resolve')}">See resolution</a>`,
  }[st.kind] || '';
  const label = { followup: 'Their turn is overdue', task: 'Next step', choose: 'First, decide how to approach it', blocked: 'On hold', wait: 'Waiting', resolve: 'Almost there', monitor: 'Check-in due', watch: 'Watching' }[st.kind] || 'Next';
  return `<section class="focal"><p class="eyebrow">${label}</p><p class="focus-task" style="font-size:clamp(21px,3.6vw,26px)">${esc(st.text)}</p>
    ${st.why ? `<p class="small ink2 mt8">${esc(st.why)}</p>` : ''}${st.kind === 'blocked' && st.blockers.length > 1 ? `<ul class="bullets">${st.blockers.map(b => `<li>${esc(b.text)}</li>`).join('')}</ul>` : ''}
    ${p ? whyList(p.reasons, 3) : ''}<div class="cluster mt16">${btn}</div></section>`;
}

CaseTabs.overview = c => {
  const facts = byCase('facts', c.id);
  const fc = k => facts.filter(f => f.kind === k).length;
  const missing = facts.filter(f => f.kind === 'missing');
  const dls = byCase('deadlines', c.id).filter(d => d.date);
  const ext = dls.filter(d => d.kind === 'external' && d.status === 'open' && daysUntil(d.date) >= 0).sort((a, b) => a.date.localeCompare(b.date))[0];
  const passed = dls.filter(d => d.kind === 'external' && (d.status === 'missed' || (d.status === 'open' && daysUntil(d.date) < 0)));
  const target = dls.filter(d => d.kind === 'self' && d.status === 'open').sort((a, b) => a.date.localeCompare(b.date))[0];
  const cons = byCase('consequences', c.id);
  const est = cons.filter(x => x.status === 'established');
  const pot = cons.filter(x => x.status === 'potential').sort((a, b) => b.severity - a.severity);
  const waits = Engine.openWaits(c.id);
  const chosen = S.paths.find(p => p.caseId === c.id && p.status === 'chosen');
  const P = pb(c.type);
  const unanswered = P.questions.filter(q => !c.answers[q.id] || c.answers[q.id] === 'unsure');
  const allDone = !Engine.openTasks(c.id).length && S.tasks.some(t => t.caseId === c.id) && !isClosed(c) && ['open', 'partial'].includes(c.resolution.state) && Engine.nextStep(c.id).kind === 'resolve';
  const links = S.links.filter(l => l.from === c.id || l.to === c.id);
  const lines = [];
  lines.push(`<p><b>${fc('confirmed')}</b> confirmed · <b>${fc('unverified') + fc('assumption')}</b> not yet checked · <b>${missing.length}</b> missing. <a class="linkish" href="${href('case', c.id, 'understand')}">Review</a></p>`);
  if (missing.length) lines.push(`<p class="small ink2">Still needed: ${missing.slice(0, 2).map(f => `<b>${esc(f.text.charAt(0).toLowerCase() + f.text.slice(1))}</b>`).join('; ')}${missing.length > 2 ? ` and ${missing.length - 2} more` : ''}.</p>`);
  if (ext) lines.push(`<p>Next deadline: <b>${esc(ext.label)}</b> — ${esc(dateAndRel(ext.date))} ${certaintyPill(ext.certainty)}</p>`);
  if (passed.length) lines.push(`<p class="small ink2">${esc(passed[0].label)} passed on ${esc(fmtDate(passed[0].date))}${passed[0].certainty !== 'confirmed' ? ' (not confirmed)' : ''}. That’s the starting point, not a verdict.</p>`);
  if (target) lines.push(`<p class="small ink2">Your own target: ${esc(dateAndRel(target.date))}.</p>`);
  if (est.length) lines.push(`<p>Already happened: ${est.map(x => `<b>${esc(x.text.charAt(0).toLowerCase() + x.text.slice(1))}</b>${x.reversibility === 'reversible' ? ' <span class="muted">(can be reversed)</span>' : ''}`).join('; ')}.</p>`);
  if (pot.length) lines.push(`<p>Could still happen: ${pot.slice(0, 2).map(x => `${esc(x.text.charAt(0).toLowerCase() + x.text.slice(1))} <span class="muted">(${esc(REVERSIBILITY[x.reversibility].toLowerCase())})</span>`).join('; ')}${pot.length > 2 ? `, and ${pot.length - 2} more` : ''}.</p>`);
  if (waits.length) lines.push(`<p>Waiting on: ${waits.map(w => `${esc(w.what)} <span class="muted">(${esc(Engine.waitState(w).label.toLowerCase())})</span>`).join('; ')}.</p>`);
  lines.push(chosen ? `<p>Approach: <b>${esc(chosen.title)}</b>. <a class="linkish" href="${href('case', c.id, 'options')}">Other options</a></p>` : `<p>No approach chosen yet. <a class="linkish" href="${href('case', c.id, 'options')}">Compare options</a></p>`);
  return `<div class="stack stack-lg">
    ${allDone ? `<div class="banner ok"><div class="grow"><p><b>Every step is done.</b> That isn’t always the same as the problem being solved. Check it against what “resolved” means for this case.</p><div class="cluster"><a class="btn btn-sm btn-sage" href="${href('case', c.id, 'resolve')}">Check resolution</a></div></div></div>` : ''}
    ${nextStepCard(c)}
    <section><div class="section-head"><h2 class="h2">Where you stand</h2></div><div class="statline where">${lines.join('')}</div></section>
    ${unanswered.length && !isClosed(c) ? `<section class="section"><div class="section-head"><h2 class="h3">Questions that would sharpen the plan</h2></div><p class="section-note">Answer only if you know — each one can change which option fits best.</p>
      <div class="stack">${unanswered.slice(0, 3).map(q => questionBlock(c, q)).join('')}</div></section>` : ''}
    <section class="section"><div class="section-head"><h2 class="h3">Connected cases</h2><button class="btn btn-sm" data-act="link-add" data-case="${esc(c.id)}">${ico('link', 'sm')}Link a case</button></div>
      ${links.length ? `<div class="list">${links.map(l => { const other = l.from === c.id ? l.to : l.from; const lbl = l.from === c.id ? LINK_TYPES[l.type].fwd : LINK_TYPES[l.type].back; return `<div class="item"><div class="item-main"><p class="xs muted">${esc(lbl)}</p>${caseLinkEl(other, 'item-title linkish plain')}${l.note ? `<p class="xs ink2 mt4">${esc(l.note)}</p>` : ''}</div><div class="item-actions">${statusPill(other)}<button class="icon-btn danger" data-act="link-delete" data-id="${esc(l.id)}" aria-label="Remove link">${ICON.close}</button></div></div>`; }).join('')}</div>` : '<p class="small muted">One problem often affects another — a ticket caused by an expired registration, a refund that blocks a payment. Link them so priorities account for it.</p>'}
    </section>
    <section class="section"><div class="section-head"><h2 class="h3">In your words</h2></div><blockquote class="serif italic ink2" style="margin:0;font-size:16.5px">“${esc(c.summary || c.title)}”</blockquote></section>
  </div>`;
};

function questionBlock(c, q) {
  const inferred = c.answerSource[q.id] === 'inferred';
  return `<fieldset class="card flat"><legend class="strong" style="font-size:14.5px;padding:0">${esc(q.q)}</legend><p class="xs muted mt4">${esc(q.why)}${inferred ? ' <span class="pill amber">Inferred from your words</span>' : ''}</p>
    <div class="seg mt8">${q.opts.map(([v, l]) => `<label><input type="radio" name="cq_${esc(q.id)}" value="${esc(v)}" data-change="case-answer" data-case="${esc(c.id)}" data-q="${esc(q.id)}" data-fk="cq-${esc(q.id)}-${esc(v)}" ${c.answers[q.id] === v ? 'checked' : ''}><span>${esc(l)}</span></label>`).join('')}</div></fieldset>`;
}

CaseTabs.understand = c => {
  const facts = byCase('facts', c.id);
  const group = (kind, list) => `<div class="mt16"><div class="row-flex" style="align-items:center"><i class="kind-dot k-${kind}" style="margin-top:0"></i><p class="strong small">${FACT_KINDS[kind].label} <span class="muted">(${list.length})</span></p></div><p class="xs muted mt4">${FACT_KINDS[kind].desc}</p>
    ${list.length ? `<div class="list mt8">${list.map(f => `<div class="item"><div class="item-main"><p class="small" style="font-weight:500">${esc(f.text)}</p>
      ${f.why ? `<p class="xs muted mt4">Why it matters: ${esc(f.why)}</p>` : ''}${f.source ? `<p class="xs muted mt4">Source: ${esc(f.source)}</p>` : ''}
      ${f.evidenceIds.length || evidenceFor('facts', f.id).length ? `<p class="xs mt4">${ico('clip', 'sm')} ${plural(new Set([...f.evidenceIds, ...evidenceFor('facts', f.id).map(e => e.id)]).size, 'piece')} of evidence</p>` : ''}</div>
      <div class="item-actions">${kind === 'missing' ? `<button class="btn btn-sm" data-act="fact-fill" data-id="${esc(f.id)}">Fill in</button>` : kind !== 'confirmed' ? `<button class="btn btn-sm" data-act="fact-confirm" data-id="${esc(f.id)}">Confirm</button>` : ''}<button class="icon-btn" data-act="fact-edit" data-id="${esc(f.id)}" aria-label="Edit">${ICON.edit}</button><button class="icon-btn danger" data-act="fact-delete" data-id="${esc(f.id)}" aria-label="Delete">${ICON.trash}</button></div></div>`).join('')}</div>` : ''}</div>`;
  const cons = byCase('consequences', c.id).sort((a, b) => ({ established: 0, potential: 1, avoided: 2 }[a.status] - { established: 0, potential: 1, avoided: 2 }[b.status]) || b.severity - a.severity);
  const dls = byCase('deadlines', c.id).sort((a, b) => (a.date || '9').localeCompare(b.date || '9'));
  const P = pb(c.type);
  return `<div class="stack stack-lg">
    <section><div class="section-head"><h2 class="h2">What you know</h2><button class="btn btn-sm" data-act="fact-add" data-case="${esc(c.id)}">${ico('plus', 'sm')}Add</button></div>
      <p class="section-note">Kept in four separate piles so nothing you assume gets treated as settled. Drafts and plans only rely on what’s confirmed.</p>
      ${group('confirmed', facts.filter(f => f.kind === 'confirmed'))}${group('unverified', facts.filter(f => f.kind === 'unverified'))}${group('assumption', facts.filter(f => f.kind === 'assumption'))}${group('missing', facts.filter(f => f.kind === 'missing'))}
    </section>
    <section class="section"><div class="section-head"><h2 class="h2">Consequences</h2><button class="btn btn-sm" data-act="cons-add" data-case="${esc(c.id)}">${ico('plus', 'sm')}Add</button></div>
      <p class="section-note">What has happened, what could still happen, and how hard each would be to undo. Items marked “general guidance” come from the playbook, not your provider.</p>
      ${cons.length ? `<div class="list">${cons.map(x => `<div class="item"><div class="item-main"><p class="small" style="font-weight:500">${esc(x.text)}</p>
        <div class="item-meta">${pill(REVERSIBILITY[x.reversibility], x.reversibility === 'irreversible' ? 'coral' : x.reversibility === 'hard' ? 'amber' : x.reversibility === 'reversible' ? 'sage' : '')}${x.severity >= 3 ? pill('Serious', 'coral') : ''}${x.general ? '<span class="tag">General guidance</span>' : ''}</div>${x.note ? `<p class="xs muted mt4">${esc(x.note)}</p>` : ''}</div>
        <div class="item-actions"><label class="sr-only" for="cs-${esc(x.id)}">Status</label><select id="cs-${esc(x.id)}" class="select" style="min-height:36px;padding:4px 30px 4px 10px;font-size:13px;width:auto" data-change="cons-status" data-id="${esc(x.id)}">${Object.entries(CONS_STATUS).map(([k, l]) => `<option value="${k}" ${x.status === k ? 'selected' : ''}>${l}</option>`).join('')}</select><button class="icon-btn" data-act="cons-edit" data-id="${esc(x.id)}" aria-label="Edit">${ICON.edit}</button><button class="icon-btn danger" data-act="cons-delete" data-id="${esc(x.id)}" aria-label="Delete">${ICON.trash}</button></div></div>`).join('')}</div>` : '<p class="small muted">None recorded.</p>'}
    </section>
    <section class="section"><div class="section-head"><h2 class="h2">Dates & deadlines</h2><button class="btn btn-sm" data-act="dl-add" data-case="${esc(c.id)}">${ico('plus', 'sm')}Add</button></div>
      <p class="section-note">Their deadlines are kept apart from your own targets, and each is marked by how sure it is.</p>
      ${dls.length ? `<div class="list">${dls.map(d => `<div class="item"><div class="item-main"><p class="small" style="font-weight:500">${esc(d.label)}</p>
        <div class="item-meta"><span class="mono">${esc(d.date ? fmtDate(d.date, { year: true }) : 'No date')}</span>${d.date ? `<span>${esc(relDay(d.date))}</span>` : ''}${pill(d.kind === 'self' ? 'Your target' : 'Their deadline', d.kind === 'self' ? '' : 'blue')}${certaintyPill(d.certainty)}${d.status !== 'open' ? pill(DL_STATUS[d.status], d.status === 'met' ? 'sage' : '') : ''}</div>${d.source ? `<p class="xs muted mt4">Source: ${esc(d.source)}</p>` : ''}</div>
        <div class="item-actions">${d.status === 'open' ? `<button class="btn btn-sm" data-act="dl-met" data-id="${esc(d.id)}">Met</button>` : ''}<button class="icon-btn" data-act="dl-edit" data-id="${esc(d.id)}" aria-label="Edit">${ICON.edit}</button><button class="icon-btn danger" data-act="dl-delete" data-id="${esc(d.id)}" aria-label="Delete">${ICON.trash}</button></div></div>`).join('')}</div>` : '<p class="small muted">No dates recorded.</p>'}
    </section>
    <section class="section"><div class="section-head"><h2 class="h2">Context</h2></div><p class="section-note">Your answers shape which options rank highest. Change them any time.</p><div class="stack">${P.questions.map(q => questionBlock(c, q)).join('')}</div></section>
    <section class="section"><div class="section-head"><h2 class="h2">What to verify</h2></div>
      <p class="section-note">Rules and policies vary by provider and location. This app can’t look them up; these are the authoritative places to check. Record what you find as a confirmed fact with its source.</p>
      <form class="input-row" data-form="case-jurisdiction" data-case="${esc(c.id)}" style="margin-bottom:12px"><label class="sr-only" for="jur">Where this applies</label><input id="jur" class="input" name="jurisdiction" value="${esc(c.jurisdiction)}" placeholder="Where this applies, e.g. Texas, US"><button class="btn" type="submit">Save</button></form>
      <ul class="checklist">${P.verify.map(v => `<li><span class="grow small">${esc(v)}${c.jurisdiction ? ` <span class="muted">— for ${esc(c.jurisdiction)}</span>` : ''}</span><button class="btn btn-xs" data-act="fact-add" data-case="${esc(c.id)}" data-kind="confirmed" data-source="${esc(v.split(':')[0])}">Record what I found</button></li>`).join('')}</ul>
    </section>
  </div>`;
};

function evidenceFor(t, id) { return S.evidence.filter(e => e.links.some(l => l.t === t && l.id === id)); }

CaseTabs.options = c => {
  const ranked = Engine.rankPaths(c.id);
  const P = pb(c.type);
  return `<section><div class="section-head"><h2 class="h2">Ways forward</h2><button class="btn btn-sm" data-act="path-add" data-case="${esc(c.id)}">${ico('plus', 'sm')}Your own approach</button></div>
    <p class="section-note">Every legitimate route, with why it might work, what it costs, and what’s uncertain. Ranked by your answers and the case so far — the most obvious route isn’t always best. No outcome is guaranteed.</p>
    ${ranked.map(({ path: p, score, reasons, best }) => {
      const def = P.paths.find(x => x.key === p.key);
      const dim = ['ruled_out', 'didnt_work'].includes(p.status);
      return `<article class="path ${p.status === 'chosen' ? 'chosen' : ''} ${dim ? 'dim' : ''}">
        <div class="between" style="align-items:flex-start"><div class="grow"><p class="tag">${esc(APPROACHES[p.approach])}${p.custom ? ' · yours' : ''}</p><h3 class="h3 mt4">${esc(p.title)}</h3></div>
          <div class="cluster">${best ? pill('Best fit so far', 'sage') : ''}${p.status !== 'considering' ? pill(p.status === 'chosen' ? 'Current approach' : PATH_STATUS[p.status], p.status === 'worked' ? 'sage' : p.status === 'chosen' ? 'ink' : '') : ''}</div></div>
        ${p.why ? `<p class="small ink2 mt8">${esc(p.why)}</p>` : ''}
        ${reasons.length ? `<div class="why">${reasons.map(r => `<span class="why-item ${r.delta < 0 ? 'neg' : ''}">${r.delta > 0 ? '+' : '−'} ${esc(r.text)}</span>`).join('')}</div>` : ''}
        <details class="disclose"><summary>Downsides, prerequisites and uncertainties</summary><div class="path-grid">
          <div><h4>Downsides</h4><p>${esc(p.downsides || '—')}</p></div>
          <div><h4>Likely outcome</h4><p>${esc(p.outcome || '—')}</p></div>
          <div><h4>You’ll need</h4>${p.prerequisites.length ? `<ul>${p.prerequisites.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '<p>Nothing special</p>'}</div>
          <div><h4>Uncertain</h4>${p.uncertainties.length ? `<ul>${p.uncertainties.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '<p>—</p>'}</div>
        </div></details>
        ${p.note ? `<p class="xs ink2 mt8"><b>Note:</b> ${esc(p.note)}</p>` : ''}
        <div class="cluster mt12">
          ${p.status === 'considering' ? `<button class="btn btn-sm btn-ink" data-act="path-choose" data-id="${esc(p.id)}">Choose this approach</button>` : ''}
          ${['considering', 'chosen'].includes(p.status) && (def && def.comm || p.custom) ? `<button class="btn btn-sm" data-act="compose" data-case="${esc(c.id)}" data-path="${esc(p.id)}">Draft a message</button>` : ''}
          ${p.status === 'chosen' ? `<button class="btn btn-sm btn-ghost" data-act="path-outcome" data-id="${esc(p.id)}" data-status="worked">It worked</button><button class="btn btn-sm btn-ghost" data-act="path-outcome" data-id="${esc(p.id)}" data-status="didnt_work">It didn’t work</button>` : ''}
          ${p.status === 'considering' ? `<button class="btn btn-sm btn-ghost" data-act="path-outcome" data-id="${esc(p.id)}" data-status="ruled_out">Rule out</button>` : ''}
          ${dim ? `<button class="btn btn-sm btn-ghost" data-act="path-reconsider" data-id="${esc(p.id)}">Reconsider</button>` : ''}
          ${p.custom ? `<button class="icon-btn danger" data-act="path-delete" data-id="${esc(p.id)}" aria-label="Delete approach">${ICON.trash}</button>` : ''}
        </div></article>`;
    }).join('') || empty('No options listed', 'Add your own approach.')}</section>`;
};

function taskRow(t) {
  const blockers = t.done ? [] : Engine.taskBlockers(t);
  const path = t.pathId ? findRec('paths', t.pathId) : null;
  return `<div class="item"><button class="cb item-lead" role="checkbox" aria-checked="${t.done}" data-act="toggle-task" data-id="${esc(t.id)}" aria-label="${t.done ? 'Mark not done' : 'Mark done'}: ${esc(t.text)}">${ICON.check}</button>
    <div class="item-main"><p class="small ${t.done ? 'done-text' : ''}" style="font-weight:500">${esc(t.text)}</p>
      <div class="item-meta">${t.effort ? `<span>~${t.effort} min</span>` : ''}${path ? `<span class="tag">${esc(truncate(path.title, 36))}</span>` : ''}${blockers.map(b => pill(b.text, 'blue')).join('')}${t.done && t.doneAt ? `<span>Done ${esc(fmtDate(stampDate(t.doneAt)))}</span>` : ''}</div>${t.note ? `<p class="xs muted mt4">${esc(t.note)}</p>` : ''}</div>
    ${t.done ? '' : `<div class="item-actions"><button class="icon-btn" data-act="task-move" data-id="${esc(t.id)}" data-dir="-1" aria-label="Move up">${ICON.up}</button><button class="icon-btn" data-act="task-move" data-id="${esc(t.id)}" data-dir="1" aria-label="Move down">${ICON.down}</button><button class="icon-btn" data-act="task-edit" data-id="${esc(t.id)}" aria-label="Edit step">${ICON.edit}</button><button class="icon-btn danger" data-act="task-delete" data-id="${esc(t.id)}" aria-label="Delete step">${ICON.trash}</button></div>`}</div>`;
}

CaseTabs.plan = c => {
  const open = Engine.openTasks(c.id);
  const done = S.tasks.filter(t => t.caseId === c.id && t.done).sort((a, b) => (b.doneAt || '').localeCompare(a.doneAt || ''));
  const docs = byCase('docs', c.id);
  const chosen = S.paths.find(p => p.caseId === c.id && p.status === 'chosen');
  return `<div class="stack stack-lg"><section><div class="section-head"><h2 class="h2">Steps</h2></div>
    <p class="section-note">${chosen ? `Following: <b>${esc(chosen.title)}</b>. ` : ''}Steps can depend on other steps, on something you’re waiting for, or on another case being resolved — blocked steps say why.</p>
    ${open.length ? `<div class="list">${open.map(taskRow).join('')}</div>` : `<p class="small muted">${done.length ? 'No open steps.' : `No steps yet. <a class="linkish" href="${href('case', c.id, 'options')}">Choose an approach</a> to get a starting plan, or add your own below.`}</p>`}
    <form class="input-row mt12" data-form="task-add" data-case="${esc(c.id)}"><label class="sr-only" for="new-task">New step</label><input id="new-task" class="input" name="text" placeholder="Add a step…" data-fk="new-task" autocomplete="off"><select class="select" name="effort" style="width:auto" aria-label="Rough effort"><option value="0">Effort?</option><option value="5">5 min</option><option value="15">15 min</option><option value="30">30 min</option><option value="60">1 hour</option></select><button class="btn" type="submit">Add</button></form>
    ${done.length ? `<details class="disclose"><summary>Done (${done.length})</summary><div class="list mt8">${done.map(taskRow).join('')}</div></details>` : ''}
  </section>
  <section class="section"><div class="section-head"><h2 class="h2">To gather</h2></div><p class="section-note">Documents and details you’ll need. Link the actual item as evidence when you have it.</p>
    ${docs.length ? `<div class="list">${docs.map(d => `<div class="item"><button class="item-lead pill ${d.status === 'needed' ? 'amber' : d.status === 'have' ? 'sage' : ''}" style="border:0" data-act="doc-cycle" data-id="${esc(d.id)}" title="Change status">${esc(DOC_STATUS[d.status])}</button><div class="item-main"><p class="small" style="font-weight:500">${esc(d.name)}</p>${d.note ? `<p class="xs muted mt4">${esc(d.note)}</p>` : ''}${d.evidenceId && findRec('evidence', d.evidenceId) ? `<p class="xs mt4">${ico('clip', 'sm')} ${esc(findRec('evidence', d.evidenceId).title)}</p>` : ''}</div><div class="item-actions"><button class="icon-btn" data-act="doc-edit" data-id="${esc(d.id)}" aria-label="Edit">${ICON.edit}</button><button class="icon-btn danger" data-act="doc-delete" data-id="${esc(d.id)}" aria-label="Delete">${ICON.trash}</button></div></div>`).join('')}</div>` : ''}
    <form class="input-row mt12" data-form="doc-add" data-case="${esc(c.id)}"><label class="sr-only" for="new-doc">New item to gather</label><input id="new-doc" class="input" name="name" placeholder="Add something to gather…" data-fk="new-doc" autocomplete="off"><button class="btn" type="submit">Add</button></form>
  </section></div>`;
};

CaseTabs.contact = c => {
  const comms = byCase('comms', c.id).sort((a, b) => (b.date || b.createdAt.slice(0, 10)).localeCompare(a.date || a.createdAt.slice(0, 10)));
  const commits = byCase('commitments', c.id);
  const cmRow = m => {
    const overdue = m.status === 'pending' && m.due && daysUntil(m.due) < 0;
    return `<div class="item"><div class="item-main"><p class="small" style="font-weight:500">${esc(m.text)}</p><div class="item-meta">${m.due ? `<span>By ${esc(fmtDate(m.due))}</span>` : '<span>No date given</span>'}${pill(overdue ? (m.party === 'them' ? 'Missed' : 'Overdue') : COMMIT_STATUS[m.status], overdue ? 'coral' : m.status === 'kept' ? 'sage' : '')}${evidenceFor('commitments', m.id).length ? `<span>${ico('clip', 'sm')} in writing</span>` : ''}</div></div>
      <div class="item-actions">${m.status === 'pending' ? `<button class="btn btn-xs" data-act="cmt-status" data-id="${esc(m.id)}" data-status="kept">Kept</button><button class="btn btn-xs btn-ghost" data-act="cmt-status" data-id="${esc(m.id)}" data-status="missed">${m.party === 'them' ? 'Missed' : 'Not done'}</button><button class="btn btn-xs btn-ghost" data-act="cmt-status" data-id="${esc(m.id)}" data-status="released">Drop</button>` : `<button class="btn btn-xs btn-ghost" data-act="cmt-status" data-id="${esc(m.id)}" data-status="pending">Reopen</button>`}<button class="icon-btn danger" data-act="cmt-delete" data-id="${esc(m.id)}" aria-label="Delete">${ICON.trash}</button></div></div>`;
  };
  return `<div class="stack stack-lg"><section>
    <div class="section-head"><h2 class="h2">Communications</h2></div>
    <p class="section-note">Prepare calls, emails and letters in the right tone, record what was said, and keep track of who promised what. You send everything yourself.</p>
    <div class="cluster" style="margin-bottom:14px"><button class="btn btn-ink" data-act="compose" data-case="${esc(c.id)}">${ico('mail', 'sm')}Prepare a message or call</button><button class="btn" data-act="incoming" data-case="${esc(c.id)}">Log a reply or contact</button></div>
    ${comms.length ? `<div class="list">${comms.map(m => `<div class="item"><span class="item-lead thumb" style="width:40px;height:40px">${ico(CHANNEL_ICON[m.channel])}</span><div class="item-main">
      <p class="small" style="font-weight:600">${m.direction === 'in' ? 'From them: ' : ''}${esc(m.subject || PURPOSES[m.purpose])}</p>
      <div class="item-meta">${pill(COMM_STATUS[m.status], m.status === 'draft' ? 'amber' : m.status === 'done' || m.status === 'received' ? 'sage' : 'blue')}${m.date ? `<span>${esc(fmtDate(m.date))}</span>` : ''}${m.direction === 'out' ? `<span>${esc(STANCES[m.stance].label)} · ${esc(TONES[m.tone])}</span>` : ''}${m.contact ? `<span>${esc(m.contact)}</span>` : ''}${m.reference ? `<span class="mono">Ref ${esc(m.reference)}</span>` : ''}</div>
      ${m.outcome ? `<p class="xs ink2 mt4 clamp2">${esc(m.outcome)}</p>` : ''}</div>
      <div class="item-actions">${m.status === 'draft' ? `<button class="btn btn-sm" data-act="comm-open" data-id="${esc(m.id)}">${m.channel === 'call' ? 'Open script' : 'Edit draft'}</button>` : `<button class="btn btn-sm btn-ghost" data-act="comm-view" data-id="${esc(m.id)}">View</button>`}<button class="icon-btn danger" data-act="comm-delete" data-id="${esc(m.id)}" aria-label="Delete">${ICON.trash}</button></div></div>`).join('')}</div>` : ''}
  </section>
  <section class="section"><div class="section-head"><h2 class="h2">Commitments</h2><button class="btn btn-sm" data-act="cmt-add" data-case="${esc(c.id)}">${ico('plus', 'sm')}Add</button></div>
    <p class="section-note">What each side said they’d do. Their promises are tracked in Waiting; a missed one becomes an escalation opportunity.</p>
    <p class="strong small">They committed to</p>${commits.filter(m => m.party === 'them').length ? `<div class="list mt8">${commits.filter(m => m.party === 'them').map(cmRow).join('')}</div>` : '<p class="small muted mt4">Nothing recorded.</p>'}
    <p class="strong small mt16">You committed to</p>${commits.filter(m => m.party === 'me').length ? `<div class="list mt8">${commits.filter(m => m.party === 'me').map(cmRow).join('')}</div>` : '<p class="small muted mt4">Nothing recorded.</p>'}
  </section></div>`;
};

CaseTabs.waiting = c => {
  const waits = byCase('waits', c.id);
  const open = waits.filter(w => ['waiting', 'escalated'].includes(w.status));
  const closed = waits.filter(w => !['waiting', 'escalated'].includes(w.status));
  const parallel = Engine.actionableTasks(c.id);
  return `<section><div class="section-head"><h2 class="h2">Waiting</h2><button class="btn btn-sm" data-act="wait-new" data-case="${esc(c.id)}">${ico('plus', 'sm')}Track something</button></div>
    <p class="section-note">For replies, actions, documents, decisions and payments from the other side — with when to follow up and when it’s fair to escalate.</p>
    ${open.length ? `<div class="list">${open.map(w => waitItem(w, Engine.waitState(w), false)).join('')}</div>` : '<p class="small muted">Nothing pending on the other side.</p>'}
    ${open.length && parallel.length ? `<div class="section"><p class="strong small">While you wait, you can still</p><div class="list mt8">${parallel.slice(0, 3).map(taskRow).join('')}</div></div>` : ''}
    ${closed.length ? `<details class="disclose"><summary>Finished (${closed.length})</summary><div class="list mt8">${closed.map(w => waitItem(w, Engine.waitState(w), false)).join('')}</div></details>` : ''}</section>`;
};

CaseTabs.evidence = c => {
  const list = byCase('evidence', c.id).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  UI.after.push(hydrateThumbs);
  return `<section><div class="section-head"><h2 class="h2">Evidence</h2><button class="btn btn-sm btn-ink" data-act="ev-new" data-case="${esc(c.id)}">${ico('plus', 'sm')}Add evidence</button></div>
    <p class="section-note">Link each item to what it proves — a fact, a promise, a call, a resolution criterion. Closing a case as “verified” relies on this.</p>
    ${list.length ? `<div class="list">${list.map(e => evidenceItem(e, false)).join('')}</div>` : '<p class="small muted">Nothing yet. Confirmation numbers, screenshots, letters and receipts all count.</p>'}</section>`;
};

CaseTabs.timeline = c => {
  const evs = byCase('events', c.id).sort((a, b) => (UIState.timelineAsc ? a.at.localeCompare(b.at) : b.at.localeCompare(a.at)));
  let lastDay = '';
  const typeCls = { resolution: 't-res', comm: 't-comm', commitment: 't-comm', wait: 't-wait', note: 't-note' };
  return `<section><div class="section-head"><h2 class="h2">Case history</h2><button class="btn btn-sm btn-ghost" data-act="timeline-order">${UIState.timelineAsc ? 'Newest first' : 'Oldest first'}</button></div>
    <form class="input-row" data-form="note-add" data-case="${esc(c.id)}" style="margin-bottom:18px"><label class="sr-only" for="tl-note">Add a note</label><input id="tl-note" class="input" name="text" placeholder="Add a note to the history…" data-fk="tl-note" autocomplete="off"><button class="btn" type="submit">Add</button></form>
    ${evs.length ? `<div class="tl">${evs.map(e => { const d = stampDate(e.at); const head = d !== lastDay ? `<p class="tl-day">${esc(fmtDate(d, { weekday: true, year: true }))}</p>` : ''; lastDay = d; return `${head}<div class="tl-ev ${typeCls[e.type] || ''}"><span class="tl-time">${esc(fmtTime(e.at))}${e.manual ? ' · note' : ''}</span><p class="tl-text">${esc(e.text)}</p></div>`; }).join('')}</div>` : '<p class="small muted">No history yet.</p>'}</section>`;
};

CaseTabs.resolve = c => {
  const R = Engine.resolution(c.id);
  const crits = byCase('criteria', c.id);
  const state = c.resolution.state; const rs = RES_STATES[state];
  const P = pb(c.type);
  const choices = [
    ['verified', 'Verified closed', 'Every criterion met, with evidence.'],
    ['conditional', 'Resolved, on a condition', 'Done if something still happens — e.g. a credit posts.'],
    ['monitoring', 'Monitoring', 'Looks resolved; watch until a date.'],
    ['partial', 'Partly resolved', 'Some of it is sorted.'],
    ['disputed', 'Disputed', 'You and they disagree on the outcome.'],
    ['closed_unverified', 'Close without verifying', 'Done, but without evidence.'],
    ['withdrawn', 'Let it go', 'You’ve decided not to pursue it.'],
  ];
  return `<div class="stack stack-lg">
    <section class="card"><p class="eyebrow">Current status</p><p class="h2 mt4">${esc(rs.label)}</p>
      ${c.resolution.condition ? `<p class="small mt8"><b>Condition:</b> ${esc(c.resolution.condition)}</p>` : ''}${c.resolution.monitorUntil ? `<p class="small mt4"><b>Watching until:</b> ${esc(dateAndRel(c.resolution.monitorUntil))}</p>` : ''}${c.resolution.note ? `<p class="small ink2 mt8">${esc(c.resolution.note)}</p>` : ''}
      ${!rs.closed ? `<p class="small ink2 mt12">${esc(R.text)}</p>` : ''}
      ${R.tasksOpen && !rs.closed ? `<p class="xs muted mt8">${plural(R.tasksOpen, 'step')} still open in the plan — that’s fine if the problem is solved anyway.</p>` : ''}
    </section>
    <section><div class="section-head"><h2 class="h2">What “resolved” means here</h2><button class="btn btn-sm" data-act="crit-add" data-case="${esc(c.id)}">${ico('plus', 'sm')}Add</button></div>
      <p class="section-note">A finished checklist isn’t proof. Mark each criterion and attach the evidence that shows it.</p>
      ${crits.length ? `<div class="list">${crits.map(x => { const evs = x.evidenceIds.map(id => findRec('evidence', id)).filter(Boolean); return `<div class="item"><div class="item-main"><p class="small" style="font-weight:500">${esc(x.text)}</p>
        <div class="item-meta">${x.status === 'met' ? (evs.length ? pill('Met · evidenced', 'sage') : pill('Met · no evidence', 'amber')) : x.status === 'pending' ? '' : pill(CRIT_STATUS[x.status], x.status === 'not_met' ? 'coral' : '')}${evs.map(e => `<span>${ico('clip', 'sm')} ${esc(truncate(e.title, 40))}</span>`).join('')}</div>${x.note ? `<p class="xs muted mt4">${esc(x.note)}</p>` : ''}</div>
        <div class="item-actions"><label class="sr-only" for="cr-${esc(x.id)}">Status</label><select id="cr-${esc(x.id)}" class="select" style="min-height:36px;padding:4px 30px 4px 10px;font-size:13px;width:auto" data-change="crit-status" data-id="${esc(x.id)}">${Object.entries(CRIT_STATUS).map(([k, l]) => `<option value="${k}" ${x.status === k ? 'selected' : ''}>${l}</option>`).join('')}</select><button class="icon-btn" data-act="crit-evidence" data-id="${esc(x.id)}" aria-label="Attach evidence">${ICON.clip}</button><button class="icon-btn danger" data-act="crit-delete" data-id="${esc(x.id)}" aria-label="Delete">${ICON.trash}</button></div></div>`; }).join('')}</div>` : '<p class="small muted">No criteria yet.</p>'}
    </section>
    <section class="section"><div class="section-head"><h2 class="h2">${rs.closed ? 'Change status' : 'Set status'}</h2></div>
      ${rs.closed ? `<div class="cluster"><button class="btn" data-act="res-reopen" data-case="${esc(c.id)}">Reopen this case</button></div>` : `<div class="choices two">${choices.map(([k, l, d]) => `<button type="button" class="choice" style="text-align:left;border:0;background:none;padding:0" data-act="res-set" data-case="${esc(c.id)}" data-state="${k}"><span class="box" style="${R.suggest === k ? 'border-color:var(--sage);box-shadow:inset 0 0 0 1px var(--sage)' : ''}"><b>${esc(l)}${R.suggest === k ? ' <span class="pill sage">Suggested</span>' : ''}</b><small>${esc(d)}</small></span></button>`).join('')}</div>`}
    </section>
    ${rs.closed && P.prevention.length ? `<section class="section"><div class="section-head"><h2 class="h3">Prevent a repeat (optional)</h2></div><p class="section-note">Only if it helps. Each can become a reminder you download to your own calendar.</p><ul class="checklist">${P.prevention.map(sg => `<li><span class="grow small">${esc(sg)}</span><button class="btn btn-xs" data-act="obligation-new" data-title="${esc(sg)}" data-type="${esc(c.type)}">Make it a reminder</button></li>`).join('')}</ul></section>` : ''}
  </div>`;
};
