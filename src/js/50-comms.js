/* ---------------- Communication drafting ----------------
   Drafts are assembled from the case: its reference, confirmed facts, earlier
   contacts and promises. Unknowns stay as visible [placeholders] — never
   invented. The person reviews and sends everything themselves. */

const REF_NOUN = { payment: 'my account', appointment: 'my appointment', renewal: 'my renewal', return: 'my order', application: 'my application', notice: 'your notice', penalty: 'citation', billing: 'a charge on my account', owed: 'my claim', general: 'this matter' };
const REF_KIND = { payment: 'account number', appointment: '', renewal: 'reference or PIN', return: 'order number', application: 'application number', notice: 'reference', penalty: 'citation number', billing: 'account number', owed: 'reference number', general: 'reference' };

const Comms = {
  pathDef(caseId, pathId) {
    const c = getCase(caseId); const p = S.paths.find(x => x.id === pathId);
    return c && p ? pb(c.type).paths.find(x => x.key === p.key) || null : null;
  },

  defaults(caseId, { pathId = '', purpose = '', waitId = '', channel = '' } = {}) {
    const c = getCase(caseId);
    const chosen = pathId || (S.paths.find(p => p.caseId === caseId && p.status === 'chosen') || {}).id || '';
    const def = this.pathDef(caseId, chosen);
    const pc = (def && def.comm) || {};
    const o = {
      channel: channel || 'email', purpose: purpose || pc.purpose || (c.type === 'owed' ? 'follow_up' : 'request'),
      stance: pc.stance || (c.type === 'owed' ? 'neutral' : 'acknowledge'), tone: 'warm', proposal: pc.proposal || '', replyBy: '',
      pathId: chosen, includeFacts: true, waitId,
    };
    if (purpose === 'follow_up' || purpose === 'escalate') { o.stance = 'neutral'; o.tone = purpose === 'escalate' ? 'firm' : 'neutral'; }
    if (o.purpose === 'dispute' || o.purpose === 'complaint') o.stance = o.stance === 'neutral' ? 'neutral' : 'dispute';
    return o;
  },

  refPhrase(c) {
    const kind = REF_KIND[c.type];
    return REF_NOUN[c.type] + (kind ? ` (${c.reference || '[' + kind + ']'})` : '');
  },

  priorContact(caseId) {
    const prior = S.comms.filter(m => m.caseId === caseId && m.direction === 'out' && ['sent', 'done'].includes(m.status) && m.date).sort((a, b) => a.date.localeCompare(b.date));
    const promises = S.commitments.filter(m => m.caseId === caseId && m.party === 'them' && ['pending', 'missed'].includes(m.status));
    let line = '';
    if (prior.length) line = `I contacted you on ${listJoin(prior.slice(-3).map(m => `${fmtDate(m.date, { year: true })} (${CHANNELS[m.channel].toLowerCase()}${m.reference ? ', ref ' + m.reference : ''})`))}`;
    if (promises.length) {
      const p = promises[promises.length - 1];
      line += `${line ? '. ' : ''}I was told you would ${p.text.replace(/\.$/, '').replace(/^(you will|you'll|they will|they'll|will)\s+/i, '')}${p.due ? ` by ${fmtDate(p.due, { year: true })}` : ''}`;
      if (p.due && daysUntil(p.due) < 0) line += ', but I haven’t received this yet';
    }
    return { prior, promises, line };
  },

  compose(caseId, o) {
    const c = getCase(caseId);
    const P = pb(c.type); const pc = P.comm;
    const def = this.pathDef(caseId, o.pathId);
    const dc = (def && def.comm) || {};
    const name = '[Your name]';
    const org = c.counterparty || '';
    const kind = REF_KIND[c.type];
    const topic = pc.topic.replace('[reference]', c.reference || '[reference]').replace('[order number]', c.reference || '[order number]').replace('[citation number]', c.reference || '[citation number]');
    const refShort = c.reference ? `${kind ? kind.split(' ')[0] + ' ' : ''}${c.reference}` : truncate(c.title, 50);
    const subj = { request: `Request regarding ${refShort}`, arrangement: `Payment arrangement — ${refShort}`, reschedule: 'Rebooking my appointment', inquiry: `Question about ${refShort}`, update: `Update — ${refShort}`, follow_up: `Follow-up — ${refShort}`, negotiate: `Proposal — ${refShort}`, dispute: `Dispute — ${refShort}`, complaint: `Formal complaint — ${refShort}`, escalate: `Escalation request — ${refShort}` }[o.purpose];
    const prior = this.priorContact(caseId);
    const issue = pc.issue;
    const claim = dc.disputeLine || pc.disputeLine;
    const stanceLine = {
      neutral: '',
      acknowledge: `I’m aware that ${issue}.`,
      apologize: `I’m sorry that ${issue}.`,
      accept: `${cap(issue)}. That was my oversight, and I take responsibility for it.`,
      dispute: `I believe ${claim}${o.reason ? `, because ${o.reason}` : ''}.`,
      negotiate: `I’d like to find a way to resolve ${topic} that works for both of us.`,
    }[o.stance];
    const ask = dc.ask || '[what you are asking for]';
    const proposal = o.proposal || dc.proposal || '';
    const askLine = {
      request: `Would you be able to ${ask}?`,
      arrangement: `Would it be possible to set up a payment arrangement? ${proposal ? `I could pay ${proposal}.` : 'I’d like to agree an amount and schedule I can reliably keep — for example [amount] every [week or month].'}`,
      reschedule: `I’d like to book a new appointment. ${proposal ? `Times that work well for me: ${proposal}.` : 'I’m generally available [days and times].'}`,
      inquiry: `Could you tell me ${pc.inquiry}?`,
      update: `I wanted to let you know that ${proposal || '[what you have done, or will do and when]'}. Please let me know if you need anything else from me.`,
      follow_up: `${prior.line ? prior.line + '.' : 'I’m following up on my earlier contact about this.'} Could you let me know where things stand, and confirm the date I can expect it to be completed?`,
      negotiate: `I’d like to propose ${proposal || '[your proposal]'}. Would that work for you?`,
      dispute: `Please review this and correct it${o.tone === 'warm' ? ' if you agree' : ''}. I’d be grateful for written confirmation of the outcome.`,
      complaint: `I’d like to make a formal complaint about ${topic}. ${prior.line ? prior.line + '. ' : ''}Please confirm you’ve received this, and let me know your complaints process and when I can expect a response.`,
      escalate: `${prior.line ? prior.line + '. ' : 'I’ve raised this before. '}As it hasn’t been resolved, I’d like to escalate it — could you pass this to a supervisor or your complaints team?`,
    }[o.purpose];
    const facts = o.includeFacts ? S.facts.filter(f => f.caseId === caseId && f.kind === 'confirmed' && f.text).slice(0, 6) : [];
    const factsBlock = facts.length ? `For reference:\n${facts.map(f => '• ' + f.text).join('\n')}` : '';
    const close = { warm: 'Thank you so much for your help — I really appreciate it.', neutral: 'Thank you for your help.', firm: `Please reply by ${o.replyBy ? fmtDate(o.replyBy, { year: true }) : '[date]'}.` }[o.tone];
    let body;
    if (o.channel === 'call') {
      body = [
        `Hi, my name is ${name}, and I’m calling about ${this.refPhrase(c)}.`,
        stanceLine, askLine,
        factsBlock ? `(If asked — ${facts.map(f => f.text).join('; ')}.)` : '',
        o.tone === 'firm' ? 'I’d like to get this resolved today if possible.' : close,
        '— Before you hang up: ask for their name, a reference number for this call, and what happens next and by when.',
      ].filter(Boolean).join('\n\n');
    } else {
      const greet = o.tone === 'firm' ? `Dear ${org || 'Sir or Madam'},` : `Hello${org ? ' ' + org + ' team' : ''},`;
      const signoff = o.tone === 'firm' ? (o.channel === 'letter' ? 'Yours sincerely,' : 'Regards,') : (o.tone === 'warm' ? 'Many thanks,' : 'Kind regards,');
      const core = [greet, `I’m writing about ${this.refPhrase(c)}.`, stanceLine, askLine, factsBlock, o.tone === 'firm' ? `${close} Thank you.` : close, `${signoff}\n${name}`].filter(Boolean).join('\n\n');
      body = o.channel === 'letter' ? `${name}\n[Your address]\n\n${fmtDate(today(), { year: true })}\n\n${org || '[Organization]'}\n[Their address]\n\nRe: ${subj}\n\n${core}` : core;
    }
    return { subject: o.channel === 'call' ? `Call — ${subj}` : subj, body: body.replace(/\n{3,}/g, '\n\n') };
  },

  preflight(caseId, text, o) {
    const out = [];
    const ph = [...new Set((text.match(/\[[^\]\n]{1,60}\]/g) || []))];
    if (ph.length) out.push({ level: 'warn', text: `${plural(ph.length, 'placeholder')} to fill before sending: ${ph.slice(0, 5).join(', ')}${ph.length > 5 ? '…' : ''}` });
    const chosen = S.paths.find(p => p.caseId === caseId && p.status === 'chosen');
    const disputing = o.purpose === 'dispute' || o.purpose === 'complaint' || (chosen && ['dispute', 'appeal'].includes(chosen.approach));
    if (disputing && ['apologize', 'accept'].includes(o.stance)) out.push({ level: 'warn', text: 'You’re disputing this. Apologising or taking responsibility in the same message can undermine your position.' });
    if (o.stance === 'dispute' && ['request', 'arrangement'].includes(o.purpose)) out.push({ level: 'info', text: 'Disputing the charge while asking for a courtesy can send mixed signals. Consider keeping them in separate messages.' });
    if (o.stance === 'accept') out.push({ level: 'info', text: 'Taking responsibility is a meaningful statement, and a written one can be quoted later. Make sure it’s what you intend.' });
    const confirmedText = S.facts.filter(f => f.caseId === caseId && f.kind === 'confirmed').map(f => f.text).join(' ');
    const amounts = [...new Set(text.match(/[$£€]\s?\d[\d,]*(\.\d{1,2})?/g) || [])].filter(a => !confirmedText.includes(a.replace(/\s/g, '')));
    if (amounts.length) out.push({ level: 'warn', text: `Mentions ${listJoin(amounts)}, which you haven’t marked as confirmed. Check it against a statement before sending.` });
    const unverified = S.facts.filter(f => f.caseId === caseId && ['unverified', 'assumption'].includes(f.kind) && f.text && text.includes(f.text));
    if (unverified.length) out.push({ level: 'warn', text: `Includes ${plural(unverified.length, 'detail')} you haven’t confirmed yet.` });
    const missing = S.facts.filter(f => f.caseId === caseId && f.kind === 'missing');
    if (missing.length) out.push({ level: 'info', text: `${plural(missing.length, 'detail')} still unknown (e.g. “${truncate(missing[0].text, 60)}”). You may be asked — or you can ask them.` });
    if (o.purpose === 'follow_up' && !this.priorContact(caseId).prior.length) out.push({ level: 'info', text: 'No earlier contact is logged for this case, so the draft refers to “my earlier contact”. Adjust if needed.' });
    return out;
  },

  callPlan(caseId, o) {
    const c = getCase(caseId);
    const kind = REF_KIND[c.type];
    const checklist = [];
    if (kind) checklist.push(c.reference ? `Your ${kind}: ${c.reference}` : `Your ${kind}`);
    S.docs.filter(d => d.caseId === caseId && d.status !== 'sent').slice(0, 4).forEach(d => checklist.push(d.name));
    checklist.push('Somewhere to take notes (the call notes here work)');
    if (['reschedule', 'arrangement', 'negotiate'].includes(o.purpose)) checklist.push('Your calendar and what you can commit to');
    const questions = S.facts.filter(f => f.caseId === caseId && f.kind === 'missing').slice(0, 4).map(f => `Can you confirm: ${f.text.charAt(0).toLowerCase() + f.text.slice(1)}?`);
    const extra = {
      request: 'If that isn’t possible, is there anything else you can do?',
      arrangement: 'Will fees or interest continue during the arrangement?',
      dispute: 'How long will the review take, and is collection paused meanwhile?',
      follow_up: 'What exactly is causing the delay?',
      escalate: 'Who will own this now, and when will I hear back?',
      reschedule: 'Can you send a reminder before the new appointment?',
    }[o.purpose];
    if (extra) questions.push(extra);
    questions.push('What happens next, and by when?', 'Can I have a reference number for this call?', 'Could you confirm that in writing?');
    return { checklist, questions };
  },
};
