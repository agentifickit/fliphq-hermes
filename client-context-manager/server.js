import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import {
  getStatus as getWhatsAppStatus,
  resolveClientForGroup,
  listGroupMappings,
  parseEvolutionWebhook,
  ingestMessages,
} from './connectors/whatsapp.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 4131;
const CLIENTS_ROOT = process.env.CLIENTS_ROOT || path.join(process.env.HOME, 'clients');

const app = express();
app.use(express.json({ limit: '5mb' }));

// Serve the frontend
app.use(express.static(path.join(__dirname, 'public')));
// Serve marked for client-side markdown rendering
app.use('/vendor/marked', express.static(
  path.join(__dirname, 'node_modules', 'marked', 'lib')
));

const TEXT_EXTENSIONS = new Set([
  '.md', '.markdown', '.yaml', '.yml', '.json', '.txt', '.csv',
  '.html', '.css', '.js', '.ts', '.toml', '.xml', '.tsv',
]);

// ---------- Helpers ----------

function slugify(name) {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function clientRoot(slug) {
  return path.join(CLIENTS_ROOT, slug);
}

function safeResolve(slug, rel) {
  const base = clientRoot(slug);
  const target = path.resolve(base, rel || '');
  if (target !== base && !target.startsWith(base + path.sep)) {
    const err = new Error('Path escapes client workspace');
    err.status = 400;
    throw err;
  }
  return target;
}

function isTextFile(p) {
  return TEXT_EXTENSIONS.has(path.extname(p).toLowerCase());
}

// Recursively walk a directory, returning a nested tree of { name, path, type, children }.
function walk(dir, rel = '') {
  let entries = [];
  let list;
  try {
    list = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return entries;
  }
  list.sort((a, b) => {
    if (a.isDirectory() && !b.isDirectory()) return -1;
    if (!a.isDirectory() && b.isDirectory()) return 1;
    return a.name.localeCompare(b.name);
  });
  for (const ent of list) {
    // hide hidden dirs/files except .flippy (operational config)
    if (ent.name.startsWith('.') && ent.name !== '.flippy') continue;
    const relPath = rel ? `${rel}/${ent.name}` : ent.name;
    if (ent.isDirectory()) {
      entries.push({
        name: ent.name,
        path: relPath,
        type: 'dir',
        children: walk(path.join(dir, ent.name), relPath),
      });
    } else if (isTextFile(ent.name)) {
      entries.push({ name: ent.name, path: relPath, type: 'file' });
    }
  }
  return entries;
}

function clientMeta(slug) {
  const root = clientRoot(slug);
  if (!fs.existsSync(root)) return null;
  let agentsMtime = null;
  const agentsPath = path.join(root, 'AGENTS.md');
  if (fs.existsSync(agentsPath)) {
    agentsMtime = fs.statSync(agentsPath).mtime.toISOString();
  }
  let latest = agentsMtime;
  function newest(dir) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.name === '.git') continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { newest(p); continue; }
      const m = fs.statSync(p).mtime.toISOString();
      if (!latest || m > latest) latest = m;
    }
  }
  newest(root);
  return { slug, root, agentsMtime, latestActivity: latest };
}

// ---------- Git helpers ----------

function requireRepo(slug) {
  const root = clientRoot(slug);
  if (!fs.existsSync(path.join(root, '.git'))) {
    const err = new Error('Client workspace is not a git repository');
    err.status = 400;
    throw err;
  }
  return root;
}

// Run git in a client workspace. Uses execFileSync (no shell → no injection).
function runGit(slug, args) {
  const root = requireRepo(slug);
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  } catch (e) {
    const msg = ((e.stderr || '') + '\n' + (e.stdout || '')).trim() || e.message || 'git command failed';
    const err = new Error(msg);
    err.status = 400;
    throw err;
  }
}

// ---------- API ----------

