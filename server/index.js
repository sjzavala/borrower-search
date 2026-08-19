import express from 'express';
import cors from 'cors';

import { router } from './routes.js';
import { login, logout, currentUser, sessionCookie, clearedCookie } from './auth.js';
import { waitForDatabase, DEFAULT_SCHEMA } from './db/pool.js';
import { seed, counts } from './db/seed.js';
import { TEST_MODE } from './db/isolation.js';

const app = express();
const PORT = process.env.PORT ?? 4000;

// `credentials: true` and an explicit origin: a wildcard origin cannot carry cookies, and
// the session cookie is the whole point of the auth layer.
app.use(cors({ origin: process.env.CLIENT_ORIGIN ?? 'http://localhost:3000', credentials: true }));
app.use(express.json());

app.post('/api/login', async (req, res, next) => {
  try {
    const { email, password } = req.body ?? {};
    const session = await login(req, email, password);
    // One message for "no such user" and for "wrong password". Distinguishing them turns
    // the login form into an account enumerator.
    if (!session) return res.status(401).json({ error: 'Invalid email or password' });
    res.setHeader('Set-Cookie', sessionCookie(session.token));
    return res.json(session.user);
  } catch (error) {
    return next(error);
  }
});

app.post('/api/logout', async (req, res, next) => {
  try {
    await logout(req);
    res.setHeader('Set-Cookie', clearedCookie());
    return res.status(204).end();
  } catch (error) {
    return next(error);
  }
});

app.use('/api', router);

// A health check that only reports `ok` cannot distinguish a healthy API from one serving
// an empty dataset, which is the failure a smoke test most needs to catch.
app.get('/health', async (_req, res) => {
  try {
    const { borrowers } = await counts(DEFAULT_SCHEMA);
    return res.json({ ok: borrowers > 0, borrowers });
  } catch (error) {
    return res.status(503).json({ ok: false, error: error.message });
  }
});

app.use((error, _req, res, _next) => {
  console.error('[api]', error);
  res.status(500).json({ error: 'Internal error' });
});

async function start() {
  await waitForDatabase();
  await seed(DEFAULT_SCHEMA);

  if (TEST_MODE) {
    // Dynamic, and inside the branch. In any other mode this module is never loaded, so
    // the control endpoints do not exist to be reached. See server/test-routes.js.
    const { testRouter } = await import('./test-routes.js');
    app.use('/test', testRouter);
    console.log('[api] NODE_ENV=test — control endpoints mounted at /test');
  }

  app.listen(PORT, () => {
    console.log(`Borrower API listening on http://localhost:${PORT}`);
  });
}

start().catch((error) => {
  console.error('[api] failed to start:', error.message);
  process.exit(1);
});

export { app };
