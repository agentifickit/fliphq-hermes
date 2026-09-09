#!/usr/bin/env node
// WhatsApp context sync — pull group messages from Evolution API (Railway) and
// capture them into each client's data/whatsapp-messages.jsonl.
//
// Usage:
//   node scripts/whatsapp-sync.js            # sync all configured clients
//   EVOLUTION_API_URL=... EVOLUTION_API_KEY=... node scripts/whatsapp-sync.js
//
// Idempotent: dedupes by Evolution messageId against the existing capture file,
// so re-runs don't duplicate. Called by the context-refresh cron (pull model,
// same as Slack/Notion).

import fs from 'node:fs';
import path from 'node:path';
import { listGroupMappings, ingestMessages } from '../connectors/whatsapp.js';
import { pullGroupMessages } from '../connectors/evolution.js';

const CLIENTS_ROOT = process.env.CLIENTS_ROOT || path.join(process.env.HOME || '/home/pulkit', 'clients');
const INSTANCE = process.env.EVOLUTION_INSTANCE_NAME || 'fliphq-wa';

function readCapturedMessageIds(slug) {
  const file = path.join(CLIENTS_ROOT, slug, 'data', 'whatsapp-messages.jsonl');
  if (!fs.existsSync(file)) return new Set();
  const ids = new Set();
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      const m = JSON.parse(line);
      if (m.messageId) ids.add(m.messageId);
    } catch { /* skip malformed */ }
  }
  return ids;
}

async function syncClient(slug, groupId) {
  const jid = groupId.endsWith('@g.us') ? groupId : `${groupId}@g.us`;
  const messages = await pullGroupMessages(INSTANCE, jid);
  const existing = readCapturedMessageIds(slug);
  const fresh = messages.filter((m) => !m.messageId || !existing.has(m.messageId));
  if (!fresh.length) return { slug, pulled: messages.length, new: 0 };
  const result = ingestMessages(slug, fresh, CLIENTS_ROOT);
  return { slug, pulled: messages.length, new: fresh.length, file: result.path };
}

async function main() {
  if (!process.env.EVOLUTION_API_KEY) {
    console.error('EVOLUTION_API_KEY not set — cannot pull from Evolution API.');
    process.exit(2);
  }
  const mappings = listGroupMappings(CLIENTS_ROOT).filter((m) => m.configured && m.enabled);
  if (!mappings.length) {
    console.log('No clients with a configured + enabled WhatsApp group_id. Nothing to sync.');
    return;
  }

  const summary = [];
  for (const m of mappings) {
    try {
      const r = await syncClient(m.slug, m.groupId);
      summary.push(r);
      console.log(`✓ ${r.slug}: pulled ${r.pulled}, captured ${r.new} new`);
    } catch (e) {
      summary.push({ slug: m.slug, error: e.message });
      console.error(`✗ ${m.slug}: ${e.message}`);
    }
  }
  console.log(`\nDone. ${summary.length} client(s) processed.`);
}

main().catch((e) => {
  console.error('Sync failed:', e.message);
  process.exit(1);
});
