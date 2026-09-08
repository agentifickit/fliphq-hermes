// Client service — file operations for client profiles

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as yaml from 'js-yaml';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const PROFILES_DIR = path.join(REPO_ROOT, 'profiles', 'clients');
const TEMPLATE_DIR = path.join(PROFILES_DIR, 'template');

function slugify(name) {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function readYaml(filePath) {
  if (!fs.existsSync(filePath)) return {};
  try {
    return yaml.load(fs.readFileSync(filePath, 'utf8')) || {};
  } catch {
    return {};
  }
}

function writeYaml(filePath, obj) {
  fs.writeFileSync(filePath, yaml.dump(obj, { lineWidth: 120, noRefs: true }), 'utf8');
}

function readFile(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

function writeFile(filePath, content) {
  fs.writeFileSync(filePath, content, 'utf8');
}

export function listClients() {
  const clients = [];
  let entries;
  try {
    entries = fs.readdirSync(PROFILES_DIR, { withFileTypes: true });
  } catch {
    return clients;
  }
  
  for (const ent of entries) {
    if (!ent.isDirectory() || ent.name === 'template' || ent.name.startsWith('.')) continue;
    const slug = ent.name;
    const clientDir = path.join(PROFILES_DIR, slug);
    const configPath = path.join(clientDir, 'config.yaml');
    const soulPath = path.join(clientDir, 'SOUL.md');
    
    let config = {};
    if (fs.existsSync(configPath)) {
      config = readYaml(configPath);
    }
    
    let soulContent = '';
    if (fs.existsSync(soulPath)) {
      soulContent = fs.readFileSync(soulPath, 'utf8');
    }
    
    // Extract client name from SOUL.md or config
    let name = slug;
    const nameMatch = soulContent.match(/\*\*(.+?)\*\*.*client/i);
    if (nameMatch) {
      name = nameMatch[1];
    }
    
    clients.push({
      slug,
      name,
      path: clientDir,
      hasConfig: fs.existsSync(configPath),
      hasSoul: fs.existsSync(soulPath),
      config: {
        model: config.model?.default || 'not set',
        channels: extractChannels(config),
        mcpServers: Object.keys(config.mcp_servers || {}),
      },
    });
  }
  
  return clients;
}

function extractChannels(config) {
  const channels = [];
  if (config.whatsapp?.enabled) channels.push('whatsapp');
  if (config.slack?.channel_prompts) channels.push('slack-connect');
  return channels;
}

export function getClient(slug) {
  const clientDir = path.join(PROFILES_DIR, slug);
  if (!fs.existsSync(clientDir)) return null;
  
  const configPath = path.join(clientDir, 'config.yaml');
  const soulPath = path.join(clientDir, 'SOUL.md');
  const envPath = path.join(clientDir, '.env');
  
  let config = {};
  if (fs.existsSync(configPath)) {
    config = readYaml(configPath);
  }
  
  let soulContent = '';
  if (fs.existsSync(soulPath)) {
    soulContent = fs.readFileSync(soulPath, 'utf8');
  }
  
  let hasEnv = fs.existsSync(envPath);
  
  return {
    slug,
    path: clientDir,
    config,
    soulContent,
    hasEnv,
  };
}

export function createClient({ name, description = '' }) {
  const slug = slugify(name);
  if (!slug) {
    throw new Error('Invalid client name');
  }
  
  const clientDir = path.join(PROFILES_DIR, slug);
  if (fs.existsSync(clientDir)) {
    throw new Error(`Client "${slug}" already exists`);
  }
  
  // Copy template
  fs.mkdirSync(clientDir, { recursive: true });
  
  // Copy template files
  const templateFiles = fs.readdirSync(TEMPLATE_DIR);
  for (const file of templateFiles) {
    const src = path.join(TEMPLATE_DIR, file);
    const dest = path.join(clientDir, file);
    fs.copyFileSync(src, dest);
  }
  
  // Replace placeholders in SOUL.md
  const soulPath = path.join(clientDir, 'SOUL.md');
  let soulContent = fs.readFileSync(soulPath, 'utf8');
  soulContent = soulContent.replace(/\[CLIENT_NAME\]/g, name);
  fs.writeFileSync(soulPath, soulContent, 'utf8');
  
  return { slug, name, path: clientDir };
}

export function updateClient(slug, updates) {
  const clientDir = path.join(PROFILES_DIR, slug);
  if (!fs.existsSync(clientDir)) {
    throw new Error(`Client "${slug}" not found`);
  }
  
  // Update config.yaml if provided
  if (updates.config) {
    const configPath = path.join(clientDir, 'config.yaml');
    writeYaml(configPath, updates.config);
  }
  
  // Update SOUL.md if provided
  if (updates.soulContent) {
    const soulPath = path.join(clientDir, 'SOUL.md');
    fs.writeFileSync(soulPath, updates.soulContent, 'utf8');
  }
  
  return getClient(slug);
}

export function deleteClient(slug) {
  const clientDir = path.join(PROFILES_DIR, slug);
  if (!fs.existsSync(clientDir)) {
    throw new Error(`Client "${slug}" not found`);
  }
  
  fs.rmSync(clientDir, { recursive: true, force: true });
  return { deleted: true };
}

export function getClientTemplate() {
  const configPath = path.join(TEMPLATE_DIR, 'config.yaml');
  const soulPath = path.join(TEMPLATE_DIR, 'SOUL.md');
  
  return {
    config: fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf8') : '',
    soul: fs.existsSync(soulPath) ? fs.readFileSync(soulPath, 'utf8') : '',
  };
}
