# Borrower Search — a QA sandbox

A deliberately buggy Node/Express + React borrower search app. It exists to practise, and
to demonstrate, a full QA loop on an unfamiliar codebase:

```
read the code  →  hunt manually  →  write cases  →  verify  →  automate
```

**It contains 10 real, planted bugs.** Don't read `PLANTED-BUGS.md` until after your first
run — finding them yourself is the point.

Two things to look at here:

- **[`METHODOLOGY.md`](METHODOLOGY.md)** — the time-boxed method, and why the phases are in
  that order.
- **[The intelligent runner](#ci-intelligent-test-selection)** — CI that maps a PR's diff
  to the specs that guard the changed files, and runs only those.

The tooling is the [qa-tms](https://github.com/sjzavala/claude-qa-tms) plugin.

## Run it

```bash
npm install
npm run dev          # API on :4000, client on :3000
```

Open <http://localhost:3000>.

```bash
npm test             # Playwright (auto-starts the app)
npm run test:ui      # Playwright UI mode
```

## Layout

```
server/
  index.js       Express bootstrap
  routes.js      GET /api/borrowers — search, filter, sort, paginate
  data.js        60 deterministic borrowers (no randomness — expected values are stable)
client/src/
  App.jsx        the entire UI: search, filters, sort, table, pagination
tests/
  smoke.spec.js  one passing test, showing house style for generated specs
test-cases/      local test-case fallback when the TMS is offline
```

## The dataset

60 borrowers, deterministic. Useful anchors:

| Fact | Value |
|---|---|
| Total borrowers | 60 |
| Borrowers with last name `Smith` | 3 (ids 1, 21, 41) |
| Borrowers with credit score exactly `700` | 2 (ids 6, 13) |
| Loan amount range | $50,000 – $1,025,000 |
| Statuses | Approved, Pending, Denied, Withdrawn |

Because the data never changes, "expected: 3 results" in a test case stays true forever.

## A timed run

Roughly the shape of an hour:

```
  (manual)                       # ~18 min — hunt bugs yourself in the browser
  (TMS web UI)                   # ~12 min — write the cases by hand
/qa-tms:verify BOR-2 BOR-3       # ~8 min  — execute them in a real browser
/qa-tms:codegen BOR-2 BOR-3      # ~10 min — generate + run traceable specs
```

The hunt and the case writing are deliberately manual; tooling enters only to verify and
automate. The reasoning is in [`METHODOLOGY.md`](METHODOLOGY.md).

Time yourself. If the hunt runs past 23 minutes you finish with cases but no automated
tests, which is the worse half to be missing.

## CI: intelligent test selection

Every spec here carries a traceability header naming the case it came from and the source
it exercises:

```js
/**
 * @qase-id  BOR-5
 * @covers   server/routes.js client/src/App.jsx
 * @guards   BUG-6 — a lowercase query returned zero results (server/routes.js:37-39)
 */
```

That header is a coverage map, so CI can read it. Label a PR **`use-intelligent-runner`**
and [playwright-test-selector](https://github.com/sjzavala/playwright-test-selector)
maps the diff to the specs that claim the changed files, runs only those, and comments the
selection with its reasoning.

Change `server/routes.js` and only the specs guarding it run. Change something no spec
claims and it runs **everything** — narrowing only happens where it can be justified,
because a runner that silently skips the one test that mattered is worse than no runner.

## CI: flake quarantine

One spec here is genuinely non-deterministic —
[`search-race-stale-response.spec.js`](tests/search-race-stale-response.spec.js). Nothing
in it is randomised. It types `Smith` one character at a time at a speed that makes all
five API responses land at the same instant, and planted bug #9 has no sequencing guard, so
whichever one lands last wins. About four times in ten, that's a response for an earlier
prefix, and the table fills with the wrong borrowers while the box still reads `Smith`.

That makes it a real fixture for
[flake-radar](https://github.com/sjzavala/flake-radar), which runs on the trunk build:

```
Tests (blocking)               everything except the quarantined specs
Tests (quarantined)            only the quarantined ones — continue-on-error
Score and decide               flake-radar ingests both reports
```

Retries are on in CI on purpose. A retry that changes the outcome is a flake proven at one
commit, on one machine, seconds apart — the strongest evidence available, and it only
exists if you let the retry happen and then record it.

Three details worth noticing:

- **The flaky spec is excluded from the PR suite** (`--grep-invert @flake-demo`). A flaky
  test has no business gating anyone's merge. It runs on trunk, where being flaky is the
  point.
- **Quarantined specs keep running**, in the second job, off the critical path. Skip them
  and they can never produce the clean runs that would release them — quarantine becomes
  permanent, which is the failure mode the whole design is trying to avoid.
- **The evidence flake-radar attaches to its issue is a fingerprint of bug #9.** A flaky
  test is very often a real race condition telling you about itself, and reading the
  evidence that way is more useful than muting it.

Because bug #9 is planted and permanent, this spec never recovers — so what you'll see here
is the quarantine and then, at fourteen days, the expiry escalation. The automatic
*restore* path is exercised end-to-end in
[flake-radar's own self-test](https://github.com/sjzavala/flake-radar/blob/main/.github/workflows/ci.yml),
where the fixture can be made to go clean on demand.

`.flake-radar/history.json` is committed, so every decision the tool makes shows up in a
diff next to the code it was made about.

## Reset

Nothing persists — the dataset is rebuilt in memory on every server start. Restart
`npm run dev` for a clean slate.
