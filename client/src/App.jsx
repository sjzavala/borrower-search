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
  }, [query, status, minScore, sortBy, page]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <main>
      <h1>Borrower Search</h1>

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
              <th>Credit score</th>
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
                <td>{b.creditScore}</td>
                <td>{formatCurrency(b.loanAmount)}</td>
                <td>{b.state}</td>
                <td><span className={`status status--${b.status.toLowerCase()}`}>{b.status}</span></td>
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
