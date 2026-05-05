import { state } from './state.js';
import { $, escapeHtml } from './utils.js';
import { renderSidebar } from './sidebar.js';
import { renderMain } from './workspaceView.js';

let scannedCandidates = [];

function splitPath(p) {
  const clean = p.replace(/\/+$/, '') || '/';
  const idx = clean.lastIndexOf('/');
  return {
    parent: idx <= 0 ? '/' : clean.slice(0, idx),
    base: clean.slice(idx + 1),
  };
}

function renderResults() {
  const container = $('#import-results');
  container.innerHTML = '';
  if (scannedCandidates.length === 0) {
    container.innerHTML = '<p class="hint">No worktrees detected in that directory. Pick a parent that contains worktree subfolders.</p>';
    $('#import-confirm').disabled = true;
    return;
  }
  for (const c of scannedCandidates) {
    const id = `import-cb-${btoa(c.worktreePath).replaceAll('=', '')}`;
    const isRegistered = state.repos.some(r => r.path === c.repoPath);
    const row = document.createElement('label');
    row.className = 'checkbox import-row';
    row.innerHTML = `
      <input type="checkbox" id="${id}" data-worktree="${escapeHtml(c.worktreePath)}" data-repo="${escapeHtml(c.repoPath)}" data-branch="${escapeHtml(c.branch)}" checked />
      <span>
        <strong>${escapeHtml(c.repoName)}</strong>
        <span class="member-branch">${escapeHtml(c.branch)}</span>
        ${isRegistered ? '' : '<span class="status-badge dirty">new repo</span>'}
        <span class="muted">${escapeHtml(c.worktreePath)}</span>
      </span>
    `;
    container.appendChild(row);
  }
  $('#import-confirm').disabled = false;
}

async function scan() {
  const dir = $('#import-dir').value.trim();
  const errEl = $('#import-error');
  errEl.textContent = '';
  if (!dir) { errEl.textContent = 'Pick a directory first.'; return; }
  $('#import-results').innerHTML = '<p class="hint">Scanning…</p>';
  try {
    scannedCandidates = await globalThis.api.workspaces.scanForWorktrees(dir);
    renderResults();
    if (!$('#import-name').value.trim()) {
      $('#import-name').value = splitPath(dir).base;
    }
  } catch (e) {
    errEl.textContent = e.message;
    $('#import-results').innerHTML = '';
    $('#import-confirm').disabled = true;
  }
}

function open() {
  $('#import-name').value = '';
  $('#import-dir').value = state.settings.workspacesRoot || '';
  $('#import-error').textContent = '';
  $('#import-results').innerHTML = '<p class="hint">Pick a directory and click Scan.</p>';
  $('#import-confirm').disabled = true;
  scannedCandidates = [];
  $('#import-workspace-modal').classList.remove('hidden');
}

async function confirm() {
  const name = $('#import-name').value.trim();
  const dir = $('#import-dir').value.trim();
  const errEl = $('#import-error');
  errEl.textContent = '';
  if (!name) { errEl.textContent = 'Workspace name is required.'; return; }

  const checked = Array.from(document.querySelectorAll('#import-results input[type="checkbox"]:checked'));
  if (checked.length === 0) { errEl.textContent = 'Select at least one worktree.'; return; }

  const members = checked.map(cb => ({
    repoPath: cb.dataset.repo,
    worktreePath: cb.dataset.worktree,
    branch: cb.dataset.branch,
  }));
  // The scan dir is parentDir/<workspace-name> in the workspace data model.
  const parentDir = splitPath(dir).parent;

  try {
    const result = await globalThis.api.workspaces.import({ name, parentDir, members });
    state.workspaces = result.workspaces;
    state.repos = result.repos;
    state.activeWorkspace = state.workspaces.find(w => w.name === name) || null;
    $('#import-workspace-modal').classList.add('hidden');
    renderSidebar();
    renderMain();
  } catch (e) {
    errEl.textContent = e.message;
  }
}

export function setupImportWorkspaceModal() {
  $('#import-workspace').addEventListener('click', open);
  $('#import-cancel').addEventListener('click', () => $('#import-workspace-modal').classList.add('hidden'));
  $('#import-scan').addEventListener('click', scan);
  $('#import-confirm').addEventListener('click', confirm);
  $('#import-dir').addEventListener('keydown', (e) => { if (e.key === 'Enter') scan(); });
  $('#import-pick-dir').addEventListener('click', async () => {
    const p = await globalThis.api.fs.pickDir();
    if (p) $('#import-dir').value = p;
  });
}
