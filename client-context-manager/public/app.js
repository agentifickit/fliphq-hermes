// ---------- State ----------
const state = {
  clients: [],
  activeSlug: null,
  activeFile: null,
  activeContent: '',
  activeOriginal: '',
  tree: [],
  editing: false,
  branch: null,
  branches: [],
  aheadOfMain: 0,
  historyOpen: false,
};

const $ = (id) => document.getElementById(id);
const el = {
  clientList: $('client-list'),
  searchInput: $('search-input'),
  searchView: $('search-view'),
  searchTitle: $('search-title'),
  searchResults: $('search-results'),
  clearSearch: $('clear-search'),
  emptyView: $('empty-view'),
  clientView: $('client-view'),
  clientTitle: $('client-title'),
  clientMeta: $('client-meta'),
  fileTree: $('file-tree'),
  docPath: $('doc-path'),
  docPreview: $('doc-preview'),
  docEditor: $('doc-editor'),
  editBtn: $('edit-btn'),
  saveBtn: $('save-btn'),
  cancelBtn: $('cancel-btn'),
  refreshBtn: $('refresh-btn'),
  newClientBtn: $('new-client-btn'),
  // git
  branchCurrent: $('branch-current'),
  branchName: $('branch-name'),
  branchMenu: $('branch-menu'),
  newBranchBtn: $('new-branch-btn'),
  tabFiles: $('tab-files'),
  tabHistory: $('tab-history'),
  historyPanel: $('history-panel'),
  diffBtn: $('diff-btn'),
  mergeBtn: $('merge-btn'),
  // modals
  modal: $('modal-overlay'),
  ncName: $('nc-name'),
  ncPillar: $('nc-pillar'),
  ncCancel: $('nc-cancel'),
  ncCreate: $('nc-create'),
  ncError: $('nc-error'),
  branchModal: $('branch-modal'),
  nbName: $('nb-name'),
  nbCancel: $('nb-cancel'),
  nbCreate: $('nb-create'),
  nbError: $('nb-error'),
  diffModal: $('diff-modal'),
  diffBase: $('diff-base'),
  diffHead: $('diff-head'),
  diffStat: $('diff-stat'),
  diffBody: $('diff-body'),
  diffClose: $('diff-close'),
  diffClose2: $('diff-close2'),
  diffMergeBtn: $('diff-merge-btn'),
  diffError: $('diff-error'),
  toast: $('toast'),
};

let toastTimer = null;
function showToast(msg, isError = false) {
  el.toast.textContent = msg;
  el.toast.className = 'toast' + (isError ? ' error' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.toast.className = 'toast hidden'; }, 3000);
}

// ---------- Markdown ----------
if (window.marked) {
  marked.setOptions({ gfm: true, breaks: false });
}
function renderMarkdown(text) {
  if (window.marked) {
    try { return marked.parse(text); } catch { /* fall through */ }
  }
  return '<pre>' + text.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</pre>';
}
function isMarkdownFile(name) {
  return /\.(md|markdown)$/i.test(name || '');
}
function renderFileContent(text, name) {
  if (isMarkdownFile(name)) return renderMarkdown(text);
  return '<pre class="raw-file">' + text.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</pre>';
}

function highlight(snippet, query) {
  const esc = snippet.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const q = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  try {
    return esc.replace(new RegExp('(' + q + ')', 'gi'), '<mark>$1</mark>');
  } catch { return esc; }
}

function renderDiff(diffText) {
  if (!diffText) return '<div class="d-empty">No changes.</div>';
  let html = '';
  for (const line of diffText.split('\n')) {
    const esc = line.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    if (line.startsWith('diff --git')) html += '<div class="d-file">' + esc + '</div>';
    else if (line.startsWith('+++') || line.startsWith('---')) html += '<div class="d-meta">' + esc + '</div>';
    else if (line.startsWith('@@')) html += '<div class="d-hunk">' + esc + '</div>';
    else if (line.startsWith('+')) html += '<div class="d-add">' + esc + '</div>';
    else if (line.startsWith('-')) html += '<div class="d-del">' + esc + '</div>';
    else html += '<div class="d-ctx">' + esc + '</div>';
  }
  return html;
}

// ---------- API helpers ----------
async function api(path, opts) {
  const r = await fetch(path, opts);
  let data = null;
  try { data = await r.json(); } catch { /* non-json */ }
  if (!r.ok) {
    const err = new Error((data && data.error) || ('Request failed: ' + r.status));
    err.status = r.status;
    err.data = data;
    throw err;
  }
  return data;
}

