// FlipHQ Client Onboarding UI — Main Server

import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { createProxyMiddleware } from './proxy-wa-manager.js';
import clientsRouter from './routes/clients.js';
import channelsRouter from './routes/channels.js';
import mcpRouter from './routes/mcp.js';
import webhookRouter from './routes/webhook.js';

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

// Inject build version into HTML
app.use((req, res, next) => {
  res.locals.buildVersion = BUILD_VERSION;
  next();
});

// Serve index.html with injected build version
app.get('/', (req, res, next) => {
  const accept = req.headers.accept || '';
  const isApiRequest = req.headers['apikey'] || 
    accept.includes('application/json') || 
    accept.includes('*/*') ||
    !accept.includes('text/html');
  
  // Proxy to Evolution API for any non-HTML request (Manager UI test, API calls)
  if (isApiRequest) {
    createProxyMiddleware()(req, res);
    return;
  }
  
  const html = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8')
    .replace(/__BUILD_VERSION__/g, BUILD_VERSION);
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.send(html);
});

// Evolution Manager UI — proxy everything to http://localhost:8080
// MUST be before express.static to avoid being intercepted
app.use('/manager', createProxyMiddleware(''));

// Catch-all: proxy any request with apikey to Evolution API root
// (handles Manager UI API calls like /instance/fetchInstances)
app.use((req, res, next) => {
  if (req.headers['apikey']) {
    createProxyMiddleware()(req, res);
    return;
  }
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

// Evolution API webhook receiver (WhatsApp messages)
app.use('/webhook', webhookRouter);

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
