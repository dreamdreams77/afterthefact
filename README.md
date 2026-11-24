# AFTER THE FACT

A calm, private place to recover when life admin has already gone wrong: a missed bill, an expired registration, an unanswered notice, or a refund that never came.

It helps you:

- **see the situation clearly**, with what you've confirmed kept separate from what you assume and what's still missing
- **understand your options**: several legitimate approaches, each with its trade-offs and the reasons it's ranked where it is
- **take the right next step**, prioritized by real deadlines, consequences that are hard to undo, and what's blocking other cases
- **communicate well**: calls, emails and letters with a deliberate stance (acknowledge, apologize, take responsibility, dispute, negotiate) and a pre-send check
- **stay on top of waiting**: promised dates, follow-up windows, missed promises and escalation, plus things you can do in the meantime
- **know when it's truly handled**: evidence-backed resolution, not just ticked boxes

## Use it

Open `index.html` in any modern browser. That's the whole app.

## Privacy

Everything stays in your browser on this device:

- case data in localStorage
- files and safety snapshots in IndexedDB

There's no account, no analytics and no AI service. The only network request is the Google Fonts stylesheet, which you can turn off in **Data & privacy**. "Open in email app" and `.ics` calendar files hand things to your own apps, and nothing is sent until you send it.

## Data safety

- Versioned schema (v2), with automatic migration from v1. Your original v1 data is kept untouched.
- Validation and repair on load and import.
- Safety snapshots before anything that replaces data, plus one a day.
- A trash that restores deleted items with their links, and undo on every delete.
- JSON backups, optionally including files.

## Develop

```
src/shell.html      HTML shell
src/styles.css      design system (no CSS framework)
src/js/*.js         modules, concatenated in filename order
tools/build.mjs     builds index.html
test/               Playwright smoke and end-to-end tests
legacy/v1.html      the original version (used to test migration)
docs/AUDIT.md       audit of v1, v2 architecture, test coverage, known limits
```

```
node tools/build.mjs            # → index.html
node tools/build.mjs dist/index.html && node test/smoke.mjs && node test/e2e.mjs
```

The tests use Playwright with Chrome. Set `CHROME_PATH` if Chrome isn't at `/usr/bin/google-chrome`.
