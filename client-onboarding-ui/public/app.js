// FlipHQ Client Onboarding UI — Frontend Logic

let currentSlug = null;
let currentTab = 'overview';

// ===== Client List =====

async function loadClients() {
  try {
    const res = await fetch('/api/clients');
    const data = await res.json();
    
    const list = document.getElementById('client-list');
    const empty = document.getElementById('empty-state');
    
    if (data.clients.length === 0) {
      list.style.display = 'none';
      empty.style.display = 'block';
      return;
    }
    
    list.style.display = 'grid';
    empty.style.display = 'none';
    
    // Fetch status for each client
    const clientsWithStatus = await Promise.all(data.clients.map(async (c) => {
      try {
        const statusRes = await fetch(`/api/clients/${c.slug}/status`);
        const statusData = await statusRes.json();
        return { ...c, gateway: statusData.status };
      } catch {
        return { ...c, gateway: { status: 'unknown' } };
      }
    }));
    
    list.innerHTML = clientsWithStatus.map(c => renderClientCard(c)).join('');
  } catch (err) {
    showToast('Failed to load clients', 'error');
    console.error(err);
  }
}

function renderClientCard(client) {
  const status = client.gateway?.status || 'unknown';
  const channels = (client.config?.channels || []).map(ch => 
    `<span class="channel-badge">${getChannelIcon(ch)} ${ch}</span>`
  ).join('');
  
  return `
    <div class="client-card" onclick="openClientDetail('${client.slug}')">
      <div class="client-card-header">
        <div>
          <div class="client-name">${escapeHtml(client.name)}</div>
          <div class="client-slug">${client.slug}</div>
        </div>
        <span class="status-badge ${status}">● ${status}</span>
      </div>
      <div class="client-channels">
        ${channels || '<span class="channel-badge">No channels</span>'}
      </div>
      <div class="client-meta">
        <span>MCP: ${client.config?.mcpServers?.length || 0}</span>
        <span>Model: ${client.config?.model || 'default'}</span>
      </div>
    </div>
  `;
}

function getChannelIcon(channel) {
  const icons = {
    whatsapp: '📱',
    'slack-connect': '💬',
    telegram: '✈️',
  };
  return icons[channel] || '🔗';
}

// ===== Create Client =====

function showCreateModal() {
  document.getElementById('create-modal').style.display = 'flex';
  document.getElementById('client-name').value = '';
  document.getElementById('client-description').value = '';
}

function hideCreateModal() {
  document.getElementById('create-modal').style.display = 'none';
}

async function createClient() {
  const name = document.getElementById('client-name').value.trim();
  const description = document.getElementById('client-description').value.trim();
  
  if (!name) {
    showToast('Client name is required', 'error');
    return;
  }
  
  try {
    const res = await fetch('/api/clients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description }),
    });
    
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error);
    }
    
    hideCreateModal();
    showToast('Client created!', 'success');
    loadClients();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ===== Client Detail =====

async function openClientDetail(slug) {
  currentSlug = slug;
  
  try {
    const res = await fetch(`/api/clients/${slug}`);
    const data = await res.json();
    const client = data.client;
    
    document.getElementById('detail-title').textContent = client.slug;
    document.getElementById('detail-config-yaml').value = JSON.stringify(client.config, null, 2);
    document.getElementById('detail-soul-md').value = client.soulContent;
    
    // Load status
    await loadGatewayStatus(slug);
    
    // Load channels
    await loadChannels(slug);
    
    // Load MCP tools
    await loadMcpTools(slug);
    
    // Show modal
    document.getElementById('detail-modal').style.display = 'flex';
  } catch (err) {
    showToast('Failed to load client details', 'error');
  }
}

function hideDetailModal() {
  document.getElementById('detail-modal').style.display = 'none';
  currentSlug = null;
}

async function loadGatewayStatus(slug) {
  try {
    const res = await fetch(`/api/clients/${slug}/status`);
    const data = await res.json();
    const status = data.status;
    
    const badge = document.getElementById('detail-gateway-status');
    badge.textContent = status.status;
    badge.className = `status-badge ${status.status}`;
    
    document.getElementById('detail-gateway-pid').textContent = status.pid || '—';
    document.getElementById('detail-gateway-uptime').textContent = status.uptime || '—';
  } catch {
    document.getElementById('detail-gateway-status').textContent = 'unknown';
  }
}

// ===== Tabs =====

function switchTab(tab) {
  currentTab = tab;
  
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  
  event.target.classList.add('active');
  document.getElementById(`tab-${tab}`).classList.add('active');
  
  if (tab === 'channels' && currentSlug) {
    loadChannels(currentSlug);
  } else if (tab === 'mcp' && currentSlug) {
    loadMcpTools(currentSlug);
  } else if (tab === 'logs' && currentSlug) {
    refreshLogs();
  }
}

