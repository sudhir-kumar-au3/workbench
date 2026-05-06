import { $, escapeHtml } from './utils.js';
import { notify } from './notify.js';
import { loadStatusFor } from './statuses.js';

let currentWorktreePath = null;

function joinPath(base, rel) {
  return base.endsWith('/') ? base + rel : `${base}/${rel}`;
}

function summary(kind, files) {
  const verb = kind === 'rebase' ? 'rebase' : kind === 'cherry-pick' ? 'cherry-pick' : 'merge';
  const count = files.length;
  if (!count) return `${verb[0].toUpperCase() + verb.slice(1)} in progress, but no conflicts remain. Click Continue to finish.`;
  return `${count} file${count === 1 ? '' : 's'} have conflicts from the ${verb}. Resolve each in your editor, mark resolved, then continue.`;
}

async function refresh() {
  if (!currentWorktreePath) return;
  let state;
  try {
    state = await globalThis.api.git.conflictState(currentWorktreePath);
  } catch (e) {
    notify.error(e.message);
    return;
  }
  $('#conflicts-summary').textContent = summary(state.kind, state.files);
  renderFiles(state.files);
  buildActions(state);
  // No conflicts AND no in-progress op = nothing left to resolve, close.
  if (!state.kind && state.files.length === 0) {
    $('#conflicts-modal').classList.add('hidden');
    loadStatusFor(currentWorktreePath);
  }
}

function renderFiles(files) {
  const list = $('#conflicts-list');
  list.innerHTML = '';
  if (!files.length) {
    list.innerHTML = '<div class="empty-row">All conflicts resolved. Continue or abort below.</div>';
    return;
  }
  for (const f of files) {
    const fullPath = joinPath(currentWorktreePath, f.path);
    const row = document.createElement('div');
    row.className = 'modified-file-row';
    row.innerHTML = `
      <span class="modified-file-status kind-U" title="Unmerged (${escapeHtml(f.code)})">${escapeHtml(f.code)}</span>
      <div class="modified-file-info">
        <div class="modified-file-path">${escapeHtml(f.path)}</div>
        <div class="modified-file-fullpath" title="${escapeHtml(fullPath)}">${escapeHtml(fullPath)}</div>
      </div>
      <div class="modified-file-actions">
        <button class="btn btn-ghost" data-action="open" title="Open in editor">↗</button>
        <button class="btn btn-primary" data-action="resolved" title="Mark as resolved (git add)">Mark resolved</button>
      </div>
    `;
    row.querySelector('[data-action="open"]').addEventListener('click', async () => {
      try { await globalThis.api.editor.open(fullPath); }
      catch (e) { notify.error(e.message); }
    });
    row.querySelector('[data-action="resolved"]').addEventListener('click', async () => {
      try {
        await globalThis.api.git.markResolved(currentWorktreePath, f.path);
        notify.success(`Marked ${f.path}`);
        refresh();
      } catch (e) { notify.error(e.message); }
    });
    list.appendChild(row);
  }
}

function buildActions(state) {
  const actions = $('#conflicts-actions');
  actions.innerHTML = '';
  const make = (label, kind, handler) => {
    const btn = document.createElement('button');
    btn.className = `btn ${kind || ''}`.trim();
    btn.textContent = label;
    btn.addEventListener('click', handler);
    actions.appendChild(btn);
    return btn;
  };

  const close = () => $('#conflicts-modal').classList.add('hidden');
  const allResolved = state.files.length === 0 && state.kind;

  make('Refresh', '', () => refresh());

  if (state.kind === 'rebase') {
    if (allResolved) {
      make('Continue rebase', 'btn-primary', async () => {
        try {
          await globalThis.api.git.continueRebase(currentWorktreePath);
          notify.success('Rebase continued.');
          loadStatusFor(currentWorktreePath);
          close();
        } catch (e) {
          // May still have conflicts in next commits — refresh.
          refresh();
          notify.error(e.message);
        }
      });
    }
    make('Abort rebase', '', async () => {
      if (!confirm('Abort the in-progress rebase? This will discard the rebase and return to the original branch state.')) return;
      try {
        await globalThis.api.git.abortRebase(currentWorktreePath);
        notify.success('Rebase aborted.');
        loadStatusFor(currentWorktreePath);
        close();
      } catch (e) { notify.error(e.message); }
    });
  } else if (state.kind === 'merge') {
    if (allResolved) {
      make('Continue merge', 'btn-primary', async () => {
        try {
          await globalThis.api.git.continueMerge(currentWorktreePath);
          notify.success('Merge completed.');
          loadStatusFor(currentWorktreePath);
          close();
        } catch (e) { notify.error(e.message); }
      });
    }
    make('Abort merge', '', async () => {
      if (!confirm('Abort the in-progress merge? This will discard the merge and return to the pre-merge state.')) return;
      try {
        await globalThis.api.git.abortMerge(currentWorktreePath);
        notify.success('Merge aborted.');
        loadStatusFor(currentWorktreePath);
        close();
      } catch (e) { notify.error(e.message); }
    });
  } else if (state.kind === 'cherry-pick') {
    // Cherry-pick uses git cherry-pick --continue / --abort. We don't expose those
    // explicitly; fall back to advising user.
    make('Resolve manually', '', () => {
      notify.error('Cherry-pick conflict — finish via terminal: git cherry-pick --continue or --abort.');
    });
  }

  make('Close', '', close);
}

export async function openConflictsModal(label, worktreePath) {
  currentWorktreePath = worktreePath;
  $('#conflicts-title').textContent = `Resolve conflicts — ${label}`;
  $('#conflicts-meta').textContent = worktreePath;
  $('#conflicts-summary').textContent = 'Loading…';
  $('#conflicts-list').innerHTML = '';
  $('#conflicts-actions').innerHTML = '';
  $('#conflicts-modal').classList.remove('hidden');
  await refresh();
}

export function setupConflictsModal() {
  // Closing is via the in-modal action buttons; nothing else to bind here.
}
