import { $, escapeHtml } from './utils.js';
import { notify } from './notify.js';
import { loadStatusFor } from './statuses.js';
import { openGitFailure } from './gitFailureModal.js';
import { colorizeDiff } from './diffModal.js';

const KIND_CLASS = {
  M: 'kind-M',
  A: 'kind-A',
  D: 'kind-D',
  R: 'kind-R',
  C: 'kind-C',
  U: 'kind-U',
  untracked: 'kind-untracked',
};

let currentTarget = null;
let currentFiles = [];
let previewedPath = null;

function hidePreview() {
  previewedPath = null;
  $('#commit-diff-preview').classList.add('hidden');
  $('#commit-diff-preview-body').innerHTML = '';
  $('#commit-files-list').querySelectorAll('.commit-file-row.previewing')
    .forEach(el => el.classList.remove('previewing'));
}

async function previewFile(path, rowEl) {
  if (previewedPath === path) { hidePreview(); return; }
  previewedPath = path;
  $('#commit-files-list').querySelectorAll('.commit-file-row.previewing')
    .forEach(el => el.classList.remove('previewing'));
  rowEl?.classList.add('previewing');
  const preview = $('#commit-diff-preview');
  const body = $('#commit-diff-preview-body');
  $('#commit-diff-preview-path').textContent = path;
  body.innerHTML = '<span class="muted">Loading…</span>';
  preview.classList.remove('hidden');
  try {
    const diff = await globalThis.api.git.diffFile(currentTarget, path);
    if (previewedPath !== path) return; // user clicked another file meanwhile
    body.innerHTML = diff?.trim() ? colorizeDiff(diff) : '<span class="muted">No textual changes.</span>';
  } catch (e) {
    body.innerHTML = `<span class="muted">${escapeHtml(e.message)}</span>`;
  }
}

function setProgress(text, kind = 'busy') {
  const el = $('#commit-progress');
  const txt = el.querySelector('[data-progress-text]');
  if (!text) {
    el.classList.add('hidden');
    el.classList.remove('done', 'busy');
    txt.textContent = '';
    return;
  }
  txt.textContent = text;
  el.classList.remove('hidden', 'done', 'busy');
  el.classList.add(kind);
}

function setBusy(busy, label = 'Commit') {
  $('#commit-confirm').disabled = busy;
  $('#commit-cancel').disabled = busy;
  $('#commit-confirm').textContent = label;
}

function selectedPaths() {
  return Array.from($('#commit-files-list').querySelectorAll('input[type="checkbox"]:checked'))
    .map(cb => cb.dataset.path);
}

function updateSummary() {
  const total = currentFiles.length;
  const checked = selectedPaths().length;
  const summary = $('#commit-files-summary');
  if (total === 0) {
    summary.textContent = 'No changes to commit';
  } else if (checked === total) {
    summary.textContent = `All ${total} file${total === 1 ? '' : 's'} selected`;
  } else {
    summary.textContent = `${checked} of ${total} file${total === 1 ? '' : 's'} selected`;
  }
}

function renderFiles() {
  const list = $('#commit-files-list');
  list.innerHTML = '';
  if (currentFiles.length === 0) {
    list.innerHTML = '<div class="empty-row">No changes in the working tree.</div>';
    updateSummary();
    return;
  }
  for (const f of currentFiles) {
    const row = document.createElement('label');
    row.className = 'commit-file-row';
    const kindClass = KIND_CLASS[f.kind] || '';
    row.innerHTML = `
      <input type="checkbox" data-path="${escapeHtml(f.path)}" checked />
      <span class="modified-file-status ${kindClass}" title="${escapeHtml(f.code)}">${escapeHtml(f.code.replace(/ /g, '·'))}</span>
      <span class="commit-file-path" title="Click to preview diff — ${escapeHtml(f.path)}">${escapeHtml(f.path)}</span>
    `;
    row.querySelector('input').addEventListener('change', updateSummary);
    row.querySelector('.commit-file-path').addEventListener('click', (e) => {
      // Don't toggle the row's checkbox when the user clicks the filename to preview.
      e.preventDefault();
      e.stopPropagation();
      previewFile(f.path, row);
    });
    list.appendChild(row);
  }
  updateSummary();
}

