-- The sandbox schema.
--
-- Applied into whichever schema the caller has set as its search_path, so the same file
-- builds the shared `public` schema in development and every `test_wN` schema under a
-- parallel test run. Nothing here names a schema explicitly — that is what makes
-- per-worker isolation possible without a second copy of this file.

CREATE TABLE IF NOT EXISTS borrowers (
  id            integer PRIMARY KEY,
  first_name    text        NOT NULL,
  last_name     text        NOT NULL,
  email         text        NOT NULL,
  ssn           text        NOT NULL,
  credit_score  integer     NOT NULL,
  -- Numeric on purpose. The planted sort defect lives in the *query* (an explicit cast to
  -- text), not in the column type — a text column here would make the bug structural and
  -- impossible to fix without a migration, which is not what it is meant to demonstrate.
  loan_amount   integer     NOT NULL,
  state         text        NOT NULL,
  status        text        NOT NULL,
  submitted_at  date        NOT NULL
);

CREATE INDEX IF NOT EXISTS borrowers_last_name_idx ON borrowers (last_name);

-- Users are seeded, never registered. Three roles whose UI visibly differs, so caching a
-- storageState per role is worth doing rather than theatre.
CREATE TABLE IF NOT EXISTS users (
  -- A natural key, deliberately. See sessions below.
  email          text PRIMARY KEY,
  display_name   text NOT NULL,
  role           text NOT NULL CHECK (role IN ('analyst', 'underwriter', 'admin')),
  password_hash  text NOT NULL
);

-- Sessions key off the user's email, not off a surrogate id.
--
-- THIS IS THE COMPOSITION-TRAP FIX, and it is the whole reason this table looks like this.
--
-- A Playwright worker caches `storageState` once and reuses it across a whole suite. If a
-- test then resets the worker's schema, every row is recreated — and had sessions
-- referenced a `SERIAL` user id, the sequence would restart, the recreated user would get
-- a different id, and the cached cookie would point at a user that no longer exists. Every
-- subsequent test 401s, and the failure looks like an auth bug rather than what it is: the
-- data reset silently invalidating the auth it was supposed to be independent of.
--
-- Keying on email makes the reference stable across any restore that reseeds the same
-- fixture, because the fixture's emails are fixed. See docs/isolation-lifecycle.md for the
-- failure path this avoids.
CREATE TABLE IF NOT EXISTS sessions (
  token       text PRIMARY KEY,
  user_email  text        NOT NULL REFERENCES users (email) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now()
);