// List all clients
app.get('/api/clients', (req, res) => {
  if (!fs.existsSync(CLIENTS_ROOT)) return res.json({ clients: [] });
  const entries = fs.readdirSync(CLIENTS_ROOT, { withFileTypes: true });
  const clients = entries
    .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
    .map((e) => clientMeta(e.name))
    .filter(Boolean)
    .sort((a, b) => (b.latestActivity || '').localeCompare(a.latestActivity || ''));
  res.json({ clients });
});

// Get a client's full workspace (tree + all text file contents)
app.get('/api/clients/:slug', (req, res) => {
  const { slug } = req.params;
  const meta = clientMeta(slug);
  if (!meta) return res.status(404).json({ error: `Client '${slug}' not found` });
  const tree = walk(meta.root);
  const files = {};
  function collect(nodes) {
    for (const ent of nodes) {
      if (ent.type === 'file') {
        const p = path.join(meta.root, ent.path);
        try { files[ent.path] = fs.readFileSync(p, 'utf8'); } catch { /* skip unreadable */ }
      } else if (ent.type === 'dir' && ent.children) {
        collect(ent.children);
      }
    }
  }
  collect(tree);
  res.json({ ...meta, tree, files });
});

// Read a single file
app.get('/api/clients/:slug/files/*', (req, res) => {
  const { slug } = req.params;
  const rel = req.params[0] || '';
  if (!clientMeta(slug)) return res.status(404).json({ error: `Client '${slug}' not found` });
  const target = safeResolve(slug, rel);
  if (!fs.existsSync(target)) return res.status(404).json({ error: 'File not found' });
  if (!isTextFile(target)) return res.status(415).json({ error: 'Not a text file' });
  res.json({ path: rel, content: fs.readFileSync(target, 'utf8') });
});

// Write a file (and auto-commit to the current branch)
app.put('/api/clients/:slug/files/*', (req, res) => {
  const { slug } = req.params;
  const rel = req.params[0] || '';
  if (!clientMeta(slug)) return res.status(404).json({ error: `Client '${slug}' not found` });
  const { content, message } = req.body || {};
  if (typeof content !== 'string') return res.status(400).json({ error: 'Missing content' });
  const target = safeResolve(slug, rel);
  if (!isTextFile(target)) return res.status(415).json({ error: 'Not an editable text file' });
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, 'utf8');

  let commit = null;
  let commitError = null;
  try {
    runGit(slug, ['add', '-A']);
    runGit(slug, ['commit', '-m', message || ('Update ' + rel)]);
    commit = runGit(slug, ['rev-parse', '--short', 'HEAD']);
  } catch (e) {
    if (!/nothing to commit/i.test(e.message)) commitError = e.message;
  }
  res.json({ ok: true, path: rel, savedAt: new Date().toISOString(), commit, commitError });
});

