// Channel service — manage WhatsApp and Slack Connect channels

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readYaml, writeYaml } from './yaml-utils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const PROFILES_DIR = path.join(REPO_ROOT, 'profiles', 'clients');
const ROUTER_DIR = path.join(REPO_ROOT, 'profiles', 'whatsapp-hub');
const ROUTING_FILE = path.join(ROUTER_DIR, 'group-routing.yaml');

function getChannelsFile(slug) {
  return path.join(PROFILES_DIR, slug, 'channels.yaml');
}

// ---------- WhatsApp ----------

export function getWhatsAppConfig(slug) {
  const channelsFile = getChannelsFile(slug);
  const channels = readYaml(channelsFile);
  return {
    enabled: channels.whatsapp?.enabled || false,
    groups: channels.whatsapp?.groups || {},
  };
}

export function getGroupRouting() {
  return readYaml(ROUTING_FILE);
}

export function addWhatsAppGroup(slug, groupId, groupName = null) {
  const bareId = String(groupId).replace(/@g\.us$/, '').replace(/@s\.whatsapp\.net$/, '');
  if (!/^\d+$/.test(bareId)) {
    throw new Error('Invalid WhatsApp group ID format. Expected bare number like 1203630123456789');
  }
  
  // Update router's group-routing.yaml
  const routing = getGroupRouting();
  routing[bareId] = slug;
  writeYaml(ROUTING_FILE, routing);
  
  // Update client's channels.yaml
  const channelsFile = getChannelsFile(slug);
  const channels = readYaml(channelsFile);
  if (!channels.whatsapp) channels.whatsapp = { enabled: true, groups: {} };
  channels.whatsapp.enabled = true;
  channels.whatsapp.groups[bareId] = {
    name: groupName || `Group ${bareId}`,
    added_at: new Date().toISOString(),
  };
  writeYaml(channelsFile, channels);
  
  return { groupId: bareId, slug, groupName: groupName || `Group ${bareId}` };
}

export function removeWhatsAppGroup(slug, groupId) {
  const bareId = String(groupId).replace(/@g\.us$/, '');
  
  const routing = getGroupRouting();
  delete routing[bareId];
  writeYaml(ROUTING_FILE, routing);
  
  const channelsFile = getChannelsFile(slug);
  const channels = readYaml(channelsFile);
  if (channels.whatsapp?.groups?.[bareId]) {
    delete channels.whatsapp.groups[bareId];
    writeYaml(channelsFile, channels);
  }
  
  return { removed: true };
}

export function listWhatsAppGroups(slug) {
  const channelsFile = getChannelsFile(slug);
  const channels = readYaml(channelsFile);
  const groups = channels.whatsapp?.groups || {};
  
  return Object.entries(groups).map(([id, info]) => ({
    groupId: id,
    name: info.name || `Group ${id}`,
    addedAt: info.added_at || null,
  }));
}

// ---------- Slack Connect ----------

export function getSlackConnectConfig(slug) {
  const channelsFile = getChannelsFile(slug);
  const channels = readYaml(channelsFile);
  return {
    enabled: channels.slack_connect?.enabled || false,
    channels: channels.slack_connect?.channels || {},
    workspace: channels.slack_connect?.workspace || null,
  };
}

export function addSlackConnectChannel(slug, channelId, channelName = null, workspace = null) {
  const cleanId = String(channelId).trim();
  if (!/^[A-Za-z0-9_]+$/.test(cleanId)) {
    throw new Error('Invalid Slack channel ID format. Expected alphanumeric like C0AQ4C19F25');
  }
  
  const channelsFile = getChannelsFile(slug);
  const channels = readYaml(channelsFile);
  if (!channels.slack_connect) channels.slack_connect = { enabled: true, channels: {} };
  channels.slack_connect.enabled = true;
  channels.slack_connect.channels[cleanId] = {
    name: channelName || `Channel ${cleanId}`,
    workspace: workspace || null,
    added_at: new Date().toISOString(),
  };
  writeYaml(channelsFile, channels);
  
  return { channelId: cleanId, slug, channelName: channelName || `Channel ${cleanId}` };
}

export function removeSlackConnectChannel(slug, channelId) {
  const cleanId = String(channelId).trim();
  
  const channelsFile = getChannelsFile(slug);
  const channels = readYaml(channelsFile);
  if (channels.slack_connect?.channels?.[cleanId]) {
    delete channels.slack_connect.channels[cleanId];
    writeYaml(channelsFile, channels);
  }
  
  return { removed: true };
}

export function listSlackConnectChannels(slug) {
  const channelsFile = getChannelsFile(slug);
  const channels = readYaml(channelsFile);
  const channelsMap = channels.slack_connect?.channels || {};
  
  return Object.entries(channelsMap).map(([id, info]) => ({
    channelId: id,
    name: info.name || `Channel ${id}`,
    workspace: info.workspace || null,
    addedAt: info.added_at || null,
  }));
}

// ---------- Channel Status ----------

export function getChannelStatus(slug) {
  const status = {
    whatsapp: { configured: false, groups: [], lastMessage: null },
    slack_connect: { configured: false, channels: [], lastMessage: null },
  };
  
  const waGroups = listWhatsAppGroups(slug);
  if (waGroups.length > 0) {
    status.whatsapp.configured = true;
    status.whatsapp.groups = waGroups;
  }
  
  const slackChannels = listSlackConnectChannels(slug);
  if (slackChannels.length > 0) {
    status.slack_connect.configured = true;
    status.slack_connect.channels = slackChannels;
  }
  
  return status;
}

// ---------- Test Channel ----------

export async function testWhatsAppGroup(groupId) {
  const apiUrl = process.env.EVOLUTION_API_URL;
  const apiKey = process.env.EVOLUTION_API_KEY;
  
  if (!apiUrl || !apiKey) {
    throw new Error('Evolution API not configured. Set EVOLUTION_API_URL and EVOLUTION_API_KEY.');
  }
  
  try {
    const response = await fetch(`${apiUrl.replace(/\/$/, '')}/message/sendText/test`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': apiKey,
      },
      body: JSON.stringify({
        number: groupId,
        text: '🔧 Test message from FlipHQ Client Onboarding UI. If you see this, the channel is working!',
      }),
    });
    
    const data = await response.json();
    return { success: true, response: data };
  } catch (err) {
    throw new Error(`Failed to send test message: ${err.message}`);
  }
}

export async function testSlackChannel(channelId) {
  const slackToken = process.env.SLACK_BOT_TOKEN;
  
  if (!slackToken) {
    throw new Error('Slack not configured. Set SLACK_BOT_TOKEN.');
  }
  
  try {
    const response = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${slackToken}`,
      },
      body: JSON.stringify({
        channel: channelId,
        text: '🔧 Test message from FlipHQ Client Onboarding UI. If you see this, the channel is working!',
      }),
    });
    
    const data = await response.json();
    return { success: data.ok, response: data };
  } catch (err) {
    throw new Error(`Failed to send test message: ${err.message}`);
  }
}
