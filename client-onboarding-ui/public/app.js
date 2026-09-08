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
        <span>MCP: ${client.config?.mcpCount || 0}</span>
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

// ===== Onboarding Wizard =====

let wizardStep = 1;
const wizardState = {
  name: '',
  description: '',
  whatsappGroups: [],
  slackChannels: [],
  mcpTools: [],
};

function showCreateModal() {
  document.getElementById('wizard-modal').style.display = 'flex';
  resetWizard();
  // Load available MCP tools for the wizard
  if (availableTools.length === 0) {
    loadAvailableTools();
  }
}

function hideWizardModal() {
  document.getElementById('wizard-modal').style.display = 'none';
  resetWizard();
}

function resetWizard() {
  wizardStep = 1;
  wizardState.name = '';
  wizardState.description = '';
  wizardState.whatsappGroups = [];
  wizardState.slackChannels = [];
  wizardState.mcpTools = [];
  
  document.getElementById('wizard-client-name').value = '';
  document.getElementById('wizard-client-description').value = '';
  
  updateWizardUI();
  renderWizardChannels();
  renderWizardMcpTools();
}

function updateWizardUI() {
  // Update step indicators
  for (let i = 1; i <= 4; i++) {
    const step = document.getElementById(`wizard-step-${i}`);
    step.classList.remove('active', 'completed');
    if (i === wizardStep) step.classList.add('active');
    else if (i < wizardStep) step.classList.add('completed');
  }
  
  // Show/hide content
  for (let i = 1; i <= 4; i++) {
    const content = document.getElementById(`wizard-content-${i}`);
    content.style.display = i === wizardStep ? 'block' : 'none';
  }
  
  // Update buttons
  document.getElementById('wizard-back-btn').style.display = wizardStep > 1 ? 'inline-block' : 'none';
  document.getElementById('wizard-next-btn').style.display = wizardStep < 4 ? 'inline-block' : 'none';
  document.getElementById('wizard-deploy-btn').style.display = wizardStep === 4 ? 'inline-block' : 'none';
  
  // Update review if on step 4
  if (wizardStep === 4) {
    updateReview();
  }
}

function wizardNext() {
  if (wizardStep === 1) {
    const name = document.getElementById('wizard-client-name').value.trim();
    if (!name) {
      showToast('Client name is required', 'error');
      return;
    }
    wizardState.name = name;
    wizardState.description = document.getElementById('wizard-client-description').value.trim();
  }
  
  if (wizardStep < 4) {
    wizardStep++;
    updateWizardUI();
    // Load MCP tools when navigating to step 3
    if (wizardStep === 3 && availableTools.length === 0) {
      loadAvailableTools();
    }
  }
}

function wizardBack() {
  if (wizardStep > 1) {
    wizardStep--;
    updateWizardUI();
  }
}

function renderWizardChannels() {
  const waList = document.getElementById('wizard-whatsapp-groups');
  if (wizardState.whatsappGroups.length > 0) {
    waList.innerHTML = wizardState.whatsappGroups.map(g => `
      <div class="channel-item">
        <div>
          <div>${escapeHtml(g.name)}</div>
          <div style="font-size:0.75rem;color:var(--text-muted);">${g.groupId}</div>
        </div>
        <button class="btn btn-danger btn-sm" onclick="removeWizardWhatsApp('${g.groupId}')">Remove</button>
      </div>
    `).join('');
  } else {
    waList.innerHTML = '<p class="info-text">No WhatsApp groups added</p>';
  }
  
  const slackList = document.getElementById('wizard-slack-channels');
  if (wizardState.slackChannels.length > 0) {
    slackList.innerHTML = wizardState.slackChannels.map(c => `
      <div class="channel-item">
        <div>
          <div>${escapeHtml(c.name)}</div>
          <div style="font-size:0.75rem;color:var(--text-muted);">${c.channelId}</div>
        </div>
        <button class="btn btn-danger btn-sm" onclick="removeWizardSlack('${c.channelId}')">Remove</button>
      </div>
    `).join('');
  } else {
    slackList.innerHTML = '<p class="info-text">No Slack channels added</p>';
  }
}

// Old renderWizardMcpTools and wizardAddMcpTool replaced below

function updateReview() {
  document.getElementById('review-name').textContent = wizardState.name || '—';
  document.getElementById('review-desc').textContent = wizardState.description || '—';
  document.getElementById('review-whatsapp').textContent = wizardState.whatsappGroups.length;
  document.getElementById('review-slack').textContent = wizardState.slackChannels.length;
  
  const mcpList = document.getElementById('review-mcp-tools');
  if (wizardState.mcpTools.length > 0) {
    mcpList.innerHTML = wizardState.mcpTools.map(t => 
      `<span class="tag">${getToolIcon(t.id)} ${getToolName(t.id)}</span>`
    ).join('');
  } else {
    mcpList.innerHTML = '<span class="info-text">None selected</span>';
  }
}

