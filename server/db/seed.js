/**
 * Seeding — the fixture, loaded into whichever schema is asked for.
 *
 * The dataset is byte-identical to the in-memory version this replaced: same 60 borrowers,
 * same 3 Smiths, same 2 scores of exactly 700, same text-sortable loan amounts. "Expected:
 * 3 results" was true before Postgres and is true after it, which is the only reason the
 * existing test cases and claude-agent-swarm's ground truth survive the migration.
 *
 * Two entry points, and the difference between them is the point:
 *
 *   seed(schema)       full setup — create the schema, install users, load data
 *   resetData(schema)  reload the fixture data ONLY, leaving users and sessions alone
 */

import { scryptSync } from 'node:crypto';

import { borrowers, users, SANDBOX_PASSWORD } from '../data.js';
import { ensureSchema, withSchema } from './pool.js';

const COLUMNS = [
  'id',
  'first_name',
  'last_name',
  'email',
  'ssn',
  'credit_score',
  'loan_amount',
  'state',
  'status',
  'submitted_at',
];

/**
 * A fixed salt per user, derived from the email.
 *
 * Deliberately deterministic, and deliberately wrong for production. A random salt would
 * make every reseed produce a different `password_hash`, so a restored schema would no
 * longer be byte-identical to the one a test cached its session against. Real auth wants a
 * random salt per user and a memory-hard KDF with tuned parameters; this wants
 * reproducibility.
 */
export function hashPassword(email, password = SANDBOX_PASSWORD) {
  return scryptSync(password, `borrower-search:${email}`, 32).toString('hex');
}

async function insertBorrowers(client) {
  // One multi-row insert rather than 60 round trips. The parameters come from a fixture
  // that never contains user input and are still bound rather than interpolated — a
  // sandbox that models the insecure thing teaches the insecure thing.
  const values = [];
  const tuples = borrowers.map((b, i) => {
    values.push(
      b.id,
      b.firstName,
      b.lastName,
      b.email,
      b.ssn,
      b.creditScore,
      b.loanAmount,
      b.state,
      b.status,
      b.submittedAt,
    );
    const base = i * COLUMNS.length;
    return `(${COLUMNS.map((_, c) => `$${base + c + 1}`).join(', ')})`;
  });

  await client.query(`INSERT INTO borrowers (${COLUMNS.join(', ')}) VALUES ${tuples.join(', ')}`, values);
}

async function insertUsers(client) {
  for (const user of users) {
    // ON CONFLICT DO NOTHING so re-running setup never disturbs a live session. Replacing
    // the row would cascade the session away and reintroduce the exact bug this avoids.
    await client.query(
      `INSERT INTO users (email, display_name, role, password_hash)
       VALUES ($1, $2, $3, $4) ON CONFLICT (email) DO NOTHING`,
      [user.email, user.displayName, user.role, hashPassword(user.email)],
    );
  }
}

/** Full setup: create the schema if absent, install the users, load the data. */
export async function seed(schema) {
  await ensureSchema(schema);
  await withSchema(schema, async (client) => {
    await client.query('TRUNCATE TABLE borrowers');
    await insertBorrowers(client);
    await insertUsers(client);
  });
  return { borrowers: borrowers.length, users: users.length };
}

/**
 * Reset the fixture data — and **only** the fixture data.
 *
 * The reset scope deliberately excludes `users` and `sessions`. That is the second half of
 * the composition-trap fix, and it is not optional: keying sessions on a natural key makes
 * a recreated user resolve, but it does nothing if the reset deleted the session row in the
 * first place.
 *
 * The first version of this file truncated all three tables, and the proof spec caught it
 * immediately — every request after a reset 401'd. Stated plainly, "resetting test data
 * should not log everybody out" is obvious. It is much less obvious when the symptom is
 * "the third test in the file fails, but only at two workers".
 */
export async function resetData(schema) {
  await withSchema(schema, async (client) => {
    await client.query('TRUNCATE TABLE borrowers');
    await insertBorrowers(client);
  });
  return { borrowers: borrowers.length };
}

/**
 * Wipe everything, sessions included.
 *
 * Not used by the normal reset path. It exists so a spec can demonstrate the failure mode
 * on purpose — the state a naive reset leaves behind — rather than only describing it.
 */
export async function wipeAll(schema) {
  await withSchema(schema, (client) =>
    client.query('TRUNCATE TABLE sessions, users, borrowers RESTART IDENTITY CASCADE'),
  );
}

/** Row counts, used by the health check and by the isolation proof spec. */
export async function counts(schema) {
  return withSchema(schema, async (client) => {
    const { rows } = await client.query(
      `SELECT (SELECT count(*) FROM borrowers) AS borrowers,
              (SELECT count(*) FROM sessions)  AS sessions,
              (SELECT count(*) FROM users)     AS users`,
    );
    const [row] = rows;
    return { borrowers: Number(row.borrowers), sessions: Number(row.sessions), users: Number(row.users) };
  });
}
