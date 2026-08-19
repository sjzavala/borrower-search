import express from 'express';
import cors from 'cors';
import { router } from './routes.js';
import { borrowers } from './data.js';

const app = express();
const PORT = process.env.PORT ?? 4000;

app.use(cors());
app.use(express.json());
app.use('/api', router);

// A health check that only reports `ok` cannot distinguish a healthy API from one
// serving an empty dataset, which is the failure a smoke test most needs to catch.
app.get('/health', (_req, res) =>
  res.json({ ok: borrowers.length > 0, borrowers: borrowers.length }),
);

app.listen(PORT, () => {
  console.log(`Borrower API listening on http://localhost:${PORT}`);
});
