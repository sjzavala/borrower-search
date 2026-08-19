#!/usr/bin/env node
/**
 * Assert the test control endpoints do not exist outside test mode.
 *
 * `POST /test/reset` truncates a schema without authentication. In test mode that is a
 * feature; anywhere else it is a remote "wipe the database" button. `server/test-routes.js`
 * is therefore never imported unless `NODE_ENV=test`, so outside test mode the router does
 * not exist and the paths 404 like any unknown route.
 *
 * That guarantee cannot be checked from the Playwright suite, because playwright.config.js
 * deliberately pins the server to `NODE_ENV=test` — the isolation fixtures need the
 * endpoints. So it is checked here instead, against a server booted the way production
 * would boot it.
 *
 *   node scripts/verify-control-endpoints-absent.mjs
 *
 * Starts its own server on a spare port, probes, and shuts down.
 */

import { spawn } from 'node:child_process';
import { once } from 'node:events';

const PORT = process.env.PROBE_PORT ?? 4555;
const BASE = `http://localhost:${PORT}`;
const PATHS = ['/test/reset', '/test/seed', '/test/truncate', '/test/counts'];

// Explicitly NOT test. `delete` rather than an empty string, so nothing inherited from the
// caller's shell can turn the guard off from the outside.
const env = { ...process.env, PORT: String(PORT) };
delete env.NODE_ENV;

const server = spawn('node', ['server/index.js'], { env, stdio: ['ignore', 'pipe', 'pipe'] });

let stderr = '';
server.stderr.on('data', (chunk) => {
  stderr += chunk;
});

async function waitForHealth(attempts = 40) {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(`${BASE}/health`);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`server never became healthy on ${BASE}\n${stderr}`);
}

let failures = 0;
try {
  await waitForHealth();

  // Sanity: the real API must be working, or a 404 on /test proves nothing — a server that
  // 404s everything would pass this check while being completely broken.
  const real = await fetch(`${BASE}/api/borrowers`);
  if (!real.ok) throw new Error(`/api/borrowers returned ${real.status}; the probe is not meaningful`);
  console.log('✓ the API itself is serving, so a 404 below means the route is absent');

  for (const path of PATHS) {
    const res = await fetch(`${BASE}${path}`, { method: 'POST' });
    const ok = res.status === 404;
    if (!ok) failures += 1;
    console.log(`${ok ? '✓' : '✗'} POST ${path.padEnd(16)} → ${res.status}${ok ? '' : '  EXPECTED 404'}`);
  }
} finally {
  server.kill('SIGTERM');
  await once(server, 'exit').catch(() => {});
}

if (failures > 0) {
  console.error(
    `\n${failures} control endpoint(s) are reachable without NODE_ENV=test.\n` +
      'An unauthenticated endpoint that truncates tables must be absent, not guarded — check\n' +
      'that server/index.js still imports test-routes.js dynamically inside `if (TEST_MODE)`.',
  );
  process.exitCode = 1;
} else {
  console.log('\nAll control endpoints are absent outside test mode.');
}
