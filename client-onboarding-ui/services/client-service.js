// Client service — file operations for client profiles

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readYaml, writeYaml } from './yaml-utils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const PROFILES_DIR = path.join(REPO_ROOT, 'profiles', 'clients');
const TEMPLATE_DIR = path.join(PROFILES_DIR, 'template');

function slugify(name) {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
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
    const channelsPath = path.join(clientDir, 'channels.yaml');
    const mcpPath = path.join(clientDir, 'mcp.yaml');
    
    let config = {};
    if (fs.existsSync(configPath)) {
      config = readYaml(configPath);
    }
    
    // Merge channels.yaml if it exists
    if (fs.existsSync(channelsPath)) {
      const channels = readYaml(channelsPath);
      config.whatsapp = { ...config.whatsapp, ...channels.whatsapp };
      config.slack_connect = { ...config.slack_connect, ...channels.slack_connect };
    }
    
    // Count MCP tools from mcp.yaml
    let mcpCount = 0;
    if (fs.existsSync(mcpPath)) {
      const mcp = readYaml(mcpPath);
      mcpCount = Object.keys(mcp.tools || {}).length;
    }
    
    let soulContent = '';
    if (fs.existsSync(soulPath)) {
      soulContent = fs.readFileSync(soulPath, 'utf8');
    }
    
    // Extract client name: prefer stored config name, then SOUL.md title, then slug
    let name = slug;
    if (config.client_name) {
      name = config.client_name;
    } else {
      const titleMatch = soulContent.match(/^#\s+(?:SOUL\.md\s*—\s*)?(.+)$/m);
      if (titleMatch) {
        name = titleMatch[1].trim();
      }
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
        mcpCount,
        mcpServers: Object.keys(config.mcp_servers || {}),
      },
    });
  }
  
  return clients;
}

function extractChannels(config) {
  const channels = [];
  if (config.whatsapp?.enabled || config.whatsapp?.groups) channels.push('whatsapp');
  if (config.slack_connect?.enabled || config.slack_connect?.channels) channels.push('slack-connect');
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
  
  // Store name in config.yaml so it survives re-reads
  const configPath = path.join(clientDir, 'config.yaml');
  if (fs.existsSync(configPath)) {
    const config = readYaml(configPath);
    config.client_name = name;
    writeYaml(configPath, config);
  }
  
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
