import { state } from './state.js';
import { $, escapeHtml } from './utils.js';
import { refresh } from './refresh.js';
import { renderSidebar } from './sidebar.js';
import { renderMain } from './workspaceView.js';

function syncBranchPlaceholders() {
  const fallback = $('#ws-input-branch').value.trim() || $('#ws-input-name').value.trim() || 'branch';
  document.querySelectorAll('.branch-override').forEach(el => {
    el.placeholder = `(${fallback})`;
  });
}

function open() {
  $('#ws-input-name').value = '';
  $('#ws-input-branch').value = '';
  $('#ws-branch-mode').value = 'auto';
  $('#ws-input-parent').value = state.settings.workspacesRoot;
  $('#ws-error').textContent = '';
  const container = $('#ws-repo-rows');
  container.innerHTML = '';
  if (state.repos.length === 0) {
    container.innerHTML = '<p class="hint">No repos registered. Use Manage repos first.</p>';
  } else {
    for (const repo of state.repos) {
      const id = `repo-cb-${btoa(repo.path).replaceAll('=', '')}`;
      const row = document.createElement('div');
      row.className = 'ws-repo-row';
      row.innerHTML = `
        <label class="checkbox">
          <input type="checkbox" id="${id}" data-repo-path="${escapeHtml(repo.path)}" checked />
          <span>${escapeHtml(repo.name)} <span class="muted">${escapeHtml(repo.path)}</span></span>
        </label>
        <input type="text" class="branch-override" placeholder="(default branch)" data-branch-for="${escapeHtml(repo.path)}" />
      `;
      container.appendChild(row);
    }
  }
  $('#new-workspace-modal').classList.remove('hidden');
  syncBranchPlaceholders();
}

async function confirm() {
  const name = $('#ws-input-name').value.trim();
  const defaultBranch = $('#ws-input-branch').value.trim() || name;
  const parentDir = $('#ws-input-parent').value.trim();
  const branchMode = $('#ws-branch-mode').value;
  const errEl = $('#ws-error');
  errEl.textContent = '';
  if (!name) { errEl.textContent = 'Name is required.'; return; }

  const members = [];
  document.querySelectorAll('#ws-repo-rows .ws-repo-row').forEach(row => {
    const cb = row.querySelector('input[type="checkbox"]');
    if (!cb.checked) return;
    const repoPath = cb.dataset.repoPath;
    const override = row.querySelector('.branch-override').value.trim();
    members.push({ repoPath, branch: override || defaultBranch });
  });
  if (members.length === 0) { errEl.textContent = 'Select at least one repo.'; return; }

  try {
    await globalThis.api.workspaces.create({ name, parentDir, branchMode, members });
    $('#new-workspace-modal').classList.add('hidden');
    await refresh();
    state.activeWorkspace = state.workspaces.find(w => w.name === name) || null;
    renderSidebar();
    renderMain();
  } catch (e) {
    errEl.textContent = e.message;
  }
}

export function setupNewWorkspaceModal() {
  $('#new-workspace').addEventListener('click', open);
  $('#empty-new-workspace').addEventListener('click', open);
  $('#ws-cancel').addEventListener('click', () => $('#new-workspace-modal').classList.add('hidden'));
  $('#ws-pick-parent').addEventListener('click', async () => {
    const p = await globalThis.api.fs.pickDir();
    if (p) $('#ws-input-parent').value = p;
  });
  document.addEventListener('input', e => {
    if (e.target.id === 'ws-input-name' || e.target.id === 'ws-input-branch') syncBranchPlaceholders();
  });
  $('#ws-confirm').addEventListener('click', confirm);
}
