# FlipHQ Client Context Manager

A self-hosted web dashboard to view, search, and edit the context of every FlipHQ
client in one place. It reads the existing `~/clients/<slug>/` workspaces directly —
no new database, no copy of Notion. AGENTS.md compass files, briefs, reports, and
config all live where they already do; this is just a fast window onto them.

## Why this exists

FlipHQ's client context already lives in structured workspaces under `~/clients/`
(AGENTS.md compass + `briefs/` + `reports/` + `data/` + `.flippy/sources.yaml`),
kept fresh by the daily `client-context-refresh` cron. This app is the management
surface on top of that: see all clients, jump into any file, edit it in place, and
search across every client from one box.

## Features

- **Client sidebar** — every workspace under `~/clients/`, sorted by last activity
- **Git-style file drawer** — every client workspace is a real git repo: `main` + feature
  branches, branch switching/creation, commit history, unified diff, and merge-to-main
  with conflict detection
- **Markdown rendering** — `.md` files render formatted; `.yaml`/`.json`/`.csv`
  render as preserved monospace so data files don't get mangled
- **Inline editing** — click Edit, save with Cmd/Ctrl+S or the Save button (each save
  auto-commits to the current branch)
- **Cross-client search** — live search with highlighted snippets, click a result
  to jump straight to that file
- **New client** — scaffolds a full workspace (AGENTS.md + briefs + reports + config)
  from the same templates the `client-workspaces` skill uses, and inits a git repo
- **Path-safe** — every file read/write is resolved and verified to stay inside the
  target client's directory; traversal attempts are rejected

## Context sources & task grooming

The client context is fed by four sources, which drive a **task-grooming** step that
triages work into each client's Notion tracker (linked to FlipHQ's sprint):

| Source | Status |
|---|---|
| Slack — internal + client-facing channels | ✅ wired |
| Notion — tasks + call transcripts | ✅ wired (IDs in `~/clients/.flippy/notion-map.yaml`) |
| WhatsApp — client group conversations | 🔧 **chosen backend: Evolution API** (self-hosted Baileys; see `docs/whatsapp-evolution-api.md`) |
| Google Drive | ✅ OAuth via `google-workspace` skill |

**Notion trackers** — the single source of truth for IDs is
`~/clients/.flippy/notion-map.yaml`. Each client's `.flippy/sources.yaml` carries a
`notion_trackers` block (task tracker + sprint + call-transcript DB). Shared core:
`Sprints` (22d71e…), `Tasks` (2b5229…, `Sprint` relation → Sprints), `FlipHQ Meetings`
(2ef229…, call transcripts).

**WhatsApp** runs on **Evolution API** (self-hosted Baileys — a dedicated FlipHQ
number sits in each client group, no Meta Cloud API's 8-participant cap). Architecture:
Evolution lives on Railway (always-on), captures group messages to Postgres, and the
local cron **pulls** via `scripts/whatsapp-sync.js` (routes `group_id` → client, dedups,
appends to `data/whatsapp-messages.jsonl`). A push/webhook path also exists at
`POST /api/whatsapp/webhook` for when Evolution runs locally.

- Deploy scaffold: `deploy/railway/` (Dockerfile, `.env.example` with the dedicated
  number as a commented placeholder, `railway.json`)
- Step-by-step: `docs/railway-deploy-runbook.md`
- Connectors: `connectors/evolution.js` (REST pull client), `connectors/whatsapp.js`
  (parse/route/capture)

Connector status (incl. per-client WhatsApp group mapping) is exposed at
`GET /api/connectors/status`.

## The git model

Each client workspace under `~/clients/<slug>/` is a real git repository. `main` is the
approved/current context. Incoming context (from the refresh cron, manual edits, or future
Slack/Notion/WhatsApp ingest) lands as commits on a feature branch; you review the diff and
merge into `main`. The API shells out to the system `git` binary via `execFileSync` (no
shell → no injection), so branches/merges/history are real git semantics with a real
audit trail.

Git API endpoints:

- `GET  /api/clients/:slug/git/status` — current branch, uncommitted changes, ahead-of-main
- `GET  /api/clients/:slug/git/branches` — list branches
- `POST /api/clients/:slug/git/branches` — create + checkout a branch
- `POST /api/clients/:slug/git/checkout` — switch branch
- `GET  /api/clients/:slug/git/log` — commit history
- `GET  /api/clients/:slug/git/diff?base=&head=` — unified diff
- `POST /api/clients/:slug/git/commit` — commit working tree with a message
- `POST /api/clients/:slug/git/merge` — merge a branch into `main` (or a target)

## Run

```bash
cd ~/workspace/client-context-manager
npm install          # first time only
npm start            # serves on http://localhost:4131
```

Or start it in the background and leave it running:

```bash
./start.sh
```

Open **http://localhost:4131** in your browser.

## Configuration

Environment variables (optional):

| Var | Default | Purpose |
|---|---|---|
| `PORT` | `4131` | Port to bind |
| `CLIENTS_ROOT` | `~/clients` | Directory containing client workspaces |

## Architecture

- `server.js` — Express API over the clients directory
  - `GET  /api/clients` — list all clients with activity metadata
  - `GET  /api/clients/:slug` — full tree + all text file contents
  - `GET  /api/clients/:slug/files/*` — read one file
  - `PUT  /api/clients/:slug/files/*` — write one file
  - `POST /api/clients` — scaffold a new workspace
  - `GET  /api/search?q=` — search all clients
- `public/` — static frontend (vanilla JS, no build step), `marked` for markdown

## Notes

- This reads and writes the same files the context-refresh cron maintains, so edits
  made here are picked up by the refresh on its next run and vice-versa.
- Only text files (`.md`, `.yaml`, `.json`, `.csv`, etc.) are exposed; assets/ images
  and binaries are excluded from the file tree.
- Guardrails apply: this app never surfaces contract terms, retainers, billing, or
  customer PII beyond what's already in the workspace files. Don't put those in
  AGENTS.md or briefs.
