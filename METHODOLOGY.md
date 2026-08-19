# Testing an unfamiliar app in an hour

A repeatable method for the situation where you are handed a codebase you have never
seen, given about an hour, and expected to come out the other side with real findings
*and* durable artifacts.

The constraint that shapes everything: **an hour is not enough time to be thorough, so
the goal is to be well-targeted.** Every phase below is time-boxed, and the boxes are
enforced. Running long on the hunt is the most common way to end up with a pile of
findings and nothing anyone can act on.

The loop:

```
read the code  →  hunt manually  →  write cases  →  verify  →  automate
```

Tooling deliberately enters late. Phases A–C are human work; the
[qa-tms](https://github.com/sjzavala/claude-qa-tms) plugin takes over at D.

---

## Phase A — Orient (0:00 – 0:05)

**Read the source before opening the browser.** Five minutes in `server/routes.js` is the
highest-leverage part of the hour, because it converts blind clicking into a list of
hypotheses you can go confirm.

What to look for, in rough order of how often it pays:

| Look for | Because |
|---|---|
| Pagination math (`offset`/`limit`) | Off-by-one is endemic and invisible on page 1 |
| Comparison operators (`>` vs `>=`) | Boundary bugs never show up in casual use |
| Sort applied to strings | `$100,000` sorting below `$90,000` is a text sort |
| Search matching | Case, trimming, partial vs exact |
| Fields the API returns but the UI hides | Data leaks live here |

Write the hypotheses down before verifying any of them. A hypothesis you wrote down and
then disproved is still a result; one you never wrote down becomes aimless clicking.

## Phase B — Manual hunt (0:05 – 0:23)

Drive the browser yourself, testing Phase A's hypotheses:

- Search, filter, sort, page — and **combinations**, which is where state bugs hide.
- Devtools Network tab open. Read an actual response body; don't infer the API from the UI.
- Probe boundaries (exactly at the limit), case, whitespace, empty, and special characters.

For each finding: reproduce it, strip it to the minimum steps that still trigger it, and
know what *should* have happened. Drop anything that doesn't reproduce reliably — an
unreliable bug report costs a team more than no bug report.

Five confirmed bugs in eighteen minutes is a good pace. At two you are over-verifying; at
nine you are probably not reproducing carefully enough.

**Stop at 0:23 regardless of what you have found.** There are always more bugs. There is
not always time to make the ones you have useful.

## Phase C — Write the cases (0:23 – 0:35)

Hand-authored, in the TMS. This is the step that converts findings into something a team
can pick up — the difference between "I found five bugs" and five durable artifacts with
owners and IDs.

**Write the cases you intend to automate first.** If you run out of time, you want the
gap to fall on cases nobody was going to turn into a spec anyway.

For each bug, write **two** cases: one pinning the bug, one covering the happy path beside
it. A fix that breaks the normal case is the classic regression, and a suite that only
tests the bug will not catch it.

### The four fields that determine spec quality

Code generation reads `title`, `preconditions`, and each step's `action` +
`expected_result`. Everything else is for humans. A case that is a title and a paragraph
generates a correspondingly thin spec:

| Field | Write it like this |
|---|---|
| `title` | Behaviour-first, states the outcome. "Search by last name is case-insensitive" — not "Test search". Boundary values go **in the title**: "…includes borrowers at exactly the minimum (700)". |
| `preconditions` | What the test assumes: server URL, seed data state, named records it depends on. "App running with default seed data; Patricia Garcia scores exactly 700." |
| `action` | Executable by someone who has never seen the app, with literal data. "Enter `smith` (lowercase) in the search field" — not "perform a search". |
| `expected_result` | **Observable** — a visible value, count, or element state. "3 rows are shown, all with last name Smith" — not "results are correct". |

`expected_result` is what becomes the assertion. Vague expected results are the single
biggest cause of weak generated specs, because there is no number to pin.

## Phase D — Verify (0:35 – 0:43)

```
/qa-tms:verify BOR-2 BOR-3
```

Drives a real browser through each case step by step and returns a per-step
Step / Action / Expected / Actual / Result table plus a verdict.

For a bug case, a **failed** verdict is the confirmation — now observed by a browser
rather than asserted by you. A **blocked** step means the case drifted from the app; fix
the case, not the tool.

This is also where expected-vs-actual acquires evidence rather than recollection.

## Phase E — Automate (0:43 – 0:53)

Verify first, then generate — in that order, because a spec generated from a
never-executed case guesses at selectors.

```
/qa-tms:codegen BOR-2 BOR-3 BOR-4
```

Generates specs carrying the JSDoc traceability header, then **runs them**. Expect the
regression guards to **fail**, and say so plainly:

> This test fails right now, and that is the deliverable. It pins the bug, so whoever
> fixes it gets a green light telling them they are done.

Then review the output rather than shipping it: generated tests should use `getByRole` /
`getByLabel` over CSS selectors, and assert on values (`toHaveCount(3)`) rather than mere
presence. Fix the weak ones. Generated code you have not read is not a deliverable.

Traceability means the suite is queryable by case:

```bash
npx playwright test --grep @qase:BOR-12
npx playwright test --grep @regression
```

### A note on the guards in this repo

In a real codebase a regression guard stays red until someone fixes the bug — that red is
the deliverable, and it goes green exactly once, on the commit that fixes it.

This repo is a sandbox, so the planted bugs are permanent and that never happens. The
guards here are marked `test.fail()` instead, which inverts the assertion into *"this bug
still exists"*. The suite stays green and still means something: if anyone fixes
`server/routes.js`, the test passes unexpectedly, Playwright fails the run, and the
annotation is the thing you delete.

Worth being explicit about, because "we marked the failing test as expected-to-fail" is
usually how a team quietly stops caring about a test. It is only legitimate when the
unexpected pass is itself an alarm.

## Phase F — Wrap (0:53 – 1:00)

State what you found, what you automated, and — importantly — **what you did not get to
and would do next**. A named gap reads as judgment. An unmentioned gap reads as an
oversight.

---

## Why this order

The expensive mistake is automating first. Tests written before the behaviour is
understood encode the bug as expected, and they are written against selectors nobody has
confirmed exist.

Reading before clicking, and confirming before automating, means each phase hands the next
one something it can trust:

| Phase | Produces | Which the next phase needs because |
|---|---|---|
| A | hypotheses | aimless clicking finds only shallow bugs |
| B | reproducible findings | a case built on a flaky repro is worse than none |
| C | cases with observable expectations | assertions come from `expected_result` |
| D | verified selectors + evidence | codegen guesses without them |
| E | failing regression guards | they are the artifact a fix is measured against |

## Practising this

This repo is a rehearsal rig: a deliberately buggy app with **10 planted bugs**
(`PLANTED-BUGS.md` — don't read it until after your first run). Run the loop end to end
with a timer, then score yourself and note the two things that cost you the most time.
