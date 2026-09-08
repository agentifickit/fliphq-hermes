// MCP tool service — manage client-specific MCP tool configurations

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readYaml, writeYaml } from './yaml-utils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const PROFILES_DIR = path.join(REPO_ROOT, 'profiles', 'clients');

function getMcpFile(slug) {
  return path.join(PROFILES_DIR, slug, 'mcp.yaml');
}

// Available MCP tool templates
export function getAvailableTools() {
  return [
    {
      id: 'posthog',
      name: 'PostHog',
      description: 'Product analytics and session replay',
      icon: '📊',
      fields: [
        { key: 'api_key', label: 'API Key', type: 'password', required: true },
        { key: 'project_id', label: 'Project ID', type: 'text', required: true },
        { key: 'base_url', label: 'Base URL', type: 'text', required: false, default: 'https://app.posthog.com' },
      ],
    },
    {
      id: 'google_analytics',
      name: 'Google Analytics 4',
      description: 'Web analytics and reporting',
      icon: '📈',
      fields: [
        { key: 'property_id', label: 'Property ID', type: 'text', required: true },
        { key: 'credentials_json', label: 'Service Account JSON', type: 'textarea', required: true },
      ],
    },
    {
      id: 'windsor',
      name: 'Windsor.ai',
      description: 'Multi-channel ad performance data',
      icon: '🎥',
      fields: [
        { key: 'api_key', label: 'API Key', type: 'password', required: true },
      ],
    },
    {
      id: 'figma',
      name: 'Figma',
      description: 'Design file access and collaboration',
      icon: '🎨',
      fields: [
        { key: 'access_token', label: 'Personal Access Token', type: 'password', required: true },
      ],
    },
    {
      id: 'meta_ads',
      name: 'Meta Ads',
      description: 'Facebook and Instagram advertising',
      icon: '📘',
      fields: [
        { key: 'app_id', label: 'App ID', type: 'text', required: true },
        { key: 'app_secret', label: 'App Secret', type: 'password', required: true },
        { key: 'access_token', label: 'Access Token', type: 'password', required: true },
        { key: 'ad_account_id', label: 'Ad Account ID', type: 'text', required: true },
      ],
    },
    {
      id: 'google_ads',
      name: 'Google Ads',
      description: 'Google advertising platform',
      icon: '🔍',
      fields: [
        { key: 'developer_token', label: 'Developer Token', type: 'password', required: true },
        { key: 'client_id', label: 'Client ID', type: 'text', required: true },
        { key: 'client_secret', label: 'Client Secret', type: 'password', required: true },
        { key: 'refresh_token', label: 'Refresh Token', type: 'password', required: true },
        { key: 'customer_id', label: 'Customer ID', type: 'text', required: true },
      ],
    },
    {
      id: 'slack',
      name: 'Slack',
      description: 'Slack workspace integration',
      icon: '💬',
      fields: [
        { key: 'bot_token', label: 'Bot Token', type: 'password', required: true },
        { key: 'app_token', label: 'App Token', type: 'password', required: false },
      ],
    },
    {
      id: 'notion',
      name: 'Notion',
      description: 'Notion workspace integration',
      icon: '📝',
      fields: [
        { key: 'api_key', label: 'Integration Token', type: 'password', required: true },
        { key: 'workspace_id', label: 'Workspace ID', type: 'text', required: false },
      ],
    },
  ];
}

// Get MCP tools for a client
export function getClientMcpTools(slug) {
  const mcpFile = getMcpFile(slug);
  const mcp = readYaml(mcpFile);
  return mcp.tools || {};
}

