// Evolution API webhook receiver — routes WhatsApp messages to client profiles

import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'url';
import { readYaml, writeYaml } from '../services/yaml-utils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const ROUTER_DIR = path.join(REPO_ROOT, 'profiles', 'whatsapp-hub');
const ROUTING_FILE = path.join(ROUTER_DIR, 'group-routing.yaml');
const CLIENTS_DIR = path.join(REPO_ROOT, 'profiles', 'clients');

const router = Router();

// Health check
router.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'evolution-webhook' });
});

// Evolution API webhook endpoint
router.post('/webhook/whatsapp', async (req, res) => {
  // Always return 200 to Evolution (otherwise it retries)
  res.json({ ok: true });

  const body = req.body;
  if (!body || !body.event) return;

  const event = body.event;
  const data = body.data || {};
  const key = data.key || {};
  const remoteJid = key.remoteJid || '';

  // Only process group messages
  if (!remoteJid.endsWith('@g.us')) return;

  const groupId = remoteJid.replace('@g.us', '');
  const routing = readYaml(ROUTING_FILE);
  const clientSlug = routing[groupId];

  if (!clientSlug) {
    console.log(`[Evolution] Unmapped group ${groupId}, ignoring`);
    return;
  }

  // Build the message record
  const message = {
    event,
    groupId,
    clientSlug,
    sender: key.participant || data.participant || key.remoteJid || 'unknown',
    pushName: data.pushName || null,
    message: data.message || {},
    timestamp: data.messageTimestamp || Date.now(),
    receivedAt: new Date().toISOString(),
  };

  // Store in client's whatsapp inbox
  const clientDir = path.join(CLIENTS_DIR, clientSlug, 'data');
  fs.mkdirSync(clientDir, { recursive: true });
  const inboxFile = path.join(clientDir, 'whatsapp-inbox.jsonl');
  fs.appendFileSync(inboxFile, JSON.stringify(message) + '\n');

  console.log(`[Evolution] Routed message from ${message.pushName || message.sender} in group ${groupId} → ${clientSlug}`);
});

export default router;
