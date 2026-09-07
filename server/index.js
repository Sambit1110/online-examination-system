import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import authRouter from './routes/auth.js';
import questionsRouter from './routes/questions.js';
import examsRouter from './routes/exams.js';
import conductRouter from './routes/conduct.js';
import resultsRouter from './routes/results.js';
import adminRouter from './routes/admin.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
// Default 5050 (not 5000) — macOS Control Center's AirPlay Receiver binds
// port 5000 on many Macs by default, which silently breaks local dev if this
// server can't claim it. Override with the PORT env var if 5050 also conflicts.
const PORT = process.env.PORT || 5050;

// Middleware
app.use(cors());
app.use(express.json());

// API Routes
app.use('/api/auth', authRouter);
app.use('/api/questions', questionsRouter);
app.use('/api/exams', examsRouter);
app.use('/api/conduct', conductRouter);
app.use('/api/results', resultsRouter);
app.use('/api/admin', adminRouter);

// Health Check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    system: 'Adamas University Online Examination System',
    timestamp: new Date().toISOString()
  });
});

// Serve static assets in production if built
const clientDist = path.resolve(__dirname, '../dist');
app.use(express.static(clientDist));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(clientDist, 'index.html'), (err) => {
    if (err) next();
  });
});

// Centralized error handler
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);
  res.status(500).json({ error: 'Internal server error: ' + (err.message || 'Unknown error') });
});

const isMainModule = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMainModule && !process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`=== Adamas University Online Examination System Backend ===`);
    console.log(`Server running securely on http://localhost:${PORT}`);
    console.log(`Database engine: Native node:sqlite (ACID & WAL mode enabled)`);
  });
}

export default app;
