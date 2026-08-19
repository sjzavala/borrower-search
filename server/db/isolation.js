/**
 * Which schema is this request talking to?
 *
 * In development and production: always `public`. There is one database and one dataset.
 *
 * Under test: the schema named by the `X-Test-Worker` header, so `TEST_PARALLEL_INDEX=3`
 * in a Playwright worker becomes `test_w3`. Four workers get four datasets and can reset
 * their own without touching each other's.
 *
 * The header is only consulted when `NODE_ENV=test`. Outside test mode it is ignored
 * completely — not rejected, not logged, ignored — so a stray header from the internet
 * cannot steer a production request at another schema. That check is here rather than in
 * a middleware someone might reorder.
 */

import { DEFAULT_SCHEMA, qualify } from './pool.js';

export const TEST_MODE = process.env.NODE_ENV === 'test';

export const WORKER_HEADER = 'x-test-worker';

/** `0` → `test_w0`. Anything unparseable falls back to the default schema. */
export function schemaForWorker(worker) {
  if (worker === undefined || worker === null || worker === '') return DEFAULT_SCHEMA;
  const index = Number(worker);
  if (!Number.isInteger(index) || index < 0 || index > 63) return DEFAULT_SCHEMA;
  return `test_w${index}`;
}

export function schemaForRequest(req) {
  if (!TEST_MODE) return DEFAULT_SCHEMA;
  return qualify(schemaForWorker(req.get?.(WORKER_HEADER) ?? req.headers?.[WORKER_HEADER]));
}
