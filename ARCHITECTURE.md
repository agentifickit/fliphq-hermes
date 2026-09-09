# FlipHQ Hermes Architecture

## Overview

FlipHQ runs a multi-agent system where:
- **Flip Copilot** (internal) — the team's agent, lives in Slack
- **Client Agents** (one per client) — isolated agents handling client conversations across WhatsApp and Slack Connect
- **WhatsApp Router** — single WhatsApp number that routes messages to the right client agent

All agents are Hermes profiles. Each profile has its own SOUL.md, memory, skills, MCP servers, and gateway config.

## Principles

1. **One agent per client** — handles all channels (WhatsApp + Slack Connect) for that client
2. **Notion is the task DB** — all tasks live here, synced every 15 min from client conversations
3. **Client agents own their tools** — PostHog, GA4, Windsor, Figma, Ad Accounts are configured per-profile
4. **Flip Copilot orchestrates** — never touches client tools directly, calls client agents via MCP
5. **WhatsApp is the exception** — one number, router profile dispatches by group ID

## Agent Map

```
┌─────────────────────────────────────────────────────────────────┐
│                     FLIP COPILOT (internal)                       │
│  Channel: Slack (#daily-huddle, DMs)                             │
│  Tools: Notion, Slack, Google Workspace, Internal BI             │
│  MCP Clients: one connection to each client agent                │
│  Role: Orchestrate client agents, internal task management       │
└─────────────────────────────────────────────────────────────────┘
          │                    │                    │
          ▼                    ▼                    ▼
   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
   │  TEEMGENIE   │   │  CLIENT B    │   │  CLIENT C    │
   │  AGENT       │   │  AGENT       │   │  AGENT       │
   │              │   │              │   │              │
   │  Channels:   │   │  Channels:   │   │  Channels:   │
   │  ├─ WhatsApp │   │  ├─ WhatsApp │   │  ├─ WhatsApp │
   │  └─ Slack    │   │  └─ Slack    │   │  └─ Slack    │
   │     Connect  │   │     Connect  │   │     Connect  │
   │              │   │              │   │              │
   │  Own Tools:  │   │  Own Tools:  │   │  Own Tools:  │
   │  ├─ PostHog  │   │  ├─ PostHog  │   │  ├─ PostHog  │
   │  ├─ GA4      │   │  ├─ GA4      │   │  ├─ GA4      │
   │  ├─ Windsor  │   │  ├─ Windsor  │   │  ├─ Windsor  │
   │  ├─ Figma    │   │  ├─ Figma    │   │  ├─ Figma    │
   │  ├─ Meta Ads │   │  ├─ Meta Ads │   │  ├─ Meta Ads │
   │  └─ G Ads    │   │  └─ G Ads    │   │  └─ G Ads    │
   │              │   │              │   │              │
   │  MCP Server: │   │  MCP Server: │   │  MCP Server: │
   │  :9001       │   │  :9002       │   │  :9003       │
   └──────────────┘   └──────────────┘   └──────────────┘
          ▲                    ▲                    ▲
          │                    │                    │
   ┌──────┴──────┐      ┌──────┴──────┐      ┌──────┴──────┐
   │  WHATSAPP   │      │  WHATSAPP   │      │  WHATSAPP   │
   │  (group)    │      │  (group)    │      │  (group)    │
   └─────────────┘      └─────────────┘      └─────────────┘
          ▲
          │
   ┌──────┴──────┐
   │  WHATSAPP   │
   │  ROUTER     │
   │  (one #)    │
   └─────────────┘
```

## Profile Structure

```
profiles/
├── internal/                  # Flip Copilot (FlipHQ team)
│   ├── config.yaml
│   ├── SOUL.md
│   └── cron-jobs.json
├── whatsapp-hub/              # WhatsApp router (one number)
│   ├── config.yaml
│   ├── SOUL.md
│   └── group-routing.yaml     # group_id → client mapping
└── clients/
    ├── template/              # Boilerplate for new clients
    │   ├── config.yaml
    │   └── SOUL.md
    └── <slug>/                # Actual client profiles
        ├── config.yaml
        ├── SOUL.md
        └── .env               # Secrets (gitignored)
```

## Communication Patterns

### 1. Client → Client Agent (real-time)
- WhatsApp: Evolution API → Router → Client profile
- Slack Connect: Slack Events API → Client profile
- Client agent responds directly, creates tasks in Notion if actionable

### 2. Flip Copilot → Client Agent (on assignment)
- Flip Copilot calls client agent's MCP server
- Client agent executes, returns result
- Used for: "Get me TeemGenie's campaign performance"

### 3. Client Agent → Notion (15-min sync)
- Cron job syncs conversation summaries to Notion
- Humans see board view of all client activity
- Flip Copilot reads Notion for overview

### 4. Client Agent → Flip Copilot (async)
- Client agent creates task in Notion when it needs internal help
- Flip Copilot picks it up on next check

## MCP Server Ports

| Client | Port |
|--------|------|
| TeemGenie | 9001 |
| Client B | 9002 |
| Client C | 9003 |
| ... | ... |

## Secrets Management

- Each client profile has its own `.env` (gitignored)
- Tokens for PostHog, GA4, Windsor, Figma, Ad Accounts live here
- Flip Copilot's `.env` has internal tokens only
- No cross-client token leakage

## Adding a New Client

1. **Scaffold**: `./scripts/new-client.sh <slug> "<Client Name>"`
2. **Configure channels**: Add WhatsApp group ID to `group-routing.yaml`, set up Slack Connect
3. **Configure tools**: Add MCP servers to client's `config.yaml` with client's credentials
4. **Deploy**: `./scripts/deploy.sh clients/<slug>`
5. **Start**: `hermes --profile <slug> gateway run`
6. **Register**: Add MCP connection to Flip Copilot's config

## Context Flow

```
WhatsApp message from TeemGenie
    │
    ▼
Evolution API → Router (whatsapp-hub)
    │
    ├─→ Stores raw message in ~/clients/teemgenie/data/whatsapp-inbox.jsonl
    ├─→ Sends acknowledgment to client
    └─→ Creates task in Notion if actionable
    │
    ▼
TeemGenie agent polls inbox (5 min) OR gets notified
    │
    ├─→ Reads WhatsApp context + Slack Connect context + Notion context
    ├─→ Generates response
    └─→ Sends response via Evolution API (WhatsApp) or Slack API
    │
    ▼
15-min cron: Sync context summary to Notion
```

## Security & Isolation

- Each profile has its own Hermes home (sessions, memory, state)
- Client agents cannot access each other's data
- Flip Copilot accesses client data only via MCP (audited, scoped)
- Secrets are per-profile, never shared
- Notion access is scoped per client (read-only client context, read-write tasks)

## Repo vs Live

| Location | What | Versioned? |
|----------|------|------------|
| `github.com/FlipHQ/fliphq-hermes` | Sanitized profiles (no secrets) | ✓ |
| `~/.hermes/profiles/<name>/` | Live profiles (with .env) | — |
| `~/clients/<slug>/data/` | Raw conversation data | — |

## Management UI

The `client-context-manager` web app provides:
- Client onboarding wizard (scaffold + configure)
- Channel mapping (WhatsApp group ID, Slack Connect channel)
- MCP tool configuration (PostHog, GA4, Windsor, Figma, Ad Accounts)
- Deploy button (runs deploy script)
- Status dashboard (all client agents, connection state)

See `client-context-manager/README.md` for setup.
