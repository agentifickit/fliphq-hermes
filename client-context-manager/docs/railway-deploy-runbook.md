# Evolution API (WhatsApp) — Railway Deploy Runbook

This is the "wire it live" step for the WhatsApp context source. Phase 1 (webhook
ingest + pull connector + sync script) is already built and tested; this deploys the
Evolution API listener to Railway and connects the dedicated WhatsApp number.

## Architecture

```
WhatsApp client group
   │  (the FlipHQ number sits in the group, hears everything)
   ▼
Evolution API  (Railway — always-on)
   │  captures every group message into Postgres
   ▼
Local app PULLS via REST (scripts/whatsapp-sync.js, run by the cron)
   │  route group_id → client, dedup, append to data/whatsapp-messages.jsonl
   ▼
Context refresh → groom → Notion task tracker
```

**Why pull, not webhook:** Evolution runs in the cloud; the local app can't receive
inbound webhooks. Pulling via REST matches how Slack/Notion already work.

## Prerequisites

- Railway account (you have $5 credit)
- The dedicated WhatsApp phone number (have it — used only for QR scan)
- `openssl` for generating the API key

## Step 1 — Deploy to Railway

1. Push this repo to GitHub (Railway deploys from the GitHub repo, using only the
   `deploy/railway/Dockerfile` — the app itself stays local and pulls from Railway).
2. Railway → **New Project → Deploy from GitHub repo** → select the repo.
3. Set **Root Directory** to `deploy/railway` (so Railway finds the `railway.json` +
   `Dockerfile` there).
4. Railway builds `atendai/evolution-api:v2.2.1` (pinned in the Dockerfile).

## Step 2 — Attach Postgres

1. In the service, click **Add Plugin → PostgreSQL**.
2. Railway injects `${{Postgres.DATABASE_URL}}` — reference it in the env var
   `DATABASE_CONNECTION_URI` (see below).

## Step 3 — Set environment variables

Add these to the service (Railway → service → Variables). Values come from
`deploy/railway/.env.example`:

| Variable | Value |
|---|---|
| `SERVER_URL` | `https://<your-app>.up.railway.app` (Railway's domain) |
| `SERVER_PORT` | `8080` |
| `AUTHENTICATION_API_KEY` | `openssl rand -hex 32` output |
| `DATABASE_PROVIDER` | `postgresql` |
| `DATABASE_CONNECTION_URI` | `${{Postgres.DATABASE_URL}}` |
| `DATABASE_SAVE_DATA_NEW_MESSAGE` | `true` |
| `DATABASE_SAVE_DATA_INSTANCE` | `true` |
| `DATABASE_SAVE_DATA_CHATS` | `true` |
| `DATABASE_SAVE_DATA_CONTACTS` | `true` |
| `CACHE_REDIS_ENABLED` | `false` |
| `CACHE_LOCAL_ENABLED` | `true` |
| `RABBITMQ_ENABLED` | `false` |

**Known pitfall** (from Evolution issues): if `DATABASE_PROVIDER` is missing or
misspelled, the container crash-loops with `Error: Database provider invalid.` Set it
to exactly `postgresql`.

## Step 4 — Create + connect the instance (pair the number)

Evolution is up. Now create the WhatsApp instance and get the QR:

```bash
# 1. Create the instance (name it fliphq-wa)
curl -X POST "https://<app>.up.railway.app/instance/create" \
  -H "Content-Type: application/json" \
  -H "apikey: <AUTHENTICATION_API_KEY>" \
  -d '{"instanceName":"fliphq-wa","integration":"WHATSAPP-BAILEYS","qrcode":true}'

# 2. Get the QR (returns base64)
curl "https://<app>.up.railway.app/instance/connect/fliphq-wa" \
  -H "apikey: <AUTHENTICATION_API_KEY>"
```

3. Decode the base64 QR, display it, and **scan it from the dedicated number's
   WhatsApp** (Settings → Linked Devices → Link a Device).
4. The instance now shows `open` state (check `GET /instance/fetchInstances`).

The dedicated number is now the "passive listener" — sitting in whatever groups you
add it to.

## Step 5 — Map groups to clients

Add the real group JID to each client's `~/.hermes/../clients/<slug>/.flippy/sources.yaml`:

```yaml
whatsapp:
  enabled: true
  group_id: "1203630123456789@g.us"   # ← the real group id
```

Find group ids: `POST /chat/findChats/fliphq-wa` (filter `remoteJid` ending `@g.us`).

## Step 6 — Wire the local app (pull side)

Add to `~/.hermes/.env` (the local machine, NOT Railway):

```bash
EVOLUTION_API_URL=https://<app>.up.railway.app
EVOLUTION_API_KEY=<same as AUTHENTICATION_API_KEY>
EVOLUTION_INSTANCE_NAME=fliphq-wa
```

Then run the sync (or let the cron do it):

```bash
cd ~/workspace/client-context-manager
node scripts/whatsapp-sync.js
```

This pulls each configured group's history, dedupes by message id, and appends to
`data/whatsapp-messages.jsonl`.

## Step 7 — Schedule the sync

Add the WhatsApp pull to the existing `client-context-refresh` cron (weekdays), so the
cron does Slack + Notion + Drive + WhatsApp in one pass. The skill already documents
WhatsApp as source #2; the sync script is the executable for it.

## Troubleshooting

- **`Error: Database provider invalid`** → `DATABASE_PROVIDER` must be exactly `postgresql`.
- **QR won't scan** → terminal must be 60+ cols; decode base64 to an image first.
- **Session logged out later** → WhatsApp unlinks idle devices; re-pair via
  `/instance/connect/fliphq-wa` and re-scan.
- **Sync returns nothing** → confirm `enabled: true` + real `group_id` in sources.yaml,
  and that the number is actually a member of the group.

## Cost

Railway: ~$5/mo for the app + Postgres (your credit covers the first month). Evolution
itself is free/open-source; WhatsApp messages over the consumer protocol are free (no
Meta per-message pricing, since this is the Baileys path).
