/**
 * Session auth, sized for a sandbox.
 *
 * A random opaque token in an HttpOnly cookie, with the session row stored in the same
 * schema as the data. Nothing here is novel and nothing here should be copied into a real
 * product — no rotation, no expiry, no CSRF token, one shared password published in the
 * repo. It exists so there is a session to cache, and so caching one has consequences.
 *
 * The consequence worth understanding: a session row references its user by **email**, not
 * by a surrogate id. See server/db/schema.sql for why, and docs/isolation-lifecycle.md for
 * the failure path that choice avoids.
 */

import { randomBytes, timingSafeEqual } from 'node:crypto';

import { withSchema } from './db/pool.js';
import { schemaForRequest } from './db/isolation.js';
import { hashPassword } from './db/seed.js';

export const COOKIE_NAME = 'bs_session';

/** Express has no cookie parser built in, and one dependency for one cookie is not a trade. */
export function readCookie(req, name) {
  const header = req.headers?.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

function constantTimeEquals(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  // timingSafeEqual throws on a length mismatch, which would itself leak length. Compare
  // lengths first and always run the comparison against a same-length buffer.
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export async function login(req, email, password) {
  const schema = schemaForRequest(req);
  return withSchema(schema, async (client) => {
    const { rows } = await client.query(
      'SELECT email, display_name AS "displayName", role, password_hash AS "passwordHash" FROM users WHERE email = $1',
      [String(email ?? '').toLowerCase()],
    );
    const user = rows[0];
    if (!user) return null;
    if (!constantTimeEquals(user.passwordHash, hashPassword(user.email, password))) return null;

    const token = randomBytes(32).toString('hex');
    await client.query('INSERT INTO sessions (token, user_email) VALUES ($1, $2)', [token, user.email]);
    return { token, user: { email: user.email, displayName: user.displayName, role: user.role } };
  });
}

export async function currentUser(req) {
  const token = readCookie(req, COOKIE_NAME);
  if (!token) return null;

  const schema = schemaForRequest(req);
  return withSchema(schema, async (client) => {
    // The join is what makes the composition trap concrete. After a reset the sessions
    // table is empty, so this returns nothing and the user is signed out cleanly — which
    // is correct. The trap is the *other* shape: sessions preserved across a reset while
    // the user row they point at is recreated under a new surrogate id, leaving a session
    // that resolves to nobody. Keying on email means a reseeded user is the same user.
    const { rows } = await client.query(
      `SELECT u.email, u.display_name AS "displayName", u.role
       FROM sessions s JOIN users u ON u.email = s.user_email
       WHERE s.token = $1`,
      [token],
    );
    return rows[0] ?? null;
  });
}

export async function logout(req) {
  const token = readCookie(req, COOKIE_NAME);
  if (!token) return;
  const schema = schemaForRequest(req);
  await withSchema(schema, (client) => client.query('DELETE FROM sessions WHERE token = $1', [token]));
}

/** Route guard. Roles are checked server-side; the client only decides what to *render*. */
export function requireRole(...roles) {
  return async (req, res, next) => {
    try {
      const user = await currentUser(req);
      if (!user) return res.status(401).json({ error: 'Not signed in' });
      if (!roles.includes(user.role)) {
        return res.status(403).json({ error: `Requires role: ${roles.join(' or ')}` });
      }
      req.user = user;
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

export function sessionCookie(token) {
  // No `Secure`: the sandbox runs over plain http on localhost, and a Secure cookie would
  // simply never be stored. SameSite=Lax is enough for a same-origin app.
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax`;
}

export function clearedCookie() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}