// ===== Gateway Controls =====

async function startGateway() {
  if (!currentSlug) return;
  try {
    const res = await fetch(`/api/clients/${currentSlug}/start`, { method: 'POST' });
    const data = await res.json();
    showToast(data.status, 'success');
    await loadGatewayStatus(currentSlug);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function stopGateway() {
  if (!currentSlug) return;
  try {
    const res = await fetch(`/api/clients/${currentSlug}/stop`, { method: 'POST' });
    const data = await res.json();
    showToast(data.status, 'success');
    await loadGatewayStatus(currentSlug);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function restartGateway() {
  if (!currentSlug) return;
  try {
    const res = await fetch(`/api/clients/${currentSlug}/restart`, { method: 'POST' });
    const data = await res.json();
    showToast(data.status, 'success');
    await loadGatewayStatus(currentSlug);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deployClient() {
  if (!currentSlug) return;
  showToast('Deploying...', 'info');
  try {
    const res = await fetch(`/api/clients/${currentSlug}/deploy`, { method: 'POST' });
    const data = await res.json();
    showToast('Deploy complete!', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function saveConfig() {
  if (!currentSlug) return;
  try {
    const configYaml = document.getElementById('detail-config-yaml').value;
    const soulMd = document.getElementById('detail-soul-md').value;
    
    // Parse YAML to object (simple parse for now)
    let config;
    try {
      config = JSON.parse(configYaml);
    } catch {
      showToast('Invalid JSON in config editor', 'error');
      return;
    }
    
    const res = await fetch(`/api/clients/${currentSlug}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config, soulContent: soulMd }),
    });
    
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error);
    }
    
    showToast('Config saved!', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ===== Logs =====

async function refreshLogs() {
  if (!currentSlug) return;
  const lines = document.getElementById('log-lines')?.value || 100;
  try {
    const res = await fetch(`/api/clients/${currentSlug}/logs?lines=${lines}`);
    const data = await res.json();
    const viewer = document.getElementById('gateway-logs');
    viewer.textContent = data.logs.length ? data.logs.join('\n') : 'No logs yet.';
  } catch (err) {
    document.getElementById('gateway-logs').textContent = 'Failed to load logs.';
  }
}

// ===== Utility =====

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ===== Internal & WhatsApp Status (placeholders) =====

function showInternalStatus() {
  showToast('Internal status coming soon', 'info');
}

function showWhatsAppStatus() {
  showToast('WhatsApp router status coming soon', 'info');
}

// ===== Channel Configuration =====

async function loadChannels(slug) {
  try {
    const res = await fetch(`/api/clients/${slug}/channels`);
    const data = await res.json();
    const channels = data.channels;
    
    // Render WhatsApp groups
    const waList = document.getElementById('whatsapp-groups-list');
    if (channels.whatsapp.groups.length > 0) {
      waList.innerHTML = channels.whatsapp.groups.map(g => `
        <div class="channel-item">
          <div>
            <div>${escapeHtml(g.name)}</div>
            <div style="font-size:0.75rem;color:var(--text-muted);">${g.groupId}</div>
          </div>
          <button class="btn btn-secondary btn-sm" onclick="testWhatsAppGroup('${g.groupId}')">Test</button>
          <button class="btn btn-danger btn-sm" onclick="removeWhatsAppGroup('${g.groupId}')">Remove</button>
        </div>
      `).join('');
    } else {
      waList.innerHTML = '<p class="info-text">No WhatsApp groups configured</p>';
    }
    
    // Render Slack channels
    const slackList = document.getElementById('slack-channels-list');
    if (channels.slack_connect.channels.length > 0) {
      slackList.innerHTML = channels.slack_connect.channels.map(c => `
        <div class="channel-item">
          <div>
            <div>${escapeHtml(c.name)}</div>
            <div style="font-size:0.75rem;color:var(--text-muted);">${c.channelId}</div>
          </div>
          <button class="btn btn-secondary btn-sm" onclick="testSlackChannel('${c.channelId}')">Test</button>
          <button class="btn btn-danger btn-sm" onclick="removeSlackChannel('${c.channelId}')">Remove</button>
        </div>
      `).join('');
    } else {
      slackList.innerHTML = '<p class="info-text">No Slack Connect channels configured</p>';
    }
  } catch (err) {
    showToast('Failed to load channels', 'error');
  }
}

// WhatsApp Group Modals
function showAddWhatsAppGroup() {
  document.getElementById('add-whatsapp-modal').style.display = 'flex';
  document.getElementById('whatsapp-group-id').value = '';
  document.getElementById('whatsapp-group-name').value = '';
}

function hideAddWhatsAppModal() {
  document.getElementById('add-whatsapp-modal').style.display = 'none';
}

async function addWhatsAppGroup() {
  if (!currentSlug) return;
  const groupId = document.getElementById('whatsapp-group-id').value.trim();
  const groupName = document.getElementById('whatsapp-group-name').value.trim();
  
  if (!groupId) {
    showToast('Group ID is required', 'error');
    return;
  }
  
  try {
    await fetch(`/api/clients/${currentSlug}/channels/whatsapp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupId, groupName }),
    });
    hideAddWhatsAppModal();
    showToast('WhatsApp group added!', 'success');
    loadChannels(currentSlug);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function removeWhatsAppGroup(groupId) {
  if (!currentSlug) return;
  if (!confirm('Remove this WhatsApp group?')) return;
  
  try {
    await fetch(`/api/clients/${currentSlug}/channels/whatsapp/${groupId}`, {
      method: 'DELETE',
    });
    showToast('WhatsApp group removed', 'success');
    loadChannels(currentSlug);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function testWhatsAppGroup(groupId) {
  if (!currentSlug) return;
  showToast('Sending test message...', 'info');
  try {
    const res = await fetch(`/api/clients/${currentSlug}/channels/whatsapp/${groupId}/test`, {
      method: 'POST',
    });
    const data = await res.json();
    showToast(data.success ? 'Test message sent!' : 'Failed to send test message', data.success ? 'success' : 'error');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Slack Channel Modals
function showAddSlackChannel() {
  document.getElementById('add-slack-modal').style.display = 'flex';
  document.getElementById('slack-channel-id').value = '';
  document.getElementById('slack-channel-name').value = '';
  document.getElementById('slack-workspace').value = '';
}

function hideAddSlackModal() {
  document.getElementById('add-slack-modal').style.display = 'none';
}

async function addSlackChannel() {
  if (!currentSlug) return;
  const channelId = document.getElementById('slack-channel-id').value.trim();
  const channelName = document.getElementById('slack-channel-name').value.trim();
  const workspace = document.getElementById('slack-workspace').value.trim();
  
  if (!channelId) {
    showToast('Channel ID is required', 'error');
    return;
  }
  
  try {
    await fetch(`/api/clients/${currentSlug}/channels/slack`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channelId, channelName, workspace }),
    });
    hideAddSlackModal();
    showToast('Slack channel added!', 'success');
    loadChannels(currentSlug);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function removeSlackChannel(channelId) {
  if (!currentSlug) return;
  if (!confirm('Remove this Slack channel?')) return;
  
  try {
    await fetch(`/api/clients/${currentSlug}/channels/slack/${channelId}`, {
      method: 'DELETE',
    });
    showToast('Slack channel removed', 'success');
    loadChannels(currentSlug);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function testSlackChannel(channelId) {
  if (!currentSlug) return;
  showToast('Sending test message...', 'info');
  try {
    const res = await fetch(`/api/clients/${currentSlug}/channels/slack/${channelId}/test`, {
      method: 'POST',
    });
    const data = await res.json();
    showToast(data.success ? 'Test message sent!' : 'Failed to send test message', data.success ? 'success' : 'error');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ===== Init =====

document.addEventListener('DOMContentLoaded', loadClients);

// ===== MCP Tool Configuration =====

let availableTools = [];

async function loadMcpTools(slug) {
  try {
    const res = await fetch(`/api/clients/${slug}/mcp-tools`);
    const data = await res.json();
    const tools = data.tools || {};
    
    const list = document.getElementById('mcp-tools-list');
    
    if (Object.keys(tools).length > 0) {
      list.innerHTML = Object.entries(tools).map(([id, tool]) => `
        <div class="mcp-tool-card">
          <div class="mcp-tool-header">
            <span class="mcp-tool-icon">${getToolIcon(id)}</span>
            <div class="mcp-tool-info">
              <div class="mcp-tool-name">${getToolName(id)}</div>
              <div class="mcp-tool-status ${tool.enabled ? 'enabled' : 'disabled'}">${tool.enabled ? '● Enabled' : '○ Disabled'}</div>
            </div>
          </div>
          <div class="mcp-tool-actions">
            <button class="btn btn-secondary btn-sm" onclick="testMcpTool('${id}')">Test</button>
            <button class="btn btn-secondary btn-sm" onclick="toggleMcpTool('${id}')">${tool.enabled ? 'Disable' : 'Enable'}</button>
            <button class="btn btn-danger btn-sm" onclick="removeMcpTool('${id}')">Remove</button>
          </div>
        </div>
      `).join('');
    } else {
      list.innerHTML = '<p class="info-text">No MCP tools configured</p>';
    }
  } catch (err) {
    showToast('Failed to load MCP tools', 'error');
  }
}

function getToolIcon(toolId) {
  const icons = {
    posthog: '📊',
    google_analytics: '📈',
    windsor: '🎥',
    figma: '🎨',
    meta_ads: '📘',
    google_ads: '🔍',
    slack: '💬',
    notion: '📝',
  };
  return icons[toolId] || '🔧';
}

function getToolName(toolId) {
  const names = {
    posthog: 'PostHog',
    google_analytics: 'Google Analytics',
    windsor: 'Windsor.ai',
    figma: 'Figma',
    meta_ads: 'Meta Ads',
    google_ads: 'Google Ads',
    slack: 'Slack',
    notion: 'Notion',
  };
  return names[toolId] || toolId;
}

function showAddMcpTool() {
  document.getElementById('add-mcp-modal').style.display = 'flex';
  loadAvailableTools();
  document.getElementById('mcp-tool-form').style.display = 'none';
  document.getElementById('add-mcp-btn').style.display = 'none';
}

function hideAddMcpModal() {
  document.getElementById('add-mcp-modal').style.display = 'none';
}

async function loadAvailableTools() {
  try {
    const res = await fetch('/api/clients/mcp-tools/available');
    const data = await res.json();
    availableTools = data.tools;
    
    const grid = document.getElementById('tool-selector-grid');
    grid.innerHTML = availableTools.map(tool => `
      <div class="tool-card" onclick="selectTool('${tool.id}')">
        <span class="tool-icon">${tool.icon}</span>
        <div class="tool-name">${tool.name}</div>
        <div class="tool-desc">${tool.description}</div>
      </div>
    `).join('');
  } catch (err) {
    showToast('Failed to load available tools', 'error');
  }
}

function selectTool(toolId) {
  const tool = availableTools.find(t => t.id === toolId);
  if (!tool) return;
  
  document.getElementById('mcp-form-title').textContent = `Configure ${tool.name}`;
  
  const fields = document.getElementById('mcp-form-fields');
  fields.innerHTML = tool.fields.map(field => `
    <div class="form-group">
      <label for="mcp-field-${field.key}">${field.label}${field.required ? ' *' : ''}</label>
      <input type="${field.type === 'textarea' ? 'text' : field.type}" 
             id="mcp-field-${field.key}" 
             placeholder="${field.default || ''}"
             ${field.required ? 'required' : ''}>
      ${field.default ? `<p class="form-hint">Default: ${field.default}</p>` : ''}
    </div>
  `).join('');
  
  document.getElementById('mcp-tool-form').style.display = 'block';
  document.getElementById('add-mcp-btn').style.display = 'inline-block';
  document.getElementById('add-mcp-btn').dataset.toolId = toolId;
}

async function addMcpTool() {
  if (!currentSlug) return;
  const btn = document.getElementById('add-mcp-btn');
  const toolId = btn.dataset.toolId;
  const tool = availableTools.find(t => t.id === toolId);
  
  if (!tool) return;
  
  const config = {};
  let missing = false;
  
  for (const field of tool.fields) {
    const input = document.getElementById(`mcp-field-${field.key}`);
    const value = input.value.trim();
    if (field.required && !value) {
      missing = true;
      break;
    }
    if (value) config[field.key] = value;
  }
  
  if (missing) {
    showToast('All required fields must be filled', 'error');
    return;
  }
  
  try {
    await fetch(`/api/clients/${currentSlug}/mcp-tools/${toolId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    hideAddMcpModal();
    showToast('MCP tool added!', 'success');
    loadMcpTools(currentSlug);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function testMcpTool(toolId) {
  if (!currentSlug) return;
  showToast('Testing connection...', 'info');
  try {
    const res = await fetch(`/api/clients/${currentSlug}/mcp-tools/${toolId}/test`, {
      method: 'POST',
    });
    const data = await res.json();
    showToast(data.message || 'Test complete', data.success ? 'success' : 'error');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function toggleMcpTool(toolId) {
  if (!currentSlug) return;
  try {
    await fetch(`/api/clients/${currentSlug}/mcp-tools/${toolId}/toggle`, {
      method: 'POST',
    });
    showToast('Tool toggled', 'success');
    loadMcpTools(currentSlug);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function removeMcpTool(toolId) {
  if (!currentSlug) return;
  if (!confirm('Remove this MCP tool?')) return;
  try {
    await fetch(`/api/clients/${currentSlug}/mcp-tools/${toolId}`, {
      method: 'DELETE',
    });
    showToast('MCP tool removed', 'success');
    loadMcpTools(currentSlug);
  } catch (err) {
    showToast(err.message, 'error');
  }
}