// Create a new client workspace
app.post('/api/clients', (req, res) => {
  const { name, pillar } = req.body || {};
  if (!name || typeof name !== 'string') return res.status(400).json({ error: 'Client name required' });
  const slug = slugify(name);
  if (!slug) return res.status(400).json({ error: 'Invalid client name' });
  const root = clientRoot(slug);
  if (fs.existsSync(root)) return res.status(409).json({ error: `Client '${slug}' already exists`, slug });

  const dirs = ['briefs/meeting-notes', 'reports', 'data', 'assets', '.flippy'];
  for (const d of dirs) fs.mkdirSync(path.join(root, d), { recursive: true });

  const cleanName = name.trim();
  const agents = [
    `# AGENTS.md — ${cleanName}`,
    `Client: ${cleanName} · Pillar: ${pillar || '<Flip Funnel / PluralHire / GTMOps / Agentific>'}`,
    `GTM Principal: <Name> · Account lead: <Name>`,
    `Slack: #<internal-channel> (<ID>) | #<client-channel> (<ID>, read-only)`,
    `Website: <url> · Engagement: <brief description>`,
    '',
    '## Snapshot',
    '<2-3 sentences describing what the client does, their market, and FlipHQ\'s role>',
    '',
    '## Where to find detail',
    '- Campaigns & active workstreams: `briefs/campaign-status.md`',
    '- Pricing strategy: `briefs/pricing-strategy.md`',
    '- Outreach pipeline: `briefs/outreach-pipeline.md`',
    '- Meeting notes: `briefs/meeting-notes/`',
    '- Performance reports: `reports/`',
    '- Flippy operational config: `.flippy/sources.yaml`',
    '',
    '## What they sell',
    '- <Primary product/service>',
    '',
    '## ICP & buyers',
    '- <Firmographics: size, stage, geography, funding>',
    '- <Industries>',
    '',
    '## Positioning',
    '- <Key differentiators vs competitors>',
    '',
    '## Goals / KPIs',
    '- <Primary KPI: target>',
    '',
    '## Key people',
    '- **Client:** <names and roles>',
    '- **FlipHQ:** <names and roles>',
    '',
    '## Data & tools',
    '- Site: <platform>',
    '- Channels: <paid, organic, SEO>',
    '',
    '## Brand & voice',
    '- <Tone, style, personality>',
    '',
    '## Guardrails',
    '- Internal channel — draft here; a human ships externally.',
    '- **Never** share: contract terms, pricing, customer PII, unpublished case studies,',
    '  service agreements, retainers, billing, invoices.',
    '- Cross-client filter active — ' + cleanName + ' content only.',
    '',
  ].join('\n');

  const sources = [
    `# ${cleanName} — Context Refresh Sources`,
    'client: ' + cleanName,
    'workspace: ' + root,
    '',
    'slack_channels:',
    '  - id: "<INTERNAL_CHANNEL_ID>"',
    '    label: "' + cleanName + ' Internal"',
    '    mode: full',
    '  - id: "<CLIENT_CHANNEL_ID>"',
    '    label: "' + cleanName + ' Client"',
    '    mode: read_only',
    '',
    'notion_search_queries:',
    '  - "' + cleanName + '"',
    '',
    'notion_databases:',
    '  - id: "<MEETING_NOTES_DB_ID>"',
    '    label: "Meeting Notes"',
    '',
    'google_drive_queries:',
    '  - "' + cleanName + '"',
    '',
  ].join('\n');

  fs.writeFileSync(path.join(root, 'AGENTS.md'), agents, 'utf8');
  fs.writeFileSync(path.join(root, '.flippy', 'sources.yaml'), sources, 'utf8');
  fs.writeFileSync(path.join(root, 'briefs', 'campaign-status.md'), '# Campaign Status\n\n_No active workstreams yet._\n', 'utf8');
  fs.writeFileSync(path.join(root, 'briefs', 'pricing-strategy.md'), '# Pricing Strategy\n\n_To be filled._\n', 'utf8');
  fs.writeFileSync(path.join(root, 'briefs', 'outreach-pipeline.md'), '# Outreach Pipeline\n\n_To be filled._\n', 'utf8');

  // initialize git repo + initial commit
  try {
    runGit(slug, ['init', '-q', '-b', 'main']);
    runGit(slug, ['add', '-A']);
    runGit(slug, ['commit', '-q', '-m', 'Initial context snapshot']);
  } catch { /* git not critical for workspace creation */ }

  res.status(201).json({ ok: true, slug, root });
});

