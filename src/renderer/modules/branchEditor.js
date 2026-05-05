import { state } from './state.js';
import { escapeHtml } from './utils.js';
import { renderMain } from './workspaceView.js';

const BRANCHES_CACHE = new Map(); // repoPath -> string[]

async function getBranchesFor(repoPath) {
  if (!BRANCHES_CACHE.has(repoPath)) {
    try {
      const branches = await globalThis.api.repos.branches(repoPath);
      BRANCHES_CACHE.set(repoPath, branches);
    } catch {
      BRANCHES_CACHE.set(repoPath, []);
    }
  }
  return BRANCHES_CACHE.get(repoPath);
}

export function invalidateBranchesFor(repoPath) {
  BRANCHES_CACHE.delete(repoPath);
}

function buildEditor(card, currentBranch) {
  const editor = document.createElement('div');
  editor.className = 'branch-editor';
  const datalistId = `branches-${Math.random().toString(36).slice(2, 8)}`;
  editor.innerHTML = `
    <input type="text" class="branch-input" list="${datalistId}" placeholder="${escapeHtml(currentBranch)}" />
    <datalist id="${datalistId}"></datalist>
    <button class="btn btn-primary" data-action="switch">Switch</button>
    <button class="btn" data-action="create">Create</button>
    <button class="btn btn-ghost" data-action="cancel" title="Cancel">×</button>
    <span class="branch-editor-error muted"></span>
  `;
  return { editor, datalistId };
}

async function applyChange(card, branch, createNew, errorEl) {
  const ws = state.activeWorkspace;
  if (!ws) return;
  const worktreePath = card.dataset.worktreePath;
  errorEl.classList.remove('error');
  errorEl.classList.add('muted');
  errorEl.textContent = createNew ? 'Creating…' : 'Switching…';
  try {
    state.workspaces = await globalThis.api.worktrees.setBranch(ws.name, worktreePath, branch, createNew);
    state.activeWorkspace = state.workspaces.find(w => w.name === ws.name) || null;
    invalidateBranchesFor(card.dataset.repoPath);
    renderMain();
  } catch (e) {
    errorEl.classList.remove('muted');
    errorEl.classList.add('error');
    errorEl.textContent = e.message;
  }
}

export function attachBranchEditor(card, branchEl, currentBranch) {
  branchEl.classList.add('clickable');
  branchEl.title = 'Click to switch or create branch';
  branchEl.addEventListener('click', async () => {
    if (card.querySelector('.branch-editor')) return; // already open
    const { editor, datalistId } = buildEditor(card, currentBranch);
    branchEl.classList.add('hidden');
    branchEl.parentElement.appendChild(editor);

    const input = editor.querySelector('.branch-input');
    const dl = editor.querySelector(`#${datalistId}`);
    const errorEl = editor.querySelector('.branch-editor-error');
    input.focus();

    // Populate suggestions asynchronously.
    getBranchesFor(card.dataset.repoPath).then(branches => {
      dl.innerHTML = branches.map(b => `<option value="${escapeHtml(b)}"></option>`).join('');
    });

    const close = () => {
      editor.remove();
      branchEl.classList.remove('hidden');
    };
    editor.querySelector('[data-action="cancel"]').addEventListener('click', close);
    editor.querySelector('[data-action="switch"]').addEventListener('click', async () => {
      const v = input.value.trim();
      if (!v) { errorEl.classList.add('error'); errorEl.textContent = 'Enter a branch name.'; return; }
      await applyChange(card, v, false, errorEl);
    });
    editor.querySelector('[data-action="create"]').addEventListener('click', async () => {
      const v = input.value.trim();
      if (!v) { errorEl.classList.add('error'); errorEl.textContent = 'Enter a branch name.'; return; }
      await applyChange(card, v, true, errorEl);
    });
    input.addEventListener('keydown', async (e) => {
      if (e.key === 'Escape') close();
      else if (e.key === 'Enter') {
        const v = input.value.trim();
        if (!v) return;
        await applyChange(card, v, false, errorEl);
      }
    });
  });
}
