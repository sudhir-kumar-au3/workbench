import { $ } from './utils.js';
import { state } from './state.js';
import { notify } from './notify.js';
import { refresh } from './refresh.js';
import { renderSidebar } from './sidebar.js';
import { renderMain } from './workspaceView.js';

function setProgress(text, kind = 'busy') {
  const el = $('#review-pr-progress');
  const txt = el.querySelector('[data-progress-text]');
  if (!text) { el.classList.add('hidden'); el.classList.remove('done', 'busy'); txt.textContent = ''; return; }
  txt.textContent = text;
  el.classList.remove('hidden', 'done', 'busy');
  el.classList.add(kind);
}

function setBusy(busy) {
  $('#review-pr-confirm').disabled = busy;
  $('#review-pr-cancel').disabled = busy;
}

function open() {
  const select = $('#review-pr-repo');
  select.innerHTML = '';
  if (state.repos.length === 0) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'No repos registered — add one in Manage repos first';
    select.appendChild(opt);
  } else {
    for (const repo of state.repos) {
      const opt = document.createElement('option');
      opt.value = repo.path;
      opt.textContent = repo.name;
      opt.title = repo.path;
      select.appendChild(opt);
    }
  }
  $('#review-pr-number').value = '';
  $('#review-pr-name').value = '';
  $('#review-pr-error').textContent = '';
  setProgress('');
  setBusy(false);
  $('#review-pr-modal').classList.remove('hidden');
  setTimeout(() => $('#review-pr-number').focus(), 50);
}

async function confirm() {
  const repoPath = $('#review-pr-repo').value;
  const prNumber = Number($('#review-pr-number').value);
  const name = $('#review-pr-name').value.trim();
  const errEl = $('#review-pr-error');
  errEl.textContent = '';
  if (!repoPath) { errEl.textContent = 'Pick a repository.'; return; }
  if (!Number.isFinite(prNumber) || prNumber <= 0) { errEl.textContent = 'Enter a valid PR number.'; return; }

  setBusy(true);
  setProgress(`Fetching PR #${prNumber} and creating worktree…`);
  try {
    const { workspaces, name: createdName } = await globalThis.api.workspaces.createFromPr({ repoPath, prNumber, name });
    state.workspaces = workspaces;
    setProgress('✓ Ready', 'done');
    await new Promise(r => setTimeout(r, 400));
    $('#review-pr-modal').classList.add('hidden');
    await refresh();
    state.activeWorkspace = state.workspaces.find(w => w.name === createdName) || null;
    renderSidebar();
    renderMain();
    notify.success(`Checked out PR #${prNumber} into "${createdName}".`);
  } catch (e) {
    errEl.textContent = e.message;
    setProgress('');
  } finally {
    setBusy(false);
  }
}

export function setupReviewPrModal() {
  const btn = $('#review-pr');
  if (btn) btn.addEventListener('click', open);
  $('#review-pr-cancel').addEventListener('click', () => $('#review-pr-modal').classList.add('hidden'));
  $('#review-pr-confirm').addEventListener('click', confirm);
}
