/* ---------------- Views ---------------- */
const Views = {};
const EXAMPLES = [
  'Forgot to pay my electric bill 10 days ago and want to ask for a late fee waiver',
  'Missed my dentist appointment last week and need to reschedule',
  'Car registration expired last month and I’m still driving it',
  'Need to return an online order that is 5 days past the 30-day return window',
  'Health insurance reimbursement claim from two months ago is still unpaid',
  'Unanswered notice from my HOA about a fence repair deadline',
  'There’s a charge on my card I don’t recognise',
  'Got a parking ticket I think was issued by mistake',
];

Views.notFound = () => `<div class="page-head"><h1 class="h1">Not found</h1><p class="lede">That page doesn’t exist. <a class="linkish" href="#/today">Go to Today</a></p></div>`;
Views.error = e => `<div class="page-head"><h1 class="h1">Something went wrong showing this page</h1><p class="lede">Your data is safe — nothing was changed. Try another section, or reload. Details: <span class="mono">${esc(e && e.message)}</span></p><div class="actions"><a class="btn" href="#/today">Go to Today</a></div></div>`;

function greeting() { const h = nowDate().getHours(); return h < 5 ? 'Late night' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; }

function quickIntake(compact = false) {
  return `<form class="${compact ? '' : 'card'}" data-form="quick-intake">
    <label class="label" for="qi">${compact ? 'Something else went wrong?' : '<span class="h3" style="display:block;margin-bottom:4px">What went wrong?</span><span class="muted xs" style="font-weight:400">In your own words — a missed bill, an expired renewal, an unanswered letter, a refund that never came.</span>'}</label>
    <div class="input-row mt8"><input id="qi" class="input" name="text" data-fk="quick-intake" placeholder="e.g. Forgot to pay my electric bill 10 days ago…" autocomplete="off"><button class="btn btn-primary" type="submit">${compact ? 'Start' : 'Start a case'}</button></div>
  </form>`;
}

/* ===== Today ===== */
Views.today = () => {
  if (!S.cases.length) return welcomeView();
  const pri = Engine.prioritized();
  const active = pri.filter(p => !p.parked);
  const actionable = active.filter(p => p.actionable);
  const top = actionable[0];
  const attention = actionable.slice(1).filter(p => p.reasons.some(r => r.hot) || p.score >= 4).slice(0, 2);
  const shown = new Set([top, ...attention].filter(Boolean).map(p => p.caseId));
  const rest = active.filter(p => !shown.has(p.caseId));
  const parked = pri.filter(p => p.parked);
  const waits = Engine.openWaits();
  const wNeeds = waits.map(w => ({ w, st: Engine.waitState(w) })).filter(x => ['missed', 'follow', 'overdue'].includes(x.st.key)).sort((a, b) => a.st.rank - b.st.rank);
  const soon = Engine.agenda().filter(i => { const n = daysUntil(i.date); return n >= 0 && n <= 7 && i.kind !== 'parked'; }).slice(0, 5);
  const restSoon = rest.some(p => S.deadlines.some(d => d.caseId === p.caseId && d.kind === 'external' && d.status === 'open' && daysUntil(d.date) >= 0 && daysUntil(d.date) <= 7));
  const openN = active.length;
  const lede = openN ? `${plural(openN, 'open case')}${waits.length ? ` · ${waits.length} in someone else’s court` : ''}${parked.length ? ` · ${parked.length} parked` : ''}.` : 'Every case is closed, parked or waiting.';

  let focal = '';
  if (top) {
    const c = getCase(top.caseId); const st = top.step;
    const btns = [];
    if (st.kind === 'task') {
      btns.push(`<button class="btn btn-sage" data-act="toggle-task" data-id="${esc(st.task.id)}">${ico('check', 'sm')}Mark done</button>`);
      btns.push(`<a class="btn" href="${href('case', c.id)}">Open case</a>`);
    } else if (st.kind === 'choose') btns.push(`<a class="btn btn-ink" href="${href('case', c.id, 'options')}">Compare options</a>`);
    else if (st.kind === 'followup') { btns.push(`<button class="btn btn-ink" data-act="compose" data-case="${esc(c.id)}" data-purpose="${st.purpose}" data-wait="${esc(st.wait.id)}">${st.purpose === 'escalate' ? 'Draft an escalation' : 'Draft a follow-up'}</button>`); btns.push(`<a class="btn" href="${href('case', c.id, 'waiting')}">Details</a>`); }
    else if (st.kind === 'resolve' || st.kind === 'monitor') btns.push(`<a class="btn btn-ink" href="${href('case', c.id, 'resolve')}">Check resolution</a>`);
    else btns.push(`<a class="btn" href="${href('case', c.id)}">Open case</a>`);
    const eff = st.task && st.task.effort ? `<span class="pill line">about ${st.task.effort} min</span>` : '';
    focal = `<section class="focal" aria-labelledby="start-here">
      <div class="between"><span class="eyebrow" id="start-here">Start here</span>${eff}</div>
      <p class="focus-task" style="font-size:clamp(22px,4vw,28px)">${esc(st.text)}</p>
      <p class="small ink2 mt8">${caseLinkEl(c.id)} · ${esc(pb(c.type).short)}</p>
      ${whyList(top.reasons, 3)}
      <div class="cluster mt16">${btns.join('')}</div>
    </section>`;
  } else {
    focal = `<section class="card"><p class="h3">Nothing needs you right now.</p><p class="small ink2 mt4">${waits.length ? `You’re waiting on ${plural(waits.length, 'reply', 'replies')} or actions from others. The Waiting view shows when to follow up.` : 'Open cases are parked or waiting on other steps.'}</p><div class="cluster mt12"><a class="btn" href="#/waiting">See what you’re waiting on</a></div></section>`;
  }

  const attnHTML = attention.length ? `<section class="section"><div class="section-head"><h2 class="h3">Also worth attention</h2></div><div class="list">${attention.map(p => {
    const c = getCase(p.caseId);
    return `<div class="item"><div class="item-main"><a class="item-title serif stretch" style="text-decoration:none" href="${href('case', c.id)}">${esc(c.title)}</a><p class="item-sub">${esc(p.step.text)}</p>${whyList(p.reasons, 2)}</div></div>`;
  }).join('')}</div></section>` : '';

  const waitHTML = waits.length ? `<section class="section"><div class="section-head"><h2 class="h3">In someone else’s court</h2><a class="linkish" href="#/waiting">All waiting</a></div>
    ${wNeeds.length ? `<div class="list">${wNeeds.slice(0, 3).map(({ w, st }) => `<div class="item"><div class="item-main"><p class="item-title">${esc(w.what)}</p><p class="item-sub">${esc(w.from || 'Them')} · ${caseLinkEl(w.caseId)}</p><div class="item-meta">${pill(st.label, st.tone)}</div></div></div>`).join('')}</div>`
      : `<p class="small ink2">${plural(waits.length, 'thing')} pending, all on track. Nothing to chase yet.</p>`}</section>` : '';

  const soonHTML = soon.length ? `<section class="section"><div class="section-head"><h2 class="h3">Next 7 days</h2><a class="linkish" href="#/dates">All dates</a></div><div class="list plain">${soon.map(agendaRow).join('')}</div></section>` : '';

  const restHTML = rest.length ? `<section class="section"><div class="section-head"><h2 class="h3">Everything else can wait</h2></div>
    <p class="small ink2">${plural(rest.length, 'other open case')}${restSoon ? '' : ' — none has a deadline in the next 7 days'}. They’re tracked; you don’t need to hold them in your head.</p>
    ${UIState.showAllToday ? `<div class="list mt12">${rest.map(p => { const c = getCase(p.caseId); return `<a class="item link" href="${href('case', c.id)}"><div class="item-main"><p class="item-title">${esc(c.title)}</p><p class="item-sub">${esc(p.step ? p.step.text : '')}</p></div>${statusPill(c.id)}</a>`; }).join('')}</div>` : ''}
    <div class="cluster mt12"><button class="btn btn-sm btn-ghost" data-act="toggle-today-all" aria-expanded="${UIState.showAllToday}">${UIState.showAllToday ? 'Hide them' : 'Show them'}</button></div></section>` : '';

  const focusHTML = actionable.length ? `<section class="section"><div class="section-head"><h2 class="h3">Have a few minutes?</h2></div><p class="small ink2">A focus session shows one small step at a time, picked by consequence and deadline. Stop whenever you like.</p>
    <div class="cluster mt12">${[5, 15, 30].map(m => `<button class="btn btn-sm" data-act="start-focus" data-min="${m}">${ico('focus', 'sm')}${m} min</button>`).join('')}</div></section>` : '';

  return `<div class="page-head"><p class="eyebrow">${greeting()} · ${esc(fmtDate(today(), { weekday: true }))}</p><h1 class="h1">${top ? 'Here’s where to start.' : 'You’re all caught up for now.'}</h1><p class="lede">${lede}</p></div>
    ${focal}${attnHTML}${waitHTML}${soonHTML}${focusHTML}${restHTML}
    <section class="section">${quickIntake(true)}</section>`;
};

