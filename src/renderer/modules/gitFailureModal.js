import { $, escapeHtml } from './utils.js';
import { notify } from './notify.js';
import { openDiff } from './diffModal.js';
import { openCommitModal } from './commitModal.js';
import { loadStatusFor } from './statuses.js';
import { openConflictsModal } from './conflictsModal.js';

const KIND_LABEL = {
  M: 'Modified',
  A: 'Added',
  D: 'Deleted',
  R: 'Renamed',
  C: 'Copied',
  U: 'Unmerged',
  untracked: 'Untracked',
};

function joinPath(base, rel) {
  return base.endsWith('/') ? base + rel : `${base}/${rel}`;
}

// Inspect git stderr to bucket the error into one of:
//  - 'dirty'      → working tree has changes blocking the op
//  - 'divergent'  → branch and upstream have diverged (need rebase or merge)
//  - 'auth'       → authentication or remote-permission failure
//  - 'unknown'    → couldn't classify; show raw output
function classifyError(message) {
  const m = (message || '').toLowerCase();
  if (
    m.includes('conflict (content)') ||
    m.includes('conflict (modify/delete)') ||
    m.includes('fix conflicts and then commit') ||
    m.includes('could not apply') ||
    m.includes('after resolving the conflicts')
  ) return 'conflict';
  if (
    m.includes('your local changes') ||
    m.includes('would be overwritten') ||
    m.includes('please commit your changes or stash them') ||
    m.includes('working tree is dirty') ||
    m.includes('cannot pull with rebase') ||
    m.includes('have unstaged changes')
  ) return 'dirty';
  if (
    m.includes('not possible to fast-forward') ||
    m.includes('non-fast-forward') ||
    m.includes('updates were rejected') ||
    m.includes('tip of your current branch is behind') ||
    m.includes('refusing to merge unrelated histories') ||
    m.includes('have diverged')
  ) return 'divergent';
  if (
    m.includes('authentication failed') ||
    m.includes('permission denied') ||
    m.includes('could not read from remote') ||
    m.includes('public key denied')
  ) return 'auth';
  return 'unknown';
}

const OP_LABEL = {
  'fast-forward': 'Fast-forward',
  pull: 'Pull',
  push: 'Push',
  sync: 'Sync',
};

const KIND_TITLES = {
  dirty: 'Working tree has uncommitted changes',
  divergent: 'Branch has diverged from upstream',
  conflict: 'Merge conflicts need resolution',
  auth: 'Authentication or permission denied',
  unknown: 'Operation failed',
};

const KIND_SUMMARIES = {
  dirty: 'Git refused the operation because the working tree has changes that would be lost or that conflict with incoming commits. Stash, commit, or revert these files and try again.',
  divergent: 'Your branch and the upstream have commits that aren\'t in each other. A fast-forward isn\'t possible — you need to rebase (or merge) and then push.',
  conflict: 'Resolve the conflicting files, mark each as resolved, then continue the operation.',
  auth: 'Git couldn\'t authenticate to the remote. Check your SSH key, credentials, or repository access.',
  unknown: 'Git reported an error. Full output is below.',
};

function renderFiles(listEl, files, worktreePath) {
  listEl.innerHTML = '';
  if (!files.length) {
    listEl.innerHTML = '<div class="empty-row">Working tree is clean.</div>';
    return;
  }
  for (const f of files) {
    const fullPath = joinPath(worktreePath, f.path);
    const kindClass = `kind-${f.kind === 'untracked' ? 'untracked' : f.kind}`;
    const stagedTag = f.staged ? '<span class="staged-tag" title="Staged">staged</span>' : '';
    const renameInfo = f.oldPath ? `<span class="muted">from ${escapeHtml(f.oldPath)}</span>` : '';
    const row = document.createElement('div');
    row.className = 'modified-file-row';
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
    listEl.appendChild(row);
  }
}

function close() {
  $('#git-failure-modal').classList.add('hidden');
}