// ---------- Client list ----------
async function loadClients() {
  try {
    const data = await api('/api/clients');
    state.clients = data.clients || [];
    renderClientList();
    if (!state.activeSlug && state.clients.length) {
      selectClient(state.clients[0].slug);
    }
  } catch (e) {
    showToast('Failed to load clients: ' + e.message, true);
  }
}

function renderClientList() {
  el.clientList.innerHTML = '';
  for (const c of state.clients) {
    const item = document.createElement('div');
    item.className = 'client-item' + (c.slug === state.activeSlug ? ' active' : '');
    item.innerHTML = '<span class="dot"></span><span class="name"></span>';
    item.querySelector('.name').textContent = c.slug.replace(/-/g, ' ');
    item.addEventListener('click', () => selectClient(c.slug));
    el.clientList.appendChild(item);
  }
}

// ---------- Client view ----------
async function selectClient(slug) {
  state.activeSlug = slug;
  state.activeFile = null;
  state.editing = false;
  state.historyOpen = false;
  renderClientList();
  hideAllViews();
  el.clientView.classList.remove('hidden');
  setEditingUI(false);
  try {
    const data = await api('/api/clients/' + encodeURIComponent(slug));
    state.tree = data.tree || [];
    el.clientTitle.textContent = slug.replace(/-/g, ' ');
    const lastActivity = data.latestActivity ? new Date(data.latestActivity).toLocaleString() : '—';
    el.clientMeta.innerHTML =
      '<span>updated ' + lastActivity + '</span>' +
      '<span>' + countFiles(state.tree) + ' files</span>';
    await loadGitState();
    renderFileTree();
    renderPanelTab();
    const agents = findFile(state.tree, 'AGENTS.md');
    if (agents) openFile(agents.path, data.files);
    else if (state.tree.length) openFirstFile(data.files);
    else openFile(null, {});
  } catch (e) {
    showToast(e.message, true);
    el.emptyView.classList.remove('hidden');
    el.clientView.classList.add('hidden');
  }
}

async function loadGitState() {
  try {
    const status = await api('/api/clients/' + encodeURIComponent(state.activeSlug) + '/git/status');
    state.branch = status.branch;
    state.aheadOfMain = status.aheadOfMain;
    el.branchName.textContent = status.branch;
    // merge button visible only when on a non-main branch with commits ahead
    const onMain = status.branch === 'main';
    el.mergeBtn.classList.toggle('hidden', onMain || status.aheadOfMain === 0);
    el.diffBtn.classList.toggle('hidden', onMain || status.aheadOfMain === 0);
    const b = await api('/api/clients/' + encodeURIComponent(state.activeSlug) + '/git/branches');
    state.branches = b.branches || [];
  } catch (e) {
    el.branchName.textContent = '—';
    el.mergeBtn.classList.add('hidden');
    el.diffBtn.classList.add('hidden');
  }
}

function countFiles(tree) {
  let n = 0;
  for (const t of tree) {
    if (t.type === 'file') n++;
    else if (t.children) n += countFiles(t.children);
  }
  return n;
}

function findFile(tree, name) {
  for (const t of tree) {
    if (t.type === 'file' && t.name === name) return t;
    if (t.children) { const f = findFile(t.children, name); if (f) return f; }
  }
  return null;
}

function openFirstFile(files) {
  for (const t of state.tree) {
    if (t.type === 'file') { openFile(t.path, files); return; }
  }
}

function renderFileTree() {
  el.fileTree.innerHTML = '';
  for (const node of state.tree) {
    el.fileTree.appendChild(renderTreeNode(node));
  }
}

function renderTreeNode(node) {
  if (node.type === 'file') {
    const div = document.createElement('div');
    div.className = 'ft-file' + (node.path === state.activeFile ? ' active' : '');
    div.innerHTML = '<span class="icon">' + fileIcon(node.name) + '</span><span></span>';
    div.querySelector('span:last-child').textContent = node.name;
    div.addEventListener('click', () => openFile(node.path));
    return div;
  }
  const wrapper = document.createElement('div');
  wrapper.className = 'ft-dir open';
  const label = document.createElement('div');
  label.className = 'ft-dir-label';
  const pretty = node.name === '.flippy' ? 'config' : node.name;
  label.innerHTML = '<span class="caret">▸</span><span>' + pretty + '</span>';
  label.addEventListener('click', () => wrapper.classList.toggle('collapsed'));
  wrapper.appendChild(label);
  const children = document.createElement('div');
  children.className = 'ft-dir-children';
  for (const child of node.children || []) {
    children.appendChild(renderTreeNode(child));
  }
  wrapper.appendChild(children);
  return wrapper;
}