function welcomeView() {
  return `<div class="page-head"><p class="eyebrow">Welcome</p><h1 class="h1">Things slip. Let’s get it handled calmly.</h1>
    <p class="lede">Describe what went wrong in your own words. AFTER THE FACT helps you see where you actually stand, compare your options, take the next right step — and know when it’s truly handled.</p></div>
    ${quickIntake(false)}
    <div class="cluster mt12"><span class="xs muted">Or try:</span>${EXAMPLES.slice(0, 3).map((e, i) => `<button class="btn btn-xs btn-quiet" data-act="intake-example" data-i="${i}">${esc(truncate(e, 46))}</button>`).join('')}</div>
    <section class="section mt32"><div class="grid3">
      <div><p class="strong">Private by default</p><p class="small ink2 mt4">Everything stays in this browser on this device. No account, no tracking, no AI service.</p></div>
      <div><p class="strong">Honest about uncertainty</p><p class="small ink2 mt4">What you’ve confirmed is kept apart from what you assume or haven’t checked yet.</p></div>
      <div><p class="strong">Done means done</p><p class="small ink2 mt4">Cases close on evidence — not just because the checklist is ticked.</p></div>
    </div></section>
    <section class="section"><div class="between"><div><p class="strong">Want to look around first?</p><p class="small ink2">Load a set of realistic example cases. You can remove them in one tap.</p></div><div class="cluster"><button class="btn" data-act="load-samples">Explore examples</button><a class="btn btn-ghost" href="#/data">Restore a backup</a></div></div></section>`;
}

function agendaRow(i) {
  const kindLabel = { deadline: 'Deadline', target: 'Your target', expected: 'Expected', followup: 'Follow-up', mine: 'Your commitment', theirs: 'Their promise', monitor: 'Monitoring check', parked: 'Parked case returns', obligation: 'Recurring' }[i.kind];
  const n = daysUntil(i.date);
  return `<div class="item"><div class="agenda-date">${esc(fmtDate(i.date))}<br><span>${esc(n === 0 ? 'today' : relDay(i.date).replace(/^in /, ''))}</span></div>
    <div class="item-main"><p class="item-title">${esc(i.title)}</p><div class="item-meta">${pill(kindLabel, i.kind === 'theirs' || i.kind === 'expected' ? 'blue' : i.kind === 'deadline' ? 'amber' : '')}${i.certainty && i.kind !== 'target' ? certaintyPill(i.certainty) : ''}${i.caseId ? `<span>${caseLinkEl(i.caseId)}</span>` : (i.kind === 'obligation' ? '<a class="linkish plain" href="#/insights">Recurring obligations</a>' : '')}</div></div></div>`;
}