async function wizardDeploy() {
  showToast('Creating client...', 'info');
  
  try {
    // Create client
    const createRes = await fetch('/api/clients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: wizardState.name, description: wizardState.description }),
    });
    
    if (!createRes.ok) {
      const data = await createRes.json();
      throw new Error(data.error);
    }
    
    const { client } = await createRes.json();
    const slug = client.slug;
    
    // Add WhatsApp groups
    for (const group of wizardState.whatsappGroups) {
      await fetch(`/api/clients/${slug}/channels/whatsapp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupId: group.groupId, groupName: group.name }),
      });
    }
    
    // Add Slack channels
    for (const channel of wizardState.slackChannels) {
      await fetch(`/api/clients/${slug}/channels/slack`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId: channel.channelId, channelName: channel.name }),
      });
    }
    
    // Add MCP tools
    for (const tool of wizardState.mcpTools) {
      await fetch(`/api/clients/${slug}/mcp-tools/${tool.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tool.config),
      });
    }
    
    hideWizardModal();
    showToast('Client created successfully!', 'success');
    loadClients();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Wizard channel/tool management
function wizardAddWhatsAppGroup() {
  const container = document.createElement('div');
  container.innerHTML = `
    <div class="inline-form" id="inline-wa-form">
      <div class="form-row">
        <input type="text" id="wizard-wa-group-id" placeholder="Group ID (e.g., 1203630123456789)" class="inline-input">
        <input type="text" id="wizard-wa-group-name" placeholder="Group Name" class="inline-input">
        <button class="btn btn-primary btn-sm" onclick="confirmAddWhatsApp()">Add</button>
        <button class="btn btn-secondary btn-sm" onclick="cancelAddWhatsApp()">Cancel</button>
      </div>
    </div>
  `;
  document.getElementById('wizard-whatsapp-groups').prepend(container);
  document.getElementById('wizard-wa-group-id').focus();
}

function confirmAddWhatsApp() {
  const groupId = document.getElementById('wizard-wa-group-id').value.trim();
  const groupName = document.getElementById('wizard-wa-group-name').value.trim() || `Group ${groupId}`;
  
  if (!groupId || !/^\d+$/.test(groupId.replace(/@g\.us$/, ''))) {
    showToast('Invalid group ID format', 'error');
    return;
  }
  
  wizardState.whatsappGroups.push({ groupId: groupId.replace(/@g\.us$/, ''), name: groupName });
  document.getElementById('inline-wa-form').remove();
  renderWizardChannels();
}

function cancelAddWhatsApp() {
  document.getElementById('inline-wa-form').remove();
}

function removeWizardWhatsApp(groupId) {
  wizardState.whatsappGroups = wizardState.whatsappGroups.filter(g => g.groupId !== groupId);
  renderWizardChannels();
}

function wizardAddSlackChannel() {
  const container = document.createElement('div');
  container.innerHTML = `
    <div class="inline-form" id="inline-slack-form">
      <div class="form-row">
        <input type="text" id="wizard-slack-channel-id" placeholder="Channel ID (e.g., C0AQ4C19F25)" class="inline-input">
        <input type="text" id="wizard-slack-channel-name" placeholder="Channel Name" class="inline-input">
        <button class="btn btn-primary btn-sm" onclick="confirmAddSlack()">Add</button>
        <button class="btn btn-secondary btn-sm" onclick="cancelAddSlack()">Cancel</button>
      </div>
    </div>
  `;
  document.getElementById('wizard-slack-channels').prepend(container);
  document.getElementById('wizard-slack-channel-id').focus();
}

function confirmAddSlack() {
  const channelId = document.getElementById('wizard-slack-channel-id').value.trim();
  const channelName = document.getElementById('wizard-slack-channel-name').value.trim() || `Channel ${channelId}`;
  
  if (!channelId || !/^[A-Za-z0-9_]+$/.test(channelId)) {
    showToast('Invalid channel ID format', 'error');
    return;
  }
  
  wizardState.slackChannels.push({ channelId, name: channelName });
  document.getElementById('inline-slack-form').remove();
  renderWizardChannels();
}

function cancelAddSlack() {
  document.getElementById('inline-slack-form').remove();
}

function removeWizardSlack(channelId) {
  wizardState.slackChannels = wizardState.slackChannels.filter(c => c.channelId !== channelId);
  renderWizardChannels();
}

// ===== Wizard MCP Tools =====

