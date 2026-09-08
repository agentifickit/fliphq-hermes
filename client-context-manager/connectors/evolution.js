// Evolution API REST client (pull-side).
//
// Evolution runs on Railway (cloud). The local client-context-manager can't receive
// webhooks from a cloud instance, so it PULLS messages via Evolution's REST API —
// the same pull model the cron already uses for Slack and Notion.
//
// Auth: global `apikey` header = AUTHENTICATION_API_KEY set at deploy time.
// Config (env): EVOLUTION_API_URL, EVOLUTION_API_KEY.

const API_URL = () => process.env.EVOLUTION_API_URL || 'http://localhost:8080';
const API_KEY = () => process.env.EVOLUTION_API_KEY || '';

async function evo(method, path, body) {
  const url = API_URL().replace(/\/$/, '') + path;
  const headers = { 'Content-Type': 'application/json' };
  if (API_KEY()) headers['apikey'] = API_KEY();
  const opts = { method, headers };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) {
    const err = new Error(`Evolution ${method} ${path} → ${res.status}: ${JSON.stringify(data)}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

// Create a WhatsApp instance. Returns the created instance object.
export async function createInstance(instanceName) {
  return evo('POST', '/instance/create', {
    instanceName,
    integration: 'WHATSAPP-BAILEYS',
    qrcode: true,
  });
}

// Connect an instance (or re-issue its QR). Returns { qrcode: { base64 } } or { code }.
export async function connectInstance(instanceName) {
  return evo('GET', `/instance/connect/${encodeURIComponent(instanceName)}`);
}

// List instances (for diagnostics).
export async function listInstances() {
  return evo('GET', '/instance/fetchInstances');
}

// List chats (including groups) for an instance. Groups have remoteJid ending @g.us.
export async function listChats(instanceName) {
  return evo('POST', `/chat/findChats/${encodeURIComponent(instanceName)}`, {});
}

// Fetch prior messages for a group. groupJid should be the full "...@g.us" id.
// Returns raw Evolution messages (defensive parse below).
export async function fetchMessages(instanceName, groupJid, { page = 1, offset = 100 } = {}) {
  return evo('POST', `/chat/findMessages/${encodeURIComponent(instanceName)}`, {
    where: { key: { remoteJid: groupJid } },
    page,
    offset,
  });
}

// Normalize a raw Evolution message into our canonical shape.
// Handles the varied envelope shapes Evolution returns for findMessages.
export function normalizeMessage(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const key = raw.key || {};
  const remoteJid = key.remoteJid || '';
  if (!remoteJid.endsWith('@g.us')) return null; // group messages only
  const type = raw.messageType || 'unknown';
  let text = '';
  if (type === 'conversation' || type === 'extendedTextMessage') {
    text = raw.message?.conversation || raw.message?.extendedTextMessage?.text || '';
  }
  return {
    messageId: key.id || null,
    groupId: String(remoteJid).replace(/@g\.us$/, ''),
    sender: String(key.participant || key.remoteJid || '').replace(/@s\.whatsapp\.net$/, ''),
    senderName: raw.pushName || null,
    text,
    type,
    ts: raw.messageTimestamp ? Number(raw.messageTimestamp) * 1000 : Date.now(),
    fromMe: !!key.fromMe,
  };
}

// Extract an array of raw messages from any of Evolution's findMessages response shapes.
export function extractMessages(result) {
  if (!result) return [];
  if (Array.isArray(result)) return result;
  const records =
    result.messages?.records ||
    result.messages ||
    result.records ||
    result.results ||
    [];
  return Array.isArray(records) ? records : [];
}

// High-level: pull + normalize a group's messages.
export async function pullGroupMessages(instanceName, groupJid, opts) {
  const result = await fetchMessages(instanceName, groupJid, opts);
  return extractMessages(result).map(normalizeMessage).filter(Boolean);
}
