// FlipHQ Client Onboarding UI — Main Server

import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import clientsRouter from './routes/clients.js';
import channelsRouter from './routes/channels.js';
import mcpRouter from './routes/mcp.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 4133;

// Build version — git commit hash + timestamp (changes every deploy)
const BUILD_VERSION = (() => {
  try {
    const hash = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
    return hash;
  } catch {
    return Date.now().toString();
  }
})();

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '5mb' }));

// Inject build version into all rendered HTML
app.use((req, res, next) => {
  res.locals.buildVersion = BUILD_VERSION;
  next();
});

// Static files — aggressive cache busting for assets, no-cache for HTML
app.use(express.static(path.join(__dirname, 'public'), {
  etag: true,
  lastModified: true,
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    } else {
      // JS/CSS cached but validated with ETag
      res.setHeader('Cache-Control', 'public, must-revalidate');
    }
  },
}));

// API routes
app.use('/api/clients', clientsRouter);
app.use('/api/clients', channelsRouter);
app.use('/api/clients', mcpRouter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    build: BUILD_VERSION, 
    env: process.env.NODE_ENV || 'production',
    timestamp: new Date().toISOString() 
  });
});

// Start server
app.listen(PORT, () => {
  const env = process.env.NODE_ENV || 'production';
  const envBadge = env !== 'production' ? ` [${env.toUpperCase()}]` : '';
  console.log(`FlipHQ Client Onboarding UI running on http://localhost:${PORT}${envBadge} (build: ${BUILD_VERSION})`);
});
