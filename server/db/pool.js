/**
 * The database handle, and the one rule that makes per-worker isolation safe.
 *
 * **Every query runs through `withSchema`.** Nothing else may take a client from the pool.
 *
 * That rule exists because a pooled connection remembers its `search_path`. Hand a client
 * back with `test_w3` still set and the next borrower of that client silently reads and
 * writes worker 3's data — a cross-worker leak that produces flaky tests nobody can
 * reproduce, because it depends on which connection the pool happened to hand out.
 *
 * `withSchema` sets the path on every checkout, before any statement runs, so a client's
 * previous setting can never be inherited. The invariant is "no query without an explicit
 * schema", and the way it is enforced is by not exporting the pool.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import pg from 'pg';

const HERE = dirname(fileURLToPath(import.meta.url));

export const DEFAULT_SCHEMA = 'public';

/** Only a schema this pattern accepts is ever interpolated into SQL. See `qualify`. */
const SAFE_SCHEMA = /^[a-z_][a-z0-9_]*$/;

const pool = new pg.Pool({
  connectionString:
    process.env.DATABASE_URL ?? 'postgres://borrower:borrower@localhost:5432/borrower_search',
  max: Number(process.env.PG_POOL_MAX ?? 10),
});

pool.on('error', (error) => {
  // An idle client erroring is a pool-level event, not a request-level one. Left
  // unhandled it takes the process down, which in a test run looks like the app crashed
  // rather than like the database restarted.
  console.error('[db] idle client error:', error.message);
});

/**
 * A schema name cannot be a bound parameter — `SET search_path TO $1` is not valid SQL —
 * so it has to be interpolated, which means it has to be validated. An allowlist pattern
 * rather than escaping: the set of legitimate names here is tiny and fully known.
 */
export function qualify(schema) {
  const name = String(schema ?? DEFAULT_SCHEMA);
  if (!SAFE_SCHEMA.test(name)) throw new Error(`refusing to use "${name}" as a schema name`);
  return name;
}

/**
 * Run `fn` against a client pinned to one schema.
 *
 * The only way to reach the database.
 */
export async function withSchema(schema, fn) {
  const name = qualify(schema);
  const client = await pool.connect();
  try {
    // Unconditional, every checkout. Never `IF NOT SET` — inheriting a previous borrower's
    // path is precisely the failure this guards.
    await client.query(`SET search_path TO ${name}`);
    return await fn(client);
  } finally {
    client.release();
  }
}

/** Convenience for the common single-statement case. */
export async function query(schema, text, params = []) {
  return withSchema(schema, (client) => client.query(text, params));
}

const SCHEMA_SQL = readFileSync(join(HERE, 'schema.sql'), 'utf8');

/** Create the schema if absent and build the tables inside it. */
export async function ensureSchema(schema) {
  const name = qualify(schema);
  const client = await pool.connect();
  try {
    await client.query(`CREATE SCHEMA IF NOT EXISTS ${name}`);
    await client.query(`SET search_path TO ${name}`);
    await client.query(SCHEMA_SQL);
  } finally {
    client.release();
  }
  return name;
}

/** Drop every table's contents. Faster than dropping the schema and rebuilding it. */
export async function truncateSchema(schema) {
  return withSchema(schema, (client) =>
    // sessions before users would be redundant — CASCADE handles the FK — but naming both
    // keeps the intent readable, and RESTART IDENTITY is deliberate: see schema.sql on why
    // identity restart is exactly the hazard the session key was chosen to survive.
    client.query('TRUNCATE TABLE sessions, users, borrowers RESTART IDENTITY CASCADE'),
  );
}

/** Wait for a database that can accept a connection, not merely a container that booted. */
export async function waitForDatabase({ attempts = 30, delayMs = 500 } = {}) {
  for (let i = 1; i <= attempts; i++) {
    try {
      const client = await pool.connect();
      client.release();
      return;
    } catch (error) {
      if (i === attempts) {
        throw new Error(
          `database unreachable after ${attempts} attempts: ${error.message}\n` +
            'Is it up? `docker compose up -d db`',
        );
      }
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

export async function closePool() {
  await pool.end();
}