function fileIcon(name) {
  if (name === 'AGENTS.md') return '🧭';
  if (name.includes('pricing')) return '💰';
  if (name.includes('pipeline')) return '🛰️';
  if (name.includes('campaign')) return '🎯';
  if (name.includes('meeting')) return '📝';
  if (name.includes('performance') || name.includes('analytics')) return '📈';
  if (name.includes('sources')) return '⚙️';
  const ext = name.split('.').pop();
  if (ext === 'yaml' || ext === 'yml' || ext === 'json') return '⚙️';
  if (ext === 'csv') return '📊';
  return '📄';
}

// ---------- Git: branches ----------
function toggleBranchMenu() {
  const open = !el.branchMenu.classList.contains('hidden');
  if (open) { el.branchMenu.classList.add('hidden'); return; }
  renderBranchMenu();
  el.branchMenu.classList.remove('hidden');
}

function renderBranchMenu() {
  el.branchMenu.innerHTML = '';
  const addItem = (label, branch, isCurrent) => {
    const item = document.createElement('div');
    item.className = 'branch-item' + (isCurrent ? ' current' : '');
    item.innerHTML = '<span class="bi-icon">' + (isCurrent ? '●' : '○') + '</span><span>' + label + '</span>';
    if (!isCurrent) {
      item.addEventListener('click', () => switchBranch(branch));
    }
    el.branchMenu.appendChild(item);
  };
  for (const b of state.branches) {
    addItem(b, b, b === state.branch);
  }
}

async function switchBranch(branch) {
  el.branchMenu.classList.add('hidden');
  try {
    await api('/api/clients/' + encodeURIComponent(state.activeSlug) + '/git/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ branch }),
    });
    showToast('Switched to ' + branch);
    selectClient(state.activeSlug);
  } catch (e) {
    showToast(e.message, true);
  }
}

function openBranchModal() {
  el.branchMenu.classList.add('hidden');
  el.branchModal.classList.remove('hidden');
  el.nbName.value = '';
  el.nbError.classList.add('hidden');
  el.nbName.focus();
}
function closeBranchModal() { el.branchModal.classList.add('hidden'); }

async function createBranch() {
  const name = el.nbName.value.trim();
  if (!name) { el.nbError.textContent = 'Name required'; el.nbError.classList.remove('hidden'); return; }
  try {
    await api('/api/clients/' + encodeURIComponent(state.activeSlug) + '/git/branches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    closeBranchModal();
    showToast('Created branch ' + name);
    selectClient(state.activeSlug);
  } catch (e) {
    el.nbError.textContent = e.message;
    el.nbError.classList.remove('hidden');
  }
}

// ---------- Git: history ----------
async function renderHistory() {
  el.historyPanel.innerHTML = '<div class="h-loading">Loading…</div>';
  try {
    const data = await api('/api/clients/' + encodeURIComponent(state.activeSlug) + '/git/log');
    el.historyPanel.innerHTML = '';
    if (!data.commits.length) {
      el.historyPanel.innerHTML = '<div class="h-empty">No commits yet.</div>';
      return;
    }
    for (const c of data.commits) {
      const row = document.createElement('div');
      row.className = 'commit-row';
      row.innerHTML =
        '<span class="c-hash">' + c.hash + '</span>' +
        '<span class="c-msg">' + (c.message || '').replace(/</g, '&lt;') + '</span>' +
        '<span class="c-meta">' + c.date + ' · ' + c.author + '</span>';
      el.historyPanel.appendChild(row);
    }
  } catch (e) {
    el.historyPanel.innerHTML = '<div class="h-empty">' + e.message + '</div>';
  }
}

function renderPanelTab() {
  const showingFiles = !state.historyOpen;
  el.tabFiles.classList.toggle('active', showingFiles);
  el.tabHistory.classList.toggle('active', !showingFiles);
  el.fileTree.classList.toggle('hidden', !showingFiles);
  el.historyPanel.classList.toggle('hidden', showingFiles);
  if (!showingFiles) renderHistory();
}

// ---------- Git: diff + merge ----------
async function openDiff() {
  el.diffModal.classList.remove('hidden');
  el.diffError.classList.add('hidden');
  el.diffBody.innerHTML = '<div class="d-empty">Loading diff…</div>';
  el.diffStat.textContent = '';
  el.diffBase.textContent = 'main';
  el.diffHead.textContent = state.branch || 'HEAD';
  try {
    const data = await api('/api/clients/' + encodeURIComponent(state.activeSlug) + '/git/diff?base=main&head=HEAD');
    el.diffStat.textContent = data.stat || 'No changes.';
    el.diffBody.innerHTML = renderDiff(data.diff);
  } catch (e) {
    el.diffBody.innerHTML = '<div class="d-empty">' + e.message + '</div>';
  }
}
function closeDiff() { el.diffModal.classList.add('hidden'); }

async function mergeToMain() {
  const branch = state.branch;
  if (branch === 'main') return;
  try {
    const data = await api('/api/clients/' + encodeURIComponent(state.activeSlug) + '/git/merge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ branch, into: 'main' }),
    });
    closeDiff();
    showToast('Merged ' + branch + ' into main ✓');
    selectClient(state.activeSlug);
  } catch (e) {
    if (e.status === 409) {
      const conflicts = (e.data && e.data.conflicts) || [];
      el.diffError.textContent = 'Merge conflict in: ' + (conflicts.join(', ') || 'unknown files');
      el.diffError.classList.remove('hidden');
      showToast('Merge conflict — resolve manually', true);
    } else {
      el.diffError.textContent = e.message;
      el.diffError.classList.remove('hidden');
      showToast(e.message, true);
    }
  }
}