// Search across all clients
app.get('/api/search', (req, res) => {
  const q = (req.query.q || '').toString().trim();
  if (q.length < 2) return res.json({ query: q, results: [] });
  const needle = q.toLowerCase();
  const results = [];
  const clients = fs.readdirSync(CLIENTS_ROOT, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
    .map((e) => e.name);

  for (const slug of clients) {
    const root = clientRoot(slug);
    const entries = walk(root);
    for (const ent of entries) {
      if (ent.type !== 'file') continue;
      const p = path.join(root, ent.path);
      let content;
      try { content = fs.readFileSync(p, 'utf8'); } catch { continue; }
      const lower = content.toLowerCase();
      const idx = lower.indexOf(needle);
      if (idx === -1) continue;
      const start = Math.max(0, idx - 60);
      const end = Math.min(content.length, idx + q.length + 120);
      let snippet = content.slice(start, end).replace(/\n+/g, ' ');
      if (start > 0) snippet = '…' + snippet;
      if (end < content.length) snippet = snippet + '…';
      results.push({ slug, file: ent.path, snippet });
    }
  }
  res.json({ query: q, results: results.slice(0, 100), total: results.length });
});

// ---------- Git API ----------

app.get('/api/clients/:slug/git/status', (req, res) => {
  const { slug } = req.params;
  const branch = runGit(slug, ['branch', '--show-current']);
  const changes = runGit(slug, ['status', '--porcelain']).split('\n').filter(Boolean).length;
  let aheadOfMain = 0;
  try {
    aheadOfMain = runGit(slug, ['log', '--oneline', 'main..HEAD']).split('\n').filter(Boolean).length;
  } catch { /* no main or no divergence */ }
  res.json({ branch, changes, aheadOfMain });
});

app.get('/api/clients/:slug/git/branches', (req, res) => {
  const { slug } = req.params;
  const current = runGit(slug, ['branch', '--show-current']);
  const out = runGit(slug, ['branch', '--format=%(refname:short)']);
  res.json({ current, branches: out.split('\n').filter(Boolean) });
});

app.post('/api/clients/:slug/git/branches', (req, res) => {
  const { slug } = req.params;
  const { name } = req.body || {};
  if (!name || !/^[A-Za-z0-9._/-]+$/.test(name)) {
    return res.status(400).json({ error: 'Invalid branch name (letters, numbers, . _ - / only)' });
  }
  runGit(slug, ['checkout', '-b', name]);
  res.json({ ok: true, branch: name });
});

app.post('/api/clients/:slug/git/checkout', (req, res) => {
  const { slug } = req.params;
  const { branch } = req.body || {};
  if (!branch) return res.status(400).json({ error: 'Branch required' });
  runGit(slug, ['checkout', branch]);
  res.json({ ok: true, branch });
});

app.get('/api/clients/:slug/git/log', (req, res) => {
  const { slug } = req.params;
  const branch = req.query.branch || 'HEAD';
  const out = runGit(slug, ['log', '--pretty=format:%h%x1f%an%x1f%ad%x1f%s', '--date=short', '-30', branch]);
  const commits = out.split('\n').filter(Boolean).map((line) => {
    const parts = line.split('\x1f');
    return { hash: parts[0], author: parts[1], date: parts[2], message: parts.slice(3).join('\x1f') };
  });
  res.json({ commits });
});

app.get('/api/clients/:slug/git/diff', (req, res) => {
  const { slug } = req.params;
  const base = req.query.base || 'main';
  const head = req.query.head || 'HEAD';
  let diff = '';
  let stat = '';
  try {
    diff = runGit(slug, ['diff', `${base}...${head}`]);
    stat = runGit(slug, ['diff', '--stat', `${base}...${head}`]);
  } catch { /* no changes or bad ref */ }
  res.json({ base, head, diff, stat });
});

app.post('/api/clients/:slug/git/commit', (req, res) => {
  const { slug } = req.params;
  const { message } = req.body || {};
  if (!message) return res.status(400).json({ error: 'Commit message required' });
  runGit(slug, ['add', '-A']);
  try {
    runGit(slug, ['commit', '-m', message]);
  } catch (e) {
    if (/nothing to commit/i.test(e.message)) return res.json({ ok: true, empty: true });
    throw e;
  }
  res.json({ ok: true, hash: runGit(slug, ['rev-parse', '--short', 'HEAD']) });
});

app.post('/api/clients/:slug/git/merge', (req, res) => {
  const { slug } = req.params;
  const { branch, into } = req.body || {};
  if (!branch) return res.status(400).json({ error: 'Branch to merge required' });
  const target = into || 'main';
  const original = runGit(slug, ['branch', '--show-current']);
  try {
    runGit(slug, ['checkout', target]);
    runGit(slug, ['merge', '--no-ff', '-m', `Merge ${branch} into ${target}`, branch]);
  } catch (e) {
    try { runGit(slug, ['merge', '--abort']); } catch {}
    try { runGit(slug, ['checkout', original]); } catch {}
    let conflicts = [];
    try {
      conflicts = runGit(slug, ['diff', '--name-only', '--diff-filter=U']).split('\n').filter(Boolean);
    } catch {}
    const err = new Error('Merge conflict: ' + e.message);
    err.status = 409;
    err.conflicts = conflicts;
    throw err;
  }
  res.json({ ok: true, merged: branch, into: target, nowOn: target });
});

// ---------- WhatsApp webhook (Evolution API) ----------

// Receives MESSAGES_UPSERT events from a live Evolution API instance. Group
// messages are routed to the matching client by group_id and appended to that
// client's raw capture file (data/whatsapp-messages.jsonl).
//
// Evolution POSTs to this URL (configured via its /webhook/set endpoint). We
// accept the standard Evolution envelope: { event, instance, data: {...}, ... }.
app.post('/api/whatsapp/webhook', (req, res) => {
  const body = req.body || {};
  const event = body.event || '';

  // Only handle message upserts (not connection/status events) — but always 200
  // so Evolution doesn't retry.
  if (event && event !== 'MESSAGES_UPSERT' && event !== 'messages.upsert') {
    return res.json({ ok: true, ignored: true, reason: `event=${event}` });
  }

  const parsed = parseEvolutionWebhook(body);
  if (!parsed.messages.length) {
    // Not a group message (DM) or no messages — ack without action.
    return res.json({ ok: true, ignored: true, reason: 'no group messages' });
  }

  const groupId = parsed.messages[0].groupId;
  const client = resolveClientForGroup(groupId, CLIENTS_ROOT);
  if (!client) {
    // Unmapped group — log and ack (don't drop silently in prod, but don't fail).
    console.warn(`[whatsapp] unmapped group ${groupId} — no client has this group_id in sources.yaml`);
    return res.json({ ok: true, unmapped: true, groupId });
  }

  const result = ingestMessages(client.slug, parsed.messages, CLIENTS_ROOT);
  res.json({
    ok: true,
    client: client.slug,
    groupId,
    captured: result.written,
    file: result.path,
  });
});

// Read the raw WhatsApp capture for a client (for the app + debugging).
app.get('/api/clients/:slug/whatsapp-messages', (req, res) => {
  const { slug } = req.params;
  if (!clientMeta(slug)) return res.status(404).json({ error: `Client '${slug}' not found` });
  const file = path.join(clientRoot(slug), 'data', 'whatsapp-messages.jsonl');
  if (!fs.existsSync(file)) return res.json({ slug, messages: [] });
  const messages = fs.readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => { try { return JSON.parse(line); } catch { return null; } })
    .filter(Boolean);
  res.json({ slug, count: messages.length, messages: messages.slice(-500) });
});

