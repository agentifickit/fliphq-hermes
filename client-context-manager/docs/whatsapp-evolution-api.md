# WhatsApp Context Source — Evolution API (chosen backend)

Decision (2026-08-25): use **Evolution API** (self-hosted Baileys wrapper) so a
dedicated FlipHQ WhatsApp number sits *inside* each client group and listens on the
full group context. Compliance treated as a non-issue — closed client groups, not
mass messaging.

Replaces the earlier "Meta Cloud API Groups API" direction (which caps groups at 8
participants and requires an Official Business Account). Evolution API removes both
constraints by using the consumer WhatsApp protocol via Baileys.

## What Evolution API is

Open source (github.com/evolution-foundation/evolution-api), self-hosted REST API
wrapping the Baileys library. Multi-channel, but we use the WhatsApp channel.

- Docs: https://docs.evolutionfoundation.com.br/
- Docker: `evoapicloud/evolution-api:latest` (default port 8080)
- Optional: Postgres + Redis (for multi-instance scale; a single FlipHQ number can
  run with the default in-memory/JSON store)

## Instance & auth model

- **Instance** = one connected WhatsApp number. We run one instance (the FlipHQ number).
- Create: `POST /instance/create` (body includes `instanceName`)
- Connect: `POST /instance/connect/{instanceName}` → returns a **base64 QR code**.
  Scan it with the FlipHQ WhatsApp number (on a phone) to link.
- Auth: every request carries header `apikey: <instance token>`.

## Group listening (the point of the whole thing)

Subscribe the instance's webhook to `MESSAGES_UPSERT`. Every incoming group message
arrives as a webhook payload:

```
{
  "event": "MESSAGES_UPSERT",
  "instance": "fliphq-wa",
  "data": {
    "key": {
      "remoteJid": "1203630123456789@g.us",   // the GROUP
      "participant": "919876543210@s.whatsapp.net", // WHO sent it (in-group sender)
      "fromMe": false,
      "id": "<message id>"
    },
    "pushName": "Sandeep Deshmukh",
    "message": { "conversation": "ship the BOF creative today" },
    "messageType": "conversation",
    "messageTimestamp": 1709553296
  },
  "sender": "1203630123456789@g.us",
  "date_time": "...",
  "apikey": "..."
}
```

Key routing facts:
- `data.key.remoteJid` ends in `@g.us` → group message. Strip `@g.us` to get the group id.
- `data.key.participant` is the actual sender's JID (ends `@s.whatsapp.net`).
- **Pitfall**: the top-level `sender` field mirrors the group JID, not the individual.
  Route on `key.remoteJid` (group) and attribute on `key.participant` (person).
- `data.message.conversation` holds plain text when `messageType === "conversation"`.
  Other types (imageMessage, audioMessage, etc.) need separate handling / transcription.

## Routing to clients

We need a **group_id → client slug** mapping so a webhook for `...@g.us` lands in the
right `~/clients/<slug>/` workspace. Plan: add a `whatsapp.group_id` field to each
client's `.flippy/sources.yaml`.

Flow: webhook → resolve group_id → client slug → ingest → commit onto `ingest/` branch
→ task grooming (same pipeline as Slack/Notion).

## History backfill (one-time bootstrap)

- List chats (incl. groups): `POST /chat/findChats/{instance}`
- Prior messages for a group: `POST /chat/findMessages/{instance}` with
  `{ "where": { "key": { "remoteJid": "<group>@g.us" } }, "page": 1, "offset": 100 }`

Use for a one-time full-history bootstrap when a new client group is wired, mirroring
the Slack full-history bootstrap pattern.

## Operational realities (not compliance — just engineering)

- **Dedicated number**: the FlipHQ number must be a real WhatsApp number (a phone).
  Don't reuse a personal number someone actively uses — linking it to Baileys will
  boot it from the official WhatsApp app on that phone.
- **Session resets**: Baileys sessions can be logged out / reset by WhatsApp. The
  `CONNECTION_UPDATE` webhook (state `close`) flags this; someone re-scans the QR.
- **Not a marketing broadcast tool**: fine for us (closed client groups), but don't
  use it for bulk blasts — that's where the ban risk concentrates.

## Status

**Webhook ingest is implemented and testable** in `connectors/whatsapp.js` + `server.js` —
runs against mock payloads with no live instance required. The live Evolution instance
(Docker + number + QR pairing) is still pending.

Implemented:

- `POST /api/whatsapp/webhook` — accepts an Evolution `MESSAGES_UPSERT` envelope,
  extracts group messages, resolves the group to a client, and appends them to that
  client's `data/whatsapp-messages.jsonl`. Always returns 200 (so Evolution won't retry).
  Handles: non-message events (ignored), DMs (ignored), unmapped groups (ack + warn).
- `GET /api/clients/:slug/whatsapp-messages` — read back a client's raw capture.
- `GET /api/connectors/status` → `whatsapp.group_mappings` — shows each client's
  configured group_id + whether it's real or a placeholder.

To go live (remaining):
1. Deploy Evolution API (Docker Desktop / native / cloud) + Postgres.
2. Create + QR-connect the instance (the dedicated FlipHQ number).
3. Point Evolution's webhook at `POST /api/whatsapp/webhook`.
4. Replace each client's `whatsapp.group_id` placeholder with the real `...@g.us` JID.
