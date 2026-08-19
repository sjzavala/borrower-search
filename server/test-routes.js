/**
 * The test-only control API.
 *
 * ⚠️ This module is **never imported outside test mode**. `server/index.js` reaches it
 * through a dynamic `import()` inside an `if (TEST_MODE)`, so in development or production
 * the code is not loaded, the router does not exist, and the paths 404 like any other
 * unknown route.
 *
 * That is deliberate, and it is the difference between "guarded" and "absent". A flag check
 * inside a mounted handler is one refactor, one inverted boolean, or one misconfigured
 * environment away from exposing `POST /test/reset` — an unauthenticated "wipe the
 * database" endpoint — to the internet. Convenience like that is how incidents start.
 *
 * `tests/api/test-endpoints-absent.spec.js` asserts the 404 with `NODE_ENV` unset, so the
 * guarantee is checked rather than asserted in a comment.
 */

import { Router } from 'express';

import { seed, resetData, wipeAll, counts } from './db/seed.js';
import { schemaForRequest } from './db/isolation.js';

export const testRouter = Router();

/**
 * Reset this worker's schema to the fixture.
 *
 * Scoped to the caller's schema — a worker can only reset its own data, because the schema
 * comes from its `X-Test-Worker` header and nothing else.
 */
testRouter.post('/reset', async (req, res, next) => {
  try {
    const schema = schemaForRequest(req);
    // resetData, not seed: the fixture data reloads, users and sessions are left alone, so
    // a worker's cached storageState survives its own mid-suite reset.
    const result = await resetData(schema);
    return res.json({ schema, ...result });
  } catch (error) {
    return next(error);
  }
});

/** Seed without truncating first — for a schema that has just been created. */
testRouter.post('/seed', async (req, res, next) => {
  try {
    const schema = schemaForRequest(req);
    const result = await seed(schema);
    return res.json({ schema, ...result });
  } catch (error) {
    return next(error);
  }
});

/**
 * Wipe everything, sessions included — the naive reset.
 *
 * Exists so a spec can demonstrate the failure mode on purpose: after this, a cached
 * session is genuinely gone and every request 401s. Contrast with /reset, which reloads
 * the data and leaves the session intact.
 */
testRouter.post('/truncate', async (req, res, next) => {
  try {
    const schema = schemaForRequest(req);
    await wipeAll(schema);
    return res.json({ schema, ...(await counts(schema)) });
  } catch (error) {
    return next(error);
  }
});

/** Row counts for the calling worker's schema, so a spec can assert on isolation. */
testRouter.get('/counts', async (req, res, next) => {
  try {
    const schema = schemaForRequest(req);
    return res.json({ schema, ...(await counts(schema)) });
  } catch (error) {
    return next(error);
  }
});
