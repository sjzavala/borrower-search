import { Router } from 'express';

import { withSchema } from './db/pool.js';
import { schemaForRequest } from './db/isolation.js';
import { currentUser, requireRole } from './auth.js';

export const router = Router();

const DEFAULT_LIMIT = 10;

/**
 * ⚠️ Every planted defect in PLANTED-BUGS.md is preserved verbatim through the Postgres
 * migration, and several of them now take an explicit effort to keep. They are marked
 * below. If you are here to make this file correct, that is the point of the sandbox — but
 * check PLANTED-BUGS.md first so you know which "fix" removes an exercise.
 */

/** ORDER BY fragments. Keys are the API's sort values; the SQL is never user-supplied. */
const ORDER_BY = {
  lastName: 'last_name ASC',
  creditScore: 'credit_score DESC',
  // BUG-6 — loan amount sorted as text.
  //
  // The column is `integer`, so this cast is now deliberate rather than accidental. It is
  // the migration-era equivalent of the old `String(b.loanAmount).localeCompare(...)`:
  // '90000' sorts above '950000' above '1025000', because text comparison never reaches
  // the second digit. Removing `::text` fixes the bug.
  loanAmount: 'loan_amount::text DESC',
  id: 'id ASC',
};

/**
 * Columns as the client expects them.
 *
 * BUG-8 — `ssn` is selected and returned in full. The UI masks it to `***-**-1000`, so the
 * exposure is invisible in the browser and plain in the network tab.
 */
const SELECT_COLUMNS = `
  id,
  first_name  AS "firstName",
  last_name   AS "lastName",
  email,
  ssn,
  credit_score AS "creditScore",
  loan_amount  AS "loanAmount",
  state,
  status,
  to_char(submitted_at, 'YYYY-MM-DD') AS "submittedAt"
`;

router.get('/borrowers', async (req, res, next) => {
  try {
    const schema = schemaForRequest(req);
    const query = req.query.q ?? '';
    const status = req.query.status ?? '';
    const minScore = req.query.minScore ? Number(req.query.minScore) : null;
    const sortBy = req.query.sortBy ?? 'id';
    const page = Number(req.query.page ?? 1);
    const limit = Number(req.query.limit ?? DEFAULT_LIMIT);

    const where = [];
    const params = [];

    if (query) {
      // BUG-1 — case-sensitive search. `LIKE` in Postgres is case-sensitive; `ILIKE` is
      // the fix. The old code was `b.lastName.includes(query)`, which had the same flaw.
      // BUG-2 — the query is not trimmed, so a trailing space matches nothing. Both
      // defects live on this one expression and neither fixes the other.
      params.push(`%${query}%`);
      where.push(`(last_name LIKE $${params.length} OR first_name LIKE $${params.length})`);
    }

    if (status) {
      params.push(status);
      where.push(`status = $${params.length}`);
    }

    if (minScore !== null && !Number.isNaN(minScore)) {
      // BUG-5 — exclusive minimum. `>=` is the fix; `>` drops the two borrowers scoring
      // exactly 700.
      params.push(minScore);
      where.push(`credit_score > $${params.length}`);
    }

    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const orderSql = ORDER_BY[sortBy] ?? ORDER_BY.id;
    const start = (page - 1) * limit;

    // BUG-3 — one record per page is dropped. `limit - 1` rows are returned while the
    // offset still advances by `limit`, so ids 10, 20, 30, 40, 50 and 60 are unreachable
    // through the UI. Was `sorted.slice(start, start + limit - 1)`.
    params.push(Math.max(0, limit - 1), start);
    const rowsSql = `
      SELECT ${SELECT_COLUMNS}
      FROM borrowers
      ${whereSql}
      ORDER BY ${orderSql}
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `;

    const payload = await withSchema(schema, async (client) => {
      const { rows } = await client.query(rowsSql, params);

      // BUG-4 — the total ignores every filter. Searching "Smith" shows 3 rows and claims
      // 60 borrowers across 6 pages, 5 of them empty. The fix is to count with `whereSql`
      // and the same parameters.
      const { rows: totals } = await client.query('SELECT count(*)::int AS total FROM borrowers');

      return { results: rows, total: totals[0].total, page, limit };
    });

    // Simulated backend latency: broader queries resolve *slower*.
    //
    // ⚠️ LOAD-BEARING. This looks like scaffolding and is not. It is what makes BUG-9's
    // race observable: typing "Smith" fires five requests whose delays shrink by 120ms per
    // character, so an earlier response can land after a later one. That race is the live
    // fixture for flake-radar's quarantine demo, and the keystroke spacing in
    // tests/search-race-stale-response.spec.js is calibrated against these exact numbers.
    // Change the formula and the demo dies silently — the spec simply stops flaking.
    const delay = Math.max(0, 600 - String(query).length * 120);
    setTimeout(() => res.json(payload), delay);
  } catch (error) {
    next(error);
  }
});

router.get('/borrowers/:id', async (req, res, next) => {
  try {
    const schema = schemaForRequest(req);
    const { rows } = await withSchema(schema, (client) =>
      client.query(`SELECT ${SELECT_COLUMNS} FROM borrowers WHERE id = $1`, [Number(req.params.id)]),
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Borrower not found' });
    return res.json(rows[0]);
  } catch (error) {
    return next(error);
  }
});

/**
 * Change a borrower's status.
 *
 * The one write in the app, and the reason the roles differ visibly: an `analyst` gets a
 * table with no status control at all, an `underwriter` gets a working one.
 */
router.patch('/borrowers/:id/status', requireRole('underwriter', 'admin'), async (req, res, next) => {
  try {
    const schema = schemaForRequest(req);
    const { status } = req.body ?? {};
    const allowed = ['Approved', 'Pending', 'Denied', 'Withdrawn'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ error: `status must be one of ${allowed.join(', ')}` });
    }

    const { rows } = await withSchema(schema, (client) =>
      client.query(
        `UPDATE borrowers SET status = $1 WHERE id = $2 RETURNING ${SELECT_COLUMNS}`,
        [status, Number(req.params.id)],
      ),
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Borrower not found' });
    return res.json(rows[0]);
  } catch (error) {
    return next(error);
  }
});

/** Who am I? Drives which controls the client renders. */
router.get('/me', async (req, res, next) => {
  try {
    const user = await currentUser(req);
    if (!user) return res.status(401).json({ error: 'Not signed in' });
    return res.json(user);
  } catch (error) {
    return next(error);
  }
});
