# AFTER THE FACT — audit and v2 architecture

## 1. Audit of the original (v1) app

Each finding below was reproduced against the original file in a headless browser set to America/Los_Angeles at 22:22 local time. The script is `test/audit-original.mjs`.

| # | Area | Finding | Evidence |
|---|------|---------|----------|
| 1 | Dates and timezones | `todayISO()` and `daysOffset()` used `toISOString()` (UTC). Display and comparison code parsed dates as local. West of UTC in the evening, "today" was tomorrow, so new targets, completion dates and "in N days" labels were off by one. | At 22:22 Nov 23 (LA), the app reported today as `2026-11-24`. |
| 2 | Security | User and imported values were interpolated into inline `onclick="…('${…}')"` handlers. `esc()` turns `'` into `&#39;`, which the HTML parser decodes back before the JS runs. A reference number like `x');…//` executed code. Imported ids and `dataUrl`s were also unescaped. | Clicking "copy" on a crafted reference set `window.__pwned`. |
| 3 | Usability | The search boxes on Fix It, Proof and History re-rendered the whole view on every keystroke. You could type one character, then focus was lost. | After typing "water", the stored query was "w" and focus was on `BODY`. |
| 4 | Data safety | Unreadable saved JSON fell back to sample data. The next save silently overwrote the user's (possibly recoverable) data. | Seeded data containing `keep-me` was gone after one click. |
| 5 | Product logic | "Mark as resolved" ticked every step automatically. A finished checklist was treated as a solved problem. | All steps were done after resolving. |
| 6 | Classification | Keyword matching used substrings with no word boundaries: `rent` matched "current", `gas` matched "Vegas", `owe` matched "power". Rule order also misfiled claims. | "reimbursement claim… unpaid" → Renewal. "current lease renewal" → Missed Payment. "parking ticket… Vegas" → Missed Payment. |
| 7 | Integrity | Deleting a situation removed its documents and call preps permanently, with no undo. Proofs and waiting items pointing at it were left orphaned. | Orphaned proof count was 1 after delete. |
| 8 | Import | Validation only checked that arrays existed. A record missing `steps` or `title` crashed rendering. | `Cannot read properties of undefined (reading 'length')`. |
| 9 | Persistence | No schema versioning or migration path. Attachments were stored as base64 in localStorage (about 5 MB quota), so two receipts could fill it. In-memory state then diverged from what was saved. | Code review. |
| 10 | Accessibility | Modals had no `role="dialog"`, focus trap or focus return. Clickable `<article>`/`<div>` elements weren't keyboard reachable. Many labels weren't associated with inputs. Muted text (#888176) and amber-on-amber pills were below WCAG AA contrast. Toasts weren't announced. | Code review and contrast calculation. |
| 11 | Reliability | Tailwind's Play CDN compiled CSS at runtime from a third-party script. The UI was unstyled offline or if the CDN was blocked. The CDN also loaded on every visit. | `tailwind is not defined` when the CDN was unreachable. |
| 12 | Honesty | Generated plans stated assumptions as instructions ("Pay the base balance", "account is 12 days past due") with no distinction between what was known and what was guessed. "Coming up within 5 days" also counted overdue items. | Code review. |

## 2. v2 architecture

**One file, no build-time dependencies, no runtime CDN.** The sources live in `src/` (CSS, an HTML shell and numbered JS modules). `tools/build.mjs` concatenates them into `index.html`. The only external request is the optional Google Fonts stylesheet, and the person can switch it off in Data & privacy.

### Data model (schema 2)
The collections are normalized, and every child record carries `caseId`:

`cases · facts · consequences · deadlines · paths · tasks · comms · commitments · waits · evidence · docs · criteria · events · links · obligations`, plus `settings`, `meta`, `dismissed` and `trash`.

- **Facts** have a `kind` of confirmed, assumption, unverified or missing, plus a source and supporting evidence. Drafts include only confirmed facts by default.
- **Consequences** have a status (potential, established or avoided), a reversibility (reversible, hard to undo, can't be undone) and a severity. Items that come from playbooks are labelled as general guidance.
- **Deadlines** distinguish *their* deadline from *your* target, and carry a certainty (confirmed, not checked or estimate).
- **Paths** are the recovery approaches: direct, negotiate, exception, dispute, arrangement, appeal, escalate, advice, alternative, or accept-and-close. Each has a why, downsides, prerequisites, uncertainties, an outcome and a status.
- **Tasks** can depend on other tasks, on a wait being received, or on another case being resolved. Dependency cycles are rejected.
- **Comms** record channel, direction, purpose, *stance* (facts only, acknowledge, apologize, take responsibility, dispute, negotiate) and tone. Call records add a checklist and answered questions.
- **Commitments** record who promised what by when. A promise from the other side automatically becomes a tracked **wait**.
- **Waits** have five kinds (response, action, document, decision, payment), a basis for the expected date (promised, their policy or your estimate) and a log. Their state is derived: promise missed, overdue, follow-up due, on track or escalated.
- **Evidence** stores metadata in localStorage and the file in IndexedDB, with a SHA-256 fingerprint. Links to what it proves are kept two-way with facts and criteria.
- **Criteria** define what "resolved" means for each case. Resolution states are open, partial, conditional, disputed, monitoring, verified, closed (not verified) and let go. *Verified* requires every criterion to be met **and** evidenced.
- **Links** relate cases to each other: blocks, affects, caused by, related to.

### Persistence and safety
- localStorage holds case data and IndexedDB holds files and snapshots. Both are probed at startup, and the app degrades gracefully if either is missing.
- `normalizeState()` validates and repairs any input: enum coercion, id de-duplication, referential integrity, clearing dangling references, and reconciling evidence links. It never throws on a bad record; it reports what it set aside.
- **Migration v1→v2** maps every v1 field. The original v1 key is left untouched and a snapshot is taken first. Attachments move to IndexedDB. Closed v1 cases become *verified* only if they had proof, otherwise *closed, not verified*.
- Unreadable data is copied aside (and offered for download) before anything else happens. The newest readable snapshot is restored.
- Data from a newer schema is opened read-only.
- **Safety snapshots** are taken before migration, import, restore, loading examples and deleting everything, plus one a day. The newest 8 are kept.
- The **trash** keeps deleted bundles with their cross-references, so a restore re-links them exactly. Every delete has an undo.
- **Multi-tab:** changes from another tab are applied live, but are deferred while a dialog is open so a form never writes into a replaced state.
- **Backups:** JSON with an optional embedded file payload. Import shows a preview and takes a snapshot first.

### The recovery engine (local, rule-based)
- **Playbooks** cover 10 situation types: payment, appointment, renewal, return, application, notice, penalty, billing dispute, money owed to you, and other. Each has missing-information prompts, *contextual questions* (only those that change the recommendation, each with "why this matters"), consequences, 4–5 ranked paths with declarative ranking rules, resolution criteria, documents, "what to verify and where", drafting phrases and optional prevention ideas.
- **Intake** parses relative dates ("10 days ago", "last Thursday") and amounts. These are recorded as *unverified, from your description*. Auto-deadlines are created only where a past date usually *is* the deadline, and are marked *estimated*.
- **Path ranking** explains itself: each +/− reason is shown. Dynamic signals (a missed promise, a passed deadline) adjust ranking.
- **Priority** weighs real deadline proximity (confirmed above estimated), severe and hard-to-undo consequences, missed promises, your own commitments, and cases this one unblocks. Every score comes with readable reasons. Parked cases come back early if a real deadline gets within 3 days.
- **Next step** follows this order: an overdue promise (draft an escalation), then an actionable task, then a due follow-up, then "choose an approach", then blocked or waiting, and finally "check it's actually resolved".
- **Drafting** assembles messages from the case: reference, confirmed facts, earlier contacts and promises. A pre-send check flags placeholders, unconfirmed amounts, and a stance that conflicts with the chosen approach (for example, apologising while disputing).
- **Insights** cover repeated situation types, repeated organizations, the typical lag after the original date, which approaches worked for *you*, and organizations that missed promises. All are dismissible. Recurring reminders export to `.ics`.

No information is invented. No real organization names, phone numbers, fee amounts or legal time limits appear in the playbooks. Where rules vary by location or provider, the app says what to verify and where to look, and records what the person actually confirms.

## 3. Testing

- `test/smoke.mjs` renders every route and every tab of every example case, on desktop (1280×900) and mobile (390×844), and fails on any page or console error.
- `test/e2e.mjs` runs 26 end-to-end scenarios in America/Los_Angeles at 22:22:
  - dates and DST
  - the intake flow and re-ranking
  - search focus
  - answers changing consequences
  - composer warnings and mark-as-sent
  - call notes turning into commitments, waits and confirmed facts
  - missed-promise escalation
  - file evidence with fingerprint verification
  - evidence-backed resolution
  - delete-evidence warning
  - case delete, undo and full restore
  - persistence and daily snapshots
  - export and import with files, plus copy/paste backup and host-mediated saving for viewers that block downloads
  - v1 migration (using the original app's own sample data plus a file)
  - recovery from corrupt data
  - script injection (UI and crafted backups)
  - malformed import
  - focus sessions
  - parking with an approaching deadline
  - cross-case blocking priority
  - dialog accessibility (role, label, focus trap, Escape, focus return, `/` search)
  - multi-tab updates (including deferral under an open dialog)
  - ICS validity
  - mobile overflow and navigation

## 4. Known limits

- Guidance is general. The app can't look up a provider's policy or local law, by design (no external services). It tells you what to verify and keeps that separate from what you've confirmed.
- Browser storage can be cleared by the browser. Back up regularly. The app can ask the browser for persistent storage.
- Files are stored per browser. A backup without files restores the records but not the files themselves.
- Calendar reminders are exported as `.ics` files rather than synced, so nothing leaves the device without your action.