/* ===== Intake ===== */
Views.new = () => {
  const I = UIState.intake;
  if (!I || !I.draft) {
    const text = I && I.text ? I.text : '';
    return `<a class="back" href="#/today">${ico('back', 'sm')}Back</a>
      <div class="page-head"><p class="eyebrow">New case · step 1 of 2</p><h1 class="h1">What went wrong?</h1><p class="lede">Write it the way you’d tell a friend. Include anything you remember — when it happened, amounts, who it’s with. You can correct everything afterwards.</p></div>
      <form data-form="intake-describe" class="card">
        <label class="label" for="intake-text">Describe the situation</label>
        <textarea id="intake-text" class="textarea" name="text" rows="4" data-fk="intake-text" data-input="intake-text" placeholder="e.g. I missed my car registration renewal last month and I’m not sure what I need to renew it…" required>${esc(text)}</textarea>
        <div class="between mt12"><span class="xs muted">Stays on this device. Nothing is sent anywhere.</span><button class="btn btn-primary" type="submit">Continue</button></div>
      </form>
      <div class="section"><p class="eyebrow" style="margin-bottom:8px">Or start from an example</p><div class="cluster">${EXAMPLES.map((e, i) => `<button class="btn btn-sm btn-quiet" data-act="intake-example" data-i="${i}">${esc(e)}</button>`).join('')}</div></div>`;
  }
  const d = I.draft; const P = pb(d.type);
  const ranked = P.paths.map(p => ({ p, ...Engine.scorePath(d.type, p, d.answers) })).sort((a, b) => b.score - a.score);
  if (I.pathKey === undefined || (I.pathKey && !P.paths.some(p => p.key === I.pathKey))) I.pathKey = ranked[0].p.key;
  const cls = d.classification;
  const alts = (cls.alternatives || []).filter(t => t !== d.type);
  const fromWords = [...d.when.map(w => `${esc(cap(w.phrase))} → around ${esc(fmtDate(w.date, { year: true }))}`), ...d.amounts.map(a => esc(a.phrase))];
  const cons = Engine.consequencesFor(d.type, d.answers);
  return `<button class="back linkish plain" style="border:0;background:none" data-act="intake-back">${ico('back', 'sm')}Edit description</button>
    <div class="page-head"><p class="eyebrow">New case · step 2 of 2</p><h1 class="h1">Here’s what I understood.</h1><p class="lede">Check it, answer only the questions that change what to do, and pick where to start. Nothing is saved until you create the case.</p></div>
    <form data-form="intake-create" class="stack stack-lg">
      <section class="card stack">
        <blockquote class="serif italic ink2" style="margin:0;font-size:17px">“${esc(d.text)}”</blockquote>
        <div class="grid2">
          ${field('Case title', `<input class="input" name="title" value="${esc(d.title)}" data-input="intake-field" data-k="title" data-fk="intake-title" required>`)}
          ${field('Kind of situation', selectEl('type', PLAYBOOK_ORDER.map(k => [k, PLAYBOOKS[k].label]), d.type, 'data-change="intake-type"'), cls.confident ? '' : 'Best guess from your words — change it if it’s not right.')}
        </div>
        ${alts.length ? `<p class="small ink2">It could also be: ${alts.map(t => `<button type="button" class="btn btn-xs btn-quiet" data-act="intake-settype" data-type="${t}">${esc(PLAYBOOKS[t].label)}</button>`).join(' ')}</p>` : ''}
        ${fromWords.length ? `<div><p class="label">Picked up from your words</p><div class="cluster">${fromWords.map(w => `<span class="pill line">${w}</span>`).join('')}</div><p class="hint">Saved as <b>unverified</b> until you check them against a statement, letter or the organization.</p></div>` : ''}
      </section>

      <section>
        <div class="section-head"><h2 class="h2">A few questions that change the plan</h2></div>
        <p class="section-note">Skip any you’re unsure about — “not sure” is a real answer, and it’ll be tracked as missing information.</p>
        <div class="stack">${P.questions.map(q => `<fieldset class="card flat"><legend class="strong" style="font-size:15px;padding:0">${esc(q.q)}</legend>
          <p class="xs muted mt4">${esc(q.why)}${d.answerSource[q.id] === 'inferred' ? ' <span class="pill amber">Inferred from your words — change if wrong</span>' : ''}</p>
          <div class="seg mt8">${q.opts.map(([v, l]) => `<label><input type="radio" name="q_${q.id}" value="${esc(v)}" data-change="intake-answer" data-q="${q.id}" data-fk="q-${q.id}-${esc(v)}" ${d.answers[q.id] === v ? 'checked' : ''}><span>${esc(l)}</span></label>`).join('')}</div></fieldset>`).join('')}</div>
      </section>

      <section>
        <div class="section-head"><h2 class="h2">Where to start</h2></div>
        <p class="section-note">Ranked using your answers. It’s a starting point, not a verdict — you can compare every option and switch later.</p>
        <div class="choices">${ranked.map((r, i) => `<label class="choice"><input type="radio" name="path" value="${esc(r.p.key)}" data-change="intake-path" ${I.pathKey === r.p.key ? 'checked' : ''}><span class="box"><b>${esc(r.p.title)}${i === 0 && r.score > ranked[ranked.length - 1].score ? ' <span class="pill sage">Best fit for your answers</span>' : ''}</b><small>${esc(r.p.why)}</small>${r.reasons.length ? `<small class="mt4">${r.reasons.map(x => `${x.delta > 0 ? '+' : '−'} ${esc(x.text)}`).join(' · ')}</small>` : ''}</span></label>`).join('')}
          <label class="choice"><input type="radio" name="path" value="" data-change="intake-path" ${I.pathKey === '' ? 'checked' : ''}><span class="box"><b>I’ll decide later</b><small>Create the case without a plan yet. The first step will be to compare options.</small></span></label></div>
      </section>

      ${cons.length ? `<section><div class="section-head"><h2 class="h3">What could be at stake</h2></div><p class="section-note">General guidance for this kind of situation — your case may differ. You can mark each as happened, avoided or not relevant later.</p>
        <ul class="bullets">${cons.map(c => `<li>${esc(c.text)} <span class="muted xs">— ${esc(REVERSIBILITY[c.rev || c.reversibility].toLowerCase())}${c.status === 'established' ? ', already happened' : ''}</span></li>`).join('')}</ul></section>` : ''}

      <details class="disclose"><summary>Add details now (optional)</summary>
        <div class="grid2 mt12">
          ${field('Who it’s with', `<input class="input" name="counterparty" value="${esc(I.counterparty || '')}" data-input="intake-field" data-k="counterparty" placeholder="e.g. your water utility">`)}
          ${field('Account or reference number', `<input class="input mono" name="reference" value="${esc(I.reference || '')}" data-input="intake-field" data-k="reference">`)}
          ${field('Where this applies', `<input class="input" name="jurisdiction" value="${esc(I.jurisdiction ?? S.settings.region)}" data-input="intake-field" data-k="jurisdiction" placeholder="e.g. Oregon, US">`, 'Rules often depend on location. Used to remind you what to verify — nothing is looked up.')}
          ${field('Your own target date', `<input class="input" type="date" name="target" value="${esc(I.target || '')}" data-input="intake-field" data-k="target">`, 'Optional. A date you choose — not a deadline.')}
        </div>
      </details>

      <div class="between"><button type="button" class="btn btn-ghost" data-act="intake-cancel">Cancel</button><button type="submit" class="btn btn-primary">Create case</button></div>
    </form>`;
};