function renderWizardMcpTools() {
  const list = document.getElementById('wizard-mcp-tools');
  if (!list) return;
  
  if (wizardState.mcpTools.length > 0) {
    list.innerHTML = `
      <div class="selected-tools-list">
        ${wizardState.mcpTools.map(t => `
          <div class="selected-tool-tag">
            <span class="tool-icon-sm">${getToolIcon(t.id)}</span>
            <span>${getToolName(t.id)}</span>
            <button class="btn-remove" onclick="removeWizardMcpTool('${t.id}')">×</button>
          </div>
        `).join('')}
      </div>
      <button class="btn btn-secondary btn-sm" onclick="showWizardMcpPicker()">+ Add Tool</button>
    `;
  } else {
    list.innerHTML = `
      <div class="empty-mcp-state">
        <p class="info-text">No MCP tools selected</p>
        <p class="form-hint">MCP tools provide analytics, ads, and integrations</p>
        <button class="btn btn-primary btn-sm" onclick="showWizardMcpPicker()">+ Add Tool</button>
      </div>
    `;
  }
}

function showWizardMcpPicker() {
  const list = document.getElementById('wizard-mcp-tools');
  if (!list) return;
  
  list.innerHTML = `
    <div class="mcp-picker-inline">
      <h4>Choose a tool</h4>
      <div class="tool-grid compact">
        ${availableTools.map(tool => {
          const isAdded = wizardState.mcpTools.find(t => t.id === tool.id);
          return `
          <div class="tool-card compact ${isAdded ? 'added' : ''}" 
               onclick="${isAdded ? '' : `showWizardMcpConfig('${tool.id}')`}">
            <span class="tool-icon">${tool.icon}</span>
            <div class="tool-name">${tool.name}</div>
            ${isAdded ? '<div class="added-badge">✓</div>' : ''}
          </div>
        `}).join('')}
      </div>
      <button class="btn btn-secondary btn-sm" onclick="renderWizardMcpTools()">Cancel</button>
    </div>
  `;
}

function showWizardMcpConfig(toolId) {
  const tool = availableTools.find(t => t.id === toolId);
  if (!tool) return;
  
  const list = document.getElementById('wizard-mcp-tools');
  if (!list) return;
  
  list.innerHTML = `
    <div class="mcp-config-inline">
      <h4>Configure ${tool.name}</h4>
      ${tool.fields.map(field => `
        <div class="form-group">
          <label>${field.label}${field.required ? ' *' : ''}</label>
          <input type="${field.type === 'textarea' ? 'text' : field.type}" 
                 id="wizard-mcp-${field.key}" 
                 placeholder="${field.default || ''}">
        </div>
      `).join('')}
      <div class="form-row">
        <button class="btn btn-primary btn-sm" onclick="addWizardMcpTool('${toolId}')">Add</button>
        <button class="btn btn-secondary btn-sm" onclick="showWizardMcpPicker()">Back</button>
      </div>
    </div>
  `;
}

function addWizardMcpTool(toolId) {
  const tool = availableTools.find(t => t.id === toolId);
  if (!tool) return;
  
  const config = {};
  let missing = false;
  
  for (const field of tool.fields) {
    const input = document.getElementById(`wizard-mcp-${field.key}`);
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
  
  wizardState.mcpTools.push({ id: toolId, config });
  renderWizardMcpTools();
}

function removeWizardMcpTool(toolId) {
  wizardState.mcpTools = wizardState.mcpTools.filter(t => t.id !== toolId);
  renderWizardMcpTools();
}

// ===== Client Detail =====

async function openClientDetail(slug) {
  currentSlug = slug;
  
  try {
    const res = await fetch(`/api/clients/${slug}`);
    if (!res.ok) throw new Error('Failed to fetch client');
    
    const data = await res.json();
    const client = data.client;
    
    // Safely set DOM elements (some may not exist in all views)
    const setTitle = (id, text) => {
      const el = document.getElementById(id);
      if (el) el.textContent = text;
    };
    const setValue = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.value = val;
    };
    
    setTitle('detail-title', client.slug);
    setTitle('overview-client-name', client.slug);
    setTitle('overview-profile-path', client.path);
    setValue('detail-config-yaml', JSON.stringify(client.config, null, 2));
    setValue('detail-soul-md', client.soulContent);
    
    // Load status
    await loadGatewayStatus(slug);
    
    // Load channels (if on channels tab)
    if (document.getElementById('detail-channels')) {
      await loadChannels(slug);
    }
    
    // Load MCP tools (if on MCP tab)
    if (document.getElementById('mcp-tools-list')) {
      await loadMcpTools(slug);
    }
    
    // Update stats
    if (typeof updateOverviewStats === 'function') {
      await updateOverviewStats(slug);
    }
    
    // Show modal
    document.getElementById('detail-modal').style.display = 'flex';
  } catch (err) {
    console.error('Failed to load client details:', err);
    showToast('Failed to load client details', 'error');
  }
}