function buildActions(actionsEl, ctx) {
  actionsEl.innerHTML = '';

  const make = (label, kind, handler) => {
    const btn = document.createElement('button');
    btn.className = `btn ${kind || ''}`.trim();
    btn.textContent = label;
    btn.addEventListener('click', handler);
    actionsEl.appendChild(btn);
    return btn;
  };

  const { op, worktreePath, label, kind, retry } = ctx;
  const repoLabel = label || worktreePath.split('/').pop();

  if (kind === 'dirty') {
    make('Open diff', '', () => { close(); openDiff(`${repoLabel} — diff`, worktreePath); });
    make('Commit changes…', '', () => { close(); openCommitModal(repoLabel, worktreePath); });
    make('Stash & retry', 'btn-primary', async () => {
      try {
        await globalThis.api.git.stash(worktreePath, `auto-stash before ${op}`);
        notify.success('Stashed.');
        close();
        if (retry) {
          try { await retry(); notify.success(`${OP_LABEL[op]} succeeded.`); }
          catch (e) { openGitFailure({ op, worktreePath, label: repoLabel, error: e.message, retry }); }
        }
        loadStatusFor(worktreePath);
      } catch (e) {
        notify.error(`Stash failed: ${e.message}`);
      }
    });
  } else if (kind === 'divergent') {
    make('Open diff', '', () => { close(); openDiff(`${repoLabel} — diff`, worktreePath); });
    if (op !== 'sync') {
      make('Sync (rebase + push)', 'btn-primary', async () => {
        close();
        try {
          await globalThis.api.git.bulkOp('fetch', [worktreePath]);
          const rebaseResult = await globalThis.api.git.bulkOp('rebase', [worktreePath]);
          if (!rebaseResult[0].ok) throw new Error(rebaseResult[0].error);
          if (op === 'push' || op === 'pull') {
            const pushResult = await globalThis.api.git.bulkOp('push', [worktreePath]);
            if (!pushResult[0].ok) throw new Error(pushResult[0].error);
          }
          notify.success('Synced.');
          loadStatusFor(worktreePath);
        } catch (e) {
          openGitFailure({ op: 'sync', worktreePath, label: repoLabel, error: e.message });
        }
      });
    }
  } else if (kind === 'auth') {
    // Nothing actionable here beyond surfacing the error; the user has to fix
    // their credentials / SSH key outside the app.
  }

  make('Close', 'btn-primary', close);
}

export async function openGitFailure({ op, worktreePath, label, error, retry }) {
  const kind = classifyError(error);
  // Conflict failures get the dedicated resolution UI instead of the generic dialog.
  if (kind === 'conflict') {
    openConflictsModal(label || worktreePath.split('/').pop(), worktreePath);
    return;
  }
  $('#git-failure-title').textContent = `${OP_LABEL[op] || 'Operation'} failed — ${KIND_TITLES[kind]}`;
  $('#git-failure-meta').textContent = worktreePath;
  $('#git-failure-summary').textContent = KIND_SUMMARIES[kind];
  $('#git-failure-raw').textContent = error || '';

  const filesWrap = $('#git-failure-files-wrap');
  const filesList = $('#git-failure-files-list');
  filesWrap.classList.add('hidden');
  filesList.innerHTML = '';

  // For "dirty" failures, show the actual modified files alongside the error.
  if (kind === 'dirty') {
    try {
      const result = await globalThis.api.worktrees.statusFiles(worktreePath);
      if (Array.isArray(result) && result.length > 0) {
        renderFiles(filesList, result, worktreePath);
        filesWrap.classList.remove('hidden');
      }
    } catch { /* ignore — the dialog still works without the file list */ }
  }

  buildActions($('#git-failure-actions'), { op, worktreePath, label, kind, retry });
  $('#git-failure-modal').classList.remove('hidden');
}

export function setupGitFailureModal() {
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('#git-failure-modal').classList.contains('hidden')) close();
  });
}
