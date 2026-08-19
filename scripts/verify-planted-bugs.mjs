#!/usr/bin/env node
/**
 * Re-verify the planted defects against a running API.
 *
 * Migrating the store to Postgres rewrote every line the API-level bugs lived on, and a
 * migration that silently *fixes* a planted bug is worse than one that breaks the app: the
 * sandbox keeps advertising ten defects, the exercise quietly has nine, and both
 * claude-agent-swarm's ground truth and this repo's own regression guards go on scoring
 * against something that is no longer there.
 *
 * So the bugs are asserted, not assumed.
 *
 *   node scripts/verify-planted-bugs.mjs
 *
 * Six of the ten are observable through the API and are checked here. The remaining four
 * are client-side or timing-dependent and are named at the end with the spec that covers
 * them — listing them as "not checked" rather than letting a green run imply ten.
 */

const BASE = process.env.API_BASE ?? 'http://localhost:4000';

async function api(path) {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return res.json();
}

/** Each check returns {ok, detail}: ok means THE BUG IS STILL PRESENT. */
const CHECKS = [
  {
    id: 'BUG-1',
    name: 'search is case-sensitive',
    async run() {
      const upper = await api('/api/borrowers?q=Smith');
      const lower = await api('/api/borrowers?q=smith');
      return {
        ok: upper.results.length === 3 && lower.results.length === 0,
        detail: `Smith → ${upper.results.length} rows, smith → ${lower.results.length} rows (want 3 and 0)`,
      };
    },
  },
  {
    id: 'BUG-2',
    name: 'search query is not trimmed',
    async run() {
      const padded = await api(`/api/borrowers?q=${encodeURIComponent('Smith ')}`);
      return {
        ok: padded.results.length === 0,
        detail: `"Smith " → ${padded.results.length} rows (want 0)`,
      };
    },
  },
  {
    id: 'BUG-3',
    name: 'pagination drops one record per page',
    async run() {
      const page1 = await api('/api/borrowers?page=1');
      const page2 = await api('/api/borrowers?page=2');
      const ids1 = page1.results.map((r) => r.id);
      const ids2 = page2.results.map((r) => r.id);
      const unreachable = !ids1.includes(10) && !ids2.includes(10);
      return {
        ok: page1.results.length === 9 && unreachable,
        detail: `page1 ids ${ids1.join(',')} · page2 ids ${ids2.join(',')} — id 10 unreachable: ${unreachable}`,
      };
    },
  },
  {
    id: 'BUG-4',
    name: 'total ignores every filter',
    async run() {
      const filtered = await api('/api/borrowers?q=Smith');
      return {
        ok: filtered.total === 60 && filtered.results.length === 3,
        detail: `3 rows shown, total reports ${filtered.total} (want 60)`,
      };
    },
  },
  {
    id: 'BUG-5',
    name: 'minimum credit score is exclusive',
    async run() {
      const at = await api('/api/borrowers?minScore=700&limit=100');
      const below = await api('/api/borrowers?minScore=699&limit=100');
      const exactlyAt = at.results.filter((r) => r.creditScore === 700).length;
      const exactlyBelow = below.results.filter((r) => r.creditScore === 700).length;
      return {
        ok: exactlyAt === 0 && exactlyBelow === 2,
        detail: `minScore=700 includes ${exactlyAt} borrowers scoring exactly 700 (want 0); minScore=699 includes ${exactlyBelow} (want 2)`,
      };
    },
  },
  {
    id: 'BUG-6',
    name: 'loan amount sorts as text',
    async run() {
      const sorted = await api('/api/borrowers?sortBy=loanAmount&limit=100');
      const amounts = sorted.results.map((r) => r.loanAmount);
      // Text-descending puts anything starting '9' above anything starting '1', so the
      // largest loan is NOT first. That is the whole defect, and it is stable regardless
      // of collation.
      const largest = Math.max(...amounts);
      return {
        ok: amounts[0] !== largest,
        detail: `first row $${amounts[0].toLocaleString()}, largest is $${largest.toLocaleString()} — first five: ${amounts.slice(0, 5).join(', ')}`,
      };
    },
  },
  {
    id: 'BUG-8',
    name: 'full SSN in the API response',
    async run() {
      const page = await api('/api/borrowers');
      const ssn = page.results[0]?.ssn;
      return {
        ok: typeof ssn === 'string' && /^\d{3}-\d{2}-\d{4}$/.test(ssn),
        detail: `first row ssn: ${ssn ?? '(absent)'}`,
      };
    },
  },
];

const NOT_CHECKED_HERE = [
  ['BUG-7', 'XSS in the empty state', 'client-side — client/src/App.jsx, covered by a browser spec'],
  [
    'BUG-9',
    'stale responses overwrite newer ones',
    'timing-dependent — tests/search-race-stale-response.spec.js, and it depends on the artificial delay in routes.js',
  ],
  ['BUG-10', 'search does not reset pagination', 'client-side — client/src/App.jsx'],
];

const results = [];
for (const check of CHECKS) {
  try {
    const { ok, detail } = await check.run();
    results.push({ ...check, ok, detail });
  } catch (error) {
    results.push({ ...check, ok: false, detail: `check errored: ${error.message}` });
  }
}

const width = Math.max(...results.map((r) => r.name.length));
for (const r of results) {
  console.log(`${r.ok ? '✓' : '✗'} ${r.id}  ${r.name.padEnd(width)}  ${r.detail}`);
}

console.log('\nNot checked here (needs a browser):');
for (const [id, name, why] of NOT_CHECKED_HERE) console.log(`  · ${id}  ${name} — ${why}`);

const gone = results.filter((r) => !r.ok);
if (gone.length > 0) {
  console.error(
    `\n${gone.length} planted defect(s) no longer reproduce: ${gone.map((r) => r.id).join(', ')}.\n` +
      'Either the migration fixed them — in which case update PLANTED-BUGS.md, the specs that\n' +
      "guard them, and claude-agent-swarm's ground truth — or the check itself has drifted.",
  );
  process.exitCode = 1;
} else {
  console.log(`\nAll ${results.length} API-observable defects still reproduce.`);
}