async function loadFiles(worktreePath) {
  try {
    const result = await globalThis.api.worktrees.statusFiles(worktreePath);
    currentFiles = Array.isArray(result) ? result : [];
  } catch {
    currentFiles = [];
  }
  renderFiles();
}

export async function openCommitModal(label, worktreePath) {
  currentTarget = worktreePath;
  $('#commit-title').textContent = `Commit — ${label}`;
  $('#commit-meta').textContent = worktreePath;
  $('#commit-message').value = '';
  $('#commit-push').checked = false;
  $('#commit-error').textContent = '';
  setProgress('');
  setBusy(false);
  currentFiles = [];
  $('#commit-files-list').innerHTML = '<div class="empty-row">Loading…</div>';
  $('#commit-files-summary').textContent = 'Files';
  hidePreview();
  $('#commit-modal').classList.remove('hidden');
  setTimeout(() => $('#commit-message').focus(), 50);
  await loadFiles(worktreePath);
}

async function confirm() {
  const message = $('#commit-message').value.trim();
  const errEl = $('#commit-error');
  errEl.textContent = '';
  if (!message) { errEl.textContent = 'Message is required.'; return; }
  if (!currentTarget) return;
  const paths = selectedPaths();
  if (currentFiles.length > 0 && paths.length === 0) {
    errEl.textContent = 'Select at least one file to commit.';
    return;
  }
  const willPush = $('#commit-push').checked;
  const target = currentTarget;
  const titleLabel = ($('#commit-title').textContent || '').replace(/^Commit\s*—\s*/, '').trim() || target.split('/').pop();
  const allSelected = paths.length === currentFiles.length;

  try {
    setBusy(true, 'Committing…');
    setProgress('Committing…');
    try {
      if (allSelected) {
        await globalThis.api.git.commitAll(target, message);
      } else {
        await globalThis.api.git.commitFiles(target, message, paths);
      }
    } catch (e) {
      errEl.textContent = e.message;
      setProgress('');
      return;
    }

    if (willPush) {
      setBusy(true, 'Pushing…');
      setProgress('Pushing to remote…');
      const results = await globalThis.api.git.bulkOp('push', [target]);
      const r = results[0];
      if (!r.ok) {
        $('#commit-modal').classList.add('hidden');
        loadStatusFor(target);
        openGitFailure({
          op: 'push',
          worktreePath: target,
          label: titleLabel,
          error: r.error,
        });
        notify.success('Committed (push failed — see dialog).');
        return;
      }
      setProgress('✓ Pushed', 'done');
    } else {
      setProgress('✓ Committed', 'done');
    }

    loadStatusFor(target);
    await new Promise(resolve => setTimeout(resolve, 600));
    $('#commit-modal').classList.add('hidden');
    notify.success(willPush ? 'Committed and pushed.' : 'Committed.');
  } finally {
    setBusy(false);
  }
}

export function setupCommitModal() {
  $('#commit-cancel').addEventListener('click', () => $('#commit-modal').classList.add('hidden'));
  $('#commit-confirm').addEventListener('click', confirm);
  $('#commit-message').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      confirm();
    }
  });
  $('#commit-files-all').addEventListener('click', () => {
    $('#commit-files-list').querySelectorAll('input[type="checkbox"]').forEach(cb => { cb.checked = true; });
    updateSummary();
  });
  $('#commit-files-none').addEventListener('click', () => {
    $('#commit-files-list').querySelectorAll('input[type="checkbox"]').forEach(cb => { cb.checked = false; });
    updateSummary();
  });
  $('#commit-diff-preview-close').addEventListener('click', hidePreview);
}
