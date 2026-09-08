# Client Onboarding UI — Feature Roadmap

## Vision

A web app for FlipHQ to onboard and manage client agents without touching the command line. The team (and eventually clients) use this to scaffold, configure, deploy, and monitor client agents.

## Tech Stack

| Layer | Choice | Why |
|-------|--------|-----|
| Backend | Node.js + Express | Same stack as client-context-manager, team knows it |
| Frontend | Vanilla HTML + CSS + JS | Fast to iterate, no build step, easy for you to redesign |
| Storage | YAML/JSON files on disk | Same as Hermes profiles, no DB needed |
| Deploy | Shell exec of deploy script | Reuses existing infrastructure |

## Feature Phases

### Phase 1 — Core CRUD + Deploy ✅
- [ ] Dashboard: list all clients with status (running/stopped)
- [ ] Create client: name, slug, description
- [ ] View client: config, channels, MCP tools, status
- [ ] Edit client: update name, description
- [ ] Delete client: remove profile (with confirmation)
- [ ] Deploy client: run deploy script from UI
- [ ] Start/Stop gateway: control agent process
- [ ] Status check: is gateway running, PID, uptime

### Phase 2 — Channel Configuration
- [ ] WhatsApp: add/edit group ID, link to router
- [ ] Slack Connect: add/edit channel ID, workspace
- [ ] Channel status: connected/disconnected, last message
- [ ] Test channel: send test message

### Phase 3 — MCP Tool Configuration
- [ ] Add/remove MCP tools per client
- [ ] Configure credentials (PostHog, GA4, Windsor, Figma, Meta Ads, G Ads)
- [ ] Test MCP connection
- [ ] Tool status: connected/error/disabled

### Phase 4 — Onboarding Wizard
- [ ] Step-by-step flow: Basic Info → Channels → Tools → Review → Deploy
- [ ] Auto-generate config files from wizard input
- [ ] Preview config before deploy
- [ ] One-click deploy after wizard

### Phase 5 — Monitoring & Logs
- [ ] Real-time gateway logs
- [ ] Message history per client
- [ ] Error alerts
- [ ] Performance metrics

### Phase 6 — Client Portal (future)
- [ ] Read-only view for clients to see their agent status
- [ ] Task board view (read-only Notion sync)
- [ ] Message history

## API Design

```
GET    /api/clients                    — list all clients
POST   /api/clients                    — create new client
GET    /api/clients/:slug              — get client details
PUT    /api/clients/:slug              — update client
DELETE /api/clients/:slug              — delete client
POST   /api/clients/:slug/deploy       — deploy client
POST   /api/clients/:slug/start        — start gateway
POST   /api/clients/:slug/stop         — stop gateway
GET    /api/clients/:slug/status       — gateway status
PUT    /api/clients/:slug/channels     — update channels
PUT    /api/clients/:slug/mcp          — update MCP tools
GET    /api/clients/:slug/logs         — gateway logs
```

## File Structure

```
client-onboarding-ui/
├── server.js              # Express API
├── package.json
├── public/
│   ├── index.html         # Dashboard
│   ├── app.js             # Frontend logic
│   └── style.css          # Styles
├── routes/
│   ├── clients.js         # Client CRUD
│   ├── channels.js        # Channel config
│   ├── mcp.js             # MCP tools
│   └── deploy.js          # Deploy + gateway control
├── services/
│   ├── client-service.js  # File operations
│   ├── deploy-service.js  # Shell exec
│   └── gateway-service.js # Process management
└── views/                 # (future) server-rendered pages
```

## Security

- Auth gate (API key or basic auth) — deploy behind Cloudflare Access
- Input validation on all endpoints
- No secrets in logs or API responses
- Confirm destructive actions (delete, stop)
