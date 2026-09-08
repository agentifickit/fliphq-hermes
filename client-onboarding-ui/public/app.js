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