// Add or update an MCP tool
export function addOrUpdateMcpTool(slug, toolId, config) {
  const mcpFile = getMcpFile(slug);
  const mcp = readYaml(mcpFile);
  
  if (!mcp.tools) mcp.tools = {};
  
  // Validate required fields
  const available = getAvailableTools();
  const template = available.find(t => t.id === toolId);
  if (!template) {
    throw new Error(`Unknown tool: ${toolId}`);
  }
  
  for (const field of template.fields) {
    if (field.required && !config[field.key]) {
      throw new Error(`${field.label} is required`);
    }
  }
  
  mcp.tools[toolId] = {
    ...config,
    enabled: true,
    added_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  
  writeYaml(mcpFile, mcp);
  return { toolId, slug, ...mcp.tools[toolId] };
}

// Remove an MCP tool
export function removeMcpTool(slug, toolId) {
  const mcpFile = getMcpFile(slug);
  const mcp = readYaml(mcpFile);
  
  if (mcp.tools?.[toolId]) {
    delete mcp.tools[toolId];
    writeYaml(mcpFile, mcp);
  }
  
  return { removed: true };
}

// Toggle tool enabled/disabled
export function toggleMcpTool(slug, toolId) {
  const mcpFile = getMcpFile(slug);
  const mcp = readYaml(mcpFile);
  
  if (!mcp.tools?.[toolId]) {
    throw new Error(`Tool not found: ${toolId}`);
  }
  
  mcp.tools[toolId].enabled = !mcp.tools[toolId].enabled;
  mcp.tools[toolId].updated_at = new Date().toISOString();
  writeYaml(mcpFile, mcp);
  
  return { toolId, enabled: mcp.tools[toolId].enabled };
}

// Test MCP tool connection
export async function testMcpTool(slug, toolId) {
  const tools = getClientMcpTools(slug);
  const config = tools[toolId];
  
  if (!config) {
    throw new Error(`Tool not found: ${toolId}`);
  }
  
  // Basic validation based on tool type
  switch (toolId) {
    case 'posthog':
      return testPosthog(config);
    case 'google_analytics':
      return testGoogleAnalytics(config);
    case 'windsor':
      return testWindsor(config);
    case 'figma':
      return testFigma(config);
    case 'meta_ads':
      return testMetaAds(config);
    case 'google_ads':
      return testGoogleAds(config);
    case 'slack':
      return testSlack(config);
    case 'notion':
      return testNotion(config);
    default:
      return { success: true, message: 'Configuration saved (no test available)' };
  }
}

async function testPosthog(config) {
  if (!config.api_key || !config.project_id) {
    throw new Error('API Key and Project ID are required');
  }
  try {
    const res = await fetch(`${config.base_url || 'https://app.posthog.com'}/api/projects/${config.project_id}`, {
      headers: { Authorization: `Bearer ${config.api_key}` },
    });
    if (res.ok) return { success: true, message: 'Connected to PostHog' };
    if (res.status === 401) throw new Error('Invalid API key');
    if (res.status === 404) throw new Error('Project not found');
    throw new Error(`PostHog API error: ${res.status}`);
  } catch (err) {
    throw new Error(`PostHog connection failed: ${err.message}`);
  }
}

async function testGoogleAnalytics(config) {
  if (!config.property_id) {
    throw new Error('Property ID is required');
  }
  // GA4 requires OAuth, so we just validate the property ID format
  if (!/^\d+$/.test(config.property_id)) {
    throw new Error('Property ID should be numeric');
  }
  return { success: true, message: 'Property ID format valid (full connection requires OAuth)' };
}

async function testWindsor(config) {
  if (!config.api_key) {
    throw new Error('API Key is required');
  }
  try {
    const res = await fetch(`https://api.windsor.ai/api/v1/user?apikey=${config.api_key}`);
    if (res.ok) return { success: true, message: 'Connected to Windsor.ai' };
    if (res.status === 401) throw new Error('Invalid API key');
    throw new Error(`Windsor API error: ${res.status}`);
  } catch (err) {
    throw new Error(`Windsor connection failed: ${err.message}`);
  }
}

async function testFigma(config) {
  if (!config.access_token) {
    throw new Error('Access Token is required');
  }
  try {
    const res = await fetch('https://api.figma.com/v1/me', {
      headers: { 'X-Figma-Token': config.access_token },
    });
    if (res.ok) return { success: true, message: 'Connected to Figma' };
    if (res.status === 401) throw new Error('Invalid access token');
    throw new Error(`Figma API error: ${res.status}`);
  } catch (err) {
    throw new Error(`Figma connection failed: ${err.message}`);
  }
}

async function testMetaAds(config) {
  if (!config.access_token || !config.ad_account_id) {
    throw new Error('Access Token and Ad Account ID are required');
  }
  try {
    const accountId = config.ad_account_id.startsWith('act_') ? config.ad_account_id : `act_${config.ad_account_id}`;
    const res = await fetch(`https://graph.facebook.com/v18.0/${accountId}?access_token=${config.access_token}&fields=name`);
    const data = await res.json();
    if (data.name) return { success: true, message: `Connected to Meta Ads account: ${data.name}` };
    if (data.error) throw new Error(data.error.message);
    throw new Error('Unknown Meta API error');
  } catch (err) {
    throw new Error(`Meta Ads connection failed: ${err.message}`);
  }
}

async function testGoogleAds(config) {
  if (!config.developer_token || !config.client_id || !config.refresh_token) {
    throw new Error('Developer Token, Client ID, and Refresh Token are required');
  }
  // Google Ads requires OAuth flow, so we just validate format
  if (!/^\d{3}-\d{3}-\d{4}$/.test(config.customer_id || '')) {
    throw new Error('Customer ID format should be XXX-XXX-XXXX');
  }
  return { success: true, message: 'Credentials format valid (full connection requires OAuth)' };
}

async function testSlack(config) {
  if (!config.bot_token) {
    throw new Error('Bot Token is required');
  }
  try {
    const res = await fetch('https://slack.com/api/auth.test', {
      headers: { Authorization: `Bearer ${config.bot_token}` },
    });
    const data = await res.json();
    if (data.ok) return { success: true, message: `Connected to Slack as ${data.user || data.bot_id}` };
    throw new Error(data.error || 'Slack auth failed');
  } catch (err) {
    throw new Error(`Slack connection failed: ${err.message}`);
  }
}

async function testNotion(config) {
  if (!config.api_key) {
    throw new Error('API Key is required');
  }
  try {
    const res = await fetch('https://api.notion.com/v1/users/me', {
      headers: {
        Authorization: `Bearer ${config.api_key}`,
        'Notion-Version': '2022-06-28',
      },
    });
    if (res.ok) return { success: true, message: 'Connected to Notion' };
    if (res.status === 401) throw new Error('Invalid API key');
    throw new Error(`Notion API error: ${res.status}`);
  } catch (err) {
    throw new Error(`Notion connection failed: ${err.message}`);
  }
}
