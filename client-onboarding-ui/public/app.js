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
  
  if (tab === 'logs' && currentSlug) {
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

// ===== Init =====

document.addEventListener('DOMContentLoaded', loadClients);
