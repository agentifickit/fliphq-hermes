# FlipHQ Hermes

Hermes Agent configuration as code for the FlipHQ GTM ecosystem.

## Profiles

| Profile | Purpose | Slack |
|---------|---------|-------|
| `internal` | FlipHQ team (Pulkit, Arpit, DJ, Vikram, Soumita, Nayna, Shiv) | FlipHQ workspace |
| `clients/template` | Base for client silos | — |
| `clients/*` | Per-client isolated profiles | Client workspace(s) |

Each profile has its own SOUL.md, skills, memory, and gateway config. They share deploy scripts and (optionally) shared skills.

## Quick Start

```bash
# Clone
git clone git@github.com:FlipHQ/fliphq-hermes.git ~/workspace/fliphq-hermes

# Deploy internal profile
cd ~/workspace/fliphq-hermes
./scripts/deploy.sh internal

# Create a new client profile
./scripts/new-client.sh teemgenie "TeemGenie Labs"

# Edit the client profile, then deploy
./scripts/deploy.sh clients/teemgenie
```

## Secrets

Secrets live in `~/.hermes/.env` and are **never** in this repo. The deploy script skips them by design.

| Secret | Source |
|--------|--------|
| `SLACK_BOT_TOKEN` | Slack App settings |
| `SLACK_APP_TOKEN` | Slack App settings |
| `NOTION_TOKEN` | Notion integrations |
| `OPENROUTER_API_KEY` | OpenRouter |
| `MORGENRUF_BEARER` | Morgenruf dashboard |
| `GOOGLE_*` | Google Cloud Console |

When deploying a new profile, manually copy `.env` entries from the active profile or regenerate tokens.

## Running Multiple Profiles

Each profile runs its own gateway process:

```bash
# Internal (background service)
hermes --profile internal gateway install
hermes --profile internal gateway start

# Client (background service)
hermes --profile teemgenie gateway install
hermes --profile teemgenie gateway start

# Or foreground for debugging
hermes --profile internal gateway run
hermes --profile teemgenie gateway run
```

## Directory Structure

```
fliphq-hermes/
├── profiles/
│   ├── internal/              # FlipHQ team
│   │   ├── config.yaml
│   │   ├── SOUL.md
│   │   └── cron-jobs.json
│   └── clients/
│       ├── template/          # Boilerplate for new clients
│       └── <slug>/            # Actual client profiles
├── shared-skills/             # Skills deployed to all profiles
├── plugins/                   # Plugin code (e.g., fliphq-slack)
├── client-context-manager/    # Web UI for non-GitHub team members
├── scripts/
│   ├── deploy.sh              # Deploy repo → ~/.hermes/
│   └── new-client.sh          # Scaffold a new client profile
└── .gitignore                 # Secrets, runtime state, cache
```

## Contributing

1. Edit the relevant profile in the repo.
2. Commit and push to `main`.
3. On the server: `git pull && ./scripts/deploy.sh <profile>`
4. Restart the gateway: `hermes --profile <profile> gateway restart`
