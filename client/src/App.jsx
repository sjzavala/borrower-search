import { useEffect, useState } from 'react';

const STATUSES = ['Approved', 'Pending', 'Denied', 'Withdrawn'];
const PAGE_SIZE = 10;

function maskSsn(ssn) {
  return `***-**-${ssn.slice(-4)}`;
}

function formatCurrency(amount) {
  return amount.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });
}

export default function App() {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [minScore, setMinScore] = useState('');
  const [sortBy, setSortBy] = useState('id');
  const [page, setPage] = useState(1);

  const [results, setResults] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Who is signed in, and therefore what this page renders.
  //
  // `null` — anonymous. The app stays usable signed out, deliberately: the read-only view
  // is what the existing specs and the BUG-9 race fixture exercise, and putting a login
  // wall in front of them would have meant rewriting three downstream consumers to test
  // the same behaviour.
  //
  // The roles differ *visibly*, which is what makes caching a storageState per role worth
  // doing rather than theatre:
  //
  //   anonymous / analyst   read-only
  //   underwriter           status becomes an editable control
  //   admin                 additionally sees the credit score column
  //
  // None of this is a security boundary. The API enforces the roles; the client only
  // decides what to draw. A reader who disables this in devtools gets a status dropdown
  // that 403s.
  const [user, setUser] = useState(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [dataVersion, setDataVersion] = useState(0);

  const canEditStatus = user?.role === 'underwriter' || user?.role === 'admin';
  const canSeeCreditScore = user?.role === 'admin';

  useEffect(() => {
    fetch('/api/me', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then(setUser)
      .catch(() => setUser(null));
  }, []);

  async function signIn(email) {
    setAuthBusy(true);
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: 'sandbox' }),
      });
      setUser(res.ok ? await res.json() : null);
    } finally {
      setAuthBusy(false);
    }
  }

  async function signOut() {
    setAuthBusy(true);
    try {
      await fetch('/api/logout', { method: 'POST', credentials: 'include' });
      setUser(null);
    } finally {
      setAuthBusy(false);
    }
  }

  async function changeStatus(id, nextStatus) {
    const res = await fetch(`/api/borrowers/${id}/status`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: nextStatus }),
    });
    if (!res.ok) {
      setError(`Could not update status (${res.status})`);
      return;
    }
    // Refetch rather than patching local state, so the table always reflects what the API
    // actually stored.
    setDataVersion((v) => v + 1);
  }

  useEffect(() => {
    const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE), sortBy });
    if (query) params.set('q', query);
    if (status) params.set('status', status);
    if (minScore) params.set('minScore', minScore);

    setLoading(true);
    setError(null);

    fetch(`/api/borrowers?${params}`)
      .then((res) => {
        if (!res.ok) throw new Error(`Request failed: ${res.status}`);
        return res.json();
      })
      .then((data) => {
        setResults(data.results);
        setTotal(data.total);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
    // ⚠️ Deliberately no abort and no sequence guard — that absence is BUG-9, and it is
    // what flake-radar's quarantine demo is calibrated against. `dataVersion` is only here
    // so a status edit refetches; it changes nothing about the race.
  }, [query, status, minScore, sortBy, page, dataVersion]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <main>
      <h1>Borrower Search</h1>

      {/* Sign-in is a row of buttons, not a form. The password is published in the repo and
          typing it in every test would be the slow, flaky UI login this sandbox exists to
          argue against — the point is to get a session cheaply and cache it. */}
      <section className="session" data-testid="session-bar">
        {user ? (
          <>
            <span data-testid="current-user">
              {user.displayName} — <strong>{user.role}</strong>
            </span>
            <button type="button" onClick={signOut} disabled={authBusy}>
              Sign out
            </button>
          </>
        ) : (
          <>
            <span data-testid="current-user">Not signed in</span>
            {['analyst', 'underwriter', 'admin'].map((role) => (
              <button
                key={role}
                type="button"
                onClick={() => signIn(`${role}@example.com`)}
                disabled={authBusy}
              >
                Sign in as {role}
              </button>
            ))}
          </>
        )}
      </section>

      <section className="controls">
        <div className="field">
          <label htmlFor="search">Search borrowers</label>
          <input
            id="search"
            type="text"
            placeholder="Name"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="status">Status</label>
          <select id="status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="minScore">Minimum credit score</label>
          <input
            id="minScore"
            type="number"
            placeholder="e.g. 700"
            value={minScore}
            onChange={(e) => { setMinScore(e.target.value); setPage(1); }}
          />
        </div>

        <div className="field">
          <label htmlFor="sortBy">Sort by</label>
          <select id="sortBy" value={sortBy} onChange={(e) => { setSortBy(e.target.value); setPage(1); }}>
            <option value="id">Default</option>
            <option value="lastName">Last name</option>
            <option value="creditScore">Credit score (high to low)</option>
            <option value="loanAmount">Loan amount (high to low)</option>
          </select>
        </div>
      </section>

      <p className="count" data-testid="result-count">
        {total} borrower{total === 1 ? '' : 's'}
      </p>

      {error && <p className="error" role="alert">{error}</p>}
      {loading && <p className="loading">Loading…</p>}

      {!loading && results.length === 0 && !error && (
        <p
          className="empty"
          data-testid="empty-state"
          dangerouslySetInnerHTML={{ __html: `No borrowers match "${query}"` }}
        />
      )}

      {results.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>SSN</th>
              {canSeeCreditScore && <th>Credit score</th>}
              <th>Loan amount</th>
              <th>State</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {results.map((b) => (
              <tr key={b.id}>
                <td>{b.firstName} {b.lastName}</td>
                <td>{b.email}</td>
                <td>{maskSsn(b.ssn)}</td>
                {canSeeCreditScore && <td>{b.creditScore}</td>}
                <td>{formatCurrency(b.loanAmount)}</td>
                <td>{b.state}</td>
                <td>
                  {canEditStatus ? (
                    <select
                      aria-label={`Status for ${b.firstName} ${b.lastName}`}
                      value={b.status}
                      onChange={(e) => changeStatus(b.id, e.target.value)}
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  ) : (
                    <span className={`status status--${b.status.toLowerCase()}`}>{b.status}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <nav className="pagination" aria-label="Pagination">
        <button type="button" onClick={() => setPage((p) => p - 1)} disabled={page <= 1}>
          Previous
        </button>
        <span data-testid="page-indicator">Page {page} of {totalPages || 1}</span>
        <button type="button" onClick={() => setPage((p) => p + 1)} disabled={page >= totalPages}>
          Next
        </button>
      </nav>
    </main>
  );
}