// ---------- Open / edit file ----------
async function openFile(relPath, files) {
  state.editing = false;
  setEditingUI(false);
  if (!relPath) {
    el.docPath.textContent = '';
    el.docPreview.innerHTML = '<p style="color:var(--text-faint)">No file selected.</p>';
    state.activeFile = null;
    state.activeContent = '';
    return;
  }
  state.activeFile = relPath;
  let content = '';
  if (files && files[relPath] !== undefined) {
    content = files[relPath];
  } else {
    const data = await api('/api/clients/' + encodeURIComponent(state.activeSlug) + '/files/' + relPath);
    content = data.content;
  }
  state.activeContent = content;
  state.activeOriginal = content;
  el.docPath.textContent = state.activeSlug + '/' + relPath;
  el.docPreview.innerHTML = renderFileContent(content, relPath);
  el.docEditor.value = content;
  renderFileTree();
}

function setEditingUI(editing) {
  if (editing) {
    el.docPreview.classList.add('hidden');
    el.docEditor.classList.remove('hidden');
    el.editBtn.classList.add('hidden');
    el.saveBtn.classList.remove('hidden');
    el.cancelBtn.classList.remove('hidden');
  } else {
    el.docPreview.classList.remove('hidden');
    el.docEditor.classList.add('hidden');
    el.editBtn.classList.remove('hidden');
    el.saveBtn.classList.add('hidden');
    el.cancelBtn.classList.add('hidden');
  }
}