/* ===== Cases ===== */
function caseBuckets() {
  const b = { open: [], waiting: [], parked: [], closed: [], all: [] };
  S.cases.forEach(c => {
    b.all.push(c);
    if (isClosed(c)) return b.closed.push(c);
    const st = Engine.caseStatus(c.id).key;
    if (st === 'parked') return b.parked.push(c);
    b.open.push(c);
    if (st === 'waiting' || st === 'blocked') b.waiting.push(c);
  });
  return b;
}
function relationChips(caseId) {
  return S.links.filter(l => l.from === caseId || l.to === caseId).map(l => {
    const other = l.from === caseId ? l.to : l.from;
    const lbl = l.from === caseId ? LINK_TYPES[l.type].fwd : LINK_TYPES[l.type].back;
    return `<span class="pill line">${ico('link', 'sm')}${esc(lbl)}: ${esc(truncate(caseTitle(other), 28))}</span>`;
  }).join('');
}
Views.cases = () => {
  const b = caseBuckets();
  const f = UIState.casesFilter in b ? UIState.casesFilter : 'open';
  const q = norm(UIState.casesQuery);
  let list = b[f];
  if (q) list = list.filter(c => norm([c.title, c.summary, c.counterparty, c.reference, pb(c.type).label].join(' ')).includes(q));
  const pri = {}; Engine.prioritized().forEach(p => { pri[p.caseId] = p; });
  list = [...list].sort((a, c2) => {
    if (isClosed(a) !== isClosed(c2)) return isClosed(a) ? 1 : -1;
    if (isClosed(a)) return (c2.resolution.closedAt || '').localeCompare(a.resolution.closedAt || '');
    return ((pri[c2.id] || {}).score || 0) - ((pri[a.id] || {}).score || 0);
  });
  const tabs = [['open', 'Open'], ['waiting', 'Waiting'], ['parked', 'Parked'], ['closed', 'Closed'], ['all', 'All']];
  const rows = list.map(c => {
    const p = pri[c.id];
    const next = p && p.step ? p.step.text : (isClosed(c) ? (c.resolution.note || '') : '');
    const nd = S.deadlines.filter(d => d.caseId === c.id && d.status === 'open' && d.date && daysUntil(d.date) >= 0).sort((x, y) => x.date.localeCompare(y.date))[0];
    return `<div class="item"><div class="item-main">
      <a class="item-title serif stretch" style="text-decoration:none" href="${href('case', c.id)}">${esc(c.title)}</a>
      ${next ? `<p class="item-sub clamp2">${isClosed(c) ? '' : '<span class="muted">Next:</span> '}${esc(next)}</p>` : ''}
      <div class="item-meta"><span class="tag">${esc(pb(c.type).short)}</span>${statusPill(c.id)}${nd ? `<span class="pill ${daysUntil(nd.date) <= 3 && nd.kind === 'external' ? 'amber' : 'line'}">${esc(nd.label)} · ${esc(fmtDate(nd.date))}</span>` : ''}${relationChips(c.id)}${c.sample ? '<span class="pill line">Example</span>' : ''}</div>
      ${p && !isClosed(c) && p.reasons.length ? whyList(p.reasons.filter(r => r.hot), 1) : ''}
    </div></div>`;
  }).join('');
  return `<div class="page-head split"><div><p class="eyebrow">Everything you’re handling</p><h1 class="h1">Cases</h1><p class="lede">Sorted by what matters most — real deadlines, consequences that are hard to undo, and what unblocks other cases.</p></div><div class="actions"><a class="btn btn-ink" href="#/new">${ico('plus', 'sm')}New case</a></div></div>
    <div class="between" style="margin-bottom:14px"><div class="seg" role="group" aria-label="Filter cases">${tabs.map(([k, l]) => `<label><input type="radio" name="cf" value="${k}" data-change="cases-filter" ${f === k ? 'checked' : ''}><span>${l} <span class="muted mono xs">${b[k].length}</span></span></label>`).join('')}</div></div>
    <label class="sr-only" for="cases-search">Search cases</label>
    <input id="cases-search" class="input" type="search" placeholder="Search titles, organizations, references…" value="${esc(UIState.casesQuery)}" data-input="cases-search" data-fk="cases-search" autocomplete="off" style="margin-bottom:14px">
    ${list.length ? `<div class="list">${rows}</div>` : empty(q ? 'No matching cases' : f === 'open' ? 'No open cases' : 'Nothing here', q ? 'Try a different word, or clear the search.' : f === 'open' ? 'When something slips, start a case and it will appear here.' : 'Cases move here as their status changes.', f === 'open' && !q ? '<a class="btn btn-primary" href="#/new">Start a case</a>' : '')}`;
};

/* ===== Waiting ===== */
Views.waiting = () => {
  const all = S.waits.filter(w => { const c = getCase(w.caseId); return c && !isClosed(c); });
  const kinds = UIState.waitingKind;
  const open = all.filter(w => ['waiting', 'escalated'].includes(w.status) && (kinds === 'all' || w.kind === kinds)).map(w => ({ w, st: Engine.waitState(w) }));
  const groups = [
    ['Promises missed', 'They said a date and it has passed. This is a good moment to escalate — calmly and in writing.', open.filter(x => x.st.key === 'missed')],
    ['Ready for a follow-up', 'The follow-up window is open, or the expected date has passed.', open.filter(x => ['follow', 'overdue'].includes(x.st.key))],
    ['On track', 'Nothing to do yet.', open.filter(x => ['on_track', 'escalated'].includes(x.st.key))],
  ];
  const recent = S.waits.filter(w => w.status === 'received' && w.receivedAt && daysUntil(w.receivedAt) >= -30);
  const parallel = Engine.prioritized().filter(p => p.actionable && p.step && p.step.kind === 'task').slice(0, 3);
  const counts = {}; all.filter(w => ['waiting', 'escalated'].includes(w.status)).forEach(w => { counts[w.kind] = (counts[w.kind] || 0) + 1; });
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return `<div class="page-head split"><div><p class="eyebrow">In someone else’s court</p><h1 class="h1">Waiting</h1><p class="lede">Replies, decisions, documents, actions and payments you’re owed — with the dates they promised and when it’s fair to follow up.</p></div><div class="actions"><button class="btn" data-act="wait-new">${ico('plus', 'sm')}Track something</button></div></div>
    <div class="seg" role="group" aria-label="Filter by kind" style="margin-bottom:18px"><label><input type="radio" name="wk" value="all" data-change="waiting-kind" ${kinds === 'all' ? 'checked' : ''}><span>All <span class="muted mono xs">${total}</span></span></label>${Object.entries(WAIT_KINDS).map(([k, v]) => `<label><input type="radio" name="wk" value="${k}" data-change="waiting-kind" ${kinds === k ? 'checked' : ''}><span>${v.label} <span class="muted mono xs">${counts[k] || 0}</span></span></label>`).join('')}</div>
    ${open.length ? groups.filter(g => g[2].length).map(([title, note, items]) => `<section class="section"><div class="section-head"><h2 class="h3">${title}</h2></div><p class="section-note">${note}</p><div class="list">${items.sort((a, b) => (a.w.expectedBy || a.w.followUpOn || '9').localeCompare(b.w.expectedBy || b.w.followUpOn || '9')).map(x => waitItem(x.w, x.st, true)).join('')}</div></section>`).join('')
      : empty('Nothing pending', 'When you’re waiting on a reply, refund or decision, track it here and you’ll be told when it’s fair to follow up.', '<button class="btn" data-act="wait-new">Track something</button>')}
    ${parallel.length && open.length ? `<section class="section"><div class="section-head"><h2 class="h3">While you wait</h2></div><p class="section-note">These don’t depend on anyone else.</p><div class="list">${parallel.map(p => `<div class="item"><button class="cb" role="checkbox" aria-checked="false" data-act="toggle-task" data-id="${esc(p.step.task.id)}" aria-label="Mark done: ${esc(p.step.task.text)}">${ICON.check}</button><div class="item-main"><p class="item-title">${esc(p.step.task.text)}</p><p class="item-sub">${caseLinkEl(p.caseId)}</p></div></div>`).join('')}</div></section>` : ''}
    ${recent.length ? `<details class="disclose"><summary>Received in the last 30 days (${recent.length})</summary><div class="list mt8">${recent.map(w => waitItem(w, Engine.waitState(w), true)).join('')}</div></details>` : ''}`;
};

