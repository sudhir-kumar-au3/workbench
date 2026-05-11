import { $ } from './utils.js';
import { state } from './state.js';
import { notify } from './notify.js';
import { refreshPrChips } from './memberCard.js';
import { showToast } from './bulkGitToast.js';

// Targets for the current modal session: [{ worktreePath, label }]. One entry = single
// mode (title pre-filled from the last commit); many = bulk mode (one shared title/body).
let targets = [];

function setProgress(text, kind = 'busy') {
  const el = $('#create-pr-progress');
  const txt = el.querySelector('[data-progress-text]');
  if (!text) { el.classList.add('hidden'); el.classList.remove('done', 'busy'); txt.textContent = ''; return; }
  txt.textContent = text;
  el.classList.remove('hidden', 'done', 'busy');
  el.classList.add(kind);
}

function setBusy(busy) {
  $('#create-pr-confirm').disabled = busy;
  $('#create-pr-cancel').disabled = busy;
}

function repoLabelFor(worktreePath) {
  const ws = state.activeWorkspace;
  const m = ws?.members.find(x => x.worktreePath === worktreePath);
  const repo = m && state.repos.find(r => r.path === m.repoPath);
  return repo?.name || worktreePath.split('/').pop();
}

export async function openCreatePr(card) {
  const worktreePath = card.dataset.worktreePath;
  targets = [{ worktreePath, label: card.dataset.repoLabel || repoLabelFor(worktreePath) }];
  $('#create-pr-heading').textContent = `Create pull request — ${targets[0].label}`;
  $('#create-pr-meta').textContent = worktreePath;
  $('#create-pr-input-title').value = '';
  $('#create-pr-input-body').value = '';
  $('#create-pr-draft').checked = false;
  $('#create-pr-error').textContent = '';
  setProgress('');
  setBusy(false);
  $('#create-pr-modal').classList.remove('hidden');
  setTimeout(() => $('#create-pr-input-title').focus(), 50);
  try {
    const { subject, body } = await globalThis.api.git.lastCommitMessage(worktreePath);
    if (!$('#create-pr-input-title').value) $('#create-pr-input-title').value = subject || '';
    if (!$('#create-pr-input-body').value) $('#create-pr-input-body').value = body || '';
  } catch { /* leave blank */ }
}

export function openCreatePrBulk() {
  const ws = state.activeWorkspace;
  if (!ws) return;
  // Members whose card has no visible PR chip = no PR yet.
  const cards = Array.from(document.querySelectorAll('#member-list .member-card'));
  targets = cards
    .filter(card => {
      const chip = card.querySelector('[data-pr]');
      return chip?.classList.contains('hidden');
    })
    .map(card => ({ worktreePath: card.dataset.worktreePath, label: card.dataset.repoLabel || repoLabelFor(card.dataset.worktreePath) }));
  if (targets.length === 0) {
    notify.success('Every repo in this workspace already has a PR.');
    return;
  }
  $('#create-pr-heading').textContent = `Create PRs — ${targets.length} repo${targets.length === 1 ? '' : 's'}`;
  $('#create-pr-meta').textContent = targets.map(t => t.label).join(', ');
  $('#create-pr-input-title').value = '';
  $('#create-pr-input-body').value = '';
  $('#create-pr-draft').checked = false;
  $('#create-pr-error').textContent = '';
  setProgress('');
  setBusy(false);
  $('#create-pr-modal').classList.remove('hidden');
  setTimeout(() => $('#create-pr-input-title').focus(), 50);
}

async function confirm() {
  const title = $('#create-pr-input-title').value.trim();
  const body = $('#create-pr-input-body').value;
  const draft = $('#create-pr-draft').checked;
  const errEl = $('#create-pr-error');
  errEl.textContent = '';
  if (!title) { errEl.textContent = 'Title is required.'; return; }
  if (targets.length === 0) return;

  setBusy(true);
  try {
    if (targets.length === 1) {
      setProgress('Pushing & creating PR…');
      const { url } = await globalThis.api.git.createPr(targets[0].worktreePath, { title, body, draft });
      setProgress('✓ Created', 'done');
      refreshPrChips();
      if (url) globalThis.api.fs.openPath(url);
      await new Promise(r => setTimeout(r, 500));
      $('#create-pr-modal').classList.add('hidden');
      notify.success('Pull request created.');
      return;
    }
    // Bulk — sequential so we don't hammer the GitHub API.
    const results = [];
    let i = 0;
    for (const t of targets) {
      i++;
      setProgress(`Creating PR for ${t.label}… (${i}/${targets.length})`);
      try {
        const { url } = await globalThis.api.git.createPr(t.worktreePath, { title, body, draft });
        results.push({ worktreePath: t.worktreePath, ok: true, output: url || 'created' });
      } catch (e) {
        results.push({ worktreePath: t.worktreePath, ok: false, error: e.message });
      }
    }
    refreshPrChips();
    $('#create-pr-modal').classList.add('hidden');
    showToast('Create PRs', results);
    const okCount = results.filter(r => r.ok).length;
    notify.success(`Created ${okCount} of ${results.length} PRs.`);
  } catch (e) {
    errEl.textContent = e.message;
    setProgress('');
  } finally {
    setBusy(false);
  }
}

export function setupCreatePrModal() {
  $('#create-pr-cancel').addEventListener('click', () => $('#create-pr-modal').classList.add('hidden'));
  $('#create-pr-confirm').addEventListener('click', confirm);
}
