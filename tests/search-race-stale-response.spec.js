import { test, expect } from '@playwright/test';

/**
 * @qase-id       BOR-9
 * @title         Typing a search shows results for what was typed, not an earlier prefix
 * @suite         Borrower Search > Filtering
 * @priority      high
 * @preconditions App running with default seed data (60 borrowers; exactly 3 have the
 *                last name "Smith" — ids 1, 21, 41)
 * @covers        client/src/App.jsx server/routes.js
 * @guards        BUG-9 — the fetch in useEffect has no sequencing guard or abort, and the
 *                API makes shorter queries slower (server/routes.js:56), so an earlier
 *                response can land after a later one and overwrite it
 *                (client/src/App.jsx:39)
 *
 * @flaky         DELIBERATE. This test is genuinely non-deterministic, and that is the
 *                point — it is the live fixture for flake-radar. Read the note below
 *                before "fixing" it.
 */

/**
 * Why this test flakes, and why it is not a Math.random() prop.
 *
 * The API delays each response by `600 - query.length * 120` ms. Typing "Smith" one
 * character at a time with a 120 ms gap fires five requests whose delays shrink by
 * exactly the gap between keystrokes:
 *
 *   sent at   0ms  "S"      resolves ~480ms
 *   sent at 120ms  "Sm"     resolves ~480ms
 *   sent at 240ms  "Smi"    resolves ~480ms
 *   sent at 360ms  "Smit"   resolves ~480ms
 *   sent at 480ms  "Smith"  resolves ~480ms
 *
 * All five land at the same instant. Which one wins is decided by scheduler and network
 * jitter, so the final render is sometimes the 3 Smiths and sometimes the results for a
 * shorter prefix. Nothing here is randomised: the non-determinism comes from the race in
 * the application, which is exactly what a real flaky test looks like.
 *
 * That is the honest version of the demo. flake-radar quarantines this test, and the
 * per-commit evidence it attaches to the issue is a fingerprint of BUG-9 — a flaky test
 * is very often a real race condition telling you about itself.
 *
 * Excluded from the pull-request suite on purpose (see .github/workflows/pr-tests.yml);
 * a flaky test has no business gating anyone's merge.
 */
/**
 * The gap between keystrokes, in milliseconds.
 *
 * 120 is the arithmetic boundary: it makes all five responses expire at the same instant.
 * But identical timers fire in insertion order, so a clean 120 resolves *correctly* every
 * time — and real overhead (input dispatch, the loopback hop) adds a little to every gap,
 * pushing it further onto the safe side. Measured on the machine this was written on:
 *
 *   110ms  →  1 pass / 4 fail        113ms  →  8 pass / 0 fail
 *   111ms  →  5 pass / 3 fail        116ms  →  5 pass / 0 fail
 *   112ms  →  7 pass / 1 fail        120ms  →  6 pass / 0 fail
 *
 * The whole transition from reliable failure to reliable success spans about three
 * milliseconds. 111 sits inside it on that machine, at roughly a 40% failure rate.
 *
 * Three milliseconds is narrower than the gap between a laptop and a shared CI runner, so
 * that number does not travel. At 111 on `ubuntu-latest` this failed 3 out of 3 — and a
 * test that *always* fails is not flaky. flake-radar scores it as broken and refuses to
 * quarantine it, which is the correct call and also no demo at all.
 *
 * So CI calibrates rather than assumes: `.github/workflows/flake-calibration.yml` sweeps
 * the delay on the runner and the repository variable `RACE_DELAY_MS` carries the answer.
 *
 * That sensitivity is not a flaw in the fixture, it is the thing being demonstrated: a
 * flaky test is one whose verdict is decided by the machine it ran on rather than by the
 * code under test.
 */
// `|| 111` rather than `?? 111`: an unset repository variable arrives as an empty string,
// not as undefined, and Number('') is 0 — which would fire all five requests at once and
// turn the fixture into a guaranteed failure.
const KEYSTROKE_DELAY_MS = Number(process.env.RACE_DELAY_MS) || 111;

test(
  'BOR-9 — the results table matches the query in the search box',
  { tag: ['@qase:BOR-9', '@regression', '@flake-demo'] },
  async ({ page }) => {
    // Step 1: open the borrower search page
    await page.goto('/');

    // Settle the unfiltered baseline request first. Without this the page-load response
    // joins the race too, and the test would flake for a second, less interesting reason.
    await page.waitForLoadState('networkidle');

    const searchBox = page.getByRole('textbox', { name: 'Search borrowers' });
    // rowgroup[0] is the header (thead), rowgroup[1] is the body (tbody)
    const dataRows = page.getByRole('rowgroup').nth(1).getByRole('row');

    // Step 2: type `Smith` one character at a time, at typing speed
    await searchBox.pressSequentially('Smith', { delay: KEYSTROKE_DELAY_MS });

    // Step 2 expected: the box holds the full query
    await expect(searchBox).toHaveValue('Smith');

    // Step 3 expected: the table shows the 3 borrowers named Smith — the results for what
    // is actually in the box, not for a prefix of it.
    //
    // When the race is lost, a response for "S" or "Sm" lands last and the table fills
    // with a broader set while the box still reads "Smith". That is the defect: the two
    // halves of the screen disagree, and nothing on the page says so.
    await expect(dataRows).toHaveCount(3);
    await expect(page.getByRole('cell', { name: /Smith/ })).toHaveCount(3);
  },
);