async function updateOverviewStats(slug) {
  try {
    // Count channels
    const channelsRes = await fetch(`/api/clients/${slug}/channels`);
    const channelsData = await channelsRes.json();
    const channelCount = channelsData.channels.whatsapp.groups.length + channelsData.channels.slack_connect.channels.length;
    document.getElementById('stat-channels').textContent = channelCount;
    
    // Count MCP tools
    const mcpRes = await fetch(`/api/clients/${slug}/mcp-tools`);
    const mcpData = await mcpRes.json();
    document.getElementById('stat-mcp-tools').textContent = Object.keys(mcpData.tools || {}).length;
    
    // Tasks placeholder (would need Notion API)
    document.getElementById('stat-tasks').textContent = '—';
  } catch (err) {
    // Ignore stats errors
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
    
    // Update overview badge
    const overviewBadge = document.getElementById('overview-gateway-status');
    if (overviewBadge) {
      overviewBadge.textContent = `● ${status.status}`;
      overviewBadge.className = `status-badge ${status.status}`;
    }
    
    // Update detail badge (if exists)
    const detailBadge = document.getElementById('detail-gateway-status');
    if (detailBadge) {
      detailBadge.textContent = status.status;
      detailBadge.className = `status-badge ${status.status}`;
    }
  } catch {
    const badge = document.getElementById('overview-gateway-status') || document.getElementById('detail-gateway-status');
    if (badge) badge.textContent = '● unknown';
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
  const targetSlug = slug || currentSlug;
  if (!targetSlug) return;
  
  try {
    const res = await fetch(`/api/clients/${targetSlug}/mcp-tools`);
    const data = await res.json();
    const tools = data.tools || {};
    
    const list = document.getElementById('mcp-tools-list');
    if (!list) return; // Not on overview tab
    
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
  document.getElementById('mcp-step-select').style.display = 'block';
  document.getElementById('mcp-step-config').style.display = 'none';
  document.getElementById('mcp-back-btn').style.display = 'none';
  document.getElementById('add-mcp-btn').style.display = 'none';
  loadAvailableTools();
}

function hideAddMcpModal() {
  document.getElementById('add-mcp-modal').style.display = 'none';
}

function mcpBack() {
  document.getElementById('mcp-step-select').style.display = 'block';
  document.getElementById('mcp-step-config').style.display = 'none';
  document.getElementById('mcp-back-btn').style.display = 'none';
  document.getElementById('add-mcp-btn').style.display = 'none';
  // Clear selection
  document.querySelectorAll('.tool-card').forEach(c => c.classList.remove('selected'));
}

async function loadAvailableTools() {
  try {
    const res = await fetch('/api/clients/mcp-tools/available');
    const data = await res.json();
    availableTools = data.tools;
    
    const grid = document.getElementById('tool-selector-grid');
    grid.innerHTML = availableTools.map(tool => `
      <div class="tool-card" onclick="selectTool('${tool.id}')" id="tool-card-${tool.id}">
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
  
  // Show selection state
  document.querySelectorAll('.tool-card').forEach(c => c.classList.remove('selected'));
  document.getElementById(`tool-card-${toolId}`).classList.add('selected');
  
  // Populate form
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
  
  // Transition to step 2
  document.getElementById('mcp-step-select').style.display = 'none';
  document.getElementById('mcp-step-config').style.display = 'block';
  document.getElementById('mcp-back-btn').style.display = 'inline-block';
  document.getElementById('add-mcp-btn').style.display = 'inline-block';
  document.getElementById('add-mcp-btn').dataset.toolId = toolId;
}

async function addMcpTool() {
  if (!currentSlug) return;
  const btn = document.getElementById('add-mcp-btn');
  const toolId = btn.dataset.toolId;
  const tool = availableTools.find(t => t.id === toolId);
  const isWizard = btn.dataset.wizardMode === 'true';
  
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
    if (isWizard) {
      // Just store in wizard state
      wizardState.mcpTools.push({ id: toolId, config });
      hideAddMcpModal();
      renderWizardMcpTools();
      showToast('Tool added to wizard', 'success');
    } else {
      // Direct API call
      await fetch(`/api/clients/${currentSlug}/mcp-tools/${toolId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      hideAddMcpModal();
      showToast('MCP tool added!', 'success');
      loadMcpTools(currentSlug);
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
  
  // Clear wizard mode
  btn.dataset.wizardMode = 'false';
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
