// FlipHQ Client Onboarding UI — Frontend Logic
// Clean rewrite with loading states, confirmations, and error boundaries

const App = {
  currentSlug: null,
  currentTab: 'overview',
  wizardStep: 1,
  availableTools: [],
  wizardState: { name: '', description: '', whatsappGroups: [], slackChannels: [], mcpTools: [] },

  // ===== Init =====
  init() {
    this.loadClients();
  },

  // ===== Loading States =====
  setLoading(elId, isLoading) {
    const el = document.getElementById(elId);
    if (!el) return;
    
    if (isLoading) {
      el.classList.add('loading');
      el.dataset.originalContent = el.innerHTML;
      el.innerHTML = '<div class="spinner"></div>';
    } else {
      el.classList.remove('loading');
      if (el.dataset.originalContent) {
        el.innerHTML = el.dataset.originalContent;
        delete el.dataset.originalContent;
      }
    }
  },

  // ===== Confirmation Dialogs =====
  confirm(message, onConfirm, title = 'Confirm') {
    const modal = document.createElement('div');
    modal.className = 'modal confirm-modal';
    modal.innerHTML = `
      <div class="modal-overlay" onclick="this.closest('.modal').remove()"></div>
      <div class="modal-content modal-small">
        <div class="modal-header">
          <h3>${this.escapeHtml(title)}</h3>
          <button class="modal-close" onclick="this.closest('.modal').remove()">×</button>
        </div>
        <div class="modal-body">
          <p>${this.escapeHtml(message)}</p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="this.closest('.modal').remove()">Cancel</button>
          <button class="btn btn-danger" id="confirm-btn">Confirm</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    
    modal.querySelector('#confirm-btn').onclick = () => {
      modal.remove();
      onConfirm();
    };
  },

  // ===== Error Boundaries =====
  handleError(err, context = 'Operation failed') {
    console.error(`[${context}]`, err);
    this.showToast(`${context}: ${err.message}`, 'error');
  },

  // ===== Client List =====
  async loadClients() {
    this.setLoading('client-list', true);
    try {
      const res = await fetch('/api/clients');
      const data = await res.json();
      const list = document.getElementById('client-list');
      const empty = document.getElementById('empty-state');
      
      if (!data.clients.length) {
        list.style.display = 'none';
        empty.style.display = 'block';
        return;
      }
      
      list.style.display = 'grid';
      empty.style.display = 'none';
      
      const clientsWithStatus = await Promise.all(data.clients.map(async (c) => {
        try {
          const statusRes = await fetch(`/api/clients/${c.slug}/status`);
          const statusData = await statusRes.json();
          return { ...c, gateway: statusData.status };
        } catch {
          return { ...c, gateway: { status: 'unknown' } };
        }
      }));
      
      list.innerHTML = clientsWithStatus.map(c => this.renderClientCard(c)).join('');
      // Clear saved loading content so setLoading(false) doesn't wipe rendered cards
      delete list.dataset.originalContent;
    } catch (err) {
      this.handleError(err, 'Failed to load clients');
    } finally {
      this.setLoading('client-list', false);
    }
  },

  renderClientCard(client) {
    const status = client.gateway?.status || 'unknown';
    const channels = (client.config?.channels || []).map(ch => 
      `<span class="channel-badge">${this.getChannelIcon(ch)} ${ch}</span>`
    ).join('');
    
    return `
      <div class="client-card" onclick="App.openClientDetail('${client.slug}')">
        <div class="client-card-header">
          <div>
            <div class="client-name">${this.escapeHtml(client.name)}</div>
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
  },

  getChannelIcon(channel) {
    const icons = { whatsapp: '📱', 'slack-connect': '💬', telegram: '✈️' };
    return icons[channel] || '🔗';
  },

  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  },

  // ===== Client Detail =====
  async openClientDetail(slug) {
    this.currentSlug = slug;
    
    try {
      const res = await fetch(`/api/clients/${slug}`);
      if (!res.ok) throw new Error('Failed to fetch client');
      
      const { client } = await res.json();
      
      const setText = (id, text) => {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
      };
      const setValue = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.value = val;
      };
      
      setText('detail-title', client.slug);
      setText('overview-client-name', client.slug);
      setText('overview-profile-path', client.path);
      setValue('detail-config-yaml', JSON.stringify(client.config, null, 2));
      setValue('detail-soul-md', client.soulContent);
      
      await this.loadGatewayStatus(slug);
      
      if (document.getElementById('detail-channels')) {
        await this.loadChannels(slug);
      }
      
      if (document.getElementById('mcp-tools-list')) {
        await this.loadMcpTools(slug);
      }
      
      await this.updateOverviewStats(slug);
      
      document.getElementById('detail-modal').style.display = 'flex';
    } catch (err) {
      console.error('Failed to load client details:', err);
      this.showToast('Failed to load client details', 'error');
    }
  },

  hideDetailModal() {
    document.getElementById('detail-modal').style.display = 'none';
    this.currentSlug = null;
  },

  async loadGatewayStatus(slug) {
    try {
      const res = await fetch(`/api/clients/${slug}/status`);
      const data = await res.json();
      const status = data.status;
      
      const overviewBadge = document.getElementById('overview-gateway-status');
      if (overviewBadge) {
        overviewBadge.textContent = `● ${status.status}`;
        overviewBadge.className = `status-badge ${status.status}`;
      }
    } catch {
      const badge = document.getElementById('overview-gateway-status');
      if (badge) badge.textContent = '● unknown';
    }
  },

  async updateOverviewStats(slug) {
    try {
      const channelsRes = await fetch(`/api/clients/${slug}/channels`);
      const channelsData = await channelsRes.json();
      const channelCount = channelsData.channels.whatsapp.groups.length + 
                          channelsData.channels.slack_connect.channels.length;
      const statChannels = document.getElementById('stat-channels');
      if (statChannels) statChannels.textContent = channelCount;
      
      const mcpRes = await fetch(`/api/clients/${slug}/mcp-tools`);
      const mcpData = await mcpRes.json();
      const statMcp = document.getElementById('stat-mcp-tools');
      if (statMcp) statMcp.textContent = Object.keys(mcpData.tools || {}).length;
      
      const statTasks = document.getElementById('stat-tasks');
      if (statTasks) statTasks.textContent = '—';
    } catch {
      // Ignore stats errors
    }
  },

  // ===== Tabs =====
  switchTab(tab) {
    this.currentTab = tab;
    
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    
    event.target.classList.add('active');
    document.getElementById(`tab-${tab}`).classList.add('active');
    
    if (tab === 'channels' && this.currentSlug) {
      this.loadChannels(this.currentSlug);
    } else if (tab === 'mcp' && this.currentSlug) {
      this.loadMcpTools(this.currentSlug);
    } else if (tab === 'logs' && this.currentSlug) {
      this.refreshLogs();
    }
  },

  // ===== Channels =====
  async loadChannels(slug) {
    try {
      const res = await fetch(`/api/clients/${slug}/channels`);
      const data = await res.json();
      const channels = data.channels;
      
      const waList = document.getElementById('detail-whatsapp-groups') || document.getElementById('wizard-whatsapp-groups');
      if (channels.whatsapp.groups.length > 0) {
        const html = channels.whatsapp.groups.map(g => `
          <div class="channel-item">
            <div>
              <div>${this.escapeHtml(g.name)}</div>
              <div style="font-size:0.75rem;color:var(--text-muted);">${g.groupId}</div>
            </div>
          </div>
        `).join('');
        if (waList) waList.innerHTML = html;
      }
    } catch (err) {
      this.showToast('Failed to load channels', 'error');
    }
  },

  // ===== MCP Tools =====
  async loadMcpTools(slug) {
    try {
      const res = await fetch(`/api/clients/${slug}/mcp-tools`);
      const data = await res.json();
      const tools = data.tools || {};
      
      const list = document.getElementById('mcp-tools-list');
      if (!list) return;
      
      if (Object.keys(tools).length > 0) {
        list.innerHTML = Object.entries(tools).map(([id, tool]) => `
          <div class="mcp-tool-card">
            <div class="mcp-tool-header">
              <span class="mcp-tool-icon">${this.getToolIcon(id)}</span>
              <div class="mcp-tool-info">
                <div class="mcp-tool-name">${this.getToolName(id)}</div>
                <div class="mcp-tool-status ${tool.enabled ? 'enabled' : 'disabled'}">${tool.enabled ? '● Enabled' : '○ Disabled'}</div>
              </div>
            </div>
            <div class="mcp-tool-actions">
              <button class="btn btn-secondary btn-sm" onclick="App.testMcpTool('${id}')">Test</button>
              <button class="btn btn-secondary btn-sm" onclick="App.toggleMcpTool('${id}')">${tool.enabled ? 'Disable' : 'Enable'}</button>
              <button class="btn btn-danger btn-sm" onclick="App.removeMcpTool('${id}')">Remove</button>
            </div>
          </div>
        `).join('');
      } else {
        list.innerHTML = '<p class="info-text">No MCP tools configured</p>';
      }
    } catch (err) {
      this.showToast('Failed to load MCP tools', 'error');
    }
  },

  getToolIcon(toolId) {
    const icons = {
      posthog: '📊', google_analytics: '📈', windsor: '🎥', figma: '🎨',
      meta_ads: '📘', google_ads: '🔍', slack: '💬', notion: '📝',
    };
    return icons[toolId] || '🔧';
  },

  getToolName(toolId) {
    const names = {
      posthog: 'PostHog', google_analytics: 'Google Analytics', windsor: 'Windsor.ai',
      figma: 'Figma', meta_ads: 'Meta Ads', google_ads: 'Google Ads', slack: 'Slack', notion: 'Notion',
    };
    return names[toolId] || toolId;
  },

  async testMcpTool(toolId) {
    if (!this.currentSlug) return;
    this.showToast('Testing connection...', 'info');
    try {
      const res = await fetch(`/api/clients/${this.currentSlug}/mcp-tools/${toolId}/test`, { method: 'POST' });
      const data = await res.json();
      this.showToast(data.message || 'Test complete', data.success ? 'success' : 'error');
    } catch (err) {
      this.showToast(err.message, 'error');
    }
  },

  async toggleMcpTool(toolId) {
    if (!this.currentSlug) return;
    try {
      await fetch(`/api/clients/${this.currentSlug}/mcp-tools/${toolId}/toggle`, { method: 'POST' });
      this.showToast('Tool toggled', 'success');
      this.loadMcpTools(this.currentSlug);
    } catch (err) {
      this.showToast(err.message, 'error');
    }
  },

  async removeMcpTool(toolId) {
    if (!this.currentSlug) return;
    this.confirm(`Remove ${this.getToolName(toolId)} from this client?`, async () => {
      this.setLoading('mcp-tools-list', true);
      try {
        await fetch(`/api/clients/${this.currentSlug}/mcp-tools/${toolId}`, { method: 'DELETE' });
        this.showToast('MCP tool removed', 'success');
        this.loadMcpTools(this.currentSlug);
      } catch (err) {
        this.handleError(err, 'Failed to remove tool');
      } finally {
        this.setLoading('mcp-tools-list', false);
      }
    }, 'Remove Tool');
  },

  // ===== Gateway Controls =====
  async startGateway() {
    if (!this.currentSlug) return;
    this.confirm('Start the gateway for this client?', async () => {
      this.setLoading('gateway-status', true);
      try {
        const res = await fetch(`/api/clients/${this.currentSlug}/start`, { method: 'POST' });
        const data = await res.json();
        this.showToast(data.status, 'success');
        this.loadGatewayStatus(this.currentSlug);
      } catch (err) {
        this.handleError(err, 'Failed to start gateway');
      } finally {
        this.setLoading('gateway-status', false);
      }
    }, 'Start Gateway');
  },

  async stopGateway() {
    if (!this.currentSlug) return;
    this.confirm('Stop the gateway for this client?', async () => {
      this.setLoading('gateway-status', true);
      try {
        const res = await fetch(`/api/clients/${this.currentSlug}/stop`, { method: 'POST' });
        const data = await res.json();
        this.showToast(data.status, 'success');
        this.loadGatewayStatus(this.currentSlug);
      } catch (err) {
        this.handleError(err, 'Failed to stop gateway');
      } finally {
        this.setLoading('gateway-status', false);
      }
    }, 'Stop Gateway');
  },

  async restartGateway() {
    if (!this.currentSlug) return;
    this.confirm('Restart the gateway for this client?', async () => {
      this.setLoading('gateway-status', true);
      try {
        const res = await fetch(`/api/clients/${this.currentSlug}/restart`, { method: 'POST' });
        const data = await res.json();
        this.showToast(data.status, 'success');
        this.loadGatewayStatus(this.currentSlug);
      } catch (err) {
        this.handleError(err, 'Failed to restart gateway');
      } finally {
        this.setLoading('gateway-status', false);
      }
    }, 'Restart Gateway');
  },

  async deployClient() {
    if (!this.currentSlug) return;
    this.confirm('Deploy this client? This will apply the latest configuration.', async () => {
      this.setLoading('btn-deploy', true);
      try {
        const res = await fetch(`/api/clients/${this.currentSlug}/deploy`, { method: 'POST' });
        const data = await res.json();
        this.showToast('Deploy complete!', 'success');
      } catch (err) {
        this.handleError(err, 'Failed to deploy');
      } finally {
        this.setLoading('btn-deploy', false);
      }
    }, 'Deploy Client');
  },

  async saveConfig() {
    if (!this.currentSlug) return;
    try {
      const configYaml = document.getElementById('detail-config-yaml').value;
      const soulMd = document.getElementById('detail-soul-md').value;
      let config;
      try {
        config = JSON.parse(configYaml);
      } catch {
        this.showToast('Invalid JSON in config editor', 'error');
        return;
      }
      
      const res = await fetch(`/api/clients/${this.currentSlug}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config, soulContent: soulMd }),
      });
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error);
      }
      
      this.showToast('Config saved!', 'success');
    } catch (err) {
      this.showToast(err.message, 'error');
    }
  },

  // ===== Logs =====
  async refreshLogs() {
    if (!this.currentSlug) return;
    const lines = document.getElementById('log-lines')?.value || 100;
    try {
      const res = await fetch(`/api/clients/${this.currentSlug}/logs?lines=${lines}`);
      const data = await res.json();
      const viewer = document.getElementById('gateway-logs');
      viewer.textContent = data.logs.length ? data.logs.join('\n') : 'No logs yet.';
    } catch (err) {
      document.getElementById('gateway-logs').textContent = 'Failed to load logs.';
    }
  },

  // ===== Onboarding Wizard =====
  showCreateModal() {
    document.getElementById('wizard-modal').style.display = 'flex';
    this.resetWizard();
    if (this.availableTools.length === 0) {
      this.loadAvailableTools();
    }
  },

  hideWizardModal() {
    document.getElementById('wizard-modal').style.display = 'none';
    this.resetWizard();
  },

  resetWizard() {
    this.wizardStep = 1;
    this.wizardState = { name: '', description: '', whatsappGroups: [], slackChannels: [], mcpTools: [] };
    
    const nameEl = document.getElementById('wizard-client-name');
    const descEl = document.getElementById('wizard-client-description');
    if (nameEl) nameEl.value = '';
    if (descEl) descEl.value = '';
    
    this.updateWizardUI();
    this.renderWizardChannels();
    this.renderWizardMcpTools();
  },

  updateWizardUI() {
    for (let i = 1; i <= 4; i++) {
      const step = document.getElementById(`wizard-step-${i}`);
      if (step) {
        step.classList.remove('active', 'completed');
        if (i === this.wizardStep) step.classList.add('active');
        else if (i < this.wizardStep) step.classList.add('completed');
      }
    }
    
    for (let i = 1; i <= 4; i++) {
      const content = document.getElementById(`wizard-content-${i}`);
      if (content) content.style.display = i === this.wizardStep ? 'block' : 'none';
    }
    
    const backBtn = document.getElementById('wizard-back-btn');
    const nextBtn = document.getElementById('wizard-next-btn');
    const deployBtn = document.getElementById('wizard-deploy-btn');
    if (backBtn) backBtn.style.display = this.wizardStep > 1 ? 'inline-block' : 'none';
    if (nextBtn) nextBtn.style.display = this.wizardStep < 4 ? 'inline-block' : 'none';
    if (deployBtn) deployBtn.style.display = this.wizardStep === 4 ? 'inline-block' : 'none';
    
    if (this.wizardStep === 4) this.updateReview();
  },

  wizardNext() {
    if (this.wizardStep === 1) {
      const name = document.getElementById('wizard-client-name').value.trim();
      if (!name) {
        this.showToast('Client name is required', 'error');
        return;
      }
      this.wizardState.name = name;
      this.wizardState.description = document.getElementById('wizard-client-description').value.trim();
    }
    
    if (this.wizardStep < 4) {
      this.wizardStep++;
      this.updateWizardUI();
      if (this.wizardStep === 3 && this.availableTools.length === 0) {
        this.loadAvailableTools();
      }
    }
  },

  wizardBack() {
    if (this.wizardStep > 1) {
      this.wizardStep--;
      this.updateWizardUI();
    }
  },

  renderWizardChannels() {
    const waList = document.getElementById('wizard-whatsapp-groups');
    if (this.wizardState.whatsappGroups.length > 0) {
      const html = this.wizardState.whatsappGroups.map(g => `
        <div class="channel-item">
          <div>
            <div>${this.escapeHtml(g.name)}</div>
            <div style="font-size:0.75rem;color:var(--text-muted);">${g.groupId}</div>
          </div>
          <button class="btn btn-danger btn-sm" onclick="App.removeWizardWhatsApp('${g.groupId}')">Remove</button>
        </div>
      `).join('');
      if (waList) waList.innerHTML = html;
    } else {
      if (waList) waList.innerHTML = '<p class="info-text">No WhatsApp groups added</p>';
    }
    
    const slackList = document.getElementById('wizard-slack-channels');
    if (this.wizardState.slackChannels.length > 0) {
      const html = this.wizardState.slackChannels.map(c => `
        <div class="channel-item">
          <div>
            <div>${this.escapeHtml(c.name)}</div>
            <div style="font-size:0.75rem;color:var(--text-muted);">${c.channelId}</div>
          </div>
          <button class="btn btn-danger btn-sm" onclick="App.removeWizardSlack('${c.channelId}')">Remove</button>
        </div>
      `).join('');
      if (slackList) slackList.innerHTML = html;
    } else {
      if (slackList) slackList.innerHTML = '<p class="info-text">No Slack channels added</p>';
    }
  },

  wizardAddWhatsAppGroup() {
    this.showChannelInlineForm('wizard-whatsapp-groups', {
      title: 'Add WhatsApp Group',
      fields: [
        { id: 'wa-group-id', label: 'Group ID', placeholder: '1203630123456789', hint: 'Bare number without @g.us', required: true },
        { id: 'wa-group-name', label: 'Group Name', placeholder: 'Optional display name', required: false },
      ],
      onSubmit: (v) => {
        const groupId = v['wa-group-id'].trim();
        const groupName = v['wa-group-name'].trim() || `Group ${groupId}`;
        if (!/^\d+$/.test(groupId.replace(/@g\.us$/, ''))) {
          this.showToast('Invalid group ID format', 'error');
          return;
        }
        this.wizardState.whatsappGroups.push({ groupId: groupId.replace(/@g\.us$/, ''), name: groupName });
        this.renderWizardChannels();
      },
    });
  },

  removeWizardWhatsApp(groupId) {
    this.wizardState.whatsappGroups = this.wizardState.whatsappGroups.filter(g => g.groupId !== groupId);
    this.renderWizardChannels();
  },

  wizardAddSlackChannel() {
    this.showChannelInlineForm('wizard-slack-channels', {
      title: 'Add Slack Channel',
      fields: [
        { id: 'sl-channel-id', label: 'Channel ID', placeholder: 'C0AQ4C19F25', hint: 'Starts with C', required: true },
        { id: 'sl-channel-name', label: 'Channel Name', placeholder: 'Optional display name', required: false },
      ],
      onSubmit: (v) => {
        const channelId = v['sl-channel-id'].trim();
        const channelName = v['sl-channel-name'].trim() || `Channel ${channelId}`;
        if (!/^[A-Za-z0-9_]+$/.test(channelId)) {
          this.showToast('Invalid channel ID format', 'error');
          return;
        }
        this.wizardState.slackChannels.push({ channelId, name: channelName });
        this.renderWizardChannels();
      },
    });
  },

  removeWizardSlack(channelId) {
    this.wizardState.slackChannels = this.wizardState.slackChannels.filter(c => c.channelId !== channelId);
    this.renderWizardChannels();
  },

  showChannelInlineForm(containerId, { title, fields, onSubmit }) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const formId = `inline-form-${containerId}`;
    const html = `
      <div class="inline-channel-form" id="${formId}">
        <h4>${this.escapeHtml(title)}</h4>
        ${fields.map(f => `
          <div class="form-group">
            <label>${this.escapeHtml(f.label)}${f.required ? ' <span class="required-star">*</span>' : ''}</label>
            <input type="text" id="${formId}-${f.id}" placeholder="${this.escapeHtml(f.placeholder)}" value="">
            ${f.hint ? `<div class="form-hint">${this.escapeHtml(f.hint)}</div>` : ''}
          </div>
        `).join('')}
        <div class="form-row">
          <button class="btn btn-primary btn-sm" id="${formId}-submit">Add</button>
          <button class="btn btn-secondary btn-sm" id="${formId}-cancel">Cancel</button>
        </div>
      </div>
    `;

    container.innerHTML = html;

    const form = document.getElementById(formId);
    const firstInput = form.querySelector('input');
    if (firstInput) firstInput.focus();

    document.getElementById(`${formId}-cancel`).onclick = () => this.renderWizardChannels();
    document.getElementById(`${formId}-submit`).onclick = () => {
      const values = {};
      for (const f of fields) {
        const input = document.getElementById(`${formId}-${f.id}`);
        values[f.id] = input.value;
        if (f.required && !input.value.trim()) {
          this.showToast(`${f.label} is required`, 'error');
          return;
        }
      }
      onSubmit(values);
    };

    const inputs = form.querySelectorAll('input');
    inputs.forEach(input => {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') document.getElementById(`${formId}-submit`).click();
        if (e.key === 'Escape') this.renderWizardChannels();
      });
    });
  },

  // ===== Wizard MCP Tools =====
  async loadAvailableTools() {
    try {
      const res = await fetch('/api/clients/mcp-tools/available');
      const data = await res.json();
      this.availableTools = data.tools;
    } catch (err) {
      console.error('Failed to load available tools:', err);
    }
  },

  renderWizardMcpTools() {
    const list = document.getElementById('wizard-mcp-tools');
    if (!list) return;
    
    if (this.wizardState.mcpTools.length > 0) {
      list.innerHTML = `
        <div class="selected-tools-list">
          ${this.wizardState.mcpTools.map(t => `
            <div class="selected-tool-tag">
              <span class="tool-icon-sm">${this.getToolIcon(t.id)}</span>
              <span>${this.getToolName(t.id)}</span>
              <button class="btn-remove" onclick="App.removeWizardMcpTool('${t.id}')">×</button>
            </div>
          `).join('')}
        </div>
        <button class="btn btn-secondary btn-sm" onclick="App.showWizardMcpPicker()">+ Add Tool</button>
      `;
    } else {
      list.innerHTML = `
        <div class="empty-mcp-state">
          <p class="info-text">No MCP tools selected</p>
          <p class="form-hint">MCP tools provide analytics, ads, and integrations</p>
          <button class="btn btn-primary btn-sm" onclick="App.showWizardMcpPicker()">+ Add Tool</button>
        </div>
      `;
    }
  },

  showWizardMcpPicker() {
    const list = document.getElementById('wizard-mcp-tools');
    if (!list) return;
    
    list.innerHTML = `
      <div class="mcp-picker-inline">
        <h4>Choose a tool</h4>
        <div class="tool-grid compact">
          ${this.availableTools.map(tool => {
            const isAdded = this.wizardState.mcpTools.find(t => t.id === tool.id);
            return `
              <div class="tool-card compact ${isAdded ? 'added' : ''}" 
                   onclick="${isAdded ? '' : `App.showWizardMcpConfig('${tool.id}')`}">
                <span class="tool-icon">${tool.icon}</span>
                <div class="tool-name">${tool.name}</div>
                ${isAdded ? '<div class="added-badge">✓</div>' : ''}
              </div>
            `;
          }).join('')}
        </div>
        <button class="btn btn-secondary btn-sm" onclick="App.renderWizardMcpTools()">Cancel</button>
      </div>
    `;
  },

  showWizardMcpConfig(toolId) {
    const tool = this.availableTools.find(t => t.id === toolId);
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
          <button class="btn btn-primary btn-sm" onclick="App.addWizardMcpTool('${toolId}')">Add</button>
          <button class="btn btn-secondary btn-sm" onclick="App.showWizardMcpPicker()">Back</button>
        </div>
      </div>
    `;
  },

  addWizardMcpTool(toolId) {
    const tool = this.availableTools.find(t => t.id === toolId);
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
      this.showToast('All required fields must be filled', 'error');
      return;
    }
    
    this.wizardState.mcpTools.push({ id: toolId, config });
    this.renderWizardMcpTools();
  },

  removeWizardMcpTool(toolId) {
    this.wizardState.mcpTools = this.wizardState.mcpTools.filter(t => t.id !== toolId);
    this.renderWizardMcpTools();
  },

  updateReview() {
    const setName = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };
    
    setName('review-name', this.wizardState.name || '—');
    setName('review-desc', this.wizardState.description || '—');
    setName('review-whatsapp', this.wizardState.whatsappGroups.length);
    setName('review-slack', this.wizardState.slackChannels.length);
    
    const mcpList = document.getElementById('review-mcp-tools');
    if (this.wizardState.mcpTools.length > 0) {
      mcpList.innerHTML = this.wizardState.mcpTools.map(t => 
        `<span class="tag">${this.getToolIcon(t.id)} ${this.getToolName(t.id)}</span>`
      ).join('');
    } else {
      mcpList.innerHTML = '<span class="info-text">None selected</span>';
    }
  },

  async wizardDeploy() {
    this.showToast('Creating client...', 'info');
    
    try {
      const createRes = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: this.wizardState.name, description: this.wizardState.description }),
      });
      
      if (!createRes.ok) {
        const data = await createRes.json();
        throw new Error(data.error);
      }
      
      const { client } = await createRes.json();
      const slug = client.slug;
      
      for (const group of this.wizardState.whatsappGroups) {
        await fetch(`/api/clients/${slug}/channels/whatsapp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ groupId: group.groupId, groupName: group.name }),
        });
      }
      
      for (const channel of this.wizardState.slackChannels) {
        await fetch(`/api/clients/${slug}/channels/slack`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channelId: channel.channelId, channelName: channel.name }),
        });
      }
      
      for (const tool of this.wizardState.mcpTools) {
        await fetch(`/api/clients/${slug}/mcp-tools/${tool.id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(tool.config),
        });
      }
      
      this.hideWizardModal();
      this.showToast('Client created successfully!', 'success');
      this.loadClients();
    } catch (err) {
      this.showToast(err.message, 'error');
    }
  },

  // ===== Utility =====
  showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  },
};

// Initialize
document.addEventListener('DOMContentLoaded', () => App.init());