function waitItem(w, st, showCase) {
  const last = w.log[w.log.length - 1];
  const basis = { promised: 'promised', policy: 'their stated timeframe', estimate: 'your estimate' }[w.basis];
  return `<div class="item"><div class="item-main">
    <div class="between" style="align-items:flex-start"><p class="item-title">${esc(w.what)}</p>${pill(st.label, st.tone)}</div>
    <p class="item-sub">${esc(WAIT_KINDS[w.kind].label)} from ${esc(w.from || 'them')}${showCase ? ` · ${caseLinkEl(w.caseId)}` : ''}</p>
    <div class="item-meta"><span>Since ${esc(fmtDate(w.since))}</span>${w.expectedBy ? `<span>Expected ${esc(fmtDate(w.expectedBy))} (${basis})</span>` : ''}${w.followUpOn && w.status !== 'received' ? `<span>Follow up ${esc(fmtDate(w.followUpOn))}</span>` : ''}${w.reference ? `<span class="mono">Ref ${esc(w.reference)}</span>` : ''}</div>
    ${last ? `<p class="xs muted mt4">Latest: ${esc(truncate(last.note, 140))}</p>` : ''}
    ${st.key === 'missed' || st.key === 'overdue' ? `<p class="xs mt8 ink2"><b>Escalation option:</b> ${esc(ESCALATE_HINTS[w.kind])}</p>` : ''}
    ${['waiting', 'escalated'].includes(w.status) ? `<div class="cluster mt12">
      <button class="btn btn-sm ${['missed', 'follow', 'overdue'].includes(st.key) ? 'btn-ink' : ''}" data-act="compose" data-case="${esc(w.caseId)}" data-purpose="${st.key === 'missed' ? 'escalate' : 'follow_up'}" data-wait="${esc(w.id)}">${st.key === 'missed' ? 'Draft an escalation' : 'Draft a follow-up'}</button>
      <button class="btn btn-sm btn-sage" data-act="wait-receive" data-id="${esc(w.id)}">Received</button>
      <button class="btn btn-sm btn-ghost" data-act="wait-log" data-id="${esc(w.id)}">Log an update</button>
      <button class="icon-btn" data-act="wait-edit" data-id="${esc(w.id)}" aria-label="Edit">${ICON.edit}</button>
    </div>` : w.outcome ? `<p class="xs ink2 mt4">Outcome: ${esc(w.outcome)}</p>` : ''}
  </div></div>`;
}

/* ===== Dates ===== */
Views.dates = () => {
  const items = Engine.agenda();
  const t = today();
  const attention = items.filter(i => i.date < t && !(i.kind === 'deadline' && i.passed && S.deadlines.some(d => d.id === i.id && d.status === 'missed')) && !['obligation', 'parked', 'target'].includes(i.kind));
  const todayItems = items.filter(i => i.date === t);
  const week = items.filter(i => { const n = daysUntil(i.date); return n >= 1 && n <= 7; });
  const later = items.filter(i => daysUntil(i.date) > 7);
  const passedKnown = items.filter(i => i.kind === 'deadline' && S.deadlines.some(d => d.id === i.id && d.status === 'missed'));
  const group = (title, note, arr) => arr.length ? `<section class="section"><div class="section-head"><h2 class="h3">${title}</h2></div>${note ? `<p class="section-note">${note}</p>` : ''}<div class="list plain">${arr.map(agendaRow).join('')}</div></section>` : '';
  return `<div class="page-head split"><div><p class="eyebrow">Ahead of you</p><h1 class="h1">Dates</h1><p class="lede">Deadlines, promised dates, follow-ups and your own targets in one place — each labelled with how sure it is.</p></div><div class="actions"><button class="btn" data-act="ics-upcoming">${ico('download', 'sm')}Add to calendar (.ics)</button></div></div>
    ${!items.length ? empty('No dates yet', 'Deadlines, follow-ups and promises from your cases will appear here.') : ''}
    ${group('Needs a decision', 'These dates have passed without being marked as met. Decide whether to act, set a new date, or mark it as no longer applying.', attention)}
    ${group('Today', '', todayItems)}${group('Next 7 days', '', week)}${group('Later', '', later)}
    ${passedKnown.length ? `<details class="disclose"><summary>Original dates that have already passed (${passedKnown.length})</summary><p class="section-note mt8">These are usually why the case exists. They’re kept for the record; the plan works from here.</p><div class="list plain">${passedKnown.map(agendaRow).join('')}</div></details>` : ''}`;
};

