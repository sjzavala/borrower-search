import express from 'express';
import cors from 'cors';
import { router } from './routes.js';

const app = express();
const PORT = process.env.PORT ?? 4000;

app.use(cors());
app.use(express.json());
app.use('/api', router);

app.get('/health', (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`Borrower API listening on http://localhost:${PORT}`);
});
