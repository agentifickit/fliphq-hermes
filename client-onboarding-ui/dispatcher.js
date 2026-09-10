import { exec } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'url';

import { readYaml } from './services/yaml-utils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const CLIENTS_DIR = path.join(REPO_ROOT, 'profiles', 'clients');
const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || 'http://localhost:8080';
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE || 'fliphq-main';
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || 'eabc8605da149b86c53c48466df20e6ba822d26a37981738987d34f839710229';
const POLL_INTERVAL_MS = 5000;

function getInboxFile(slug) {
  return path.join(CLIENTS_DIR, slug, 'data', 'whatsapp-inbox.jsonl');
}

function getProcessedFile(slug) {
  return path.join(CLIENTS_DIR, slug, 'data', 'whatsapp-processed.jsonl');
}

function readProcessed(slug) {
  const f = getProcessedFile(slug);
  if (!fs.existsSync(f)) return new Set();
  return new Set(fs.readFileSync(f, 'utf8').split('\n').filter(Boolean));
}

function markProcessed(slug, msgId) {
  const f = getProcessedFile(slug);
  fs.appendFileSync(f, msgId + '\n');
}

function getRouting() {
  const routingFile = path.join(REPO_ROOT, 'profiles', 'whatsapp-hub', 'group-routing.yaml');
  if (!fs.existsSync(routingFile)) return {};
  try {
    const data = readYaml(routingFile);
    return data.group_routing || {};
  } catch (e) {
    console.error(`[Dispatcher] Failed to read routing: ${e.message}`);
    return {};
  }
}

async function pollInbox(slug) {
  const inboxFile = getInboxFile(slug);
  if (!fs.existsSync(inboxFile)) return;

  const processed = readProcessed(slug);
  const lines = fs.readFileSync(inboxFile, 'utf8').split('\n').filter(Boolean);

  for (const line of lines) {
    let msg;
    try { msg = JSON.parse(line); } catch { continue; }

    const msgId = msg.timestamp + '-' + msg.sender + '-' + JSON.stringify(msg.message);
    if (processed.has(msgId)) continue;

    console.log(`[Dispatcher] New: group=${msg.groupId} from=${msg.pushName || msg.sender}: ${JSON.stringify(msg.message).slice(0, 60)}`);
    markProcessed(slug, msgId);
    try {
      await processMessage(slug, msg);
    } catch (e) {
      console.error(`[Dispatcher] processMessage error: ${e.message}`);
    }
  }
}

async function processMessage(slug, msg) {
  const { sender, pushName, message, groupId } = msg;
  const text = message?.conversation || message?.text || JSON.stringify(message);
  const senderName = pushName || sender;

  try {
    const prompt = `You are the ${slug} AI agent. WhatsApp message from ${senderName} in group ${groupId}: "${text}" Respond helpfully and concisely in 1-2 sentences.`;

    const safePrompt = prompt.replace(/'/g, "'\\''");
    const cmd = `hermes chat -p ${slug} -q '${safePrompt}' 2>/dev/null`;

    console.log(`[Dispatcher] Running agent for ${slug}...`);
    const result = await new Promise((resolve, reject) => {
      exec(cmd, { encoding: 'utf8', timeout: 120000 }, (err, stdout) => {
        if (err) reject(err);
        else resolve(stdout);
      });
    });

    let reply = result.trim();
    const boxMatch = reply.match(/╭─[^\n]*\n([\s\S]*?)\n╰─/);
    if (boxMatch) {
      reply = boxMatch[1].replace(/^[ ]+|[ ]+$/g, '').trim();
    } else {
      reply = reply.replace(/^Query:\s*.+?\n*/, '').replace(/Initializing agent\.\.\.[^]*/, '').trim();
    }
    reply = reply.replace(/Resume this session with:.*$/s, '').trim();

    if (reply) {
      await sendWhatsAppReply(groupId, reply);
      console.log(`[Dispatcher] Replied: ${reply.slice(0, 80)}`);
    }
  } catch (err) {
    console.error(`[Dispatcher] Agent error: ${err.message}`);
  }
}

async function sendWhatsAppReply(groupId, text) {
  try {
    const body = JSON.stringify({ number: `${groupId}@g.us`, text });
    const tmpFile = `/tmp/wa-reply-${Date.now()}.json`;
    fs.writeFileSync(tmpFile, body);

    await new Promise((resolve, reject) => {
      exec(`curl -s -X POST '${EVOLUTION_API_URL}/message/sendText/${EVOLUTION_INSTANCE}' -H 'apikey: ${EVOLUTION_API_KEY}' -H 'Content-Type: application/json' -d @${tmpFile}`, {
        encoding: 'utf8',
        timeout: 30000,
      }, (err) => {
        try { fs.unlinkSync(tmpFile); } catch {}
        if (err) reject(err);
        else resolve();
      });
    });
  } catch (err) {
    console.error(`[Dispatcher] Send error: ${err.message}`);
  }
}

function main() {
  console.log('[Dispatcher] Starting WhatsApp inbox dispatcher...');
  console.log(`[Dispatcher] Polling every ${POLL_INTERVAL_MS / 1000}s`);
  console.log(`[Dispatcher] Watching: ${CLIENTS_DIR}`);

  const pollAll = async () => {
    const routing = getRouting();
    for (const slug of new Set(Object.values(routing))) {
      try { await pollInbox(slug); } catch (e) { console.error(`[Dispatcher] pollInbox(${slug}) error: ${e.message}`); }
    }
  };

  setInterval(pollAll, POLL_INTERVAL_MS);
  pollAll();
}

main();
