import { $, escapeHtml } from './utils.js';
import { notify } from './notify.js';
import { openDiff } from './diffModal.js';
import { loadStatusFor } from './statuses.js';

const KIND_LABEL = {
  M: 'Modified',
  A: 'Added',
  D: 'Deleted',
  R: 'Renamed',
  C: 'Copied',
  U: 'Unmerged',
  untracked: 'Untracked',
};

let currentWorktreePath = null;
let currentLabel = '';

function joinPath(base, rel) {
  return base.endsWith('/') ? base + rel : `${base}/${rel}`;
}

function renderRows(files, worktreePath) {
  const list = $('#modified-files-list');
  list.innerHTML = '';
  if (!files.length) {
    list.innerHTML = '<div class="empty-row">Working tree is clean.</div>';
    return;
  }
  for (const f of files) {
    const fullPath = joinPath(worktreePath, f.path);
    const row = document.createElement('div');
    row.className = 'modified-file-row';
    const kindClass = `kind-${f.kind === 'untracked' ? 'untracked' : f.kind}`;
    const stagedTag = f.staged ? '<span class="staged-tag" title="Staged">staged</span>' : '';
    const renameInfo = f.oldPath ? `<span class="muted">from ${escapeHtml(f.oldPath)}</span>` : '';
    row.innerHTML = `
      <span class="modified-file-status ${kindClass}" title="${escapeHtml(KIND_LABEL[f.kind] || f.code)} (${escapeHtml(f.code)})">${escapeHtml(f.code.replace(/ /g, '·'))}</span>
      <div class="modified-file-info">
        <div class="modified-file-path">${escapeHtml(f.path)} ${renameInfo}</div>
        <div class="modified-file-fullpath" title="${escapeHtml(fullPath)}">${escapeHtml(fullPath)}</div>
      </div>
      <div class="modified-file-actions">
        ${stagedTag}
        <button class="btn btn-ghost" data-action="copy" title="Copy full path">⧉</button>
        <button class="btn btn-ghost" data-action="open" title="Open in editor">↗</button>
        <button class="btn btn-ghost btn-discard" data-action="discard" title="Discard changes (irreversible)">⌫</button>
      </div>
    `;
    row.querySelector('[data-action="copy"]').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(fullPath); notify.success('Path copied'); }
      catch (e) { notify.error(`Could not copy: ${e.message}`); }
    });
    row.querySelector('[data-action="open"]').addEventListener('click', async () => {
      try { await globalThis.api.editor.open(fullPath); }
      catch (e) { notify.error(e.message); }
    });
    row.querySelector('[data-action="discard"]').addEventListener('click', async () => {
      const isUntracked = f.kind === 'untracked';
      const verb = isUntracked ? 'Delete the untracked file' : 'Discard changes to';
      if (!confirm(`${verb}\n\n${f.path}\n\nThis cannot be undone.`)) return;
      try {
        await globalThis.api.git.discardFile(worktreePath, f.path, isUntracked);
        notify.success(isUntracked ? 'File deleted' : 'Changes discarded');
        // Re-fetch the file list and the card status.
        const fresh = await globalThis.api.worktrees.statusFiles(worktreePath);
        renderRows(Array.isArray(fresh) ? fresh : [], worktreePath);
        loadStatusFor(worktreePath);
      } catch (e) {
        notify.error(e.message);
      }
    });
    list.appendChild(row);
  }
}

export async function openModifiedFiles(label, worktreePath) {
  currentWorktreePath = worktreePath;
  currentLabel = label;
  $('#modified-title').textContent = `Modified files — ${label}`;
  $('#modified-meta').textContent = worktreePath;
  const list = $('#modified-files-list');
  list.innerHTML = '<div class="empty-row">Loading…</div>';
  $('#modified-files-modal').classList.remove('hidden');
  try {
    const result = await globalThis.api.worktrees.statusFiles(worktreePath);
    if (result?.error) {
      list.innerHTML = `<div class="empty-row error">${escapeHtml(result.error)}</div>`;
      return;
    }
    renderRows(result, worktreePath);
  } catch (e) {
    notify.error(e.message);
    $('#modified-files-modal').classList.add('hidden');
  }
}

export function setupModifiedFilesModal() {
  $('#modified-close').addEventListener('click', () => {
    $('#modified-files-modal').classList.add('hidden');
  });
  $('#modified-open-diff').addEventListener('click', () => {
    if (!currentWorktreePath) return;
    $('#modified-files-modal').classList.add('hidden');
    openDiff(`${currentLabel} — diff`, currentWorktreePath);
  });
}