/* ===== Evidence ===== */
const ThumbCache = new Map();
function hydrateThumbs() {
  document.querySelectorAll('[data-thumb]').forEach(async el => {
    const id = el.dataset.thumb;
    try {
      let url = ThumbCache.get(id);
      if (!url) { const rec = await IDB.getBlob(id); if (!rec || !rec.blob) { el.title = 'File not found on this device'; return; } url = URL.createObjectURL(rec.blob); ThumbCache.set(id, url); }
      el.innerHTML = `<img class="thumb" src="${url}" alt="">`;
    } catch (e) { /* leave icon */ }
  });
}
function evidenceItem(e, showCase = true) {
  const isImg = e.file && /^image\//.test(e.file.mime);
  const links = e.links.length;
  return `<div class="item">
    <div class="item-lead" ${isImg ? `data-thumb="${esc(e.file.blobId)}"` : ''}><span class="thumb">${ico(e.file ? 'file' : 'clip')}</span></div>
    <div class="item-main"><p class="item-title">${esc(e.title)}</p>
      <div class="item-meta">${pill(EVIDENCE_TYPES[e.type])}${e.date ? `<span>${esc(fmtDate(e.date))}</span>` : ''}${e.reference ? `<button class="pill line mono" data-act="copy" data-text="${esc(e.reference)}" title="Copy reference">${esc(e.reference)} ${ICON.copy}</button>` : ''}${showCase ? (e.caseId ? `<span>${caseLinkEl(e.caseId)}</span>` : '<span class="muted">Not filed to a case</span>') : ''}${links ? `<span>${ico('link', 'sm')} supports ${plural(links, 'item')}</span>` : ''}</div>
      ${e.note ? `<p class="xs ink2 mt4 clamp2">${esc(e.note)}</p>` : ''}
      ${e.location ? `<p class="xs muted mt4">Kept at: ${esc(e.location)}</p>` : ''}
      ${e.file ? `<p class="xs muted mt4">${esc(e.file.name)} · ${esc(fmtBytes(e.file.size))}${e.file.sha256 ? ` · <span class="mono" title="SHA-256 fingerprint: lets you show the file hasn’t changed since you added it">fp ${esc(e.file.sha256.slice(0, 10))}</span>` : ''}</p>` : ''}
    </div>
    <div class="item-actions">${e.file ? `<button class="icon-btn" data-act="ev-open" data-id="${esc(e.id)}" aria-label="Open file">${ICON.download}</button>` : ''}<button class="icon-btn" data-act="ev-edit" data-id="${esc(e.id)}" aria-label="Edit">${ICON.edit}</button><button class="icon-btn danger" data-act="ev-delete" data-id="${esc(e.id)}" aria-label="Delete">${ICON.trash}</button></div>
  </div>`;
}
Views.evidence = () => {
  const q = norm(UIState.evidenceQuery); const tf = UIState.evidenceType;
  let list = S.evidence.filter(e => (tf === 'all' || e.type === tf) && (!q || norm([e.title, e.reference, e.note, e.location, e.file && e.file.name, e.caseId && caseTitle(e.caseId)].join(' ')).includes(q)));
  list = [...list].sort((a, b) => (b.date || b.createdAt.slice(0, 10)).localeCompare(a.date || a.createdAt.slice(0, 10)));
  UI.after.push(hydrateThumbs);
  return `<div class="page-head split"><div><p class="eyebrow">Proof, kept safely</p><h1 class="h1">Evidence</h1><p class="lede">Receipts, letters, screenshots, reference numbers and call records — attached to the moments they prove. Files stay on this device.</p></div><div class="actions"><button class="btn btn-ink" data-act="ev-new">${ico('plus', 'sm')}Add evidence</button></div></div>
    <div class="grid2" style="margin-bottom:14px">
      <div><label class="sr-only" for="ev-search">Search evidence</label><input id="ev-search" class="input" type="search" placeholder="Search titles, references, notes…" value="${esc(UIState.evidenceQuery)}" data-input="evidence-search" data-fk="evidence-search"></div>
      <div><label class="sr-only" for="ev-type">Type</label><select id="ev-type" class="select" data-change="evidence-type">${[['all', 'All types'], ...Object.entries(EVIDENCE_TYPES)].map(([k, l]) => `<option value="${k}" ${tf === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>
    </div>
    ${list.length ? `<div class="list">${list.map(e => evidenceItem(e)).join('')}</div>` : empty(q || tf !== 'all' ? 'No matching evidence' : 'No evidence yet', 'Add a confirmation number, a photo of a letter, a receipt or a screenshot. Linking it to what it proves makes closing a case trustworthy.', '<button class="btn" data-act="ev-new">Add evidence</button>')}`;
};

/* ===== Insights ===== */
Views.insights = () => {
  const ins = Engine.insights();
  const enough = S.cases.length >= 2;
  return `<div class="page-head"><p class="eyebrow">Looking back, gently</p><h1 class="h1">Insights</h1><p class="lede">Patterns from your own cases, and optional ways to make the next time easier. Prevention is a bonus — never the point.</p></div>
    ${!enough ? empty('Not enough history yet', 'Insights appear once you’ve worked through a few cases. Nothing here is ever a judgement.') : ins.length ? `<div class="stack">${ins.map(i => `<article class="card flat">
      <div class="between" style="align-items:flex-start"><p class="h3">${esc(i.title)}</p><button class="btn btn-xs btn-ghost" data-act="insight-dismiss" data-id="${esc(i.id)}">Not useful</button></div>
      <p class="small ink2 mt4">${esc(i.text)}</p>
      ${i.suggestions && i.suggestions.length ? `<ul class="checklist mt8">${i.suggestions.map(sg => `<li><span class="grow small">${esc(sg)}</span><button class="btn btn-xs" data-act="obligation-new" data-title="${esc(sg)}" data-type="${esc(i.type || '')}">Make it a reminder</button></li>`).join('')}</ul>` : ''}
    </article>`).join('')}</div>` : empty('No patterns right now', 'Nothing stands out — or you’ve dismissed what did. That’s fine.')}
    <section class="section"><div class="section-head"><h2 class="h2">Recurring obligations</h2><button class="btn btn-sm" data-act="obligation-new">${ico('plus', 'sm')}Add</button></div>
      <p class="section-note">Things that come round again — renewals, annual filings, monthly bills. Download them as a calendar file to get reminders in the calendar you already use. Nothing is sent anywhere.</p>
      ${S.obligations.length ? `<div class="list">${[...S.obligations].sort((a, b) => a.next.localeCompare(b.next)).map(o => `<div class="item"><div class="item-main"><p class="item-title">${esc(o.title)}</p><div class="item-meta"><span>${esc(CADENCES[o.cadence])}</span><span>Next: ${esc(dateAndRel(o.next))}</span><span>Reminder ${o.remindDays} day${o.remindDays === 1 ? '' : 's'} before</span></div></div><div class="item-actions"><button class="icon-btn" data-act="obligation-ics" data-id="${esc(o.id)}" aria-label="Download calendar file">${ICON.download}</button><button class="icon-btn" data-act="obligation-edit" data-id="${esc(o.id)}" aria-label="Edit">${ICON.edit}</button><button class="icon-btn danger" data-act="obligation-delete" data-id="${esc(o.id)}" aria-label="Delete">${ICON.trash}</button></div></div>`).join('')}</div>
        <div class="cluster mt12"><button class="btn btn-sm" data-act="obligation-ics-all">${ico('download', 'sm')}Download all (.ics)</button></div>` : empty('None yet', 'When you close a case, you’ll be offered a reminder for next time — or add one here.')}
    </section>`;
};

/* ===== Focus session ===== */
Views.focus = route => {
  const F = UIState.focus;
  const min = Number(route.query.get('min')) || S.settings.focusMinutes || 15;
  if (!F || F.minutes !== min && F.idx === 0 && !F.done.length) {
    const q = Engine.focusQueue(min);
    UIState.focus = { minutes: min, queue: q.queue.map(x => x.task.id), idx: 0, done: [], skipped: [], startedAt: nowStamp() };
  }
  const f = UIState.focus;
  const ids = f.queue.filter(id => findRec('tasks', id));
  if (!ids.length) return `<div class="focus-wrap"><div class="page-head"><p class="eyebrow">Focus session</p><h1 class="h1">Nothing to do right now.</h1><p class="lede">Every open step is waiting on something or someone. That’s a fine place to be.</p></div><div class="cluster"><a class="btn" href="#/waiting">See what you’re waiting on</a><a class="btn btn-ghost" href="#/today">Back to Today</a></div></div>`;
  if (f.idx >= ids.length) {
    const next = Engine.prioritized().find(p => p.actionable && p.step && p.step.kind === 'task');
    return `<div class="focus-wrap"><div class="page-head"><p class="eyebrow">Session finished</p><h1 class="h1">${f.done.length ? `${plural(f.done.length, 'step')} done.` : 'That’s the session.'}</h1><p class="lede">${f.done.length ? 'Each of those is recorded in its case timeline.' : 'Nothing was marked done — and that’s okay. Looking at it is a step too.'}</p></div>
      ${f.done.length ? `<ul class="checklist">${f.done.map(id => { const t = findRec('tasks', id); return t ? `<li>${ico('check', 'sm')}<span class="grow">${esc(t.text)} <span class="muted xs">· ${esc(caseTitle(t.caseId))}</span></span></li>` : ''; }).join('')}</ul>` : ''}
      ${next ? `<p class="small ink2 mt16">Next time, start with: <b>${esc(next.step.text)}</b></p>` : ''}
      <div class="cluster mt24"><a class="btn btn-ink" href="#/today">Back to Today</a><button class="btn" data-act="focus-again">Another round</button></div></div>`;
  }
  const t = findRec('tasks', ids[f.idx]); const c = getCase(t.caseId);
  const p = Engine.priority(c.id);
  const blockers = Engine.taskBlockers(t);
  return `<div class="focus-wrap">
    <div class="between" style="margin-bottom:14px"><p class="eyebrow">Focus · ${f.idx + 1} of ${ids.length}</p><button class="btn btn-sm btn-ghost" data-act="focus-end">End session</button></div>
    <div class="meter" aria-hidden="true"><i style="width:${Math.round((f.idx / ids.length) * 100)}%"></i></div>
    <div class="focus-card mt16">
      <p class="small ink2">${caseLinkEl(c.id)}${t.effort ? ` · about ${t.effort} min` : ''}</p>
      <h1 class="focus-task">${esc(t.text)}</h1>
      ${t.note ? `<p class="small ink2 mt8">${esc(t.note)}</p>` : ''}
      ${blockers.length ? `<p class="banner warn mt12">${esc(blockers[0].text)}</p>` : ''}
      ${p ? whyList(p.reasons, 2) : ''}
      <div class="cluster mt24"><button class="btn btn-sage" data-act="focus-done" data-id="${esc(t.id)}">${ico('check', 'sm')}Done</button><button class="btn" data-act="focus-skip">Skip for now</button><button class="btn btn-ghost" data-act="focus-blocked" data-id="${esc(t.id)}">Can’t do this yet</button></div>
    </div>
    <p class="xs muted mt16">Skipping is fine. Nothing here is graded.</p></div>`;
};

/* ===== Data & privacy ===== */
Views.data = () => {
  const lsBytes = LocalStore.bytes(APP.lsKey);
  const files = S.evidence.filter(e => e.file);
  const fileBytes = files.reduce((a, e) => a + (e.file.size || 0), 0);
  UI.after.push(hydrateDataPage);
  const last = S.meta.lastExportAt;
  return `<div class="page-head"><p class="eyebrow">Your data, your device</p><h1 class="h1">Data & privacy</h1><p class="lede">What’s stored, where it lives, and how to back it up, move it or delete it.</p></div>

  <section class="section"><div class="section-head"><h2 class="h2">What stays private</h2></div>
    <div class="grid2">
      <div class="inset"><p class="strong small">Stays on this device</p><ul class="bullets"><li>All cases, notes, drafts and dates — in this browser’s local storage.</li><li>Attached files — in this browser’s IndexedDB.</li><li>Safety snapshots and the trash.</li></ul></div>
      <div class="inset"><p class="strong small">Leaves the device only when you choose</p><ul class="bullets"><li>Backups you export (a file you control).</li><li>“Open in email app” hands a draft to your own mail app — nothing is sent until you press send there.</li><li>Calendar files (.ics) you download and import yourself.</li></ul></div>
    </div>
    <div class="inset mt12"><p class="strong small">The only network request</p><p class="small ink2 mt4">The typefaces are loaded from Google Fonts, which means your browser contacts Google when the app opens (no case data is included). You can switch to your device’s own fonts instead.</p>
      <label class="check mt8"><input type="checkbox" data-change="system-fonts" ${Prefs.get('systemFonts', false) ? 'checked' : ''}><span class="small">Use system fonts only — no font requests</span></label></div>
    <p class="small ink2 mt12">There’s no account, no analytics, and no AI service. Suggestions come from playbooks built into this page and run on your device. They’re general guidance and may not match your provider or location — the app keeps what you’ve confirmed separate from that guidance.</p>
  </section>

  <section class="section"><div class="section-head"><h2 class="h2">Back up & restore</h2></div>
    <p class="section-note">Browser storage can be cleared by the browser, a cleanup tool or a reinstall. A backup file is the reliable copy.${last ? ` Last export: ${esc(fmtStamp(last))}.` : ' You haven’t exported a backup yet.'}</p>
    <div class="cluster"><button class="btn btn-ink" data-act="export">${ico('download', 'sm')}Export backup</button>
      <label class="btn">${ico('upload', 'sm')}Import backup<input type="file" accept=".json,application/json" class="sr-only" data-change="import-file"></label></div>
    <div class="cluster mt8"><button class="btn btn-sm btn-ghost" data-act="export-copy">${ico('copy', 'sm')}Copy backup text</button><button class="btn btn-sm btn-ghost" data-act="import-paste">Paste a backup</button><span class="xs muted">For browsers or viewers that block file downloads.</span></div>
    <label class="check mt12"><input type="checkbox" id="export-files" ${files.length ? 'checked' : ''} ${files.length ? '' : 'disabled'}><span class="small">Include attached files in the backup (${plural(files.length, 'file')}, ${esc(fmtBytes(fileBytes))})</span></label>
    <p class="xs muted mt8">Importing replaces what’s here. A safety snapshot is taken first, so it can be undone.</p>
  </section>

  <section class="section"><div class="section-head"><h2 class="h2">Storage</h2></div>
    <dl class="kv"><dt>Case data</dt><dd>${esc(fmtBytes(lsBytes))} · ${plural(S.cases.length, 'case')}</dd><dt>Attached files</dt><dd>${plural(files.length, 'file')} · ${esc(fmtBytes(fileBytes))}</dd><dt>File store</dt><dd id="idb-status">Checking…</dd><dt>Browser quota</dt><dd id="quota-status">Checking…</dd><dt>Format</dt><dd>Schema version ${APP.schema}${S.meta.migratedFrom ? ' (upgraded from version 1)' : ''}</dd></dl>
    <div class="cluster mt12" id="persist-row"></div>
  </section>

  <section class="section"><div class="section-head"><h2 class="h2">Safety snapshots</h2><button class="btn btn-sm" data-act="snapshot-now">Take one now</button></div>
    <p class="section-note">Taken automatically before anything that replaces data (upgrades, imports, clearing, loading examples) and once a day. The newest ${APP.maxSnapshots} are kept.</p>
    <div id="snapshots" class="list"><div class="item"><p class="small muted">Loading…</p></div></div>
  </section>

  <section class="section"><div class="section-head"><h2 class="h2">Trash</h2>${S.trash.length ? '<button class="btn btn-sm btn-ghost btn-danger" data-act="trash-empty">Empty trash</button>' : ''}</div>
    <p class="section-note">Deleted cases, steps, evidence and messages go here first — with their links — so they can be restored exactly.</p>
    ${S.trash.length ? `<div class="list">${S.trash.map(t => { const n = Object.values(t.items).reduce((a, v) => a + T.arr(v).length, 0); return `<div class="item"><div class="item-main"><p class="item-title">${esc(t.label)}</p><p class="item-meta"><span>${esc(fmtStamp(t.at))}</span><span>${plural(n, 'record')}</span></p></div><div class="item-actions"><button class="btn btn-sm" data-act="trash-restore" data-id="${esc(t.id)}">Restore</button><button class="icon-btn danger" data-act="trash-purge" data-id="${esc(t.id)}" aria-label="Delete permanently">${ICON.trash}</button></div></div>`; }).join('')}</div>` : '<p class="small muted">The trash is empty.</p>'}
  </section>

  <section class="section"><div class="section-head"><h2 class="h2">Preferences</h2></div>
    <form data-form="settings" class="grid2">
      ${field('Where you usually are', `<input class="input" name="region" value="${esc(S.settings.region)}" placeholder="e.g. Ontario, Canada">`, 'Pre-fills “where this applies” on new cases, so you know which rules to verify.')}
      ${field('Default focus session', selectEl('focusMinutes', [[5, '5 minutes'], [15, '15 minutes'], [30, '30 minutes'], [60, '60 minutes']], S.settings.focusMinutes))}
      <div><button class="btn" type="submit">Save preferences</button></div>
    </form>
  </section>

  <section class="section"><div class="section-head"><h2 class="h2">Examples</h2></div>
    <p class="section-note">Realistic example cases show every part of the app. They’re marked “Example” and can be removed without touching your own cases.</p>
    <div class="cluster">${S.cases.some(c => c.sample) ? '<button class="btn" data-act="remove-samples">Remove examples</button>' : '<button class="btn" data-act="load-samples">Add example cases</button>'}</div>
  </section>

  <section class="section"><div class="section-head"><h2 class="h2">Delete everything</h2></div>
    <p class="section-note">Removes all cases and attached files from this browser. A snapshot of the case data is kept (files aren’t). Export a backup first if you might want anything back.</p>
    <button class="btn btn-danger" data-act="clear-all">Delete all data…</button>
  </section>`;
};

async function hydrateDataPage() {
  const idbEl = document.getElementById('idb-status');
  const ok = await IDB.probe();
  if (idbEl) idbEl.textContent = ok ? 'Available' : 'Unavailable in this browser — files can’t be attached; snapshots last only until the tab closes.';
  const qEl = document.getElementById('quota-status');
  try {
    if (navigator.storage && navigator.storage.estimate) { const e = await navigator.storage.estimate(); if (qEl) qEl.textContent = `${fmtBytes(e.usage || 0)} used of about ${fmtBytes(e.quota || 0)}`; }
    else if (qEl) qEl.textContent = 'Not reported by this browser';
  } catch (e) { if (qEl) qEl.textContent = 'Not reported by this browser'; }
  const pr = document.getElementById('persist-row');
  try {
    if (pr && navigator.storage && navigator.storage.persisted) {
      const p = await navigator.storage.persisted();
      pr.innerHTML = p ? `${pill('Protected from automatic cleanup', 'sage')}` : `<button class="btn btn-sm" data-act="persist">Ask the browser to keep this data</button><span class="xs muted">Reduces the chance of the browser clearing it when space runs low.</span>`;
    }
  } catch (e) { /* ignore */ }
  const host = document.getElementById('snapshots');
  if (!host) return;
  const snaps = await Snapshots.list();
  host.innerHTML = snaps.length ? snaps.map(s => `<div class="item"><div class="item-main"><p class="item-title">${esc(s.reason)}</p><p class="item-meta"><span>${esc(fmtStamp(s.at))}</span><span>${esc(fmtBytes(s.size * 2))}</span></p></div><div class="item-actions"><button class="btn btn-sm" data-act="snapshot-restore" data-id="${esc(s.id)}">Restore</button><button class="icon-btn" data-act="snapshot-download" data-id="${esc(s.id)}" aria-label="Download">${ICON.download}</button><button class="icon-btn danger" data-act="snapshot-delete" data-id="${esc(s.id)}" aria-label="Delete">${ICON.trash}</button></div></div>`).join('') : '<div class="item"><p class="small muted">No snapshots yet.</p></div>';
}
