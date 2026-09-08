// FlipHQ Client Onboarding UI — Main Server

import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import clientsRouter from './routes/clients.js';
import channelsRouter from './routes/channels.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 4133;

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '5mb' }));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// API routes
app.use('/api/clients', clientsRouter);
app.use('/api/clients', channelsRouter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, () => {
  console.log(`FlipHQ Client Onboarding UI running on http://localhost:${PORT}`);
});