// ---------- Connector status ----------

app.get('/api/connectors/status', (req, res) => {
  const hasEnv = (k) => !!(process.env[k] && process.env[k].trim());
  res.json({
    connectors: {
      slack: {
        wired: hasEnv('SLACK_BOT_TOKEN'),
        note: hasEnv('SLACK_BOT_TOKEN') ? 'Bot token present' : 'Missing SLACK_BOT_TOKEN',
      },
      notion: {
        wired: hasEnv('NOTION_API_KEY') || hasEnv('NOTION_API_TOKEN'),
        note: (hasEnv('NOTION_API_KEY') || hasEnv('NOTION_API_TOKEN')) ? 'API key present' : 'Missing NOTION_API_KEY',
      },
      google_drive: {
        wired: false, // OAuth-backed; not introspectable from env alone
        note: 'OAuth via google-workspace skill',
      },
      whatsapp: {
        ...getWhatsAppStatus(),
        group_mappings: listGroupMappings(CLIENTS_ROOT),
      },
    },
  });
});

// ---------- Error handler ----------
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  const status = err.status || 500;
  res.status(status).json({ error: err.message || 'Server error', conflicts: err.conflicts });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`FlipHQ Client Context Manager running on http://localhost:${PORT}`);
  console.log(`Serving clients from: ${CLIENTS_ROOT}`);
});
