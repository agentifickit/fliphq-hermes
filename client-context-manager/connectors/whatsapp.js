// WhatsApp connector — Evolution API (chosen backend)
//
// STATUS: Backend DECIDED (Evolution API). Webhook INGEST logic implemented here
// and testable with mock payloads. The live Evolution instance (Docker + number +
// QR pairing) is still pending — see docs/whatsapp-evolution-api.md.
//
// Evolution API = self-hosted Baileys wrapper. A dedicated FlipHQ WhatsApp number
// sits inside each client group; incoming group messages arrive as MESSAGES_UPSERT
// webhooks, and we route them to the right client workspace by group_id.

import fs from 'node:fs';
import path from 'node:path';
import * as yaml from 'js-yaml';

const STATUS = {
  enabled: false,
  backend: 'Evolution API (self-hosted, Baileys)',
  account: 'Dedicated FlipHQ WhatsApp number (QR-connect via instance)',
  source: 'Client group conversations (number sits in each client group)',
  state: 'stubbed (webhook ingest ready; live instance pending)',
  model: 'passive-listener',
  compliance: 'accepted — closed client groups',
};

export function getStatus() {
  return STATUS;
}

// ---------- group_id normalization ----------

// Evolution group JIDs look like "1203630123456789@g.us". Normalize to the bare id
// so matching is resilient to whether callers include the "@g.us" suffix.
export function bareGroupId(jid) {
  if (!jid) return '';
  return String(jid).replace(/@g\.us$/, '').replace(/@s\.whatsapp\.net$/, '');
}

// ---------- group_id -> client resolution ----------

// Scan every client workspace's .flippy/sources.yaml for a `whatsapp.group_id`
// matching the incoming group. Returns { slug, workspace } or null.
export function resolveClientForGroup(groupJid, clientsRoot) {
  const root = clientsRoot || path.join(process.env.HOME || '/home/pulkit', 'clients');
  const bare = bareGroupId(groupJid);
  if (!bare) return null;

  let entries;
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return null;
  }

  for (const ent of entries) {
    if (!ent.isDirectory() || ent.name.startsWith('.')) continue;
    const sourcesPath = path.join(root, ent.name, '.flippy', 'sources.yaml');
    if (!fs.existsSync(sourcesPath)) continue;
    let doc;
    try {
      doc = yaml.load(fs.readFileSync(sourcesPath, 'utf8'));
    } catch {
      continue;
    }
    const groupId = doc?.whatsapp?.group_id;
    if (!groupId) continue;
    if (bareGroupId(groupId) === bare) {
      return { slug: ent.name, workspace: path.join(root, ent.name), groupId };
    }
  }
  return null;
}

// List every configured group mapping (for diagnostics / the connector status).
export function listGroupMappings(clientsRoot) {
  const root = clientsRoot || path.join(process.env.HOME || '/home/pulkit', 'clients');
  const mappings = [];
  let entries;
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return mappings;
  }
  for (const ent of entries) {
    if (!ent.isDirectory() || ent.name.startsWith('.')) continue;
    const sourcesPath = path.join(root, ent.name, '.flippy', 'sources.yaml');
    if (!fs.existsSync(sourcesPath)) continue;
    let doc;
    try {
      doc = yaml.load(fs.readFileSync(sourcesPath, 'utf8'));
    } catch {
      continue;
    }
    const wa = doc?.whatsapp || {};
    mappings.push({
      slug: ent.name,
      enabled: !!wa.enabled,
      groupId: wa.group_id || null,
      configured: !!wa.group_id && !String(wa.group_id).includes('<'),
    });
  }
  return mappings;
}

// ---------- Evolution webhook parsing ----------

// Parse an Evolution API MESSAGES_UPSERT webhook into normalized message records.
// Returns { instance, messages: [{ groupId, sender, senderName, text, type, ts }] }.
//   - groupId: bare group id (no @g.us suffix)
//   - sender:  bare participant JID (no @s.whatsapp.net suffix) — WHO in the group
//   - text:    plain text body ('' for non-text types)
//   - type:    messageType (conversation | imageMessage | audioMessage | ...)
export function parseEvolutionWebhook(payload) {
  if (!payload || typeof payload !== 'object') {
    return { instance: null, messages: [] };
  }
  const instance = payload.instance || null;
  const data = payload.data || {};
  const key = data.key || {};
  const remoteJid = key.remoteJid || '';

  // Only handle group messages (remoteJid ends @g.us).
  if (!remoteJid.endsWith('@g.us')) {
    return { instance, messages: [] };
  }

  const groupId = bareGroupId(remoteJid);
  const sender = bareGroupId(key.participant || key.remoteJid);
  const senderName = data.pushName || null;
  const type = data.messageType || 'unknown';
  let text = '';
  if (type === 'conversation' || type === 'extendedTextMessage') {
    text = data.message?.conversation || data.message?.extendedTextMessage?.text || '';
  }
  const ts = data.messageTimestamp ? Number(data.messageTimestamp) * 1000 : Date.now();

  return {
    instance,
    messages: [{ groupId, sender, senderName, text, type, ts, fromMe: !!key.fromMe }],
  };
}

// ---------- Ingest (capture the raw stream) ----------

// Append parsed messages to the client's rolling JSONL capture file.
// Returns { clientSlug, written, path }.
export function ingestMessages(clientSlug, messages, clientsRoot) {
  const root = clientsRoot || path.join(process.env.HOME || '/home/pulkit', 'clients');
  const dataDir = path.join(root, clientSlug, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const file = path.join(dataDir, 'whatsapp-messages.jsonl');
  const lines = messages.map((m) =>
    JSON.stringify({ ...m, capturedAt: new Date().toISOString() })
  );
  fs.appendFileSync(file, lines.join('\n') + '\n', 'utf8');
  return { clientSlug, written: lines.length, path: file };
}