async function saveFile() {
  if (!state.activeFile) return;
  const content = el.docEditor.value;
  try {
    const data = await api('/api/clients/' + encodeURIComponent(state.activeSlug) + '/files/' + state.activeFile, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    state.activeContent = content;
    state.activeOriginal = content;
    state.editing = false;
    setEditingUI(false);
    el.docPreview.innerHTML = renderFileContent(content, state.activeFile);
    const commitMsg = data.commit ? ' · committed ' + data.commit : '';
    showToast('Saved ' + state.activeFile + commitMsg);
    loadGitState();
  } catch (e) {
    showToast(e.message, true);
  }
}

// ---------- Search ----------
let searchTimer = null;
function debouncedSearch() {
  clearTimeout(searchTimer);
  const q = el.searchInput.value.trim();
  if (q.length < 2) {
    if (state.activeSlug) { hideAllViews(); el.clientView.classList.remove('hidden'); }
    else { hideAllViews(); el.emptyView.classList.remove('hidden'); }
    return;
  }
  searchTimer = setTimeout(() => doSearch(q), 250);
}

async function doSearch(q) {
  try {
    const data = await api('/api/search?q=' + encodeURIComponent(q));
    hideAllViews();
    el.searchView.classList.remove('hidden');
    el.searchTitle.textContent = 'Search · “' + q + '” (' + data.total + ' results)';
    el.searchResults.innerHTML = '';
    if (!data.results.length) {
      el.searchResults.innerHTML = '<p style="color:var(--text-faint)">No matches.</p>';
      return;
    }
    for (const res of data.results) {
      const div = document.createElement('div');
      div.className = 'search-result';
      div.innerHTML =
        '<div class="sr-head"><span class="sr-client"></span><span class="sr-file"></span></div>' +
        '<div class="sr-snippet"></div>';
      div.querySelector('.sr-client').textContent = res.slug;
      div.querySelector('.sr-file').textContent = res.file;
      div.querySelector('.sr-snippet').innerHTML = highlight(res.snippet, data.query);
      div.addEventListener('click', () => {
        selectClient(res.slug).then(() => openFile(res.file));
      });
      el.searchResults.appendChild(div);
    }
  } catch (e) {
    showToast('Search failed: ' + e.message, true);
  }
}

// ---------- New client modal ----------
function openModal() { el.modal.classList.remove('hidden'); el.ncName.focus(); }
function closeModal() { el.modal.classList.add('hidden'); el.ncError.classList.add('hidden'); }

async function createClient() {
  const name = el.ncName.value.trim();
  const pillar = el.ncPillar.value;
  if (!name) { el.ncError.textContent = 'Name is required'; el.ncError.classList.remove('hidden'); return; }
  try {
    const data = await api('/api/clients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, pillar }),
    });
    closeModal();
    el.ncName.value = '';
    showToast('Created workspace: ' + data.slug);
    await loadClients();
    selectClient(data.slug);
  } catch (e) {
    el.ncError.textContent = e.message;
    el.ncError.classList.remove('hidden');
  }
}

// ---------- View helpers ----------
function hideAllViews() {
  el.searchView.classList.add('hidden');
  el.emptyView.classList.add('hidden');
  el.clientView.classList.add('hidden');
}

// ---------- Wire events ----------
el.searchInput.addEventListener('input', debouncedSearch);
el.clearSearch.addEventListener('click', () => { el.searchInput.value = ''; debouncedSearch(); });
el.editBtn.addEventListener('click', () => { state.editing = true; setEditingUI(true); el.docEditor.focus(); });
el.cancelBtn.addEventListener('click', () => {
  state.editing = false;
  el.docEditor.value = state.activeOriginal;
  setEditingUI(false);
});
el.saveBtn.addEventListener('click', saveFile);
el.refreshBtn.addEventListener('click', () => { if (state.activeSlug) { selectClient(state.activeSlug); showToast('Refreshed'); } });
el.newClientBtn.addEventListener('click', openModal);
el.ncCancel.addEventListener('click', closeModal);
el.ncCreate.addEventListener('click', createClient);
el.modal.addEventListener('click', (e) => { if (e.target === el.modal) closeModal(); });

// git events
el.branchCurrent.addEventListener('click', toggleBranchMenu);
el.newBranchBtn.addEventListener('click', openBranchModal);
el.nbCancel.addEventListener('click', closeBranchModal);
el.nbCreate.addEventListener('click', createBranch);
el.branchModal.addEventListener('click', (e) => { if (e.target === el.branchModal) closeBranchModal(); });
el.tabFiles.addEventListener('click', () => { state.historyOpen = false; renderPanelTab(); });
el.tabHistory.addEventListener('click', () => { state.historyOpen = true; renderPanelTab(); });
el.diffBtn.addEventListener('click', openDiff);
el.mergeBtn.addEventListener('click', openDiff);
el.diffClose.addEventListener('click', closeDiff);
el.diffClose2.addEventListener('click', closeDiff);
el.diffMergeBtn.addEventListener('click', mergeToMain);
el.diffModal.addEventListener('click', (e) => { if (e.target === el.diffModal) closeDiff(); });

document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 's' && state.editing) {
    e.preventDefault();
    saveFile();
  }
  if (e.key === 'Escape') { closeDiff(); closeBranchModal(); closeModal(); el.branchMenu.classList.add('hidden'); }
});

// close menus on outside click
document.addEventListener('click', (e) => {
  if (!e.target.closest('.branch-bar') && !e.target.closest('.branch-menu')) {
    el.branchMenu.classList.add('hidden');
  }
});

// ---------- Init ----------
loadClients();
