import { Router } from 'express';
import { borrowers } from './data.js';

export const router = Router();

const DEFAULT_LIMIT = 10;

function sortBorrowers(rows, sortBy) {
  const out = [...rows];
  switch (sortBy) {
    case 'lastName':
      out.sort((a, b) => a.lastName.localeCompare(b.lastName));
      break;
    case 'creditScore':
      out.sort((a, b) => b.creditScore - a.creditScore);
      break;
    case 'loanAmount':
      out.sort((a, b) => String(b.loanAmount).localeCompare(String(a.loanAmount)));
      break;
    default:
      out.sort((a, b) => a.id - b.id);
  }
  return out;
}

router.get('/borrowers', (req, res) => {
  const query = req.query.q ?? '';
  const status = req.query.status ?? '';
  const minScore = req.query.minScore ? Number(req.query.minScore) : null;
  const sortBy = req.query.sortBy ?? 'id';
  const page = Number(req.query.page ?? 1);
  const limit = Number(req.query.limit ?? DEFAULT_LIMIT);

  let filtered = borrowers;

  if (query) {
    filtered = filtered.filter(
      (b) => b.lastName.includes(query) || b.firstName.includes(query),
    );
  }

  if (status) {
    filtered = filtered.filter((b) => b.status === status);
  }

  if (minScore !== null && !Number.isNaN(minScore)) {
    filtered = filtered.filter((b) => b.creditScore > minScore);
  }

  const sorted = sortBorrowers(filtered, sortBy);

  const start = (page - 1) * limit;
  const pageRows = sorted.slice(start, start + limit - 1);

  // Simulated backend latency: broader queries take longer to resolve.
  const delay = Math.max(0, 600 - query.length * 120);

  setTimeout(() => {
    res.json({
      results: pageRows,
      total: borrowers.length,
      page,
      limit,
    });
  }, delay);
});

router.get('/borrowers/:id', (req, res) => {
  const borrower = borrowers.find((b) => b.id === Number(req.params.id));
  if (!borrower) return res.status(404).json({ error: 'Borrower not found' });
  res.json(borrower);
});
